# Hotels Agent Worker

The Hotels Agent is a specialized booking agent that handles hotel searches and accommodation bookings. It uses a systematic decision-tree approach to gather accommodation requirements and searches the hotel database for the best available options.

## Features

- **Systematic Information Gathering**: Follows a structured decision tree (City → Dates → Property Type → Room Type → Guests)
- **Hotel Database Integration**: Searches comprehensive hotel database via MCP Registry
- **Intelligent Booking Engine**: Finds best accommodations based on price, location, and preferences
- **Booking Management**: Creates and stores booking confirmations with references
- **Alternative Options**: Suggests alternatives when preferred hotels aren't available
- **Conversational Flow**: Maintains context across multiple interactions
- **Multiple Property Types**: Supports hotels, Airbnb, and private properties

## Architecture

```
User Input → Information Extraction → Decision Tree → Hotel Search
                                                          ↓
                                                  Booking Creation
                                                          ↓
                                                Confirmation & Storage
```

## Core Components

### 1. HotelsAgent Class
Main agent implementation with:
- Streaming and synchronous response modes
- Booking state management
- Integration with base agent framework
- Booking lookup functionality

### 2. BookingEngine
Core booking logic that:
- Extracts hotel information using AI
- Follows systematic decision tree
- Searches hotel database via MCP
- Creates detailed booking confirmations
- Handles edge cases and alternatives

### 3. Type System
Comprehensive TypeScript types for:
- **HotelCriteria**: User requirements (city, dates, property type, room type, guests)
- **Hotel**: Database hotel record with enhanced details
- **HotelBooking**: Complete booking with confirmation details
- **BookingState**: Conversation and booking state management

## Booking Process

### Decision Tree Flow
1. **City**: Destination city/location
2. **Dates**: Check-in and check-out dates
3. **Property Type**: Hotel, Airbnb, or Private Property
4. **Room Type**: Standard, Single, Double, or Suite
5. **Guests**: Number of guests
6. **Booking**: Search and confirm accommodation

### Information Extraction
- Uses AI to parse natural language input
- Normalizes city names and property types
- Validates dates and guest counts
- Maintains conversation context

### Hotel Search Strategy
1. **Exact Match**: Search for exact criteria first
2. **Alternative Property Types**: Try different accommodation types
3. **Alternative Room Types**: Consider different room configurations
4. **Price Range Flexibility**: Adjust budget constraints if needed
5. **Location Alternatives**: Suggest nearby areas if available

## API Endpoints

### Main Booking Endpoint
```
POST /
Content-Type: application/json

{
  "query": "Book a hotel in New York for next week",
  "context_id": "optional-session-id"
}
```

### Booking Lookup
```
GET /booking?reference=HTL123
GET /booking?context_id=session_123
```

### Agent Info
```
GET /.well-known/agent.json
```

## Usage Examples

### Initial Booking Request
```bash
curl -X POST https://agent.hotels.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need accommodation in London"
  }'
```

### Follow-up Information
```bash
curl -X POST https://agent.hotels.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Check-in March 15, check-out March 18, for 2 guests",
    "context_id": "booking_session_123"
  }'
```

### Complete Booking Request
```bash
curl -X POST https://agent.hotels.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Book a double room hotel in Paris, March 15-18, for 2 guests"
  }'
```

### Streaming Response
```bash
curl -X POST https://agent.hotels.demos.build/ \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "Book a suite in Tokyo for business trip"
  }'
```

### Booking Lookup
```bash
curl "https://agent.hotels.demos.build/booking?reference=HTL123"
```

## Response Formats

### Information Required
```json
{
  "response_type": "input_required",
  "is_task_complete": false,
  "require_user_input": true,
  "content": "Which city do you need accommodation in?",
  "context_id": "session_123"
}
```

### Booking Confirmed
```json
{
  "response_type": "booking_confirmed", 
  "is_task_complete": true,
  "require_user_input": false,
  "content": "🏨 Hotel Booking Confirmed!\n\nHotel: Grand Hotel Downtown\n...",
  "context_id": "session_123"
}
```

### No Hotels Available
```json
{
  "response_type": "no_results",
  "is_task_complete": false,
  "require_user_input": true,
  "content": "No hotels found matching your criteria. Would you like to see alternatives?",
  "context_id": "session_123"
}
```

## Booking Confirmation Format

Complete bookings include:
- **Booking Reference**: HTL + 3 digits (e.g., HTL123)
- **Confirmation Number**: 2 letters + 10 digits
- **Hotel Details**: Name, location, property type, room type
- **Stay Information**: Check-in/out dates, duration, guest count
- **Pricing**: Per-night rate and total cost
- **Amenities**: Available facilities and services
- **Contact Information**: Hotel phone, email, address
- **Policies**: Cancellation policy and important notes

## Property Types Supported

### Hotels
- Traditional hotel accommodations
- Professional service and amenities
- Room service, concierge, business facilities

### Airbnb
- Private accommodations with kitchen facilities
- More flexible check-in/out options
- Local neighborhood experience

### Private Properties
- Exclusive villas, houses, or apartments
- Full privacy and custom amenities
- Ideal for groups or extended stays

## Room Types Available

- **Standard**: Basic accommodations with essential amenities
- **Single**: Single occupancy rooms
- **Double**: Double occupancy with various bed configurations
- **Suite**: Premium rooms with separate living areas

## Configuration

### KV Namespace (wrangler.toml)
Create a KV namespace for booking storage:
```bash
wrangler kv:namespace create "BOOKINGS"
```

### MCP Registry Integration
Connects to MCP Registry for:
- Hotel database queries
- Agent discovery (if needed)
- Travel data access

## Hotel Database Schema

Expected database structure:
```sql
CREATE TABLE hotels (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    hotel_type TEXT NOT NULL,
    room_type TEXT NOT NULL,
    price_per_night REAL NOT NULL
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
  -d '{"query": "I need a hotel in Paris"}'

# Test complete booking
curl -X POST http://localhost:8787/ \
  -H "Content-Type: application/json" \
  -d '{"query": "Book hotel in London, March 15-18, double room, 2 guests"}'
```

## City Name Handling

Built-in support for:
- **Major US Cities**: NYC → New York, LA → Los Angeles, SF → San Francisco
- **International Cities**: London, Paris, Tokyo, Sydney, etc.
- **Abbreviations**: Common city abbreviations and variations
- **Capitalization**: Automatic proper case formatting

## Decision Tree Logic

The agent follows a strict sequence:
1. **City Validation**: Ensure valid destination
2. **Date Processing**: Validate and format check-in/out dates
3. **Property Type Selection**: Confirm accommodation type preference
4. **Room Type Selection**: Verify room configuration needs
5. **Guest Count**: Confirm number of guests
6. **Hotel Search**: Query database with complete criteria
7. **Booking Creation**: Generate confirmation and reference

## AI Integration

- **Model**: Uses Llama 3.1 8B Instruct for natural language understanding
- **Extraction**: Parses user input to extract hotel criteria
- **Normalization**: Converts natural language to structured data
- **Context**: Maintains conversation flow and booking state

## Amenities and Services

Automatically assigned based on property type:

### Hotel Amenities
- Free WiFi, Room Service, Concierge
- Fitness Center, Business Center, Restaurant

### Airbnb Amenities
- Kitchen/Kitchenette, Laundry Service
- Parking Available, Local Host Support

### Private Property Amenities
- Full Kitchen, Private Parking
- Garden/Terrace, Complete Privacy

## Error Handling

- **Database Errors**: Graceful fallback when hotel DB unavailable
- **Invalid Input**: Clear validation messages for incorrect data
- **No Results**: Helpful suggestions for alternative options
- **Booking Failures**: Retry logic and error recovery
- **Date Validation**: Ensures check-out is after check-in

## Performance Considerations

- **Efficient Queries**: Optimized database queries with proper indexing
- **Caching**: Hotel search results cached temporarily
- **State Management**: Lightweight state storage in KV
- **Response Times**: Optimized for quick hotel searches

## Integration Points

- **MCP Registry**: Hotel database access and queries
- **Orchestrator Agent**: Primary consumer of booking services
- **Base Agent Framework**: Inherits streaming and protocol compliance
- **Travel Data Sources**: Extensible for additional hotel APIs

## Booking Policies

### Check-in/Check-out Times
- **Standard**: 3:00 PM check-in, 11:00 AM check-out
- **Luxury**: 4:00 PM check-in, 12:00 PM check-out
- **Budget**: 2:00 PM check-in, 10:00 AM check-out

### Cancellation Policies
- **Flexible**: Free cancellation up to 24 hours before
- **Moderate**: Free cancellation up to 5 days before
- **Strict**: Free cancellation up to 14 days before
- **Non-refundable**: No cancellation allowed