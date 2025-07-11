# Planner Agent Worker

The Planner Agent is a specialized travel planning agent that analyzes user requests and breaks them down into structured, actionable tasks for specialized booking agents. It uses AI-powered conversation management to gather complete trip requirements and generate comprehensive planning outputs.

## Features

- **Intelligent Request Analysis**: Uses AI to understand complex travel requests
- **Conversational Planning**: Asks clarifying questions to gather complete information
- **Structured Task Generation**: Creates detailed tasks for air tickets, hotels, and car rental agents
- **Memory Management**: Maintains conversation state across multiple interactions
- **Quick Planning Mode**: Single-shot planning for simple requests
- **ReAct Pattern**: Reasoning and Acting approach inspired by LangGraph

## Architecture

```
User Input → Conversation State → Planning Engine → AI Analysis
                                        ↓
                                 Decision Tree Logic
                                        ↓
                            Input Required ← → Complete Plan
                                        ↓
                               Task List Generation
```

## Core Components

### 1. PlannerAgent Class
Main agent implementation with:
- Streaming and synchronous response modes
- Conversation state management
- Integration with base agent framework
- Quick planning endpoint

### 2. PlanningEngine
Core planning logic that:
- Processes user input with AI assistance
- Maintains decision tree for information gathering
- Generates structured task lists
- Handles conversation flow management

### 3. Type System
Comprehensive TypeScript types for:
- **TripInfo**: Complete travel information structure
- **PlannerTask**: Individual booking tasks with metadata
- **TaskList**: Complete planning output
- **ConversationState**: Session memory management

## Planning Process

### Information Gathering Priority
1. **Origin & Destination**: Where traveling from/to
2. **Travel Dates**: Departure and return dates
3. **Travelers**: Number and age considerations
4. **Budget & Type**: Trip budget and business/leisure classification
5. **Preferences**: Hotel, car rental, and special requirements

### Task Generation Rules
- **Airfare**: Always generated (priority 1)
- **Hotels**: Generated for overnight trips (priority 2)
- **Car Rental**: Generated when requested or inferred (priority 3)

### Response Types
- **input_required**: More information needed
- **completed**: Full task list generated
- **error**: Processing error occurred

## API Endpoints

### Main Agent Endpoint
```
POST /
Content-Type: application/json

{
  "query": "Plan a business trip to Tokyo for next month",
  "context_id": "optional-session-id"
}
```

### Quick Planning
```
POST /plan
Content-Type: application/json

{
  "query": "I need flights and hotel for London, March 15-22, 2 people"
}
```

### Agent Info
```
GET /.well-known/agent.json
```

## Usage Examples

### Conversational Planning
```bash
# Initial request
curl -X POST https://agent.planner.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I want to visit Paris",
    "context_id": "session_123"
  }'

# Response might ask for dates
# Follow-up with more info
curl -X POST https://agent.planner.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "March 15 to March 22, departing from New York",
    "context_id": "session_123"
  }'
```

### Quick Planning
```bash
curl -X POST https://agent.planner.demos.build/plan \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Book round-trip flights NYC to London March 15-22 for 2 people, plus hotel"
  }'
```

### Streaming Response
```bash
curl -X POST https://agent.planner.demos.build/ \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "Plan a family vacation to Orlando"
  }'
```

## Task Output Format

When planning is complete, generates structured tasks:

```json
{
  "status": "completed",
  "data": {
    "tripInfo": {
      "origin": "JFK",
      "destination": "LHR",
      "departDate": "2024-03-15",
      "returnDate": "2024-03-22",
      "numTravelers": 2,
      "tripType": "leisure",
      "budget": 3000
    },
    "tasks": [
      {
        "id": "task_1",
        "type": "airfare",
        "agent": "air_tickets",
        "description": "Book flight tickets",
        "query": "Book round-trip flights for 2 passengers...",
        "dependencies": [],
        "metadata": {
          "priority": 1,
          "estimatedTime": "10-15 minutes"
        }
      }
    ],
    "reasoning": "Explanation of the planning decisions",
    "totalEstimatedTime": "25-35 minutes"
  }
}
```

## Configuration

### KV Namespace (wrangler.toml)
Create a KV namespace for conversation memory:
```bash
wrangler kv:namespace create "MEMORY"
```

### AI Binding
Uses Workers AI for natural language processing:
- Model: `@cf/meta/llama-3.1-8b-instruct`
- Handles conversation analysis and decision making

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
Test planning capabilities:
```bash
# Test simple request
curl -X POST http://localhost:8787/plan \
  -H "Content-Type: application/json" \
  -d '{"query": "Trip to Paris next month"}'

# Test conversational flow
curl -X POST http://localhost:8787/ \
  -H "Content-Type: application/json" \
  -d '{"query": "I need help planning a vacation"}'
```

## Decision Tree Logic

The planner follows a structured decision tree:

1. **Parse Initial Request**: Extract any explicit information
2. **Identify Missing Info**: Determine critical gaps
3. **Prioritize Questions**: Ask most important questions first
4. **Validate Responses**: Check for completeness and accuracy
5. **Generate Tasks**: Create actionable task list when complete
6. **Provide Reasoning**: Explain planning decisions

## AI Integration

- **Model**: Uses Llama 3.1 8B Instruct for language understanding
- **Prompting**: Chain-of-thought prompting for structured reasoning
- **Context**: Maintains conversation history for coherent interactions
- **Validation**: Parses and validates AI responses for consistency

## Error Handling

- **Graceful Degradation**: Falls back to simpler responses if AI fails
- **Input Validation**: Validates user input and AI responses
- **State Recovery**: Handles conversation state corruption
- **Timeout Handling**: Manages AI response timeouts

## Performance Considerations

- **Memory Efficiency**: Uses KV storage for conversation state
- **Response Speed**: Optimized prompts for fast AI responses
- **Context Management**: Limits conversation history to prevent context overflow
- **Caching**: Session state cached with 24-hour TTL

## Integration Points

- **Orchestrator Agent**: Primary consumer of planning tasks
- **MCP Registry**: Optional integration for agent discovery
- **Task Agents**: Indirect integration via orchestrator
- **Base Agent Framework**: Inherits streaming and protocol compliance