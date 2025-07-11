import { BaseAgent, AgentCard } from '@a2a-workers/shared/agent-base';
import { A2AAgentResponse } from '@a2a-workers/shared/a2a-protocol';
import { PlanningEngine } from './planning-engine';
import { ConversationState, PlannerResponse } from './types';

interface Env {
  AI: Ai;
  MEMORY: KVNamespace;
  MCP_REGISTRY: Fetcher;
}

export class PlannerAgent extends BaseAgent {
  private env: Env;
  private planningEngine: PlanningEngine;

  constructor(env: Env) {
    const agentCard: AgentCard = {
      name: "Planner Agent",
      description: "Intelligent travel planning agent that analyzes requests and creates structured task plans for booking agents",
      url: "https://agent.planner.demos.build",
      version: "1.0.0",
      capabilities: {
        streaming: "true",
        pushNotifications: "false",
        stateTransitionHistory: "true",
        sessionManagement: "true",
        methodCompatibility: ["tasks/send", "tasks/sendSubscribe", "tasks/get", "tasks/list", "tasks/cancel", "tasks/resubscribe", "tasks/submitInput", "message/send", "message/stream"]
      },
      authentication: {
        schemes: ["none"]
      },
      defaultInputModes: ["text", "data"],
      defaultOutputModes: ["text", "json"],
      skills: [{
        id: "travel_planning",
        name: "Travel Planning & Task Decomposition",
        description: "Analyzes travel requests and breaks them down into actionable tasks for specialized booking agents",
        tags: ["planning", "travel", "task-decomposition", "coordination"],
        examples: [
          "Plan a business trip to Tokyo for next month",
          "I need to book a family vacation to Orlando",
          "Help me organize a romantic getaway to Paris",
          "Create a travel plan for a conference in San Francisco"
        ]
      }]
    };

    super(agentCard);
    this.env = env;
    this.planningEngine = new PlanningEngine(env.AI);
    
    // Set KV storage for A2A state persistence
    this.setKVStorage(env.MEMORY);
  }

  async *stream(query: string, contextId: string, taskId?: string): AsyncGenerator<A2AAgentResponse> {
    try {
      // Load conversation state
      const state = await this.loadConversationState(contextId);

      yield {
        response_type: "status",
        is_task_complete: false,
        require_user_input: false,
        content: "Analyzing your travel request...",
        context_id: contextId
      };

      // Process the user input with planning engine
      const planningResult = await this.planningEngine.processUserInput(query, state);

      // Save updated state
      await this.saveConversationState(contextId, state);

      // Handle different response types
      if (planningResult.status === 'input_required') {
        yield {
          response_type: "input_required",
          is_task_complete: false,
          require_user_input: true,
          content: planningResult.message,
          context_id: contextId
        };
      } else if (planningResult.status === 'completed') {
        yield {
          response_type: "planning_complete",
          is_task_complete: true,
          require_user_input: false,
          content: JSON.stringify(planningResult.data),
          context_id: contextId
        };
      } else if (planningResult.status === 'error') {
        yield {
          response_type: "error",
          is_task_complete: true,
          require_user_input: false,
          content: planningResult.message,
          context_id: contextId
        };
      }

    } catch (error) {
      yield {
        response_type: "error",
        is_task_complete: true,
        require_user_input: false,
        content: `Planning error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context_id: contextId
      };
    }
  }

  private async loadConversationState(contextId: string): Promise<ConversationState> {
    try {
      const data = await this.env.MEMORY.get(`planner_state:${contextId}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading conversation state:', error);
    }

    // Return fresh state
    return {
      contextId,
      messages: [],
      tripInfo: {},
      currentStep: 'initial',
      lastActivity: Date.now()
    };
  }

  private async saveConversationState(contextId: string, state: ConversationState): Promise<void> {
    try {
      state.lastActivity = Date.now();
      await this.env.MEMORY.put(
        `planner_state:${contextId}`,
        JSON.stringify(state),
        { expirationTtl: 86400 } // 24 hours
      );
    } catch (error) {
      console.error('Error saving conversation state:', error);
    }
  }

  async handleQuickPlan(request: Request): Promise<Response> {
    // Endpoint for quick planning without conversation state
    try {
      const body = await request.json() as any;
      const query = body.query || body.message || '';
      
      if (!query) {
        return new Response(JSON.stringify({
          error: 'Query is required'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Create temporary state for single-shot planning
      const tempState: ConversationState = {
        contextId: `quick_${Date.now()}`,
        messages: [],
        tripInfo: {},
        currentStep: 'initial',
        lastActivity: Date.now()
      };

      const result = await this.planningEngine.processUserInput(query, tempState);

      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Failed to process planning request',
        error: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle quick planning endpoint
    if (url.pathname === '/plan' && request.method === 'POST') {
      return this.handleQuickPlan(request);
    }

    // Delegate to BaseAgent for standard A2A protocol handling
    return super.handleRequest(request);
  }
}