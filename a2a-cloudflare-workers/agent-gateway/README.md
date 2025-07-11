# Agent Gateway Worker

The Agent Gateway serves as the central routing point for all A2A (Agent-to-Agent) communication in the system. It provides agent discovery, request routing, and session management using Cloudflare Workers and Durable Objects.

## Features

- **Agent Discovery**: Integrates with MCP Registry to find appropriate agents
- **Dynamic Routing**: Routes requests to specific agent Workers via Service Bindings
- **Session Management**: Uses Durable Objects to maintain conversation state
- **Multi-Protocol Support**: Handles both A2A protocol and JSON-RPC formats
- **Streaming Support**: Full SSE support for real-time agent responses

## Architecture

```
Client Request → Agent Gateway → MCP Registry (Discovery)
                      ↓
                Agent Workers (via Service Bindings)
                      ↓
                Durable Objects (Session State)
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Deploy Dependent Services

Ensure these services are deployed first:
- MCP Registry Worker
- All Agent Workers (Orchestrator, Planner, etc.)

### 3. Update Service Bindings

Update `wrangler.toml` with actual service names from your deployments.

### 4. Deploy

For development:
```bash
npm run dev
```

For production:
```bash
npm run deploy
```

## API Endpoints

### Agent Discovery
```
POST /discover
Content-Type: application/json

{
  "query": "I need to book a flight"
}
```

### Route to Agent
```
POST /route
Content-Type: application/json

{
  "query": "Book a flight from NYC to London",
  "context_id": "optional-session-id",
  "agent": "optional-specific-agent"
}
```

### Service Status
```
GET /status
```

### Direct Agent Access

Access agents via subdomain or path:
- `https://orchestrator.agent.gateway.demos.build/`
- `https://agent.gateway.demos.build/agents/planner/`

## Session Management

Sessions are managed using Durable Objects and provide:
- Context persistence across requests
- Agent interaction history
- Metadata storage
- Automatic cleanup after 24 hours of inactivity

## Routing Logic

1. **Explicit Agent**: If `agent` parameter provided, route directly
2. **Query-based Discovery**: Use MCP Registry to find best agent
3. **Subdomain/Path Routing**: Direct routing based on URL structure

## Streaming Responses

The gateway supports SSE streaming:
```bash
curl -X POST https://agent.gateway.demos.build/route \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"query": "Plan a trip to Paris"}'
```

## Error Handling

- **404**: Agent not found
- **405**: Method not allowed
- **500**: Internal server error

All errors return JSON with error details.

## Development Tips

1. **Local Testing**: Use `wrangler dev` with `--local` flag for faster iteration
2. **Service Bindings**: In development, services must be running locally
3. **Durable Objects**: Require `wrangler dev` (not `--local`) for full functionality

## Monitoring

Check service health:
```bash
curl https://agent.gateway.demos.build/status
```

Response includes status of all connected services.