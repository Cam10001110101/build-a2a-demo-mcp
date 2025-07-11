# Car Rental Agent Worker

The Car Rental Agent is a specialized booking agent that handles car rental searches and vehicle bookings. It uses a systematic decision-tree approach to gather rental requirements and searches the vehicle database for the best available options.

## Features

- **Systematic Information Gathering**: Follows a structured decision tree (City → Dates → Car Type)
- **Vehicle Database Integration**: Searches comprehensive car rental database via MCP Registry
- **Intelligent Booking Engine**: Finds best vehicles based on price and type preferences
- **Booking Management**: Creates and stores booking confirmations with references
- **Alternative Options**: Suggests different vehicle types when preferred option isn't available
- **Conversational Flow**: Maintains context across multiple interactions
- **Multiple Vehicle Types**: Supports Sedans, SUVs, and Trucks

## Architecture

```
User Input → Information Extraction → Decision Tree → Car Search
                                                         ↓
                                                 Booking Creation
                                                         ↓
                                               Confirmation & Storage
```

## Core Components

### 1. CarRentalAgent Class
Main agent implementation with:
- Streaming and synchronous response modes
- Booking state management
- Integration with base agent framework
- Booking lookup functionality

### 2. BookingEngine
Core booking logic that:
- Extracts rental information using AI
- Follows systematic decision tree
- Searches car database via MCP
- Creates detailed booking confirmations
- Handles edge cases and alternatives

### 3. Type System
Comprehensive TypeScript types for:
- **CarCriteria**: User requirements (city, dates, car type)
- **RentalCar**: Database vehicle record
- **CarBooking**: Complete booking with confirmation details
- **BookingState**: Conversation and booking state management

## Booking Process

### Decision Tree Flow
1. **City**: Rental location/city
2. **Dates**: Pickup and return dates
3. **Car Type**: Sedan, SUV, or Truck
4. **Booking**: Search and confirm vehicle

### Information Extraction
- Uses AI to parse natural language input
- Normalizes city names
- Validates dates
- Maps various car type descriptions to standard types

### Car Search Strategy
1. **Exact Match**: Search for exact criteria first
2. **Alternative Types**: Try different vehicle types
3. **Price Range Flexibility**: Adjust budget constraints if needed
4. **Location Alternatives**: Consider nearby locations

## API Endpoints

### Main Booking Endpoint
```
POST /
Content-Type: application/json

{
  "query": "Book a rental car in San Francisco for next week",
  "context_id": "optional-session-id"
}
```

### Booking Lookup
```
GET /booking?reference=CAR123
GET /booking?context_id=session_123
```

### Agent Info
```
GET /.well-known/agent.json
```

## Usage Examples

### Initial Booking Request
```bash
curl -X POST https://agent.car-rental.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need a rental car in Los Angeles"
  }'
```

### Follow-up Information
```bash
curl -X POST https://agent.car-rental.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Pickup June 15, return June 18",
    "context_id": "booking_session_123"
  }'
```

### Complete Booking Request
```bash
curl -X POST https://agent.car-rental.demos.build/ \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Book an SUV in Miami, June 15-18"
  }'
```

### Streaming Response
```bash
curl -X POST https://agent.car-rental.demos.build/ \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "query": "Book a truck in Denver for my move"
  }'
```

### Booking Lookup
```bash
curl "https://agent.car-rental.demos.build/booking?reference=CAR123"
```

## Response Formats

### Information Required
```json
{
  "response_type": "input_required",
  "is_task_complete": false,
  "require_user_input": true,
  "content": "Which city do you need a rental car in?",
  "context_id": "session_123"
}
```

### Booking Confirmed
```json
{
  "response_type": "booking_confirmed", 
  "is_task_complete": true,
  "require_user_input": false,
  "content": "🚗 Car Rental Booking Confirmed!\n\nProvider: Enterprise\n...",
  "context_id": "session_123"
}
```

### No Cars Available
```json
{
  "response_type": "no_results",
  "is_task_complete": false,
  "require_user_input": true,
  "content": "No SUVs available. Would you like to see these alternatives?",
  "context_id": "session_123"
}
```

## Booking Confirmation Format

Complete bookings include:
- **Booking Reference**: CAR + 3 digits (e.g., CAR123)
- **Confirmation Number**: 2 letters + 8 digits
- **Provider Details**: Rental company name
- **Rental Information**: Pickup/return dates, duration, vehicle type
- **Pricing**: Daily rate and total cost
- **Vehicle Features**: Specific features by car type
- **Pickup Location**: Address, phone, hours
- **Insurance Options**: Basic and premium coverage options

## Vehicle Types

### Sedan
- Fuel efficient for city and highway driving
- Features: Bluetooth, GPS, Cruise Control, USB Charging
- Best for: Business travel, couples, small families

### SUV
- All-wheel drive capability
- Features: Third row seating, roof rails, power liftgate
- Best for: Families, outdoor activities, cargo needs

### Truck
- 4-wheel drive and towing capability
- Features: Towing package, bed liner, crew cab
- Best for: Moving, hauling, construction work

## Vehicle Features by Type

### Sedan Features
- Fuel Efficient
- Bluetooth Connectivity
- GPS Navigation
- Cruise Control
- USB Charging Ports
- Backup Camera
- Automatic Transmission

### SUV Features
- All-Wheel Drive
- Third Row Seating
- Roof Rails
- Apple CarPlay/Android Auto
- Power Liftgate

### Truck Features
- 4-Wheel Drive
- Towing Package
- Bed Liner
- Running Boards
- Crew Cab

## Configuration

### KV Namespace (wrangler.toml)
Create a KV namespace for booking storage:
```bash
wrangler kv:namespace create "BOOKINGS"
```

### MCP Registry Integration
Connects to MCP Registry for:
- Car rental database queries
- Agent discovery (if needed)
- Travel data access

## Car Database Schema

Expected database structure:
```sql
CREATE TABLE rental_cars (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    city TEXT NOT NULL,
    type_of_car TEXT NOT NULL,
    daily_rate REAL NOT NULL
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
  -d '{"query": "I need a car in Chicago"}'

# Test complete booking
curl -X POST http://localhost:8787/ \
  -H "Content-Type: application/json" \
  -d '{"query": "Book SUV in Dallas, June 15-18"}'
```

## City Name Handling

Built-in support for:
- **Major US Cities**: NYC → New York, LA → Los Angeles, SF → San Francisco
- **Abbreviations**: Common city abbreviations and variations
- **International Cities**: London, Paris, Tokyo, Sydney, etc.
- **Capitalization**: Automatic proper case formatting

## Decision Tree Logic

The agent follows a strict sequence:
1. **City Validation**: Ensure valid rental location
2. **Date Processing**: Validate pickup and return dates
3. **Car Type Selection**: Confirm vehicle type preference
4. **Car Search**: Query database with complete criteria
5. **Booking Creation**: Generate confirmation and reference

## AI Integration

- **Model**: Uses Llama 3.1 8B Instruct for natural language understanding
- **Extraction**: Parses user input to extract rental criteria
- **Normalization**: Converts natural language to structured data
- **Context**: Maintains conversation flow and booking state

## Rental Providers

Supported providers include:
- Enterprise
- Hertz
- Avis
- Budget
- National
- Alamo
- Thrifty
- Dollar
- Zipcar

## Insurance Options

### Basic Coverage
- $15/day
- State minimum liability coverage
- Suitable for drivers with existing auto insurance

### Premium Coverage
- $35/day
- Full coverage with zero deductible
- Recommended for peace of mind

## Error Handling

- **Database Errors**: Graceful fallback when car DB unavailable
- **Invalid Input**: Clear validation messages for incorrect data
- **No Results**: Helpful suggestions for alternative options
- **Booking Failures**: Retry logic and error recovery
- **Date Validation**: Ensures return date is after pickup date

## Performance Considerations

- **Efficient Queries**: Optimized database queries with proper indexing
- **Caching**: Car search results cached temporarily
- **State Management**: Lightweight state storage in KV
- **Response Times**: Optimized for quick vehicle searches

## Integration Points

- **MCP Registry**: Car database access and queries
- **Orchestrator Agent**: Primary consumer of booking services
- **Base Agent Framework**: Inherits streaming and protocol compliance
- **Travel Data Sources**: Extensible for additional car rental APIs

## Rental Policies

### Age Requirements
- Primary driver must be 25+ years old
- Additional fees may apply for drivers under 25
- Valid driver's license required

### Fuel Policy
- Return with same fuel level to avoid charges
- Pre-purchase fuel options available

### Late Returns
- Subject to additional daily charges
- Grace period typically 29 minutes
- Full day charge after grace period

### Mileage
- Unlimited mileage on most rentals
- Some specialty vehicles may have restrictions

## Pickup/Return Process

### Pickup Requirements
- Valid driver's license
- Credit card in driver's name
- Booking confirmation number
- Proof of insurance (if using personal coverage)

### Return Process
- Return to designated area
- Leave keys as instructed
- Note final mileage
- Check for personal belongings