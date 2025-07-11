import { Env, AgentCard, A2ARequest, A2AResponse } from './types';

export { AgentSession } from './session';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    // Route to specific agent based on subdomain or path
    const agentName = extractAgentName(url);
    
    if (agentName) {
      return routeToAgent(request, env, agentName);
    }

    // Default gateway endpoints
    if (url.pathname === '/discover') {
      return handleDiscover(request, env);
    } else if (url.pathname === '/route') {
      return handleRoute(request, env);
    } else if (url.pathname === '/status') {
      return handleStatus(env);
    }

    return new Response('Agent Gateway - Use /discover or /route endpoints', { 
      status: 200,
      headers: getCorsHeaders()
    });
  }
};

function extractAgentName(url: URL): string | null {
  // Check subdomain
  const subdomain = url.hostname.split('.')[0];
  const agentSubdomains = ['orchestrator', 'planner', 'air-tickets', 'hotels', 'car-rental'];
  
  if (agentSubdomains.includes(subdomain)) {
    return subdomain;
  }

  // Check path prefix
  const pathMatch = url.pathname.match(/^\/agents\/([^/]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  return null;
}

async function routeToAgent(request: Request, env: Env, agentName: string): Promise<Response> {
  let targetService: Fetcher | null = null;
  
  switch (agentName) {
    case 'orchestrator':
      targetService = env.ORCHESTRATOR_AGENT;
      break;
    case 'planner':
      targetService = env.PLANNER_AGENT;
      break;
    case 'air-tickets':
      targetService = env.AIR_TICKETS_AGENT;
      break;
    case 'hotels':
      targetService = env.HOTELS_AGENT;
      break;
    case 'car-rental':
      targetService = env.CAR_RENTAL_AGENT;
      break;
  }

  if (!targetService) {
    return new Response(`Agent not found: ${agentName}`, { 
      status: 404,
      headers: getCorsHeaders()
    });
  }

  // Forward the request to the agent
  const agentUrl = new URL(request.url);
  agentUrl.pathname = agentUrl.pathname.replace(/^\/agents\/[^/]+/, '');
  
  const response = await targetService.fetch(new Request(agentUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
    // @ts-ignore
    duplex: 'half'
  }));

  // Add CORS headers to the response
  const newHeaders = new Headers(response.headers);
  Object.entries(getCorsHeaders()).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

async function handleDiscover(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: getCorsHeaders()
    });
  }

  try {
    const body = await request.json() as { query: string };
    
    // Call MCP Registry to find agent
    const mcpResponse = await env.MCP_REGISTRY.fetch('https://mcp-registry.internal/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'find_agent',
          arguments: { query: body.query }
        }
      })
    });

    const result = await mcpResponse.json() as any;
    
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400,
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'application/json'
        }
      });
    }

    // Extract agent card from response
    const agentCard = JSON.parse(result.result.content[0].text) as AgentCard;
    
    return new Response(JSON.stringify(agentCard), {
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json'
      }
    });
  }
}

async function handleRoute(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: getCorsHeaders()
    });
  }

  try {
    const body = await request.json() as A2ARequest & { agent?: string };
    
    // If no agent specified, discover one based on query
    let agentName = body.agent;
    if (!agentName && body.query) {
      const mcpResponse = await env.MCP_REGISTRY.fetch('https://mcp-registry.internal/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'find_agent',
            arguments: { query: body.query }
          }
        })
      });

      const result = await mcpResponse.json() as any;
      if (!result.error) {
        const agentCard = JSON.parse(result.result.content[0].text) as AgentCard;
        agentName = agentCard.name.toLowerCase().replace(/\s+/g, '-');
      }
    }

    if (!agentName) {
      return new Response(JSON.stringify({ 
        error: 'No agent specified or found for query' 
      }), {
        status: 400,
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'application/json'
        }
      });
    }

    // Get or create session
    const contextId = body.context_id || body.contextId || generateContextId();
    const sessionId = env.SESSIONS.idFromName(contextId);
    const sessionStub = env.SESSIONS.get(sessionId);

    // Update session with agent info
    await sessionStub.fetch('https://session.internal/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId,
        agents: { [agentName]: `https://agent.${agentName}.demos.build` }
      })
    });

    // Route to the agent
    let targetService: Fetcher | null = null;
    
    switch (agentName) {
      case 'orchestrator':
      case 'orchestrator-agent':
        targetService = env.ORCHESTRATOR_AGENT;
        break;
      case 'planner':
      case 'langraph-planner-agent':
        targetService = env.PLANNER_AGENT;
        break;
      case 'air-ticketing':
      case 'air-ticketing-agent':
        targetService = env.AIR_TICKETS_AGENT;
        break;
      case 'hotel-booking':
      case 'hotel-booking-agent':
        targetService = env.HOTELS_AGENT;
        break;
      case 'car-rental':
      case 'car-rental-agent':
        targetService = env.CAR_RENTAL_AGENT;
        break;
    }

    if (!targetService) {
      return new Response(JSON.stringify({ 
        error: `Agent service not found: ${agentName}` 
      }), {
        status: 404,
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'application/json'
        }
      });
    }

    // Check if streaming is requested
    const acceptHeader = request.headers.get('Accept');
    const wantsStream = acceptHeader?.includes('text/event-stream');

    // Forward request to agent
    const agentResponse = await targetService.fetch('https://agent.internal/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(wantsStream ? { 'Accept': 'text/event-stream' } : {})
      },
      body: JSON.stringify({
        ...body,
        context_id: contextId
      })
    });

    // Record in session history
    if (!wantsStream && agentResponse.headers.get('Content-Type')?.includes('application/json')) {
      const responseData = await agentResponse.json();
      await sessionStub.fetch('https://session.internal/add-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: agentName,
          query: body.query || body.message || '',
          response: responseData
        })
      });

      return new Response(JSON.stringify(responseData), {
        headers: {
          ...getCorsHeaders(),
          'Content-Type': 'application/json'
        }
      });
    }

    // For streaming responses, pass through directly
    return new Response(agentResponse.body, {
      headers: {
        ...getCorsHeaders(),
        ...Object.fromEntries(agentResponse.headers.entries())
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json'
      }
    });
  }
}

async function handleStatus(env: Env): Promise<Response> {
  const services = [
    { name: 'MCP Registry', binding: env.MCP_REGISTRY },
    { name: 'Orchestrator Agent', binding: env.ORCHESTRATOR_AGENT },
    { name: 'Planner Agent', binding: env.PLANNER_AGENT },
    { name: 'Air Tickets Agent', binding: env.AIR_TICKETS_AGENT },
    { name: 'Hotels Agent', binding: env.HOTELS_AGENT },
    { name: 'Car Rental Agent', binding: env.CAR_RENTAL_AGENT }
  ];

  const statuses = await Promise.all(
    services.map(async (service) => {
      try {
        // Try to fetch agent info
        const response = await service.binding.fetch('https://agent.internal/.well-known/agent.json');
        const isHealthy = response.status === 200;
        return {
          name: service.name,
          status: isHealthy ? 'healthy' : 'unhealthy',
          statusCode: response.status
        };
      } catch (error) {
        return {
          name: service.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    })
  );

  return new Response(JSON.stringify({
    gateway: 'healthy',
    services: statuses,
    timestamp: new Date().toISOString()
  }), {
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'application/json'
    }
  });
}

function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders()
  });
}

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400'
  };
}

function generateContextId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}