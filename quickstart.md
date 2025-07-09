
# Setup Environment

```bash
uv venv
source .venv/bin/activate
uv pip install -e .
```

# Start MCP Server

```
cd agents/a2a_mcp && uv run a2a-mcp --run mcp-server --transport sse
```

# Start a2a Agents

Orchestrator Agent:
```
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/orchestrator_agent.json --port 10101
```

Planner Agent:
```
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/planner_agent.json --port 10102
```

Airline Ticketing Agent:
```
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/air_ticketing_agent.json --port 10103
```

Hotel Booking Agent:
```
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/hotel_booking_agent.json --port 10104
```

Car Rental Reservations Agent:
```
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/car_rental_agent.json --port 10105
```

# Start a2a CLI - Connect Orchestrator Agent

CLI:
```
cd hosts/cli && uv run . --agent http://localhost:10101
```

# Start a2a Inspector

Frontend:
```
cd a2a-inspector/frontend && npm run build -- --watch
```

Backend:
```
cd a2a-inspector/backend && uv run app.py
```

# Start MCP Inspector

```
npx @modelcontextprotocol/inspector http://localhost:10100/sse
```

# Start Agent Chat UI
```
cd demo/ui && uv run main.py
```


# Endpoint URLs

### MCP Server
```
http://localhost:10100/sse
```
Example MCP Client Config (Claude Desktop)
```json
{
  "mcpServers": {
    "a2a-mcp-server": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:10100/sse"
      ]
    }
  }
}
```

### Orchestrator Agent
```
http://localhost:10101
```
```
http://localhost:10101/.well-known/agent.json
```

### Planner Agent
```
http://localhost:10102
```
```
http://localhost:10102/.well-known/agent.json
```

### Airline Ticketing Agent
```
http://localhost:10103
```
```
http://localhost:10103/.well-known/agent.json
```

### Hotel Booking Agent
```
http://localhost:10104
```
```
http://localhost:10104/.well-known/agent.json
```

### Car Rental Reservations Agent
```
http://localhost:10105
```
```
http://localhost:10105/.well-known/agent.json
```

### a2a Inspector
```
http://127.0.0.1:5001
```

### MCP Inspector
```
http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=AUTO_GENERATED_TOKEN#resources
```
### Agent Chat UI

```
http://0.0.0.0:12000/
```
