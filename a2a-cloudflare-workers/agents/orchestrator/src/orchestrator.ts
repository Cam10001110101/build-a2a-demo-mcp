import { BaseAgent, AgentCard } from '@a2a-workers/shared/agent-base';
import { A2AAgentResponse, createTextMessage } from '@a2a-workers/shared/a2a-protocol';
import { WorkflowGraph, WorkflowNode, WorkflowNodeConfig } from './workflow';
import { SUMMARY_COT_INSTRUCTIONS, QA_COT_PROMPT } from './prompts';
import { MCPClient, createMCPClient } from '@a2a-workers/shared/mcp-client';

interface Env {
  AI: Ai;
  SESSIONS: KVNamespace;
  MCP_REGISTRY: Fetcher;
  // Legacy service bindings - will be replaced by MCP discovery
  PLANNER?: Fetcher;
  AIR_TICKETS?: Fetcher;
  HOTELS?: Fetcher;
  CAR_RENTAL?: Fetcher;
}

interface SessionData {
  contextId: string;
  workflow?: any;
  conversationHistory: any[];
  artifacts: any[];
  state: 'new' | 'planning' | 'executing' | 'completed' | 'paused';
  lastActivity: number;
}

export class OrchestratorAgent extends BaseAgent {
  private env: Env;
  private mcpClient: MCPClient;
  private agentCache: Map<string, any> = new Map();

  constructor(env: Env) {
    const agentCard: AgentCard = {
      name: "Orchestrator Agent",
      description: "Coordinates multi-agent travel planning workflows",
      url: "https://agent.orchestrator.demos.build",
      version: "1.0.0",
      capabilities: {
        streaming: "true",
        pushNotifications: "true",
        stateTransitionHistory: "true"
      },
      authentication: {
        schemes: ["none"]
      },
      defaultInputModes: ["text"],
      defaultOutputModes: ["text"],
      skills: [{
        id: "orchestrator",
        name: "Workflow Orchestrator",
        description: "Orchestrates complex travel planning tasks across multiple specialized agents",
        tags: ["coordination", "workflow", "travel", "planning"],
        examples: [
          "Plan a 5-day trip to London for 2 people",
          "Book flights and hotels for a business trip to Tokyo",
          "Organize a family vacation to Orlando with car rental"
        ]
      }]
    };

    super(agentCard);
    this.env = env;
    this.mcpClient = createMCPClient(env.MCP_REGISTRY);
    
    // Configure KV storage for A2A state persistence
    this.setKVStorage(env.SESSIONS);
  }

  async *stream(query: string, contextId: string, taskId?: string): AsyncGenerator<A2AAgentResponse> {
    console.log(`[Orchestrator] stream - Query: "${query}", Context: ${contextId}${taskId ? `, Task: ${taskId}` : ''}`);
    
    try {
      // Load or create session
      console.log(`[Orchestrator] Loading session for context: ${contextId}`);
      const session = await this.loadSession(contextId);
      console.log(`[Orchestrator] Session loaded - State: ${session.state}, History items: ${session.conversationHistory.length}`);
      
      const workflow = new WorkflowGraph();
      
      if (session.workflow) {
        workflow.deserialize(session.workflow);
      }

      // Check if this is a question about an existing trip
      if (session.state === 'completed' && this.isQuestion(query)) {
        yield* this.handleQuestion(query, session);
        return;
      }

      // Handle workflow continuation or new planning
      if (session.state === 'paused') {
        yield* this.resumeWorkflow(query, session, workflow);
      } else {
        yield* this.startNewWorkflow(query, session, workflow);
      }

    } catch (error) {
      yield {
        response_type: "error",
        is_task_complete: true,
        require_user_input: false,
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context_id: contextId
      };
    }
  }

  private async *startNewWorkflow(
    query: string, 
    session: SessionData, 
    workflow: WorkflowGraph
  ): AsyncGenerator<A2AAgentResponse> {
    
    session.state = 'planning';
    session.conversationHistory.push({
      role: 'user',
      content: query,
      timestamp: Date.now()
    });

    yield {
      response_type: "status",
      is_task_complete: false,
      require_user_input: false,
      content: "Analyzing your request...",
      context_id: session.contextId
    };

    // Build conversation context like Python version - send full conversation history to planner
    const conversationContext = session.conversationHistory.map(h => h.content).join('\n');
    const plannerResult = await this.callAgentByName('planner', conversationContext, session.contextId);
    
    if (!plannerResult.success) {
      throw new Error(`Planning failed: ${plannerResult.error}`);
    }

    // Parse planner response - it could be input_required, completed, or error
    let plannerResponse;
    try {
      const firstParse = JSON.parse(plannerResult.content);
      
      // Check if this is a "planning_complete" response type (indicates completed planning)
      if (firstParse.response_type === 'planning_complete' && firstParse.content) {
        try {
          // Parse the content which should contain the task data
          const taskData = JSON.parse(firstParse.content);
          plannerResponse = { status: 'completed', data: taskData };
        } catch (e) {
          // If content isn't JSON, check if the content itself contains task structure
          if (firstParse.content.includes('tasks') && firstParse.content.includes('tripInfo')) {
            try {
              const taskData = JSON.parse(firstParse.content);
              plannerResponse = { status: 'completed', data: taskData };
            } catch (e2) {
              plannerResponse = firstParse;
            }
          } else {
            plannerResponse = firstParse;
          }
        }
      } 
      // Check if content field contains JSON with task structure
      else if (firstParse.content && typeof firstParse.content === 'string') {
        try {
          // Try to parse the nested JSON content
          const nestedContent = JSON.parse(firstParse.content);
          if (nestedContent.tasks || nestedContent.tripInfo || nestedContent.status === 'completed') {
            plannerResponse = { status: 'completed', data: nestedContent };
          } else {
            plannerResponse = firstParse;
          }
        } catch (e) {
          // If content parsing fails, check if the content itself looks like a JSON task plan
          if (firstParse.content.includes('"status"') && firstParse.content.includes('"tasks"') && firstParse.content.includes('"data"')) {
            try {
              const cleanedContent = firstParse.content.trim();
              const taskData = JSON.parse(cleanedContent);
              plannerResponse = { status: 'completed', data: taskData.data || taskData };
            } catch (e2) {
              plannerResponse = firstParse;
            }
          } else {
            plannerResponse = firstParse;
          }
        }
      } else {
        plannerResponse = firstParse;
      }
    } catch (e) {
      // If not JSON, treat as plain text response
      plannerResponse = { status: 'completed', content: plannerResult.content };
    }

    console.log(`[Orchestrator] Raw planner result:`, JSON.stringify(plannerResult, null, 2));
    console.log(`[Orchestrator] Parsed planner response:`, JSON.stringify(plannerResponse, null, 2));

    if (plannerResponse.status === 'input_required' || plannerResponse.response_type === 'input_required') {
      // Planner needs more information, pause and ask user
      session.state = 'paused';
      workflow.addNode({
        id: 'planner_node',
        type: 'agent',
        agentName: 'planner',
        query: query,
        dependencies: [],
        metadata: { waitingForInput: true, question: plannerResponse.question || plannerResponse.content }
      });
      
      await this.saveSession(session.contextId, { ...session, workflow: workflow.serialize() });
      
      yield {
        response_type: "question",
        is_task_complete: false,
        require_user_input: true,
        content: plannerResponse.question || plannerResponse.content,
        context_id: session.contextId
      };
      return;
    } else if (plannerResponse.status === 'completed' && (plannerResponse.data?.tasks || plannerResponse.content?.tasks || plannerResponse.tasks)) {
      // Planner provided a complete plan, execute the tasks
      const tasks = plannerResponse.data?.tasks || plannerResponse.content?.tasks || plannerResponse.tasks;
      
      console.log(`[Orchestrator] Found ${tasks.length} tasks to execute:`, tasks);
      
      // Add nodes to workflow with proper structure
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        workflow.addNode({
          id: `task_${i + 1}`,
          type: 'task',
          agentName: task.agent,
          query: `Execute ${task.agent} booking task`,
          dependencies: task.dependencies || [],
          metadata: { priority: task.priority, taskData: task }
        });
      }

      session.state = 'executing';
      await this.saveSession(session.contextId, { ...session, workflow: workflow.serialize() });

      yield {
        response_type: "status",
        is_task_complete: false,
        require_user_input: false,
        content: `Planning complete! Found ${tasks.length} tasks to execute. Starting task execution...`,
        context_id: session.contextId
      };

      // Execute workflow
      yield* this.executeWorkflow(session, workflow);
    } else {
      // Simple response from planner, return it
      yield {
        response_type: "final",
        is_task_complete: true,
        require_user_input: false,
        content: plannerResponse.question || plannerResponse.message || plannerResponse.content || plannerResult.content,
        context_id: session.contextId
      };
    }
  }

  private async *resumeWorkflow(
    userInput: string,
    session: SessionData, 
    workflow: WorkflowGraph
  ): AsyncGenerator<A2AAgentResponse> {
    
    // Add user input to conversation history like Python version
    session.conversationHistory.push({
      role: 'user',
      content: userInput,
      timestamp: Date.now()
    });

    yield {
      response_type: "status",
      is_task_complete: false,
      require_user_input: false,
      content: "Resuming workflow with your input...",
      context_id: session.contextId
    };

    // Check if we're still in planning phase or should continue with planner
    const pausedNodes = workflow.getAllNodes().filter(n => n.state === 'PAUSED');
    const plannerNode = pausedNodes.find(n => n.agentName === 'planner' || n.metadata?.waitingForInput);
    
    console.log(`[Orchestrator] Resume workflow - Found ${pausedNodes.length} paused nodes`);
    console.log(`[Orchestrator] Planner node found:`, plannerNode ? `${plannerNode.id}:${plannerNode.state}` : 'none');
    
    if (plannerNode) {
      // Still in planning phase - send updated conversation to planner
      const conversationContext = session.conversationHistory.map(h => h.content).join('\n');
      const plannerResult = await this.callAgentByName('planner', conversationContext, session.contextId);
      
      if (!plannerResult.success) {
        throw new Error(`Planning failed: ${plannerResult.error}`);
      }

      // Parse planner response
      let plannerResponse;
      try {
        const firstParse = JSON.parse(plannerResult.content);
        
        // Check if this is a "planning_complete" response type (indicates completed planning)
        if (firstParse.response_type === 'planning_complete' && firstParse.content) {
          try {
            // Parse the content which should contain the task data
            const taskData = JSON.parse(firstParse.content);
            plannerResponse = { status: 'completed', data: taskData };
          } catch (e) {
            // If content isn't JSON, check if the content itself contains task structure
            if (firstParse.content.includes('tasks') && firstParse.content.includes('tripInfo')) {
              try {
                const taskData = JSON.parse(firstParse.content);
                plannerResponse = { status: 'completed', data: taskData };
              } catch (e2) {
                plannerResponse = firstParse;
              }
            } else {
              plannerResponse = firstParse;
            }
          }
        } 
        // Check if content field contains JSON with task structure
        else if (firstParse.content && typeof firstParse.content === 'string') {
          try {
            // Try to parse the nested JSON content
            const nestedContent = JSON.parse(firstParse.content);
            if (nestedContent.tasks || nestedContent.tripInfo || nestedContent.status === 'completed') {
              plannerResponse = { status: 'completed', data: nestedContent };
            } else {
              plannerResponse = firstParse;
            }
          } catch (e) {
            // If content parsing fails, check if the content itself looks like a JSON task plan
            if (firstParse.content.includes('"status"') && firstParse.content.includes('"tasks"') && firstParse.content.includes('"data"')) {
              try {
                const cleanedContent = firstParse.content.trim();
                const taskData = JSON.parse(cleanedContent);
                plannerResponse = { status: 'completed', data: taskData.data || taskData };
              } catch (e2) {
                plannerResponse = firstParse;
              }
            } else {
              plannerResponse = firstParse;
            }
          }
        } else {
          plannerResponse = firstParse;
        }
      } catch (e) {
        plannerResponse = { status: 'completed', content: plannerResult.content };
      }

      if (plannerResponse.status === 'input_required' || plannerResponse.response_type === 'input_required') {
        // Still need more info, update node and continue paused
        workflow.updateNode(plannerNode.id, {
          state: 'PAUSED',
          metadata: { ...plannerNode.metadata, question: plannerResponse.question || plannerResponse.content }
        });
        
        await this.saveSession(session.contextId, { ...session, workflow: workflow.serialize() });
        
        yield {
          response_type: "question",
          is_task_complete: false,
          require_user_input: true,
          content: plannerResponse.question || plannerResponse.content,
          context_id: session.contextId
        };
        return;
      } else if (plannerResponse.status === 'completed' && (plannerResponse.data?.tasks || plannerResponse.content?.tasks || plannerResponse.tasks)) {
        // Planning complete, add tasks to workflow
        const tasks = plannerResponse.data?.tasks || plannerResponse.content?.tasks || plannerResponse.tasks;
        
        console.log(`[Orchestrator] Resume workflow - Found ${tasks.length} tasks to execute:`, tasks);
        
        // Mark planner node as completed
        workflow.updateNode(plannerNode.id, { state: 'COMPLETED' });
        
        // Add task nodes to workflow with proper structure
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          workflow.addNode({
            id: `task_${i + 1}`,
            type: 'task',
            agentName: task.agent,
            query: `Execute ${task.agent} booking task`,
            dependencies: task.dependencies || [],
            metadata: { priority: task.priority, taskData: task }
          });
        }

        session.state = 'executing';
        await this.saveSession(session.contextId, { ...session, workflow: workflow.serialize() });

        yield {
          response_type: "status",
          is_task_complete: false,
          require_user_input: false,
          content: `Planning complete! Found ${tasks.length} tasks to execute. Starting task execution...`,
          context_id: session.contextId
        };

        // Execute workflow
        yield* this.executeWorkflow(session, workflow);
        return;
      }
    } else {
      // Not in planning phase, update existing paused nodes with user input
      for (const node of pausedNodes) {
        workflow.updateNode(node.id, {
          state: 'READY',
          metadata: { ...node.metadata, userInput }
        });
      }

      session.state = 'executing';
      await this.saveSession(session.contextId, { ...session, workflow: workflow.serialize() });

      yield* this.executeWorkflow(session, workflow);
    }
  }

  private async *executeWorkflow(
    session: SessionData,
    workflow: WorkflowGraph
  ): AsyncGenerator<A2AAgentResponse> {
    
    console.log(`[Orchestrator] Starting workflow execution - Session state: ${session.state}`);
    const allNodes = workflow.getAllNodes();
    console.log(`[Orchestrator] Workflow has ${allNodes.length} nodes:`, allNodes.map(n => `${n.id}:${n.state}`));
    
    let iterationCount = 0;
    const maxIterations = 20; // Safety limit to prevent infinite loops
    
    while (!workflow.isComplete() && !workflow.hasPausedNodes() && iterationCount < maxIterations) {
      iterationCount++;
      console.log(`[Orchestrator] Workflow iteration ${iterationCount}/${maxIterations}`);
      
      const readyNodes = workflow.getReadyNodes();
      console.log(`[Orchestrator] Found ${readyNodes.length} ready nodes:`, readyNodes.map(n => `${n.id}:${n.state}`));
      
      if (readyNodes.length === 0) {
        console.log(`[Orchestrator] No ready nodes found, checking workflow completion...`);
        console.log(`[Orchestrator] Workflow complete: ${workflow.isComplete()}, Has paused: ${workflow.hasPausedNodes()}`);
        break;
      }

      // Execute ready nodes in parallel (for now, do sequentially)
      for (const node of readyNodes) {
        yield {
          response_type: "status",
          is_task_complete: false,
          require_user_input: false,
          content: `Executing: ${node.agentName || node.type} - ${node.query || 'Processing...'}`,
          context_id: session.contextId
        };

        workflow.updateNode(node.id, { state: 'RUNNING' });
        
        try {
          const result = await this.executeNode(node);
          
          if (result.requiresInput) {
            workflow.updateNode(node.id, { 
              state: 'PAUSED',
              result: result.content 
            });
            
            session.state = 'paused';
            await this.saveSession(session.contextId, { ...session, workflow: workflow.serialize() });
            
            yield {
              response_type: "input_required",
              is_task_complete: false,
              require_user_input: true,
              content: result.content,
              context_id: session.contextId
            };
            return;
          } else {
            workflow.updateNode(node.id, { 
              state: 'COMPLETED',
              result: result.content 
            });
            
            session.artifacts.push({
              nodeId: node.id,
              agentName: node.agentName,
              content: result.content,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          workflow.updateNode(node.id, { 
            state: 'FAILED',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Save progress
        await this.saveSession(session.contextId, { ...session, workflow: workflow.serialize() });
      }
    }

    console.log(`[Orchestrator] Workflow execution ended after ${iterationCount} iterations`);
    console.log(`[Orchestrator] Final state - Complete: ${workflow.isComplete()}, Paused: ${workflow.hasPausedNodes()}`);
    
    if (iterationCount >= maxIterations) {
      console.error(`[Orchestrator] Workflow execution stopped due to max iterations limit`);
      yield {
        response_type: "error",
        is_task_complete: true,
        require_user_input: false,
        content: "Workflow execution stopped due to maximum iteration limit. Please contact support.",
        context_id: session.contextId
      };
      return;
    }

    // Generate final summary if workflow is complete
    if (workflow.isComplete() && !workflow.hasPausedNodes()) {
      session.state = 'completed';
      
      yield {
        response_type: "status",
        is_task_complete: false,
        require_user_input: false,
        content: "Generating comprehensive trip summary...",
        context_id: session.contextId
      };

      const summary = await this.generateSummary(session.artifacts);
      
      yield {
        response_type: "final",
        is_task_complete: true,
        require_user_input: false,
        content: summary,
        context_id: session.contextId
      };

      await this.saveSession(session.contextId, session);
    }
  }

  private async executeNode(node: WorkflowNode): Promise<{ success: boolean; content: string; requiresInput: boolean }> {
    if (!node.agentName) {
      return { success: false, content: "No agent specified for node", requiresInput: false };
    }

    const serviceBinding = await this.getServiceBinding(node.agentName);
    if (!serviceBinding) {
      return { success: false, content: `Service binding not found for ${node.agentName}`, requiresInput: false };
    }

    // Use the detailed task query if available, otherwise fall back to generic query
    const taskQuery = node.metadata?.taskData?.query || node.query;
    
    console.log(`[Orchestrator] Calling ${node.agentName} with query:`, taskQuery);
    
    const response = await serviceBinding.fetch(new Request('https://dummy/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: taskQuery,
        context_id: node.metadata?.contextId || `node_${node.id}`,
        task_id: node.id
      })
    }));

    if (!response.ok) {
      throw new Error(`Agent ${node.agentName} returned ${response.status}`);
    }

    const result = await response.json();
    
    return {
      success: true,
      content: result.content || JSON.stringify(result),
      requiresInput: result.require_user_input || false
    };
  }

  private async getServiceBinding(agentName: string): Promise<Fetcher | null> {
    // First try cache
    if (this.agentCache.has(agentName)) {
      return this.agentCache.get(agentName);
    }

    // Try legacy bindings first (for backward compatibility)
    const legacyBinding = this.getLegacyBinding(agentName);
    if (legacyBinding) {
      this.agentCache.set(agentName, legacyBinding);
      return legacyBinding;
    }

    // Use MCP discovery to find the agent
    try {
      const agentCard = await this.mcpClient.findAgent(agentName);
      if (agentCard && agentCard.url) {
        // Create a fetcher that makes HTTP requests to the agent URL
        const fetcher: Fetcher = {
          fetch: async (request: Request) => {
            const url = new URL(request.url);
            const agentUrl = new URL(agentCard.url);
            
            // Update the request URL to use the agent's URL
            const newUrl = new URL(url.pathname + url.search, agentCard.url);
            
            return fetch(newUrl.toString(), {
              method: request.method,
              headers: request.headers,
              body: request.body
            });
          }
        };
        
        this.agentCache.set(agentName, fetcher);
        return fetcher;
      }
    } catch (error) {
      console.error(`Failed to discover agent ${agentName}:`, error);
    }

    return null;
  }

  private getLegacyBinding(agentName: string): Fetcher | null {
    switch (agentName.toLowerCase()) {
      case 'planner': return this.env.PLANNER || null;
      case 'air_tickets': return this.env.AIR_TICKETS || null;
      case 'hotels': return this.env.HOTELS || null;
      case 'car_rental': return this.env.CAR_RENTAL || null;
      default: return null;
    }
  }

  private async callAgentByName(agentName: string, query: string, contextId?: string): Promise<{ success: boolean; content: string; error?: string }> {
    try {
      const service = await this.getServiceBinding(agentName);
      if (!service) {
        return { 
          success: false, 
          content: '', 
          error: `Agent '${agentName}' not found via MCP discovery` 
        };
      }

      // Use provided contextId or generate new one - maintain session like Python version
      const sessionId = contextId || crypto.randomUUID();

      const response = await service.fetch(new Request('https://dummy/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context_id: sessionId })
      }));

      if (!response.ok) {
        return {
          success: false,
          content: '',
          error: `Agent returned ${response.status}`
        };
      }

      const result = await response.json();
      return {
        success: true,
        content: JSON.stringify(result),
        error: undefined
      };
    } catch (error) {
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Legacy method for backward compatibility
  private async callAgent(serviceName: keyof Env, query: string): Promise<{ success: boolean; content: string; error?: string }> {
    try {
      const service = this.env[serviceName] as Fetcher;
      const response = await service.fetch(new Request('https://dummy/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      }));

      if (!response.ok) {
        return { success: false, content: '', error: `Service returned ${response.status}` };
      }

      const result = await response.json();
      return { success: true, content: result.content || JSON.stringify(result) };
    } catch (error) {
      return { success: false, content: '', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private parsePlannerResult(content: string): WorkflowNodeConfig[] {
    // Simple parsing - in practice this would be more sophisticated
    const tasks: WorkflowNodeConfig[] = [];
    
    try {
      const planResult = JSON.parse(content);
      
      if (planResult.tasks && Array.isArray(planResult.tasks)) {
        for (let i = 0; i < planResult.tasks.length; i++) {
          const task = planResult.tasks[i];
          tasks.push({
            id: `task_${i + 1}`,
            type: 'task',
            agentName: task.agent || task.type,
            query: task.query || task.description,
            dependencies: task.dependencies || [],
            metadata: task.metadata || {}
          });
        }
      }
    } catch (error) {
      // Fallback: create a simple task structure
      tasks.push({
        id: 'task_1',
        type: 'task',
        agentName: 'air_tickets',
        query: content,
        dependencies: [],
        metadata: {}
      });
    }

    return tasks;
  }

  private async generateSummary(artifacts: any[]): Promise<string> {
    // Try to use the Summary Agent first
    try {
      const summaryResult = await this.callAgentByName('summary', JSON.stringify({
        content: artifacts.map(a => `${a.agentName}: ${a.content}`),
        format: 'executive',
        metadata: {
          agentCount: artifacts.length,
          agentsUsed: Array.from(new Set(artifacts.map(a => a.agentName)))
        }
      }), 'summary_context');

      if (summaryResult.success) {
        const parsed = JSON.parse(summaryResult.content);
        return parsed.content || summaryResult.content;
      }
    } catch (error) {
      console.error('Summary agent failed, falling back to AI:', error);
    }

    // Fallback to direct AI summarization
    const artifactTexts = artifacts.map(a => `${a.agentName}: ${a.content}`).join('\n\n');
    const prompt = `${SUMMARY_COT_INSTRUCTIONS}\n\nTravel booking results:\n${artifactTexts}`;
    
    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });

      return response.response || 'Summary generation failed';
    } catch (error) {
      return `Unable to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async *handleQuestion(query: string, session: SessionData): AsyncGenerator<A2AAgentResponse> {
    const context = {
      artifacts: session.artifacts,
      conversationHistory: session.conversationHistory.slice(-10) // Last 10 messages
    };

    const prompt = `${QA_COT_PROMPT}\n\nContext: ${JSON.stringify(context)}\n\nQuestion: ${query}`;
    
    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });

      const result = JSON.parse(response.response || '{"can_answer": false, "answer": "Unable to process question"}');
      
      yield {
        response_type: "answer",
        is_task_complete: true,
        require_user_input: false,
        content: result.answer,
        context_id: session.contextId
      };
    } catch (error) {
      yield {
        response_type: "error",
        is_task_complete: true,
        require_user_input: false,
        content: "I'm sorry, I couldn't process your question at this time.",
        context_id: session.contextId
      };
    }
  }

  private isQuestion(query: string): boolean {
    const questionWords = ['what', 'when', 'where', 'who', 'why', 'how', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did'];
    const lowerQuery = query.toLowerCase().trim();
    
    return questionWords.some(word => lowerQuery.startsWith(word)) || 
           lowerQuery.includes('?') ||
           lowerQuery.includes('tell me') ||
           lowerQuery.includes('show me');
  }

  private async loadSession(contextId: string): Promise<SessionData> {
    console.log(`[Orchestrator] Attempting to load session: session:${contextId}`);
    try {
      const data = await this.env.SESSIONS.get(`session:${contextId}`);
      console.log(`[Orchestrator] Session data from KV:`, data ? 'Found' : 'Not found');
      if (data) {
        const parsed = JSON.parse(data);
        console.log(`[Orchestrator] Loaded session - State: ${parsed.state}, History items: ${parsed.conversationHistory.length}`);
        return parsed;
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }

    // Return new session
    console.log(`[Orchestrator] Creating new session for context: ${contextId}`);
    return {
      contextId,
      conversationHistory: [],
      artifacts: [],
      state: 'new',
      lastActivity: Date.now()
    };
  }

  private async saveSession(contextId: string, session: SessionData): Promise<void> {
    try {
      session.lastActivity = Date.now();
      console.log(`[Orchestrator] Saving session: session:${contextId} - State: ${session.state}, History items: ${session.conversationHistory.length}`);
      await this.env.SESSIONS.put(
        `session:${contextId}`,
        JSON.stringify(session),
        { expirationTtl: 86400 } // 24 hours
      );
      console.log(`[Orchestrator] Session saved successfully`);
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }
}