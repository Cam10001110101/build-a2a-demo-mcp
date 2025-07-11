// Core booking logic and car search

import { 
  CarCriteria, 
  RentalCar, 
  CarBooking, 
  BookingResponse, 
  BookingState,
  CarSearchParams 
} from './types';
import { 
  CARS_COT_INSTRUCTIONS, 
  CAR_SEARCH_PROMPT,
  BOOKING_CONFIRMATION_PROMPT,
  QUESTION_TEMPLATES,
  CITY_VARIATIONS,
  CAR_TYPE_MAPPINGS,
  CAR_FEATURES,
  RENTAL_PROVIDERS,
  PICKUP_RETURN_TIMES,
  INSURANCE_OPTIONS
} from './prompts';
import { MCPClient, createMCPClient } from '@a2a-workers/shared/mcp-client';

export class BookingEngine {
  private ai: Ai;
  private mcpClient: MCPClient;

  constructor(ai: Ai, mcpRegistry: Fetcher) {
    this.ai = ai;
    this.mcpClient = createMCPClient(mcpRegistry);
  }

  async processBookingRequest(
    input: string, 
    state: BookingState
  ): Promise<BookingResponse> {
    
    // Add user message to conversation
    state.messages.push({
      role: 'user',
      content: input,
      timestamp: Date.now()
    });

    try {
      // Extract information from user input
      const extractedInfo = await this.extractCarInfo(input, state);
      
      // Update criteria with new information
      Object.assign(state.criteria, extractedInfo);

      // Determine next step
      const nextStep = this.determineNextStep(state.criteria);
      
      if (nextStep !== 'booking') {
        // Still need more information
        const question = this.generateQuestion(nextStep, state.criteria);
        state.currentStep = nextStep as any;
        
        return {
          status: 'input_required',
          question,
          context: {
            current_step: nextStep,
            collected_info: state.criteria
          }
        };
      }

      // All information collected, search for cars
      state.currentStep = 'booking';
      return await this.searchAndBookCars(state.criteria as CarCriteria);

    } catch (error) {
      return {
        status: 'error',
        message: 'I encountered an error processing your request. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async extractCarInfo(input: string, state: BookingState): Promise<Partial<CarCriteria>> {
    const conversationHistory = state.messages
      .slice(-5) // Keep last 5 messages for context
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `
${CARS_COT_INSTRUCTIONS}

Current conversation:
${conversationHistory}

Current criteria: ${JSON.stringify(state.criteria)}

User's latest input: "${input}"

Extract any car rental information from the user's input and respond with JSON:
{
  "extracted": {
    "city": "city name if mentioned",
    "pickupDate": "YYYY-MM-DD if pickup date mentioned",
    "returnDate": "YYYY-MM-DD if return date mentioned", 
    "carType": "SEDAN|SUV|TRUCK",
    "budget": number,
    "pickupLocation": "specific location within city if mentioned"
  },
  "reasoning": "explanation of what was extracted"
}

Only include fields that were explicitly mentioned or clearly implied.
`;

    try {
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }]
      });

      const result = this.parseAIResponse(response.response || '{}');
      return this.normalizeExtractedInfo((result as any).extracted || {});
    } catch (error) {
      console.error('Error extracting car info:', error);
      return {};
    }
  }

  private normalizeExtractedInfo(extracted: any): Partial<CarCriteria> {
    const normalized: Partial<CarCriteria> = {};

    // Normalize city with variations
    if (extracted.city) {
      normalized.city = this.normalizeCity(extracted.city);
    }

    // Normalize car type
    if (extracted.carType) {
      const typeKey = extracted.carType.toLowerCase();
      normalized.carType = CAR_TYPE_MAPPINGS[typeKey] as any || extracted.carType;
    }

    // Copy other fields directly
    if (extracted.pickupDate) normalized.pickupDate = extracted.pickupDate;
    if (extracted.returnDate) normalized.returnDate = extracted.returnDate;
    if (extracted.budget) normalized.budget = Number(extracted.budget);
    if (extracted.pickupLocation) normalized.pickupLocation = extracted.pickupLocation;

    return normalized;
  }

  private normalizeCity(input: string): string {
    const lower = input.toLowerCase().trim();
    
    // Look up in city variations mapping
    if (CITY_VARIATIONS[lower]) {
      return CITY_VARIATIONS[lower];
    }

    // Return properly capitalized city name
    return input.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private determineNextStep(criteria: Partial<CarCriteria>): string {
    if (!criteria.city) return 'city';
    if (!criteria.pickupDate || !criteria.returnDate) return 'dates';
    if (!criteria.carType) return 'car_type';
    return 'booking';
  }

  private generateQuestion(step: string, criteria: Partial<CarCriteria>): string {
    const templates = QUESTION_TEMPLATES[step] || ['Could you provide more information?'];
    const question = templates[Math.floor(Math.random() * templates.length)];

    // Add context based on current criteria
    switch (step) {
      case 'dates':
        return `${question} ${criteria.city ? `For your rental in ${criteria.city}.` : ''}`;
      case 'car_type':
        return `${question} ${criteria.city ? `For your rental in ${criteria.city}.` : ''}`;
      default:
        return question;
    }
  }

  private async searchAndBookCars(criteria: CarCriteria): Promise<BookingResponse> {
    try {
      // Search for cars using MCP Registry
      const searchParams: CarSearchParams = {
        city: criteria.city,
        type_of_car: criteria.carType || 'SEDAN',
        limit: 10
      };

      if (criteria.budget) {
        searchParams.max_price = criteria.budget;
      }

      const cars = await this.queryCarDatabase(searchParams);
      
      if (cars.length === 0) {
        return await this.handleNoCars(criteria);
      }

      // Select best car (lowest price for now)
      const selectedCar = this.selectBestCar(cars);

      // Create booking
      const booking = await this.createBooking(selectedCar, criteria);
      
      return {
        status: 'completed',
        booking
      };

    } catch (error) {
      return {
        status: 'error',
        message: 'Unable to search for rental cars at this time. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async queryCarDatabase(params: CarSearchParams): Promise<RentalCar[]> {
    try {
      // Use proper MCP protocol to query travel data
      const result = await this.mcpClient.queryTravelData(
        this.buildCarQuery(params)
      );

      // Extract results from the response
      if (result && result.results) {
        return this.parseCarResults(result.results);
      }
      
      return [];
    } catch (error) {
      console.error('Car database query error:', error);
      return [];
    }
  }

  private buildCarQuery(params: CarSearchParams): string {
    const conditions: string[] = [];
    
    if (params.city) {
      conditions.push(`city = '${params.city}'`);
    }
    if (params.type_of_car) {
      conditions.push(`type_of_car = '${params.type_of_car}'`);
    }
    if (params.max_price) {
      conditions.push(`daily_rate <= ${params.max_price}`);
    }
    if (params.min_price) {
      conditions.push(`daily_rate >= ${params.min_price}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return `SELECT * FROM rental_cars ${whereClause} ORDER BY daily_rate ASC LIMIT ${params.limit || 10}`;
  }

  private parseCarResults(results: any[]): RentalCar[] {
    return results.map(row => ({
      id: row.id,
      provider: row.provider,
      city: row.city,
      type_of_car: row.type_of_car,
      daily_rate: row.daily_rate
    }));
  }

  private selectBestCar(cars: RentalCar[]): RentalCar {
    // For now, select the cheapest car
    // In a real implementation, consider ratings, features, availability, etc.
    return cars.reduce((best, current) => 
      current.daily_rate < best.daily_rate ? current : best
    );
  }

  private async createBooking(
    car: RentalCar, 
    criteria: CarCriteria
  ): Promise<CarBooking> {
    
    const days = this.calculateDays(criteria.pickupDate!, criteria.returnDate!);
    const totalPrice = car.daily_rate * days;
    const pickupTimes = PICKUP_RETURN_TIMES.standard;

    const booking: CarBooking = {
      pickup_date: criteria.pickupDate!,
      return_date: criteria.returnDate!,
      provider: car.provider || this.selectRandomProvider(),
      city: car.city,
      car_type: car.type_of_car,
      status: 'booking_complete',
      price: `$${totalPrice}`,
      daily_rate: `$${car.daily_rate}`,
      total_days: days,
      description: 'Booking Complete',
      booking_reference: this.generateBookingReference(),
      confirmation_number: this.generateConfirmationNumber(),
      pickup_time: pickupTimes.pickup,
      return_time: pickupTimes.return,
      booking_date: new Date().toISOString(),
      features: CAR_FEATURES[car.type_of_car] || [],
      pickup_location: {
        name: `${car.provider || 'Rental'} - ${car.city} Downtown`,
        address: this.generateLocationAddress(car.city),
        phone: this.generatePhoneNumber(),
        hours: '8:00 AM - 6:00 PM'
      },
      insurance_options: INSURANCE_OPTIONS
    };

    return booking;
  }

  private calculateDays(pickup: string, returnDate: string): number {
    const pickupDate = new Date(pickup);
    const dropDate = new Date(returnDate);
    const diffTime = dropDate.getTime() - pickupDate.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 1;
  }

  private selectRandomProvider(): string {
    return RENTAL_PROVIDERS[Math.floor(Math.random() * RENTAL_PROVIDERS.length)];
  }

  private generateBookingReference(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let ref = 'CAR';
    for (let i = 0; i < 3; i++) {
      ref += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return ref;
  }

  private generateConfirmationNumber(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let conf = '';
    for (let i = 0; i < 2; i++) {
      conf += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    for (let i = 0; i < 8; i++) {
      conf += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return conf;
  }

  private generatePhoneNumber(): string {
    const areaCode = Math.floor(Math.random() * 900) + 100;
    const exchange = Math.floor(Math.random() * 900) + 100;
    const number = Math.floor(Math.random() * 9000) + 1000;
    return `+1 (${areaCode}) ${exchange}-${number}`;
  }

  private generateLocationAddress(city: string): string {
    const streetNumber = Math.floor(Math.random() * 999) + 1;
    const streets = ['Airport Rd', 'Main St', 'Central Ave', 'Rental Car Row', 'Terminal Dr'];
    const street = streets[Math.floor(Math.random() * streets.length)];
    return `${streetNumber} ${street}, ${city}`;
  }

  private async handleNoCars(criteria: CarCriteria): Promise<BookingResponse> {
    // Try alternative car types
    const alternatives = await this.findAlternatives(criteria);
    
    if (alternatives.length > 0) {
      return {
        status: 'no_cars',
        message: `No ${criteria.carType?.toLowerCase()}s available. Would you like to see these alternatives?`,
        alternatives
      };
    }

    return {
      status: 'no_cars',
      message: `No rental cars found in ${criteria.city} for your dates. Please try different dates or locations.`
    };
  }

  private async findAlternatives(criteria: CarCriteria): Promise<RentalCar[]> {
    // Search with different car types
    const altCarTypes: Array<'SEDAN' | 'SUV' | 'TRUCK'> = ['SEDAN', 'SUV', 'TRUCK'];
    const types = altCarTypes.filter(type => type !== criteria.carType);
    
    for (const altType of types) {
      const altParams: CarSearchParams = {
        ...criteria,
        type_of_car: altType,
        limit: 3
      };
      
      const cars = await this.queryCarDatabase(altParams);
      if (cars.length > 0) {
        return cars;
      }
    }

    return [];
  }

  private parseAIResponse(response: string): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {};
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return {};
    }
  }
}