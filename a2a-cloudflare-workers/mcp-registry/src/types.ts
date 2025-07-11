export interface Env {
  AI: any;
  AGENT_CARDS: KVNamespace;
  EMBEDDINGS_CACHE: KVNamespace;
  TRAVEL_DB: D1Database;
  ENVIRONMENT: string;
  RATE_LIMITER?: any; // Cloudflare rate limiter binding
  // Authentication environment variables
  AUTH_SCHEME?: string;
  API_KEY?: string;
  API_KEYS?: string;
  REQUIRE_HTTPS?: string;
  [key: string]: any; // For dynamic API_KEY_1, API_KEY_2, etc.
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  provider?: string | null;
  version: string;
  documentationUrl?: string | null;
  capabilities: {
    streaming: string;
    pushNotifications: string;
    stateTransitionHistory?: string;
  };
  authentication: {
    credentials?: any;
    schemes: string[];
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
    inputModes?: string[] | null;
    outputModes?: string[] | null;
  }>;
}

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

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}