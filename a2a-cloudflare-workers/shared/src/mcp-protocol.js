// MCP Protocol Types and Utilities
export const MCP_VERSION = "2025-06-18";
// Helper functions
export function createMCPResponse(result, error) {
    if (error) {
        return { error };
    }
    return { result };
}
export function createMCPError(code, message, data) {
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
};
