import { DurableObject } from 'cloudflare:workers';

export interface SessionState {
  contextId: string;
  agents: Map<string, string>; // agentName -> agentUrl
  history: Array<{
    timestamp: string;
    agent: string;
    query: string;
    response: any;
  }>;
  metadata: Record<string, any>;
}

export class AgentSession extends DurableObject {
  private state: SessionState;

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.state = {
      contextId: '',
      agents: new Map(),
      history: [],
      metadata: {}
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'GET' && url.pathname === '/state') {
      return this.getState();
    } else if (method === 'POST' && url.pathname === '/update') {
      return this.updateState(request);
    } else if (method === 'POST' && url.pathname === '/add-history') {
      return this.addHistory(request);
    } else if (method === 'DELETE' && url.pathname === '/clear') {
      return this.clearState();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async getState(): Promise<Response> {
    // Convert Map to object for JSON serialization
    const stateData = {
      ...this.state,
      agents: Object.fromEntries(this.state.agents)
    };

    return new Response(JSON.stringify(stateData), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async updateState(request: Request): Promise<Response> {
    try {
      const updates = await request.json() as Partial<SessionState>;
      
      if (updates.contextId !== undefined) {
        this.state.contextId = updates.contextId;
      }
      
      if (updates.agents) {
        // Convert object back to Map
        const agentsObj = updates.agents as any;
        if (agentsObj instanceof Map) {
          this.state.agents = agentsObj;
        } else {
          this.state.agents = new Map(Object.entries(agentsObj));
        }
      }
      
      if (updates.metadata) {
        this.state.metadata = { ...this.state.metadata, ...updates.metadata };
      }

      // Store state persistently
      await this.ctx.storage.put('state', this.state);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async addHistory(request: Request): Promise<Response> {
    try {
      const entry = await request.json() as {
        agent: string;
        query: string;
        response: any;
      };

      this.state.history.push({
        timestamp: new Date().toISOString(),
        ...entry
      });

      // Keep only last 100 entries
      if (this.state.history.length > 100) {
        this.state.history = this.state.history.slice(-100);
      }

      // Store state persistently
      await this.ctx.storage.put('state', this.state);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async clearState(): Promise<Response> {
    this.state = {
      contextId: '',
      agents: new Map(),
      history: [],
      metadata: {}
    };

    await this.ctx.storage.delete('state');

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async alarm() {
    // Clean up old sessions after 24 hours of inactivity
    const lastActivity = this.state.history.length > 0 
      ? new Date(this.state.history[this.state.history.length - 1].timestamp)
      : new Date(0);
    
    const now = new Date();
    const hoursSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceLastActivity > 24) {
      await this.clearState();
    }
  }
}