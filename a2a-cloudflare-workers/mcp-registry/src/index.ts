import { Env, MCPRequest, MCPResponse, MCPTool, MCPResource, AgentCard } from './types';
import { findAgent, queryTravelData, queryPlacesData } from './tools';
import { Authenticator, AuthConfig, loadApiKeysFromEnv } from '@a2a-workers/shared/auth';
import { checkCloudflareRateLimit } from '@a2a-workers/shared/rate-limiter';
import { InputValidator } from '@a2a-workers/shared/validation';
import { registerAgent, listAgents, updateCapabilities } from './agent-registry';
import { checkAgentHealth, updateAgentMetadata, getAllAgentHealth } from './agent-health';

// MCP Lifecycle State Management
interface MCPSession {
  id: string;
  state: 'uninitialized' | 'initializing' | 'initialized';
  protocolVersion: string;
  clientCapabilities?: any;
  serverCapabilities?: any;
  createdAt: number;
  lastActivity: number;
}

// Global session storage (in production, use KV or Durable Objects)
const sessions = new Map<string, MCPSession>();

// Get server capabilities based on protocol version
function getServerCapabilities(protocolVersion: string) {
  const baseCapabilities = {
    tools: {
      listChanged: false
    },
    resources: {
      subscribe: false,
      listChanged: false
    }
  };
  
  // Add version-specific capabilities
  if (protocolVersion === '2025-06-18') {
    return {
      ...baseCapabilities,
      transport: {
        streamableHttp: true,
        sse: true
      },
      elicitation: false, // Not yet implemented
      structuredOutput: false, // Not yet implemented
      experimental: {
        metaFields: true,
        resourceLinks: true
      }
    };
  } else {
    // Fallback for older versions
    return {
      ...baseCapabilities,
      transport: {
        streamableHttp: true,
        sse: true
      }
    };
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    console.log(`[MCP-Registry] ${requestId} - ${request.method} ${url.pathname} - Start`);
    
    try {
      // Handle CORS
      if (request.method === 'OPTIONS') {
        console.log(`[MCP-Registry] ${requestId} - CORS preflight request`);
        return handleCors();
      }

      // Set up authentication
      const authConfig: AuthConfig = {
        scheme: env.AUTH_SCHEME as 'bearer' | 'api-key' | 'none' || 'api-key',
        apiKeys: loadApiKeysFromEnv(env),
        requireHttps: env.REQUIRE_HTTPS !== 'false' // Default to true
      };

      // Validate MCP-Protocol-Version header for MCP endpoints (required in 2025-06-18)
      const mcpPaths = ['/mcp', '/rpc', '/sse'];
      if (mcpPaths.includes(url.pathname)) {
        const protocolVersion = request.headers.get('mcp-protocol-version');
        if (!protocolVersion) {
          console.log(`[MCP-Registry] ${requestId} - Missing required MCP-Protocol-Version header`);
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid request - Missing MCP-Protocol-Version header',
              data: { 
                required: 'MCP-Protocol-Version header is required for MCP 2025-06-18 compliance'
              }
            },
            id: null
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        // Validate protocol version (support 2025-06-18 and fall back to compatible versions)
        const supportedVersions = ['2025-06-18', '2024-11-05'];
        if (!supportedVersions.includes(protocolVersion)) {
          console.log(`[MCP-Registry] ${requestId} - Unsupported protocol version: ${protocolVersion}`);
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Unsupported protocol version',
              data: { 
                requested: protocolVersion,
                supported: supportedVersions
              }
            },
            id: null
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        console.log(`[MCP-Registry] ${requestId} - Protocol version: ${protocolVersion}`);
      }

      // Skip auth for demo/dev environment or public endpoints
      const publicPaths = ['/initialize', '/.well-known/mcp.json', '/.well-known/oauth-authorization-server', '/.well-known/openid_configuration'];
      const skipAuth = authConfig.scheme === 'none' || publicPaths.includes(url.pathname);
      
      if (!skipAuth) {
        // Check rate limit first
        const rateLimitResult = await checkCloudflareRateLimit(request, env.RATE_LIMITER);
        if (!rateLimitResult.allowed) {
          console.log(`[MCP-Registry] ${requestId} - Rate limit exceeded`);
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Rate limit exceeded',
              data: { 
                retryAfter: rateLimitResult.retryAfter,
                limit: rateLimitResult.limit
              }
            },
            id: null
          }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'X-RateLimit-Limit': rateLimitResult.limit.toString(),
              'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
              'X-RateLimit-Reset': rateLimitResult.reset.toString(),
              'Retry-After': rateLimitResult.retryAfter?.toString() || '60'
            }
          });
        }

        // Then authenticate
        const authenticator = new Authenticator(authConfig);
        const authResult = await authenticator.authenticate(request);
        
        if (!authResult.authenticated) {
          console.log(`[MCP-Registry] ${requestId} - Authentication failed: ${authResult.reason}`);
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Authentication failed',
              data: { reason: authResult.reason }
            },
            id: null
          }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'WWW-Authenticate': `${authConfig.scheme} realm="MCP Registry"`
            }
          });
        }
        
        console.log(`[MCP-Registry] ${requestId} - Authenticated client: ${authResult.clientId}`);
      }

      // Route requests
      let response: Response;
      if (url.pathname === '/mcp') {
        console.log(`[MCP-Registry] ${requestId} - Handling unified MCP endpoint`);
        response = await handleMCPEndpoint(request, env);
      } else if (url.pathname === '/sse') {
        console.log(`[MCP-Registry] ${requestId} - Handling SSE connection`);
        response = await handleSSE(request, env);
      } else if (url.pathname === '/rpc') {
        console.log(`[MCP-Registry] ${requestId} - Handling RPC call`);
        response = await handleRPC(request, env);
      } else if (url.pathname === '/initialize') {
        console.log(`[MCP-Registry] ${requestId} - Handling initialization`);
        response = await handleInitialize(env);
      } else if (url.pathname === '/.well-known/mcp.json') {
        console.log(`[MCP-Registry] ${requestId} - Handling MCP server info`);
        response = await handleMCPInfo();
      } else if (url.pathname === '/.well-known/oauth-authorization-server') {
        console.log(`[MCP-Registry] ${requestId} - Handling OAuth authorization server metadata`);
        response = await handleOAuthMetadata();
      } else if (url.pathname === '/.well-known/openid_configuration') {
        console.log(`[MCP-Registry] ${requestId} - Handling OpenID configuration`);
        response = await handleOpenIDConfiguration();
      } else if (url.pathname === '/' || url.pathname === '') {
        console.log(`[MCP-Registry] ${requestId} - Handling root path`);
        // Handle root path based on method and content type
        if (request.method === 'POST' && request.headers.get('content-type')?.includes('application/json')) {
          // If it's a POST with JSON, treat it as RPC
          response = await handleRPC(request, env);
        } else {
          // Otherwise, return server info
          response = await handleMCPInfo();
        }
      } else {
        console.log(`[MCP-Registry] ${requestId} - Unknown path: ${url.pathname}`);
        response = new Response('Not Found', { status: 404 });
      }

      const duration = Date.now() - startTime;
      console.log(`[MCP-Registry] ${requestId} - ${request.method} ${url.pathname} - Complete (${duration}ms) - Status: ${response.status}`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[MCP-Registry] ${requestId} - ${request.method} ${url.pathname} - Error (${duration}ms):`, error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
};

// Unified MCP endpoint supporting both Streamable HTTP and SSE transports
async function handleMCPEndpoint(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = request.headers.get('mcp-session-id');
  
  if (request.method === 'POST') {
    // Streamable HTTP transport - handle JSON-RPC requests
    console.log(`[MCP-Registry] Streamable HTTP POST request${sessionId ? ` (session: ${sessionId})` : ''}`);
    
    try {
      const body = await request.json() as any;
      
      // Validate MCP request format
      const validation = InputValidator.validateMCPRequest(body);
      if (!validation.valid) {
        return new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || null,
          error: {
            code: -32600,
            message: 'Invalid request',
            data: { errors: validation.errors }
          }
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            ...(sessionId && { 'Mcp-Session-Id': sessionId })
          }
        });
      }
      
      const mcpRequest = body as MCPRequest;
      const protocolVersion = request.headers.get('mcp-protocol-version');
      const response = await handleMCPRequest(mcpRequest, env, sessionId, protocolVersion);
      
      // Check if client requested streaming via Accept header
      const acceptHeader = request.headers.get('accept');
      const isStreamingRequested = acceptHeader?.includes('text/event-stream');
      
      if (isStreamingRequested && shouldStreamResponse(mcpRequest)) {
        // Return SSE response for streaming
        return createSSEResponse(response, sessionId);
      } else {
        // Return regular JSON response
        return new Response(JSON.stringify(response), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            ...(sessionId && { 'Mcp-Session-Id': sessionId })
          }
        });
      }
      
    } catch (error) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          ...(sessionId && { 'Mcp-Session-Id': sessionId })
        }
      });
    }
  } else if (request.method === 'GET') {
    // SSE transport - return SSE stream for notifications
    console.log(`[MCP-Registry] SSE GET request${sessionId ? ` (session: ${sessionId})` : ''}`);
    return createSSEStream(sessionId);
  } else if (request.method === 'DELETE' && sessionId) {
    // Session termination
    console.log(`[MCP-Registry] Session termination request (session: ${sessionId})`);
    // TODO: Implement session cleanup if using stateful sessions
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } else {
    return new Response('Method not allowed for MCP endpoint', { 
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Allow': 'GET, POST, DELETE, OPTIONS'
      }
    });
  }
}

// Helper function to determine if response should be streamed
function shouldStreamResponse(request: MCPRequest): boolean {
  // Stream long-running operations or large responses
  const streamableMethods = ['tools/call', 'resources/read'];
  return streamableMethods.includes(request.method);
}

// Create SSE response for streaming data
function createSSEResponse(mcpResponse: MCPResponse, sessionId?: string | null): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Stream the response
  (async () => {
    try {
      // Send the response as SSE event
      const eventData = `data: ${JSON.stringify(mcpResponse)}\n\n`;
      await writer.write(encoder.encode(eventData));
      
      // End the stream
      await writer.close();
    } catch (error) {
      console.error('SSE streaming error:', error);
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, Mcp-Session-Id',
      ...(sessionId && { 'Mcp-Session-Id': sessionId })
    }
  });
}

// Create SSE stream for notifications and keepalive
function createSSEStream(sessionId?: string | null): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Start processing in the background
  (async () => {
    try {
      let keepAlive = true;
      
      // Send initial connection event
      await writer.write(encoder.encode('event: connected\ndata: {"type":"connected"}\n\n'));
      
      // Send periodic keepalive
      const pingInterval = setInterval(async () => {
        if (!keepAlive) {
          clearInterval(pingInterval);
          return;
        }
        try {
          await writer.write(encoder.encode('event: ping\ndata: {"type":"ping","timestamp":' + Date.now() + '}\n\n'));
        } catch (error) {
          keepAlive = false;
          clearInterval(pingInterval);
        }
      }, 30000); // 30 seconds

      // Handle connection cleanup
      const cleanup = () => {
        keepAlive = false;
        clearInterval(pingInterval);
        writer.close();
      };

      // Note: In a real implementation, you'd want to store the stream
      // for sending notifications from other parts of the system
      
    } catch (error) {
      console.error('SSE stream error:', error);
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, Mcp-Session-Id',
      ...(sessionId && { 'Mcp-Session-Id': sessionId })
    }
  });
}

async function handleSSE(request: Request, env: Env): Promise<Response> {
  // Handle POST requests as JSON-RPC (some MCP clients use POST to SSE endpoint)
  if (request.method === 'POST') {
    return await handleRPC(request, env);
  }
  
  // Handle GET requests as traditional SSE
  if (request.method !== 'GET') {
    return new Response('SSE endpoint supports GET and POST requests', { 
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // Create a TransformStream for SSE
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Start processing in the background
  (async () => {
    try {
      // MCP SSE transport starts with connection established
      // Standard MCP clients expect to send initialize request first
      
      // Keep connection alive and handle any POST data that might come through WebSocket-style
      // In practice, MCP SSE is typically unidirectional for notifications
      
      let keepAlive = true;
      const pingInterval = setInterval(async () => {
        if (!keepAlive) {
          clearInterval(pingInterval);
          return;
        }
        try {
          // Send keepalive ping in MCP format
          await writer.write(encoder.encode(': keepalive\n\n'));
        } catch (error) {
          keepAlive = false;
          clearInterval(pingInterval);
        }
      }, 30000); // 30 seconds

      // Clean up on close
      request.signal.addEventListener('abort', () => {
        keepAlive = false;
        clearInterval(pingInterval);
        writer.close();
      });

      // For MCP SSE, we primarily send notifications/progress updates
      // The actual request/response should happen via the /rpc endpoint
      
    } catch (error) {
      console.error('SSE error:', error);
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
    }
  });
}

async function handleRPC(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await request.json() as any;
    
    // Validate MCP request format
    const validation = InputValidator.validateMCPRequest(body);
    if (!validation.valid) {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: body.id || null,
        error: {
          code: -32600,
          message: 'Invalid request',
          data: { errors: validation.errors }
        }
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    const mcpRequest = body as MCPRequest;
    const response = await handleMCPRequest(mcpRequest, env);
    
    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error'
      }
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function handleMCPRequest(request: MCPRequest, env: Env, sessionId?: string | null, protocolVersion?: string): Promise<MCPResponse> {
  const { id, method, params } = request;
  
  console.log(`[MCP-Registry] MCP Request - Method: ${method}, ID: ${id}`, params ? `Params: ${JSON.stringify(params)}` : 'No params');

  // Get or create session
  let session: MCPSession | undefined;
  if (sessionId) {
    session = sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  try {
    switch (method) {
      case 'initialize':
        // Handle initialization with proper version negotiation
        const clientVersion = params?.protocolVersion || protocolVersion || '2025-06-18';
        const clientCapabilities = params?.capabilities || {};
        const clientInfo = params?.clientInfo || {};
        
        console.log(`[MCP-Registry] Initialize request - Client version: ${clientVersion}`, clientInfo);
        
        // Determine best protocol version to use
        const supportedVersions = ['2025-06-18', '2024-11-05'];
        let negotiatedVersion = '2025-06-18'; // Default to latest
        
        if (!supportedVersions.includes(clientVersion)) {
          // Propose the latest compatible version
          console.log(`[MCP-Registry] Client requested unsupported version ${clientVersion}, proposing ${negotiatedVersion}`);
        } else {
          negotiatedVersion = clientVersion;
        }
        
        // Create or update session
        if (sessionId) {
          session = {
            id: sessionId,
            state: 'initializing',
            protocolVersion: negotiatedVersion,
            clientCapabilities,
            serverCapabilities: getServerCapabilities(negotiatedVersion),
            createdAt: Date.now(),
            lastActivity: Date.now()
          };
          sessions.set(sessionId, session);
          console.log(`[MCP-Registry] Created session: ${sessionId}`);
        }
        
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: negotiatedVersion,
            capabilities: getServerCapabilities(negotiatedVersion),
            serverInfo: {
              name: 'MCP Registry Worker',
              version: '1.0.0'
            }
          }
        };
        
      case 'initialized':
        // Handle initialized notification (completion of handshake)
        if (session) {
          session.state = 'initialized';
          console.log(`[MCP-Registry] Session ${sessionId} fully initialized`);
        }
        
        // Notifications don't return responses
        return {
          jsonrpc: '2.0',
          id,
          result: null
        };

      case 'tools/list':
        // Validate session state for non-initialize methods
        if (sessionId && session && session.state !== 'initialized') {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32600,
              message: 'Invalid request - Session not initialized',
              data: { 
                currentState: session.state,
                required: 'Session must be in initialized state'
              }
            }
          };
        } else if (sessionId && !session) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32600,
              message: 'Invalid request - Unknown session',
              data: { 
                sessionId,
                required: 'Session must be initialized first'
              }
            }
          };
        }
        
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: getToolsList(session?.protocolVersion)
          }
        };

      case 'tools/call':
        const toolResult = await callTool(params.name, params.arguments, env);
        return {
          jsonrpc: '2.0',
          id,
          result: toolResult
        };

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: await getResourcesList(env)
          }
        };

      case 'resources/read':
        const resourceContent = await readResource(params.uri, env);
        return {
          jsonrpc: '2.0',
          id,
          result: resourceContent
        };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

function getToolsList(protocolVersion?: string): MCPTool[] {
  const supportsTitle = protocolVersion === '2025-06-18';
  
  return [
    {
      name: 'find_agent',
      ...(supportsTitle && { title: 'Find Agent' }),
      description: 'Finds the most relevant agent card based on a natural language query string.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The natural language query string used to search for a relevant agent.'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'query_travel_data',
      ...(supportsTitle && { title: 'Query Travel Data' }),
      description: 'Retrieves travel data (flights, hotels, car rentals) from the database.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'A SQL SELECT query to run against the travel database.'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'query_places_data',
      ...(supportsTitle && { title: 'Query Places Data' }),
      description: 'Query for places information.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query for places.'
          }
        },
        required: ['query']
      }
    },
    {
      name: 'register_agent',
      ...(supportsTitle && { title: 'Register Agent' }),
      description: 'Register or update an agent card in the registry.',
      inputSchema: {
        type: 'object',
        properties: {
          agentCard: {
            type: 'object',
            description: 'The A2A agent card to register',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              url: { type: 'string' },
              version: { type: 'string' },
              capabilities: { type: 'object' },
              authentication: { type: 'object' },
              skills: { type: 'array' }
            },
            required: ['name', 'description', 'url']
          },
          ttl: {
            type: 'number',
            description: 'Time to live in seconds (default: 86400 - 24 hours)'
          }
        },
        required: ['agentCard']
      }
    },
    {
      name: 'list_agents',
      ...(supportsTitle && { title: 'List Agents' }),
      description: 'List all registered agents with optional filtering.',
      inputSchema: {
        type: 'object',
        properties: {
          filters: {
            type: 'object',
            properties: {
              capabilities: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by required capabilities'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by skill tags'
              },
              available: {
                type: 'boolean',
                description: 'Filter by availability status'
              }
            }
          }
        }
      }
    },
    {
      name: 'update_capabilities',
      ...(supportsTitle && { title: 'Update Agent Capabilities' }),
      description: 'Update an agent\'s capabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: {
            type: 'string',
            description: 'The agent ID (name) to update'
          },
          capabilities: {
            type: 'object',
            description: 'The updated capabilities object'
          }
        },
        required: ['agentId', 'capabilities']
      }
    },
    {
      name: 'check_agent_health',
      ...(supportsTitle && { title: 'Check Agent Health' }),
      description: 'Check the health status of a registered agent by calling its health endpoint.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: {
            type: 'string',
            description: 'The agent ID (name) to check health for'
          }
        },
        required: ['agentId']
      }
    },
    {
      name: 'update_agent_metadata',
      ...(supportsTitle && { title: 'Update Agent Metadata' }),
      description: 'Update metadata for an agent including health status and last seen timestamp.',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: {
            type: 'string',
            description: 'The agent ID (name) to update'
          },
          metadata: {
            type: 'object',
            description: 'The metadata to update',
            properties: {
              health: {
                type: 'string',
                enum: ['healthy', 'unhealthy', 'unknown'],
                description: 'Health status of the agent'
              },
              lastSeen: {
                type: 'string',
                description: 'ISO 8601 timestamp of last successful contact'
              },
              responseTime: {
                type: 'number',
                description: 'Average response time in milliseconds'
              },
              errorCount: {
                type: 'number',
                description: 'Number of consecutive errors'
              }
            }
          }
        },
        required: ['agentId', 'metadata']
      }
    }
  ];
}

async function callTool(name: string, args: any, env: Env): Promise<any> {
  // Get tool schema for validation
  const tools = getToolsList();
  const tool = tools.find(t => t.name === name);
  
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  
  // Validate tool arguments
  const validation = InputValidator.validateToolInput(name, args, tool.inputSchema);
  if (!validation.valid) {
    throw new Error(`Invalid arguments for tool ${name}: ${validation.errors?.join(', ')}`);
  }
  
  // Use sanitized arguments
  const sanitizedArgs = validation.sanitized!;
  
  switch (name) {
    case 'find_agent':
      const agent = await findAgent(sanitizedArgs.query, env);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(agent)
          }
        ]
      };

    case 'query_travel_data':
      const travelData = await queryTravelData(sanitizedArgs.query, env);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(travelData)
          }
        ]
      };

    case 'query_places_data':
      const placesData = await queryPlacesData(sanitizedArgs.query);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(placesData)
          }
        ]
      };

    case 'register_agent':
      const registrationResult = await registerAgent(sanitizedArgs.agentCard, sanitizedArgs.ttl, env);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(registrationResult)
          }
        ]
      };

    case 'list_agents':
      const agents = await listAgents(sanitizedArgs.filters, env);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(agents)
          }
        ]
      };

    case 'update_capabilities':
      const updateResult = await updateCapabilities(sanitizedArgs.agentId, sanitizedArgs.capabilities, env);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(updateResult)
          }
        ]
      };

    case 'check_agent_health':
      const healthResult = await checkAgentHealth(sanitizedArgs.agentId, env);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(healthResult)
          }
        ]
      };

    case 'update_agent_metadata':
      const metadataResult = await updateAgentMetadata(sanitizedArgs.agentId, sanitizedArgs.metadata, env);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(metadataResult)
          }
        ]
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function getResourcesList(env: Env): Promise<MCPResource[]> {
  const resources: MCPResource[] = [
    {
      uri: 'mcp://mcp-registry/agent-cards',
      name: 'Agent Cards List',
      description: 'List of all registered agent cards',
      mimeType: 'application/json'
    },
    {
      uri: 'mcp://mcp-registry/agent-health',
      name: 'Agent Health Status',
      description: 'Health status and metadata for all registered agents',
      mimeType: 'application/json'
    }
  ];

  // Add individual agent card resources
  const agentCardsList = await env.AGENT_CARDS.list();
  for (const key of agentCardsList.keys) {
    const cardName = key.name.replace('agent_card:', '');
    resources.push({
      uri: `mcp://mcp-registry/agent-cards/${cardName}`,
      name: `Agent Card: ${cardName}`,
      description: `Agent card for ${cardName}`,
      mimeType: 'application/json'
    });
  }

  return resources;
}

async function readResource(uri: string, env: Env): Promise<any> {
  if (uri === 'mcp://mcp-registry/agent-cards') {
    const cardUris: string[] = [];
    const agentCardsList = await env.AGENT_CARDS.list();
    
    for (const key of agentCardsList.keys) {
      cardUris.push(`mcp://mcp-registry/agent-cards/${key.name.replace('agent_card:', '')}`);
    }
    
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ agent_cards: cardUris })
        }
      ]
    };
  }

  if (uri === 'mcp://mcp-registry/agent-health') {
    const healthData = await getAllAgentHealth(env);
    
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ agent_health: healthData })
        }
      ]
    };
  }

  // Handle individual agent card resources
  const match = uri.match(/^mcp:\/\/mcp-registry\/agent-cards\/(.+)$/);
  if (match) {
    const cardName = match[1];
    const cardData = await env.AGENT_CARDS.get(`agent_card:${cardName}`, 'json');
    
    if (cardData) {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ agent_card: [cardData] })
          }
        ]
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
}

async function handleMCPInfo(): Promise<Response> {
  const mcpInfo = {
    name: "A2A Agent Registry",
    description: "Model Context Protocol server for Agent-to-Agent discovery and registration",
    version: "1.0.0",
    protocolVersion: "2025-06-18",
    capabilities: {
      tools: true,
      resources: true,
      transport: ["streamable-http", "sse"],
      sessions: true
    },
    endpoints: {
      mcp: "/mcp",           // Unified Streamable HTTP + SSE endpoint
      rpc: "/rpc",           // Legacy JSON-RPC endpoint
      sse: "/sse"            // Legacy SSE endpoint
    },
    transport: {
      streamableHttp: {
        endpoint: "/mcp",
        methods: ["GET", "POST", "DELETE"],
        sessions: true,
        streaming: true
      },
      sse: {
        endpoint: "/sse",
        methods: ["GET"],
        sessions: false,
        streaming: true
      }
    },
    authentication: {
      schemes: ["none"],
      description: "Demo/development server - no authentication required."
    },
    serverInfo: {
      name: "MCP Registry Worker",
      version: "1.0.0",
      host: "Cloudflare Workers"
    }
  };

  return new Response(JSON.stringify(mcpInfo, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Api-Key, Api-Key, Mcp-Session-Id, Mcp-Protocol-Version, Accept',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    }
  });
}

async function handleOAuthMetadata(): Promise<Response> {
  // OAuth 2.0 Authorization Server Metadata (RFC 8414)
  // Note: This server primarily uses API key authentication
  const oauthMetadata = {
    issuer: "https://agent.mcp-registry.demos.build",
    authorization_endpoint: "https://agent.mcp-registry.demos.build/oauth/authorize",
    token_endpoint: "https://agent.mcp-registry.demos.build/oauth/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    scopes_supported: ["mcp:read", "mcp:write"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    // Extension: Indicate alternative authentication methods
    "x-mcp-auth-schemes": ["api-key", "bearer"],
    "x-mcp-preferred-auth": "api-key",
    "x-mcp-api-key-header": "X-API-Key"
  };

  return new Response(JSON.stringify(oauthMetadata, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleOpenIDConfiguration(): Promise<Response> {
  // OpenID Connect Discovery (for compatibility)
  const openidConfig = {
    issuer: "https://agent.mcp-registry.demos.build",
    authorization_endpoint: "https://agent.mcp-registry.demos.build/oauth/authorize",
    token_endpoint: "https://agent.mcp-registry.demos.build/oauth/token",
    userinfo_endpoint: "https://agent.mcp-registry.demos.build/oauth/userinfo",
    jwks_uri: "https://agent.mcp-registry.demos.build/.well-known/jwks.json",
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "mcp:read", "mcp:write"]
  };

  return new Response(JSON.stringify(openidConfig, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Initialize agent cards endpoint (for setup)
async function handleInitialize(env: Env): Promise<Response> {
  try {
    // Load agent cards from the original data
    const agentCards: Record<string, AgentCard> = {
      orchestrator: {
        name: "Orchestrator Agent",
        description: "Orchestrates the task generation and execution",
        url: "https://agent.orchestrator.demos.build/",
        provider: null,
        version: "1.0.0",
        documentationUrl: null,
        capabilities: {
          streaming: "True",
          pushNotifications: "True",
          stateTransitionHistory: "False"
        },
        authentication: {
          credentials: null,
          schemes: ["public"]
        },
        defaultInputModes: ["text", "text/plain"],
        defaultOutputModes: ["text", "text/plain"],
        skills: [{
          id: "executor",
          name: "Task Executor",
          description: "Orchestrates the task generation and execution, takes help from the planner to generate tasks",
          tags: ["execute plan"],
          examples: ["Plan my trip to London, submit an expense report"],
          inputModes: null,
          outputModes: null
        }]
      },
      planner: {
        name: "Langraph Planner Agent",
        description: "Decomposes a travel query into tasks to be executed by task agents",
        url: "https://agent.planner.demos.build/",
        provider: null,
        version: "1.0.0",
        documentationUrl: null,
        capabilities: {
          streaming: "True",
          pushNotifications: "True",
          stateTransitionHistory: "False"
        },
        authentication: {
          credentials: null,
          schemes: ["public"]
        },
        defaultInputModes: ["text", "text/plain"],
        defaultOutputModes: ["text", "text/plain"],
        skills: [{
          id: "planner",
          name: "Travel Planner",
          description: "Plans trips by decomposing travel requirements into executable tasks",
          tags: ["travel planning", "task decomposition"],
          examples: ["Plan a 5-day trip to London for 2 people"],
          inputModes: null,
          outputModes: null
        }]
      },
      air_tickets: {
        name: "Air Ticketing Agent",
        description: "Books airline tickets based on travel requirements",
        url: "https://agent.air-tickets.demos.build/",
        provider: null,
        version: "1.0.0",
        documentationUrl: null,
        capabilities: {
          streaming: "True",
          pushNotifications: "True",
          stateTransitionHistory: "False"
        },
        authentication: {
          credentials: null,
          schemes: ["public"]
        },
        defaultInputModes: ["text", "text/plain"],
        defaultOutputModes: ["text", "text/plain"],
        skills: [{
          id: "book_flights",
          name: "Flight Booking",
          description: "Search and book flights based on travel criteria",
          tags: ["flight booking", "airline tickets"],
          examples: ["Book a flight from NYC to London for June 15th"],
          inputModes: null,
          outputModes: null
        }]
      },
      hotels: {
        name: "Hotel Booking Agent",
        description: "Books hotel accommodations based on travel requirements",
        url: "https://agent.hotels.demos.build/",
        provider: null,
        version: "1.0.0",
        documentationUrl: null,
        capabilities: {
          streaming: "True",
          pushNotifications: "True",
          stateTransitionHistory: "False"
        },
        authentication: {
          credentials: null,
          schemes: ["public"]
        },
        defaultInputModes: ["text", "text/plain"],
        defaultOutputModes: ["text", "text/plain"],
        skills: [{
          id: "book_hotels",
          name: "Hotel Booking",
          description: "Search and book hotels based on location and preferences",
          tags: ["hotel booking", "accommodation"],
          examples: ["Book a hotel in downtown London for 5 nights"],
          inputModes: null,
          outputModes: null
        }]
      },
      car_rental: {
        name: "Car Rental Agent",
        description: "Books rental cars based on travel requirements",
        url: "https://agent.car-rental.demos.build/",
        provider: null,
        version: "1.0.0",
        documentationUrl: null,
        capabilities: {
          streaming: "True",
          pushNotifications: "True",
          stateTransitionHistory: "False"
        },
        authentication: {
          credentials: null,
          schemes: ["public"]
        },
        defaultInputModes: ["text", "text/plain"],
        defaultOutputModes: ["text", "text/plain"],
        skills: [{
          id: "book_car",
          name: "Car Rental",
          description: "Search and book rental cars",
          tags: ["car rental", "vehicle booking"],
          examples: ["Rent a midsize car at JFK airport"],
          inputModes: null,
          outputModes: null
        }]
      }
    };

    // Store agent cards in KV
    for (const [key, card] of Object.entries(agentCards)) {
      await env.AGENT_CARDS.put(`agent_card:${key}`, JSON.stringify(card));
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Agent cards initialized successfully',
      count: Object.keys(agentCards).length
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
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