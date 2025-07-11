/**
 * MCP Client - Proper Model Context Protocol client implementation
 * Provides standardized communication with MCP servers
 */

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPResourceRead {
  uri: string;
}

export class MCPClient {
  private binding: any;
  private requestCounter = 0;

  constructor(binding: any) {
    this.binding = binding;
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestCounter,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const response = await this.sendRequest(request);
    
    if (response.error) {
      throw new Error(`MCP Tool Error: ${response.error.message}`);
    }

    // Extract content from tool response
    if (response.result?.content?.[0]?.text) {
      try {
        return JSON.parse(response.result.content[0].text);
      } catch {
        return response.result.content[0].text;
      }
    }

    return response.result;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<any[]> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestCounter,
      method: 'tools/list',
      params: {}
    };

    const response = await this.sendRequest(request);
    return response.result?.tools || [];
  }

  /**
   * List available resources
   */
  async listResources(): Promise<any[]> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestCounter,
      method: 'resources/list',
      params: {}
    };

    const response = await this.sendRequest(request);
    return response.result?.resources || [];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestCounter,
      method: 'resources/read',
      params: { uri }
    };

    const response = await this.sendRequest(request);
    
    if (response.error) {
      throw new Error(`MCP Resource Error: ${response.error.message}`);
    }

    // Extract content from resource response
    if (response.result?.contents?.[0]?.text) {
      try {
        return JSON.parse(response.result.contents[0].text);
      } catch {
        return response.result.contents[0].text;
      }
    }

    return response.result;
  }

  /**
   * Initialize MCP connection
   */
  async initialize(): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestCounter,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {}
      }
    };

    const response = await this.sendRequest(request);
    return response.result;
  }

  /**
   * Send a raw MCP request
   */
  private async sendRequest(request: MCPRequest): Promise<MCPResponse> {
    // For service bindings, we need to provide a full URL
    const response = await this.binding.fetch('https://dummy/rpc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`MCP Request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as MCPResponse;
    
    // Handle transport-level errors
    if (!result.jsonrpc || result.jsonrpc !== '2.0') {
      throw new Error('Invalid MCP response format');
    }

    return result;
  }

  /**
   * Helper methods for common operations
   */

  /**
   * Find an agent by query
   */
  async findAgent(query: string): Promise<any> {
    return this.callTool('find_agent', { query });
  }

  /**
   * Query travel data
   */
  async queryTravelData(sqlQuery: string): Promise<any> {
    return this.callTool('query_travel_data', { query: sqlQuery });
  }

  /**
   * Register an agent (when implemented)
   */
  async registerAgent(agentCard: any, ttl?: number): Promise<any> {
    return this.callTool('register_agent', { 
      agentCard, 
      ttl: ttl || 86400 // Default 24 hours
    });
  }

  /**
   * Update agent capabilities (when implemented)
   */
  async updateCapabilities(agentId: string, capabilities: any): Promise<any> {
    return this.callTool('update_capabilities', {
      agentId,
      capabilities
    });
  }

  /**
   * List agents with filtering (when implemented)
   */
  async listAgents(filters?: {
    capabilities?: string[];
    tags?: string[];
    available?: boolean;
  }): Promise<any[]> {
    return this.callTool('list_agents', { filters });
  }
}

// Export convenience function
export function createMCPClient(binding: any): MCPClient {
  return new MCPClient(binding);
}