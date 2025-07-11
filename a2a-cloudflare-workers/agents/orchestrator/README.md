# Orchestrator Agent Worker

The Orchestrator Agent is the central coordinator for multi-agent travel planning workflows. It manages complex task execution across specialized agents using dynamic workflow graphs and maintains session state for continuous conversations.

## Features

- **Workflow Orchestration**: Creates and manages dynamic workflow graphs for task execution
- **Session Management**: Maintains conversation context and state across multiple interactions
- **Multi-Agent Coordination**: Coordinates with planner and task agents via Service Bindings
- **Streaming Support**: Provides real-time status updates during workflow execution
- **Question Answering**: Handles follow-up questions about completed or ongoing trips
- **Resume Capability**: Can pause and resume workflows when user input is required

## Architecture

```
User Query → Orchestrator → Planner Agent (task decomposition)
                ↓
           Workflow Graph Creation
                ↓
         Task Agents Execution (flights, hotels, car rental)
                ↓
           Result Aggregation → Summary Generation
```

## Core Components

### 1. OrchestratorAgent Class
Main agent implementation extending `BaseAgent` with:
- Workflow graph management
- Session state persistence
- Agent coordination logic
- Streaming response handling

### 2. WorkflowGraph
Simplified graph implementation for managing:
- Task nodes and dependencies
- Execution order (topological sort)
- State transitions (READY → RUNNING → COMPLETED/PAUSED/FAILED)
- Result collection and artifact management

### 3. Session Management
Uses Workers KV for persistent storage of:
- Conversation history
- Workflow state
- Collected artifacts
- User preferences and context

## Workflow States

- **new**: Fresh session, ready for new planning request
- **planning**: Delegating to planner for task decomposition
- **executing**: Running workflow tasks
- **paused**: Waiting for user input to continue
- **completed**: All tasks finished, summary generated

## API Endpoints

### Main Agent Endpoint
```
POST /
Content-Type: application/json

{
  "query": "Plan a 5-day trip to London for 2 people",
  "context_id": "optional-session-id"
}
```

### Agent Info
```
GET /.well-known/agent.json
```

Returns agent card with capabilities and metadata.

## Usage Examples

### New Trip Planning
```bash
curl -X POST https://agent.orchestrator.demos.build/ \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "Plan a business trip to Tokyo for next month"
  }'
```

### Resume Paused Workflow
```bash
curl -X POST https://agent.orchestrator.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Yes, book the 8am flight",
    "context_id": "existing-session-id"
  }'
```

### Ask Questions About Trip
```bash
curl -X POST https://agent.orchestrator.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What time is my flight departure?",
    "context_id": "completed-trip-session-id"
  }'
```

## Configuration

### Service Bindings (wrangler.toml)
Update these with your actual service names:
- `MCP_REGISTRY`: Agent discovery service
- `PLANNER`: Task decomposition agent
- `AIR_TICKETS`: Flight booking agent
- `HOTELS`: Hotel booking agent  
- `CAR_RENTAL`: Car rental agent

### KV Namespace
Create and bind a KV namespace for session storage:
```bash
wrangler kv:namespace create "SESSIONS"
```

## Development

### Local Development
```bash
npm install
npm run dev
```

### Deploy
```bash
npm run deploy
```

### Testing
Test with curl or use the Agent Gateway for integrated testing.

## Key Features

### Dynamic Workflow Creation
- Planner decomposes user requests into specific tasks
- Orchestrator creates workflow graph with proper dependencies
- Tasks execute in optimal order based on dependencies

### State Persistence
- Sessions survive across requests
- Workflows can be paused and resumed
- Conversation history maintained

### Error Handling
- Failed tasks marked appropriately
- Workflow continues with remaining tasks
- Clear error reporting to users

### Intelligent Question Handling
- Recognizes questions vs. new planning requests
- Uses AI to answer questions about completed trips
- Maintains context from previous interactions

## Protocol Compliance

- **A2A Protocol**: Full compliance with task status events and artifact updates
- **Streaming**: Server-Sent Events for real-time updates
- **Agent Discovery**: Uses MCP Registry for dynamic agent discovery

## Monitoring

Monitor orchestrator performance through:
- **Cloudflare Observability**: Real-time logs, metrics, and tracing enabled
- **Custom Domain**: https://agent.orchestrator.demos.build
- **Worker Dashboard**: Real-time performance metrics and resource usage
- **KV Storage**: Session state and conversation history monitoring
- **Service Bindings**: Health monitoring of connected agents (MCP Registry, Planner, Task Agents)

### Observability Features

The orchestrator has comprehensive monitoring enabled:

```toml
[observability]
enabled = true
```

Access detailed logs and metrics via:
1. Cloudflare dashboard → Workers & Pages → a2a-orchestrator
2. Real-time request tracing and performance analysis
3. Session state monitoring and workflow execution logs
4. Error tracking and debugging information

## Limitations

- Simplified workflow graph (not full topological sorting)
- Basic question recognition heuristics
- Session TTL limited to 24 hours
- LLM responses subject to Workers AI rate limits