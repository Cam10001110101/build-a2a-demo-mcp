/**
 * MCP Client - Proper Model Context Protocol client implementation
 * Provides standardized communication with MCP servers
 */
export class MCPClient {
    binding;
    requestCounter = 0;
    constructor(binding) {
        this.binding = binding;
    }
    /**
     * Call an MCP tool
     */
    async callTool(toolName, args) {
        const request = {
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
            }
            catch {
                return response.result.content[0].text;
            }
        }
        return response.result;
    }
    /**
     * List available tools
     */
    async listTools() {
        const request = {
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
    async listResources() {
        const request = {
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
    async readResource(uri) {
        const request = {
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
            }
            catch {
                return response.result.contents[0].text;
            }
        }
        return response.result;
    }
    /**
     * Initialize MCP connection
     */
    async initialize() {
        const request = {
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
    async sendRequest(request) {
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
        const result = await response.json();
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
    async findAgent(query) {
        return this.callTool('find_agent', { query });
    }
    /**
     * Query travel data
     */
    async queryTravelData(sqlQuery) {
        return this.callTool('query_travel_data', { query: sqlQuery });
    }
    /**
     * Register an agent (when implemented)
     */
    async registerAgent(agentCard, ttl) {
        return this.callTool('register_agent', {
            agentCard,
            ttl: ttl || 86400 // Default 24 hours
        });
    }
    /**
     * Update agent capabilities (when implemented)
     */
    async updateCapabilities(agentId, capabilities) {
        return this.callTool('update_capabilities', {
            agentId,
            capabilities
        });
    }
    /**
     * List agents with filtering (when implemented)
     */
    async listAgents(filters) {
        return this.callTool('list_agents', { filters });
    }
}
// Export convenience function
export function createMCPClient(binding) {
    return new MCPClient(binding);
}
