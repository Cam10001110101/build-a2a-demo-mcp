# Air Tickets Agent Worker

The Air Tickets Agent is a specialized booking agent that handles flight searches and ticket bookings. It uses a systematic decision-tree approach to gather travel requirements and searches the flight database for the best available options.

## Features

- **Systematic Information Gathering**: Follows a structured decision tree (Origin → Destination → Dates → Class → Passengers)
- **Flight Database Integration**: Searches comprehensive flight database via MCP Registry
- **Intelligent Booking Engine**: Finds best flights based on price, timing, and preferences
- **Booking Management**: Creates and stores booking confirmations with references
- **Alternative Options**: Suggests alternatives when preferred flights aren't available
- **Conversational Flow**: Maintains context across multiple interactions

## Architecture

```
User Input → Information Extraction → Decision Tree → Flight Search
                                                           ↓
                                                   Booking Creation
                                                           ↓
                                                 Confirmation & Storage
```

## Core Components

### 1. AirTicketsAgent Class
Main agent implementation with:
- Streaming and synchronous response modes
- Booking state management
- Integration with base agent framework
- Booking lookup functionality

### 2. BookingEngine
Core booking logic that:
- Extracts flight information using AI
- Follows systematic decision tree
- Searches flight database via MCP
- Creates detailed booking confirmations
- Handles edge cases and alternatives

### 3. Type System
Comprehensive TypeScript types for:
- **FlightCriteria**: User requirements (origin, destination, dates, class, passengers)
- **Flight**: Database flight record with enhanced details
- **FlightBooking**: Complete booking with confirmation details
- **BookingState**: Conversation and booking state management

## Booking Process

### Decision Tree Flow
1. **Origin**: Departure city/airport
2. **Destination**: Arrival city/airport  
3. **Dates**: Departure and return dates
4. **Cabin Class**: Economy, Premium Economy, Business, First
5. **Passengers**: Number of travelers
6. **Booking**: Search and confirm flights

### Information Extraction
- Uses AI to parse natural language input
- Normalizes airport codes and cities
- Validates dates and passenger counts
- Maintains conversation context

### Flight Search Strategy
1. **Exact Match**: Search for exact criteria first
2. **Alternative Classes**: Try different cabin classes
3. **Alternative Airports**: Consider nearby airports (JFK → LGA, EWR)
4. **Alternative Carriers**: Search across different airlines
5. **Flexible Options**: Suggest alternative dates if available

## API Endpoints

### Main Booking Endpoint
```
POST /
Content-Type: application/json

{
  "query": "Book a round-trip flight from NYC to London",
  "context_id": "optional-session-id"
}
```

### Booking Lookup
```
GET /booking?reference=ABC123
GET /booking?context_id=session_123
```

### Agent Info
```
GET /.well-known/agent.json
```

## Usage Examples

### Initial Booking Request
```bash
curl -X POST https://agent.air-tickets.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need flights to Tokyo"
  }'
```

### Follow-up Information
```bash
curl -X POST https://agent.air-tickets.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "From New York, departing March 15, returning March 22",
    "context_id": "booking_session_123"
  }'
```

### Complete Booking Request
```bash
curl -X POST https://agent.air-tickets.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Book economy round-trip flights for 2 passengers, JFK to NRT, March 15-22"
  }'
```

### Streaming Response
```bash
curl -X POST https://agent.air-tickets.demos.build/ \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "Book business class tickets to London"
  }'
```

### Booking Lookup
```bash
curl "https://agent.air-tickets.demos.build/booking?reference=ABC123"
```

## Response Formats

### Information Required
```json
{
  "response_type": "input_required",
  "is_task_complete": false,
  "require_user_input": true,
  "content": "What is your departure city or airport?",
  "context_id": "session_123"
}
```

### Booking Confirmed
```json
{
  "response_type": "booking_confirmed", 
  "is_task_complete": true,
  "require_user_input": false,
  "content": "✈️ Flight Booking Confirmed!\n\nBooking Reference: ABC123\n...",
  "context_id": "session_123"
}
```

### No Flights Available
```json
{
  "response_type": "no_results",
  "is_task_complete": false,
  "require_user_input": true,
  "content": "No flights found in business class. Would you like to see economy options?",
  "context_id": "session_123"
}
```

## Booking Confirmation Format

Complete bookings include:
- **Booking Reference**: 6-character alphanumeric code
- **Flight Details**: Carrier, flight number, airports, times
- **Pricing**: Per-person and total pricing
- **Travel Information**: Duration, cabin class, important notes
- **Instructions**: Airport arrival times, required documents

## Configuration

### KV Namespace (wrangler.toml)
Create a KV namespace for booking storage:
```bash
wrangler kv:namespace create "BOOKINGS"
```

### MCP Registry Integration
Connects to MCP Registry for:
- Flight database queries
- Agent discovery (if needed)
- Travel data access

## Flight Database Schema

Expected database structure:
```sql
CREATE TABLE flights (
    id INTEGER PRIMARY KEY,
    carrier TEXT NOT NULL,
    flight_number INTEGER NOT NULL,
    from_airport TEXT NOT NULL,
    to_airport TEXT NOT NULL,
    ticket_class TEXT NOT NULL,
    price REAL NOT NULL
);
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
Test booking flow:
```bash
# Test simple request
curl -X POST http://localhost:8787/ \
  -H "Content-Type: application/json" \
  -d '{"query": "I need a flight to Paris"}'

# Test complete booking
curl -X POST http://localhost:8787/ \
  -H "Content-Type: application/json" \
  -d '{"query": "Round-trip JFK to CDG, March 15-22, economy, 2 passengers"}'
```

## Airport Code Handling

Built-in support for:
- **Major US Airports**: NYC (JFK/LGA/EWR), LAX, ORD, etc.
- **International Hubs**: LHR, CDG, NRT, SYD, etc.
- **City Name Mapping**: "New York" → JFK, "Los Angeles" → LAX
- **Code Validation**: Validates 3-letter IATA codes

## Decision Tree Logic

The agent follows a strict sequence:
1. **Origin Validation**: Ensure valid departure location
2. **Destination Validation**: Ensure valid arrival location
3. **Date Processing**: Validate and format travel dates
4. **Class Selection**: Confirm cabin class preference
5. **Passenger Count**: Verify number of travelers
6. **Flight Search**: Query database with complete criteria
7. **Booking Creation**: Generate confirmation and reference

## AI Integration

- **Model**: Uses Llama 3.1 8B Instruct for natural language understanding
- **Extraction**: Parses user input to extract flight criteria
- **Normalization**: Converts natural language to structured data
- **Context**: Maintains conversation flow and booking state

## Error Handling

- **Database Errors**: Graceful fallback when flight DB unavailable
- **Invalid Input**: Clear validation messages for incorrect data
- **No Results**: Helpful suggestions for alternative options
- **Booking Failures**: Retry logic and error recovery
- **State Recovery**: Handles corrupted conversation state

## Performance Considerations

- **Efficient Queries**: Optimized database queries with proper indexing
- **Caching**: Flight search results cached temporarily
- **State Management**: Lightweight state storage in KV
- **Response Times**: Optimized for quick flight searches

## Integration Points

- **MCP Registry**: Flight database access and queries
- **Orchestrator Agent**: Primary consumer of booking services
- **Base Agent Framework**: Inherits streaming and protocol compliance
- **Travel Data Sources**: Extensible for additional flight APIs