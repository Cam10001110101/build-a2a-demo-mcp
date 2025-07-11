// Core booking logic and hotel search

import { 
  HotelCriteria, 
  Hotel, 
  HotelBooking, 
  BookingResponse, 
  BookingState,
  HotelSearchParams 
} from './types';
import { 
  HOTELS_COT_INSTRUCTIONS, 
  HOTEL_SEARCH_PROMPT,
  BOOKING_CONFIRMATION_PROMPT,
  QUESTION_TEMPLATES,
  CITY_VARIATIONS,
  PROPERTY_TYPE_MAPPINGS,
  ROOM_TYPE_MAPPINGS,
  AMENITIES_LIST,
  CANCELLATION_POLICIES,
  CHECK_IN_OUT_TIMES
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
      const extractedInfo = await this.extractHotelInfo(input, state);
      
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

      // All information collected, search for hotels
      state.currentStep = 'booking';
      return await this.searchAndBookHotels(state.criteria);

    } catch (error) {
      return {
        status: 'error',
        message: 'I encountered an error processing your request. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async extractHotelInfo(input: string, state: BookingState): Promise<Partial<HotelCriteria>> {
    const conversationHistory = state.messages
      .slice(-5) // Keep last 5 messages for context
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `
${HOTELS_COT_INSTRUCTIONS}

Current conversation:
${conversationHistory}

Current criteria: ${JSON.stringify(state.criteria)}

User's latest input: "${input}"

Extract any hotel booking information from the user's input and respond with JSON:
{
  "extracted": {
    "city": "city name if mentioned",
    "checkInDate": "YYYY-MM-DD if check-in date mentioned",
    "checkOutDate": "YYYY-MM-DD if check-out date mentioned", 
    "guests": number,
    "propertyType": "HOTEL|AIRBNB|PRIVATE_PROPERTY",
    "roomType": "STANDARD|SINGLE|DOUBLE|SUITE",
    "budget": number,
    "location": "specific area within city if mentioned"
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
      return this.normalizeExtractedInfo(result.extracted || {});
    } catch (error) {
      console.error('Error extracting hotel info:', error);
      return {};
    }
  }

  private normalizeExtractedInfo(extracted: any): Partial<HotelCriteria> {
    const normalized: Partial<HotelCriteria> = {};

    // Normalize city with variations
    if (extracted.city) {
      normalized.city = this.normalizeCity(extracted.city);
    }

    // Normalize property type
    if (extracted.propertyType) {
      const typeKey = extracted.propertyType.toLowerCase();
      normalized.propertyType = PROPERTY_TYPE_MAPPINGS[typeKey] || extracted.propertyType;
    }

    // Normalize room type
    if (extracted.roomType) {
      const roomKey = extracted.roomType.toLowerCase();
      normalized.roomType = ROOM_TYPE_MAPPINGS[roomKey] || extracted.roomType;
    }

    // Copy other fields directly
    if (extracted.checkInDate) normalized.checkInDate = extracted.checkInDate;
    if (extracted.checkOutDate) normalized.checkOutDate = extracted.checkOutDate;
    if (extracted.guests) normalized.guests = Number(extracted.guests);
    if (extracted.budget) normalized.budget = Number(extracted.budget);
    if (extracted.location) normalized.location = extracted.location;

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

  private determineNextStep(criteria: HotelCriteria): string {
    if (!criteria.city) return 'city';
    if (!criteria.checkInDate || !criteria.checkOutDate) return 'dates';
    if (!criteria.propertyType) return 'property_type';
    if (!criteria.roomType) return 'room_type';
    if (!criteria.guests) return 'guests';
    return 'booking';
  }

  private generateQuestion(step: string, criteria: HotelCriteria): string {
    const templates = QUESTION_TEMPLATES[step] || ['Could you provide more information?'];
    const question = templates[Math.floor(Math.random() * templates.length)];

    // Add context based on current criteria
    switch (step) {
      case 'dates':
        return `${question} ${criteria.city ? `For your stay in ${criteria.city}.` : ''}`;
      case 'property_type':
        return `${question} ${criteria.city ? `For your accommodation in ${criteria.city}.` : ''} Hotels are our most popular option.`;
      case 'room_type':
        return `${question} Standard rooms are our most popular option.`;
      case 'guests':
        return `${question} I'll assume 2 guests if not specified.`;
      default:
        return question;
    }
  }

  private async searchAndBookHotels(criteria: HotelCriteria): Promise<BookingResponse> {
    try {
      // Search for hotels using MCP Registry
      const searchParams: HotelSearchParams = {
        city: criteria.city,
        hotel_type: criteria.propertyType || 'HOTEL',
        room_type: criteria.roomType || 'STANDARD',
        limit: 10
      };

      if (criteria.budget) {
        searchParams.max_price = criteria.budget;
      }

      const hotels = await this.queryHotelDatabase(searchParams);
      
      if (hotels.length === 0) {
        return await this.handleNoHotels(criteria);
      }

      // Select best hotel (lowest price for now)
      const selectedHotel = this.selectBestHotel(hotels);

      // Create booking
      const booking = await this.createBooking(selectedHotel, criteria);
      
      return {
        status: 'completed',
        booking
      };

    } catch (error) {
      return {
        status: 'error',
        message: 'Unable to search for hotels at this time. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async queryHotelDatabase(params: HotelSearchParams): Promise<Hotel[]> {
    try {
      // Use proper MCP protocol to query travel data
      const result = await this.mcpClient.queryTravelData(
        this.buildHotelQuery(params)
      );

      // Extract results from the response
      if (result && result.results) {
        return this.parseHotelResults(result.results);
      }
      
      return [];
    } catch (error) {
      console.error('Hotel database query error:', error);
      return [];
    }
  }

  private buildHotelQuery(params: HotelSearchParams): string {
    const conditions: string[] = [];
    
    if (params.city) {
      conditions.push(`city = '${params.city}'`);
    }
    if (params.hotel_type) {
      conditions.push(`hotel_type = '${params.hotel_type}'`);
    }
    if (params.room_type) {
      conditions.push(`room_type = '${params.room_type}'`);
    }
    if (params.max_price) {
      conditions.push(`price_per_night <= ${params.max_price}`);
    }
    if (params.min_price) {
      conditions.push(`price_per_night >= ${params.min_price}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return `SELECT * FROM hotels ${whereClause} ORDER BY price_per_night ASC LIMIT ${params.limit || 10}`;
  }

  private parseHotelResults(results: any[]): Hotel[] {
    return results.map(row => ({
      id: row.id,
      name: row.name,
      city: row.city,
      hotel_type: row.hotel_type,
      room_type: row.room_type,
      price_per_night: row.price_per_night
    }));
  }

  private selectBestHotel(hotels: Hotel[]): Hotel {
    // For now, select the cheapest hotel
    // In a real implementation, consider ratings, amenities, location, etc.
    return hotels.reduce((best, current) => 
      current.price_per_night < best.price_per_night ? current : best
    );
  }

  private async createBooking(
    hotel: Hotel, 
    criteria: HotelCriteria
  ): Promise<HotelBooking> {
    
    const guests = criteria.guests || 2;
    const nights = this.calculateNights(criteria.checkInDate!, criteria.checkOutDate!);
    const totalRate = hotel.price_per_night * nights;

    // Generate realistic hotel details
    const enrichedHotel = await this.enrichHotelDetails(hotel);
    const checkInOutTimes = CHECK_IN_OUT_TIMES.standard;

    const booking: HotelBooking = {
      name: enrichedHotel.name,
      city: enrichedHotel.city,
      hotel_type: enrichedHotel.hotel_type,
      room_type: enrichedHotel.room_type,
      price_per_night: `$${enrichedHotel.price_per_night}`,
      check_in_time: checkInOutTimes.check_in,
      check_out_time: checkInOutTimes.check_out,
      total_rate_usd: `$${totalRate}`,
      status: 'completed',
      description: 'Hotel booking confirmed',
      booking_reference: this.generateBookingReference(),
      guest_count: guests,
      nights: nights,
      check_in_date: criteria.checkInDate!,
      check_out_date: criteria.checkOutDate!,
      booking_date: new Date().toISOString(),
      confirmation_number: this.generateConfirmationNumber(),
      cancellation_policy: CANCELLATION_POLICIES.moderate,
      amenities: this.generateAmenities(enrichedHotel.hotel_type),
      contact_info: {
        phone: this.generatePhoneNumber(),
        email: this.generateHotelEmail(enrichedHotel.name),
        address: this.generateHotelAddress(enrichedHotel.city)
      }
    };

    return booking;
  }

  private calculateNights(checkIn: string, checkOut: string): number {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const diffTime = checkOutDate.getTime() - checkInDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private async enrichHotelDetails(hotel: Hotel): Promise<Hotel> {
    // Add realistic hotel amenities and details
    const enriched = { ...hotel };
    
    // Generate star rating based on hotel type and price
    if (hotel.price_per_night < 100) {
      enriched.star_rating = 3;
    } else if (hotel.price_per_night < 200) {
      enriched.star_rating = 4;
    } else {
      enriched.star_rating = 5;
    }

    return enriched;
  }

  private generateAmenities(hotelType: string): string[] {
    const baseAmenities = ['Free WiFi', 'Air Conditioning'];
    
    if (hotelType === 'HOTEL') {
      return [
        ...baseAmenities,
        'Room Service',
        'Concierge',
        'Fitness Center',
        'Business Center',
        'Restaurant'
      ];
    } else if (hotelType === 'AIRBNB') {
      return [
        ...baseAmenities,
        'Kitchen/Kitchenette',
        'Laundry Service',
        'Parking Available'
      ];
    } else {
      return [
        ...baseAmenities,
        'Full Kitchen',
        'Private Parking',
        'Garden/Terrace'
      ];
    }
  }

  private generateBookingReference(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let ref = 'HTL';
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
    for (let i = 0; i < 10; i++) {
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

  private generateHotelEmail(hotelName: string): string {
    const name = hotelName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 10);
    return `reservations@${name}hotel.com`;
  }

  private generateHotelAddress(city: string): string {
    const streetNumber = Math.floor(Math.random() * 9999) + 1;
    const streets = ['Main St', 'Broadway', 'Park Ave', 'First St', 'Oak St', 'Elm St'];
    const street = streets[Math.floor(Math.random() * streets.length)];
    return `${streetNumber} ${street}, ${city}`;
  }

  private async handleNoHotels(criteria: HotelCriteria): Promise<BookingResponse> {
    // Try alternative property or room types
    const alternatives = await this.findAlternatives(criteria);
    
    if (alternatives.length > 0) {
      return {
        status: 'no_hotels',
        message: `No hotels found matching your exact criteria. Would you like to see these alternatives?`,
        alternatives
      };
    }

    return {
      status: 'no_hotels',
      message: `No hotels found in ${criteria.city} for your dates. Please try different dates or locations.`
    };
  }

  private async findAlternatives(criteria: HotelCriteria): Promise<Hotel[]> {
    // Search with different property types
    const altPropertyTypes = ['HOTEL', 'AIRBNB', 'PRIVATE_PROPERTY']
      .filter(type => type !== criteria.propertyType);
    
    for (const altType of altPropertyTypes) {
      const altParams: HotelSearchParams = {
        ...criteria,
        hotel_type: altType,
        limit: 3
      };
      
      const hotels = await this.queryHotelDatabase(altParams);
      if (hotels.length > 0) {
        return hotels;
      }
    }

    // Try different room types
    const altRoomTypes = ['STANDARD', 'SINGLE', 'DOUBLE', 'SUITE']
      .filter(type => type !== criteria.roomType);
    
    for (const altRoom of altRoomTypes) {
      const altParams: HotelSearchParams = {
        ...criteria,
        room_type: altRoom,
        limit: 3
      };
      
      const hotels = await this.queryHotelDatabase(altParams);
      if (hotels.length > 0) {
        return hotels;
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