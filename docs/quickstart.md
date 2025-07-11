
# Quickstart Guide

This repository contains both Python and Cloudflare Workers implementations. The **Cloudflare Workers implementation** is the primary focus and is fully deployed to production.

## 🌟 **Production Deployment (Cloudflare Workers)**

The production system is fully deployed and ready to use:

### **Public Endpoints**
- **MCP Registry**: `https://agent.mcp-registry.demos.build`
- **Orchestrator**: `https://agent.orchestrator.demos.build`
- **Planner**: `https://agent.planner.demos.build`
- **Air Tickets**: `https://agent.air-tickets.demos.build`
- **Hotels**: `https://agent.hotels.demos.build`
- **Car Rental**: `https://agent.car-rental.demos.build`

### **Testing the Production System**
```bash
# Test MCP Registry with proper protocol headers
curl -X POST https://agent.mcp-registry.demos.build/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'

# Test agent discovery
curl -X POST https://agent.mcp-registry.demos.build/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "find_agent",
      "arguments": {
        "query": "I need to book a flight"
      }
    }
  }'

# Test orchestrator for travel planning
curl -X POST https://agent.orchestrator.demos.build/ \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "Plan a 3-day business trip to San Francisco next month"
  }'
```

## 🛠 **Local Development (Cloudflare Workers)**

### **Setup**
```bash
# Navigate to Cloudflare Workers project
cd a2a-cloudflare-workers

# Install dependencies
npm install

# Automated setup and deployment
./scripts/create-kv-namespaces.sh
cd mcp-registry && npm run create-db && npm run db-init && npm run db-seed && cd ..
./scripts/deploy-all.sh
curl -X POST https://agent.mcp-registry.demos.build/initialize
```

### **Local Development**
```bash
# Run individual workers locally
cd mcp-registry && npm run dev          # Port 8787
cd ../agents/orchestrator && npm run dev # Port 8788  
cd ../agents/planner && npm run dev      # Port 8789
cd ../agents/air-tickets && npm run dev  # Port 8790
cd ../agents/hotels && npm run dev       # Port 8791
cd ../agents/car-rental && npm run dev   # Port 8792
```

### **Testing Local Development**
```bash
# Run comprehensive test suite
./scripts/test-deployment.sh

# Test local MCP Registry
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "MCP-Protocol-Version: 2025-06-18" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## 🐍 **Python Implementation (Alternative)**

For local Python development and testing:

### **Setup Environment**
```bash
uv venv
source .venv/bin/activate
uv pip install -e .
```

### **Start Python MCP Server**
```bash
cd agents/a2a_mcp && uv run a2a-mcp --run mcp-server --transport sse
```

### **Start Python Agents**
```bash
# Orchestrator Agent
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/orchestrator_agent.json --port 10101

# Planner Agent  
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/planner_agent.json --port 10102

# Task Agents
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/air_ticketing_agent.json --port 10103
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/hotel_booking_agent.json --port 10104
cd agents/a2a_mcp && uv run src/a2a_mcp/agents/ --agent-card agent_cards/car_rental_agent.json --port 10105
```

### **Python Local Endpoints**
- **MCP Server**: `http://localhost:10100/sse`
- **Orchestrator**: `http://localhost:10101`
- **Planner**: `http://localhost:10102`
- **Air Tickets**: `http://localhost:10103`
- **Hotels**: `http://localhost:10104`
- **Car Rental**: `http://localhost:10105`

## 🔧 **Development Tools**

### **Start a2a CLI** (connects to Python agents)
```bash
cd hosts/cli && uv run . --agent http://localhost:10101
```

### **Start a2a Inspector**
```bash
# Frontend
cd a2a-inspector/frontend && npm run build -- --watch

# Backend
cd a2a-inspector/backend && uv run app.py
```
Access at: `http://127.0.0.1:5001`

### **Start MCP Inspector**
```bash
# For production MCP Registry
npx @modelcontextprotocol/inspector https://agent.mcp-registry.demos.build/sse

# For local Python MCP Server  
npx @modelcontextprotocol/inspector http://localhost:10100/sse
```

### **Start Agent Chat UI**
```bash
cd demo/ui && uv run main.py
```
Access at: `http://0.0.0.0:12000/`

## 📋 **MCP Client Configuration**

### **Claude Desktop** (production)
```json
{
  "mcpServers": {
    "a2a-production": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://agent.mcp-registry.demos.build/sse"]
    }
  }
}
```

### **Claude Desktop** (local Python)
```json
{
  "mcpServers": {
    "a2a-local": {
      "command": "npx", 
      "args": ["-y", "mcp-remote", "http://localhost:10100/sse"]
    }
  }
}
```

## 🌐 **Agent Cards**

All agents expose their capabilities via standard A2A agent cards:
- **Production**: `https://agent.{service}.demos.build/.well-known/agent.json`
- **Python Local**: `http://localhost:{port}/.well-known/agent.json`
