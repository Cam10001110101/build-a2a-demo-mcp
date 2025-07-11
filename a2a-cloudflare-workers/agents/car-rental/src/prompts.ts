// Car rental agent prompts and constants

export const CARS_COT_INSTRUCTIONS = `You are a car rental booking agent. 
When helping a user, use Chain-of-Thought reasoning to track what information you need and guide the conversation.

Follow this decision tree:
1. City - Ask for the rental location
2. Dates - Ask for pickup and return dates  
3. Class of car - Ask for vehicle type (Sedan, SUV, or Truck)

For each step:
- Track what information you already have
- Identify what information you still need
- Formulate a natural question to ask the user
- Use context from previous information to make the question more helpful

When all information is collected, search for available cars and confirm the booking.`;

export const CAR_SEARCH_PROMPT = `Search for rental cars based on the given criteria. Return cars that match the requirements.`;

export const BOOKING_CONFIRMATION_PROMPT = `Create a car rental booking confirmation with all relevant details.`;

export const QUESTION_TEMPLATES: Record<string, string[]> = {
  city: [
    'Which city do you need a rental car in?',
    'Where would you like to pick up your rental car?',
    'What location do you need the car rental for?',
    'In which city are you looking to rent a car?'
  ],
  dates: [
    'What are your pickup and return dates?',
    'When do you need the rental car (pickup and return dates)?',
    'What dates do you need the car for?',
    'When would you like to pick up and return the car?'
  ],
  car_type: [
    'What type of car would you prefer? We have Sedans, SUVs, and Trucks available.',
    'Which class of vehicle do you need - Sedan, SUV, or Truck?',
    'What type of car suits your needs? Choose from Sedan, SUV, or Truck.',
    'Would you prefer a Sedan, SUV, or Truck for your rental?'
  ]
};

export const CITY_VARIATIONS: Record<string, string> = {
  'nyc': 'New York',
  'ny': 'New York',
  'la': 'Los Angeles',
  'sf': 'San Francisco',
  'san fran': 'San Francisco',
  'philly': 'Philadelphia',
  'vegas': 'Las Vegas',
  'dc': 'Washington DC',
  'washington': 'Washington DC',
  'chi': 'Chicago',
  'chi-town': 'Chicago',
  // International
  'cdmx': 'Mexico City',
  'méxico': 'Mexico City',
  'bcn': 'Barcelona',
  'mad': 'Madrid',
  'ldn': 'London',
  'par': 'Paris',
  'ams': 'Amsterdam',
  'hkg': 'Hong Kong',
  'sgp': 'Singapore',
  'tyo': 'Tokyo',
  'syd': 'Sydney',
  'mel': 'Melbourne'
};

export const CAR_TYPE_MAPPINGS: Record<string, string> = {
  'sedan': 'SEDAN',
  'sedans': 'SEDAN',
  'car': 'SEDAN',
  'regular': 'SEDAN',
  'standard': 'SEDAN',
  'suv': 'SUV',
  'suvs': 'SUV',
  'crossover': 'SUV',
  'truck': 'TRUCK',
  'trucks': 'TRUCK',
  'pickup': 'TRUCK',
  'pickup truck': 'TRUCK'
};

export const CAR_FEATURES: Record<string, string[]> = {
  'SEDAN': [
    'Fuel Efficient',
    'Bluetooth Connectivity',
    'GPS Navigation',
    'Cruise Control',
    'USB Charging Ports',
    'Backup Camera',
    'Automatic Transmission'
  ],
  'SUV': [
    'All-Wheel Drive',
    'Third Row Seating',
    'Roof Rails',
    'Bluetooth Connectivity',
    'GPS Navigation',
    'Backup Camera',
    'Apple CarPlay/Android Auto',
    'Power Liftgate'
  ],
  'TRUCK': [
    '4-Wheel Drive',
    'Towing Package',
    'Bed Liner',
    'Bluetooth Connectivity',
    'GPS Navigation',
    'Backup Camera',
    'Running Boards',
    'Crew Cab'
  ]
};

export const RENTAL_PROVIDERS = [
  'Enterprise',
  'Hertz',
  'Avis',
  'Budget',
  'National',
  'Alamo',
  'Thrifty',
  'Dollar',
  'Zipcar'
];

export const PICKUP_RETURN_TIMES = {
  standard: {
    pickup: '9:00 AM',
    return: '5:00 PM'
  },
  airport: {
    pickup: '24/7',
    return: '24/7'
  },
  downtown: {
    pickup: '8:00 AM',
    return: '6:00 PM'
  }
};

export const INSURANCE_OPTIONS = {
  basic: 'Basic Coverage - $15/day (State minimum liability)',
  premium: 'Premium Coverage - $35/day (Full coverage with zero deductible)'
};