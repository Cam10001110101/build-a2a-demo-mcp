import { BaseAgent, AgentCard } from '@a2a-workers/shared/agent-base';
import { A2AAgentResponse } from '@a2a-workers/shared/a2a-protocol';
import { MCPClient, createMCPClient } from '@a2a-workers/shared/mcp-client';

interface Env {
  AI: Ai;
  SUMMARIES: KVNamespace;
  MCP_REGISTRY: Fetcher;
}

interface SummaryRequest {
  content: string | string[];
  format?: 'bullet' | 'paragraph' | 'executive' | 'technical';
  maxLength?: number;
  contextId?: string;
  metadata?: Record<string, any>;
}

export class SummaryAgent extends BaseAgent {
  private env: Env;
  private mcpClient: MCPClient;

  constructor(env: Env) {
    const agentCard: AgentCard = {
      name: "Summary Agent",
      description: "Specialized agent for creating concise, accurate summaries of travel plans, agent responses, and complex information",
      url: "https://agent.summary.demos.build",
      version: "1.0.0",
      capabilities: {
        streaming: "true",
        pushNotifications: "false",
        stateTransitionHistory: "false"
      },
      authentication: {
        schemes: ["none"]
      },
      defaultInputModes: ["text", "application/json"],
      defaultOutputModes: ["text", "application/json"],
      skills: [{
        id: "summarize",
        name: "Content Summarization",
        description: "Create concise summaries of travel plans, agent responses, and complex information",
        tags: ["summary", "aggregation", "synthesis", "travel", "planning"],
        examples: [
          "Summarize the travel itinerary",
          "Create an executive summary of the trip plan",
          "Provide a bullet-point summary of all bookings",
          "Generate a technical summary of agent interactions"
        ]
      }]
    };

    super(agentCard);
    this.env = env;
    this.mcpClient = createMCPClient(env.MCP_REGISTRY);
    
    // Set KV storage for A2A state persistence
    this.setKVStorage(env.SUMMARIES);
  }

  async *stream(query: string, contextId: string): AsyncGenerator<A2AAgentResponse> {
    try {
      // Parse the request
      let summaryRequest: SummaryRequest;
      
      try {
        // Try to parse as JSON first
        summaryRequest = JSON.parse(query);
      } catch {
        // Fallback to simple text request
        summaryRequest = {
          content: query,
          format: 'paragraph',
          contextId
        };
      }

      yield {
        response_type: "status",
        is_task_complete: false,
        require_user_input: false,
        content: "Analyzing content for summarization...",
        context_id: contextId
      };

      // Generate the summary
      const summary = await this.generateSummary(summaryRequest);

      // Save summary to KV for future reference
      if (contextId) {
        await this.saveSummary(contextId, summary, summaryRequest);
      }

      yield {
        response_type: "summary",
        is_task_complete: true,
        require_user_input: false,
        content: summary,
        context_id: contextId,
        metadata: {
          format: summaryRequest.format,
          wordCount: summary.split(/\s+/).length,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      yield {
        response_type: "error",
        is_task_complete: true,
        require_user_input: false,
        content: `Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context_id: contextId
      };
    }
  }

  private async generateSummary(request: SummaryRequest): Promise<string> {
    const { content, format = 'paragraph', maxLength = 500 } = request;
    
    // Prepare content for summarization
    const textContent = Array.isArray(content) ? content.join('\n\n') : content;
    
    // Create format-specific prompts
    const formatInstructions = this.getFormatInstructions(format);
    
    const prompt = `
You are a professional summarization agent specializing in travel planning and coordination.

Task: Create a ${format} summary of the following content.
${formatInstructions}

Maximum length: ${maxLength} words

Content to summarize:
${textContent}

Generate a clear, concise summary that captures all essential information while maintaining readability.
`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You are a professional summarization agent. Provide clear, accurate summaries.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: Math.min(maxLength * 2, 2000) // Rough token estimate
      });

      return response.response || 'Summary generation failed';
    } catch (error) {
      console.error('AI summarization error:', error);
      // Fallback to simple extraction
      return this.fallbackSummary(textContent, maxLength);
    }
  }

  private getFormatInstructions(format: string): string {
    switch (format) {
      case 'bullet':
        return `
Format the summary as bullet points:
- Start each point with a bullet (-)
- Keep each point concise and focused
- Group related items together
- Include all key information`;

      case 'executive':
        return `
Create an executive summary with:
- A brief overview paragraph
- Key highlights section
- Important decisions or actions required
- Timeline and cost summary if applicable`;

      case 'technical':
        return `
Provide a technical summary including:
- System interactions and agent communications
- Data structures and formats used
- API calls and responses
- Error states and recovery actions`;

      case 'paragraph':
      default:
        return `
Write a flowing paragraph summary that:
- Captures the main points coherently
- Maintains logical flow between ideas
- Emphasizes the most important information
- Provides context where necessary`;
    }
  }

  private fallbackSummary(content: string, maxLength: number): string {
    // Simple fallback summarization
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    const words = content.split(/\s+/);
    
    if (words.length <= maxLength) {
      return content;
    }

    // Take first sentences up to maxLength
    let summary = '';
    let wordCount = 0;
    
    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).length;
      if (wordCount + sentenceWords > maxLength) {
        break;
      }
      summary += sentence + ' ';
      wordCount += sentenceWords;
    }

    return summary.trim() + '...';
  }

  private async saveSummary(
    contextId: string, 
    summary: string, 
    request: SummaryRequest
  ): Promise<void> {
    try {
      const summaryRecord = {
        contextId,
        summary,
        request,
        timestamp: Date.now(),
        metadata: {
          wordCount: summary.split(/\s+/).length,
          format: request.format,
          sourceLength: Array.isArray(request.content) 
            ? request.content.join(' ').split(/\s+/).length 
            : request.content.split(/\s+/).length
        }
      };

      await this.env.SUMMARIES.put(
        `summary:${contextId}:${Date.now()}`,
        JSON.stringify(summaryRecord),
        { expirationTtl: 86400 * 7 } // 7 days
      );

      // Also save latest summary for quick access
      await this.env.SUMMARIES.put(
        `summary:latest:${contextId}`,
        JSON.stringify(summaryRecord),
        { expirationTtl: 86400 * 7 }
      );
    } catch (error) {
      console.error('Error saving summary:', error);
    }
  }

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle summary retrieval
    if (url.pathname === '/summary' && request.method === 'GET') {
      const contextId = url.searchParams.get('context_id');
      if (!contextId) {
        return new Response(JSON.stringify({ error: 'context_id required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      const summary = await this.env.SUMMARIES.get(`summary:latest:${contextId}`, 'json');
      if (!summary) {
        return new Response(JSON.stringify({ error: 'Summary not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response(JSON.stringify(summary), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Delegate to BaseAgent for standard A2A protocol handling
    return super.handleRequest(request);
  }
}