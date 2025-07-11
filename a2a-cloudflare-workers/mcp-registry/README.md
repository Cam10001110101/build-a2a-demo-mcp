# MCP Registry Worker

This is the Model Context Protocol (MCP) registry service deployed on Cloudflare Workers. It provides agent discovery, travel data queries, and embeddings-based search using Workers AI.

## Features

- **MCP Protocol Compliance**: Full support for MCP v2025-06-18 with HTTP/SSE transport, protocol version validation, and session management
- **Agent Discovery**: Vector similarity search using Cloudflare Workers AI embeddings
- **Travel Database**: D1-powered SQL database for flights, hotels, and car rentals
- **Caching**: Embeddings cached in Workers KV for performance
- **SSE Support**: Server-Sent Events for real-time communication
- **Version Negotiation**: Supports both MCP 2025-06-18 and backward compatibility with 2024-11-05

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Cloudflare Resources

Create KV namespaces:
```bash
npm run create-kv
```

Create D1 database:
```bash
npm run create-db
```

Update `wrangler.toml` with the actual IDs returned from these commands.

### 3. Initialize Database

Create schema:
```bash
npm run db-init
```

Seed data:
```bash
npm run db-seed
```

### 4. Deploy

For development:
```bash
npm run dev
```

For production:
```bash
npm run deploy
```

### 5. Initialize Agent Cards

After deployment, initialize agent cards by making a POST request to:
```bash
curl -X POST https://agent.mcp-registry.demos.build/initialize
```

## API Endpoints

### Unified MCP Endpoint (Recommended)
```
POST /mcp
Content-Type: application/json
MCP-Protocol-Version: 2025-06-18

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

### MCP SSE Transport
```
POST /sse
Content-Type: text/event-stream
MCP-Protocol-Version: 2025-06-18
```

### Legacy RPC (requires protocol version header)
```
POST /rpc
Content-Type: application/json
MCP-Protocol-Version: 2025-06-18

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**⚠️ Important**: All MCP endpoints require the `MCP-Protocol-Version` header for 2025-06-18 compliance.

## Available MCP Methods

### Core MCP Methods
1. **initialize** - Initialize MCP session with version negotiation
2. **tools/list** - List all available tools
3. **tools/call** - Execute a specific tool
4. **resources/list** - List available resources
5. **resources/read** - Read resource content

### Available Tools
1. **find_agent** - Finds the most relevant agent based on natural language query
   - Parameters: `query` (string) - Natural language description of needed capability
   - Returns: Agent information with URL and capabilities

2. **query_travel_data** - Executes SQL queries against the travel database  
   - Parameters: `query` (string) - SQL query to execute
   - Returns: Query results from flights, hotels, car_rentals tables

3. **query_places_data** - Placeholder for places search functionality
   - Parameters: `query` (string) - Location search query
   - Returns: Location information and details

### MCP 2025-06-18 Features
- **Protocol Version Validation**: All requests must include `MCP-Protocol-Version` header
- **Session Lifecycle**: Proper initialization → initializing → initialized states
- **Title Fields**: Tools include title fields for improved UX
- **Version-Specific Capabilities**: Different feature sets based on protocol version
- **Backward Compatibility**: Supports MCP 2024-11-05 for legacy clients

## Testing

### Test Agent Discovery
```bash
curl -X POST https://agent.mcp-registry.demos.build/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "find_agent",
      "arguments": {
        "query": "I need to book a flight"
      }
    }
  }'
```

### Test Database Query
```bash
curl -X POST https://agent.mcp-registry.demos.build/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "query_travel_data",
      "arguments": {
        "query": "SELECT * FROM flights WHERE departure_airport = \"JFK\" LIMIT 5"
      }
    }
  }'
```

### Test Protocol Version Negotiation
```bash
# Test initialization with version negotiation
curl -X POST https://agent.mcp-registry.demos.build/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

### Automated Testing
Use the provided test script for comprehensive validation:
```bash
# From project root (a2a-cloudflare-workers)
./scripts/test-deployment.sh
```

## Architecture

- **Workers AI**: Uses `@cf/baai/bge-large-en-v1.5` for 1024-dimensional embeddings
- **Workers KV**: Stores agent cards and caches embeddings
- **D1 Database**: SQLite-compatible database for travel data
- **SSE Transport**: Real-time bidirectional communication

## Environment Variables

Configure in `wrangler.toml`:
- `ENVIRONMENT`: Set to "development" or "production"

## Observability

The MCP Registry has Cloudflare Observability enabled for comprehensive monitoring:

```toml
[observability]
enabled = true
```

### Custom Domain

Access the MCP Registry via its custom domain:
- **Production**: https://agent.mcp-registry.demos.build
- **Legacy URL**: https://a2a-mcp-registry.cbrohn.workers.dev

### Monitoring Features

- **Real-time Logs**: View request logs in Cloudflare dashboard
- **Performance Metrics**: Track response times, success rates, and error rates
- **Resource Usage**: Monitor KV operations, D1 queries, and Workers AI usage
- **Request Tracing**: Detailed execution traces for debugging

### Accessing Observability Data

1. Visit the Cloudflare dashboard
2. Navigate to Workers & Pages → a2a-mcp-registry
3. View logs, metrics, and performance data
4. Use filters to search by time range, log level, or request details

## Troubleshooting

1. **KV namespace not found**: Ensure you've created KV namespaces and updated wrangler.toml
2. **D1 database errors**: Run database initialization scripts
3. **Embeddings errors**: Check Workers AI is enabled for your account
4. **CORS issues**: The worker includes CORS headers for all endpoints
5. **Custom domain issues**: Verify DNS configuration and propagation
6. **Performance issues**: Check observability logs for bottlenecks or errors