import { OrchestratorAgent } from './orchestrator';

export interface Env {
  AI: Ai;
  SESSIONS: KVNamespace;
  MCP_REGISTRY: Fetcher;
  // Legacy service bindings - optional for backward compatibility
  PLANNER?: Fetcher;
  AIR_TICKETS?: Fetcher;
  HOTELS?: Fetcher;
  CAR_RENTAL?: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    console.log(`[Orchestrator] ${requestId} - ${request.method} ${url.pathname} - Start`);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      console.log(`[Orchestrator] ${requestId} - CORS preflight request`);
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    try {
      // Debug endpoint to see what A2A Inspector sends
      if (url.pathname === '/debug' && request.method === 'POST') {
        const body = await request.json();
        console.log(`[Orchestrator] Debug - Request body:`, JSON.stringify(body, null, 2));
        
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        
        (async () => {
          const response = {
            jsonrpc: '2.0',
            id: body.id || 'debug',
            result: {
              message: 'Debug: Request received',
              request_body: body,
              available_fields: Object.keys(body)
            }
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(response)}\n\n`));
          await writer.close();
        })();
        
        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Test endpoint for A2A Inspector
      if (url.pathname === '/test-sse' && request.method === 'POST') {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        
        (async () => {
          // Simple success response
          const response = {
            jsonrpc: '2.0',
            id: 'test',
            result: {
              message: 'Hello from Orchestrator Agent',
              timestamp: new Date().toISOString()
            }
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(response)}\n\n`));
          await writer.close();
        })();
        
        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Check if this is a JSON-RPC request with method field
      if (request.method === 'POST' && request.headers.get('content-type')?.includes('application/json')) {
        const bodyText = await request.text();
        let body;
        try {
          body = JSON.parse(bodyText);
        } catch (e) {
          // Not JSON, pass through
          const newRequest = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: bodyText
          });
          const orchestrator = new OrchestratorAgent(env);
          return await orchestrator.handleRequest(newRequest);
        }
        
        // Check if it's a JSON-RPC request with message/stream method
        if (body.jsonrpc === '2.0' && body.method === 'message/stream' && body.params?.message?.parts?.[0]?.text) {
          console.log('[Orchestrator] Received A2A Inspector request:', JSON.stringify(body));
          
          // Convert to our expected format, generating contextId if missing
          const convertedBody = {
            message: body.params.message.parts[0].text,
            contextId: body.params.message.contextId || `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
            id: body.id,
            messageId: body.params.message.messageId
          };
          
          console.log('[Orchestrator] Converted body:', JSON.stringify(convertedBody));
          
          const newRequest = new Request(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(convertedBody)
          });
          
          const orchestrator = new OrchestratorAgent(env);
          return await orchestrator.handleRequest(newRequest);
        }
        
        // Not a message/stream request, pass through
        const newRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: bodyText
        });
        const orchestrator = new OrchestratorAgent(env);
        return await orchestrator.handleRequest(newRequest);
      }
      
      console.log(`[Orchestrator] ${requestId} - Creating orchestrator instance`);
      const orchestrator = new OrchestratorAgent(env);
      const response = await orchestrator.handleRequest(request);
      
      const duration = Date.now() - startTime;
      console.log(`[Orchestrator] ${requestId} - ${request.method} ${url.pathname} - Complete (${duration}ms) - Status: ${response.status}`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Orchestrator] ${requestId} - ${request.method} ${url.pathname} - Error (${duration}ms):`, error);
      
      return new Response(JSON.stringify({
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
};