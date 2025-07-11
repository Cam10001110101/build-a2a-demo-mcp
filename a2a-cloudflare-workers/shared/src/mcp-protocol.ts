// MCP Protocol Types and Utilities

export const MCP_VERSION = "2025-06-18";

export interface MCPRequest {
  method: string;
  params?: any;
}

export interface MCPResponse {
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPServerInfo {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities?: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolsListResponse {
  tools: MCPTool[];
}

export interface MCPCallToolRequest {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPCallToolResponse {
  result: any;
}

// SSE Event Types
export interface MCPSSEEvent {
  type: 'message' | 'error' | 'done';
  data: any;
}

// Helper functions
export function createMCPResponse(result?: any, error?: MCPError): MCPResponse {
  if (error) {
    return { error };
  }
  return { result };
}

export function createMCPError(code: number, message: string, data?: any): MCPError {
  return { code, message, data };
}

// Standard MCP error codes
export const MCPErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
} as const;