// Prompts and instructions for hotels agent

export const HOTELS_COT_INSTRUCTIONS = `
You are an AI Hotel Booking Agent that helps users find and book hotel accommodations.

## Your Role
You systematically gather accommodation requirements and search for the best available hotels in the database.

## Decision Tree Process
Follow this exact sequence to gather information:

1. **CITY**: Where do they need accommodation?
   - Get city name (e.g., "New York", "London", "Tokyo")
   - If unclear, ask for clarification

2. **DATES**: When do they need accommodation?
   - Check-in date (required)
   - Check-out date (required)
   - Calculate number of nights

3. **PROPERTY TYPE**: What type of accommodation?
   - HOTEL (default)
   - AIRBNB
   - PRIVATE_PROPERTY

4. **ROOM TYPE**: What type of room?
   - STANDARD (default)
   - SINGLE
   - DOUBLE
   - SUITE

5. **GUESTS**: How many guests?
   - Default to 1-2 if not specified
   - Ensure room type supports guest count

## Chain-of-Thought Process
Before each response, think through:
1. What information do I have?
2. What information is still missing?
3. What's the next most important question?
4. Can I search for hotels yet?

## Database Schema
The hotels table contains:
- id: Hotel identifier
- name: Hotel name
- city: City location
- hotel_type: HOTEL/AIRBNB/PRIVATE_PROPERTY
- room_type: STANDARD/SINGLE/DOUBLE/SUITE
- price_per_night: Nightly rate in USD

## Response Format
Always respond with JSON in one of these formats:

**Need More Information:**
\`\`\`json
{
  "status": "input_required",
  "question": "Which city do you need accommodation in?",
  "context": {
    "current_step": "city",
    "collected_info": {...}
  }
}
\`\`\`

**Booking Complete:**
\`\`\`json
{
  "status": "completed",
  "booking": {
    "name": "Grand Hotel Downtown",
    "city": "New York",
    "hotel_type": "HOTEL",
    "room_type": "DOUBLE",
    "price_per_night": "$250",
    "check_in_time": "3:00 PM",
    "check_out_time": "11:00 AM",
    "total_rate_usd": "$750",
    "nights": 3,
    "guest_count": 2,
    "check_in_date": "2024-03-15",
    "check_out_date": "2024-03-18",
    "status": "completed",
    "description": "Hotel booking confirmed",
    "booking_reference": "HTL123",
    "confirmation_number": "GH2024031567"
  }
}
\`\`\`

**No Hotels Available:**
\`\`\`json
{
  "status": "no_hotels",
  "message": "No hotels found matching your criteria. Would you like to try different dates or room types?",
  "alternatives": [...]
}
\`\`\`

## Search Strategy
1. Search for exact matches first
2. If no results, try:
   - Different room types
   - Different property types
   - Nearby cities or areas
   - Different price ranges
3. Always provide alternatives when possible

## Booking Rules
- Always calculate total price (nights × price_per_night × rooms)
- Standard check-in: 3:00 PM, check-out: 11:00 AM
- Generate booking references (format: HTL + 3 numbers)
- Generate confirmation numbers (format: 2 letters + 10 digits)
- Include cancellation policy information
- Provide hotel contact information

## Quality Guidelines
- Be conversational but efficient
- Ask one focused question at a time
- Provide helpful suggestions about locations
- Validate dates (check-out after check-in)
- Explain amenities and hotel features
- Always confirm important details before booking
`;

export const HOTEL_SEARCH_PROMPT = `
Search the hotel database for accommodations matching these criteria:
{criteria}

Guidelines:
1. Search for exact city matches first
2. If no exact matches, try common variations (NYC → New York)
3. Consider all available property and room types if specific type not found
4. Return multiple options when available
5. Include realistic hotel details (amenities, ratings, etc.)

Respond with matching hotels in this format:
{
  "hotels": [...],
  "total_results": number,
  "search_performed": "description of search"
}
`;

export const BOOKING_CONFIRMATION_PROMPT = `
Create a hotel booking confirmation for:
Hotel: {hotel}
Check-in: {check_in_date}
Check-out: {check_out_date}
Guests: {guest_count}
Nights: {nights}

Generate:
1. Realistic check-in/check-out times
2. Total price calculation
3. Booking reference (format: HTL123)
4. Confirmation number (format: GH2024031567)
5. Hotel amenities and contact information
6. Cancellation policy details

Ensure all details are consistent and professional.
`;

export const QUESTION_TEMPLATES = {
  city: [
    "Which city do you need accommodation in?",
    "What's your destination city for the hotel booking?",
    "Where would you like to stay?"
  ],
  dates: [
    "What are your check-in and check-out dates?",
    "When would you like to check in and check out?",
    "What dates do you need the hotel for?"
  ],
  property_type: [
    "What type of accommodation would you prefer? (Hotel, Airbnb, or Private Property)",
    "Do you have a preference for the type of property?",
    "Would you like a traditional hotel, Airbnb, or private property?"
  ],
  room_type: [
    "What type of room would you like? (Standard, Single, Double, or Suite)",
    "Do you have a room preference?",
    "Which room type would work best for you?"
  ],
  guests: [
    "How many guests will be staying?",
    "How many people need accommodation?",
    "What's the total number of guests?"
  ]
};

export const CITY_VARIATIONS = {
  // Major US cities
  'nyc': 'New York',
  'ny': 'New York',
  'new york city': 'New York',
  'la': 'Los Angeles',
  'los angeles': 'Los Angeles',
  'sf': 'San Francisco',
  'san fran': 'San Francisco',
  'chicago': 'Chicago',
  'miami': 'Miami',
  'vegas': 'Las Vegas',
  'las vegas': 'Las Vegas',
  'dc': 'Washington',
  'washington dc': 'Washington',
  
  // International cities
  'london': 'London',
  'paris': 'Paris',
  'tokyo': 'Tokyo',
  'sydney': 'Sydney',
  'rome': 'Rome',
  'berlin': 'Berlin',
  'madrid': 'Madrid',
  'amsterdam': 'Amsterdam'
};

export const PROPERTY_TYPE_MAPPINGS = {
  'hotel': 'HOTEL',
  'hotels': 'HOTEL',
  'traditional hotel': 'HOTEL',
  'airbnb': 'AIRBNB',
  'air bnb': 'AIRBNB',
  'apartment': 'AIRBNB',
  'private': 'PRIVATE_PROPERTY',
  'private property': 'PRIVATE_PROPERTY',
  'house': 'PRIVATE_PROPERTY',
  'villa': 'PRIVATE_PROPERTY'
};

export const ROOM_TYPE_MAPPINGS = {
  'standard': 'STANDARD',
  'regular': 'STANDARD',
  'basic': 'STANDARD',
  'single': 'SINGLE',
  'single room': 'SINGLE',
  'double': 'DOUBLE',
  'double room': 'DOUBLE',
  'twin': 'DOUBLE',
  'suite': 'SUITE',
  'luxury': 'SUITE',
  'premium': 'SUITE'
};

export const AMENITIES_LIST = [
  'Free WiFi',
  'Swimming Pool',
  'Fitness Center',
  'Spa Services',
  'Room Service',
  'Concierge',
  'Business Center',
  'Pet Friendly',
  'Parking Available',
  'Restaurant',
  'Bar/Lounge',
  'Airport Shuttle',
  'Laundry Service',
  'Air Conditioning',
  'Mini Bar',
  'Safe Deposit Box',
  'Balcony/Terrace',
  'Kitchen/Kitchenette'
];

export const CANCELLATION_POLICIES = {
  'flexible': 'Free cancellation up to 24 hours before check-in',
  'moderate': 'Free cancellation up to 5 days before check-in',
  'strict': 'Free cancellation up to 14 days before check-in, 50% refund up to 7 days',
  'non_refundable': 'Non-refundable - no cancellation allowed'
};

export const CHECK_IN_OUT_TIMES = {
  'standard': {
    check_in: '3:00 PM',
    check_out: '11:00 AM'
  },
  'luxury': {
    check_in: '4:00 PM',
    check_out: '12:00 PM'
  },
  'budget': {
    check_in: '2:00 PM',
    check_out: '10:00 AM'
  }
};