export interface Env {
  MCP_REGISTRY: Fetcher;
  ORCHESTRATOR_AGENT: Fetcher;
  PLANNER_AGENT: Fetcher;
  AIR_TICKETS_AGENT: Fetcher;
  HOTELS_AGENT: Fetcher;
  CAR_RENTAL_AGENT: Fetcher;
  SESSIONS: DurableObjectNamespace;
  ENVIRONMENT: string;
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

export interface A2ARequest {
  query?: string;
  message?: string;
  context_id?: string;
  contextId?: string;
  task_id?: string;
  taskId?: string;
}

export interface A2AResponse {
  is_task_complete: boolean;
  require_user_input: boolean;
  content: string;
  context_id?: string;
}

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}