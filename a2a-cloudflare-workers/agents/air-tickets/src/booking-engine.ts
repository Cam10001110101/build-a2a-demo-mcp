// Core booking logic and flight search

import { 
  FlightCriteria, 
  Flight, 
  FlightBooking, 
  BookingResponse, 
  BookingState,
  FlightSearchParams 
} from './types';
import { 
  AIRFARE_COT_INSTRUCTIONS, 
  FLIGHT_SEARCH_PROMPT,
  BOOKING_CONFIRMATION_PROMPT,
  QUESTION_TEMPLATES,
  AIRPORT_CODES,
  CLASS_MAPPINGS 
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
      const extractedInfo = await this.extractFlightInfo(input, state);
      
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

      // All information collected, search for flights
      state.currentStep = 'booking';
      return await this.searchAndBookFlights(state.criteria);

    } catch (error) {
      return {
        status: 'error',
        message: 'I encountered an error processing your request. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async extractFlightInfo(input: string, state: BookingState): Promise<Partial<FlightCriteria>> {
    const conversationHistory = state.messages
      .slice(-5) // Keep last 5 messages for context
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `
${AIRFARE_COT_INSTRUCTIONS}

Current conversation:
${conversationHistory}

Current criteria: ${JSON.stringify(state.criteria)}

User's latest input: "${input}"

Extract any flight booking information from the user's input and respond with JSON:
{
  "extracted": {
    "origin": "airport code or city if mentioned",
    "destination": "airport code or city if mentioned", 
    "departDate": "YYYY-MM-DD if date mentioned",
    "returnDate": "YYYY-MM-DD if return date mentioned",
    "passengers": number,
    "cabinClass": "economy|premium_economy|business|first",
    "budget": number
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
      console.error('Error extracting flight info:', error);
      return {};
    }
  }

  private normalizeExtractedInfo(extracted: any): Partial<FlightCriteria> {
    const normalized: Partial<FlightCriteria> = {};

    // Normalize origin/destination with airport codes
    if (extracted.origin) {
      normalized.origin = this.normalizeAirport(extracted.origin);
    }
    if (extracted.destination) {
      normalized.destination = this.normalizeAirport(extracted.destination);
    }

    // Normalize cabin class
    if (extracted.cabinClass) {
      const classKey = extracted.cabinClass.toLowerCase();
      normalized.cabinClass = CLASS_MAPPINGS[classKey] || extracted.cabinClass;
    }

    // Copy other fields directly
    if (extracted.departDate) normalized.departDate = extracted.departDate;
    if (extracted.returnDate) normalized.returnDate = extracted.returnDate;
    if (extracted.passengers) normalized.passengers = Number(extracted.passengers);
    if (extracted.budget) normalized.budget = Number(extracted.budget);

    return normalized;
  }

  private normalizeAirport(input: string): string {
    const lower = input.toLowerCase().trim();
    
    // Check if it's already an airport code
    if (/^[A-Z]{3}$/.test(input.toUpperCase())) {
      return input.toUpperCase();
    }

    // Look up in airport codes mapping
    if (AIRPORT_CODES[lower]) {
      return AIRPORT_CODES[lower][0]; // Return primary airport
    }

    // Return as-is for further processing
    return input;
  }

  private determineNextStep(criteria: FlightCriteria): string {
    if (!criteria.origin) return 'origin';
    if (!criteria.destination) return 'destination';
    if (!criteria.departDate) return 'dates';
    if (!criteria.cabinClass) return 'class';
    if (!criteria.passengers) return 'passengers';
    return 'booking';
  }

  private generateQuestion(step: string, criteria: FlightCriteria): string {
    const templates = QUESTION_TEMPLATES[step] || ['Could you provide more information?'];
    const question = templates[Math.floor(Math.random() * templates.length)];

    // Add context based on current criteria
    switch (step) {
      case 'destination':
        return `${question} ${criteria.origin ? `You're departing from ${criteria.origin}.` : ''}`;
      case 'dates':
        return `${question} ${criteria.origin && criteria.destination ? 
          `For your trip from ${criteria.origin} to ${criteria.destination}.` : ''}`;
      case 'class':
        return `${question} Economy is our most popular option.`;
      case 'passengers':
        return `${question} I'll assume 1 passenger if not specified.`;
      default:
        return question;
    }
  }

  private async searchAndBookFlights(criteria: FlightCriteria): Promise<BookingResponse> {
    try {
      // Search for flights using MCP Registry
      const searchParams: FlightSearchParams = {
        origin: criteria.origin,
        destination: criteria.destination,
        ticket_class: criteria.cabinClass || 'economy',
        limit: 10
      };

      const flights = await this.queryFlightDatabase(searchParams);
      
      if (flights.length === 0) {
        return await this.handleNoFlights(criteria);
      }

      // Find best flights for outbound and return
      const outbound = this.selectBestFlight(flights, 'outbound');
      const returnFlight = criteria.returnDate ? 
        this.selectBestFlight(flights, 'return') : undefined;

      // Create booking
      const booking = await this.createBooking(outbound, returnFlight, criteria);
      
      return {
        status: 'completed',
        booking
      };

    } catch (error) {
      return {
        status: 'error',
        message: 'Unable to search for flights at this time. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async queryFlightDatabase(params: FlightSearchParams): Promise<Flight[]> {
    try {
      // Use proper MCP protocol to query travel data
      const result = await this.mcpClient.queryTravelData(
        this.buildFlightQuery(params)
      );

      // Extract results from the response
      if (result && result.results) {
        return this.parseFlightResults(result.results);
      }
      
      return [];
    } catch (error) {
      console.error('Flight database query error:', error);
      return [];
    }
  }

  private buildFlightQuery(params: FlightSearchParams): string {
    const conditions: string[] = [];
    
    if (params.origin) {
      conditions.push(`from_airport = '${params.origin}'`);
    }
    if (params.destination) {
      conditions.push(`to_airport = '${params.destination}'`);
    }
    if (params.ticket_class) {
      conditions.push(`ticket_class = '${params.ticket_class}'`);
    }
    if (params.max_price) {
      conditions.push(`price <= ${params.max_price}`);
    }
    if (params.carrier) {
      conditions.push(`carrier = '${params.carrier}'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return `SELECT * FROM flights ${whereClause} ORDER BY price ASC LIMIT ${params.limit || 10}`;
  }

  private parseFlightResults(results: any[]): Flight[] {
    return results.map(row => ({
      id: row.id,
      carrier: row.carrier,
      flight_number: row.flight_number,
      from_airport: row.from_airport,
      to_airport: row.to_airport,
      ticket_class: row.ticket_class,
      price: row.price
    }));
  }

  private selectBestFlight(flights: Flight[], direction: 'outbound' | 'return'): Flight {
    // For now, select the cheapest flight
    // In a real implementation, consider time preferences, stops, etc.
    return flights.reduce((best, current) => 
      current.price < best.price ? current : best
    );
  }

  private async createBooking(
    outbound: Flight, 
    returnFlight: Flight | undefined, 
    criteria: FlightCriteria
  ): Promise<FlightBooking> {
    
    const passengers = criteria.passengers || 1;
    const outboundPrice = outbound.price * passengers;
    const returnPrice = returnFlight ? returnFlight.price * passengers : 0;
    const totalPrice = outboundPrice + returnPrice;

    // Generate realistic flight details
    const onwardFlight = await this.enrichFlightDetails(outbound);
    const returnFlightEnriched = returnFlight ? 
      await this.enrichFlightDetails(returnFlight) : undefined;

    const booking: FlightBooking = {
      onward: onwardFlight,
      return: returnFlightEnriched,
      total_price: `$${totalPrice}`,
      status: 'completed',
      description: returnFlightEnriched ? 
        `Round-trip booking confirmed for ${outbound.from_airport} ↔ ${outbound.to_airport}` :
        `One-way booking confirmed for ${outbound.from_airport} → ${outbound.to_airport}`,
      booking_reference: this.generateBookingReference(),
      passenger_count: passengers,
      booking_date: new Date().toISOString()
    };

    return booking;
  }

  private async enrichFlightDetails(flight: Flight): Promise<Flight> {
    // Add realistic flight times and details
    const enriched = { ...flight };
    
    // Generate realistic departure/arrival times
    const departureHour = Math.floor(Math.random() * 20) + 6; // 6 AM to 2 AM
    const departureMinute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
    
    enriched.departure_time = `${departureHour.toString().padStart(2, '0')}:${departureMinute.toString().padStart(2, '0')}`;
    
    // Calculate arrival time (add 2-8 hours for domestic, 6-14 for international)
    const flightDuration = this.estimateFlightDuration(flight.from_airport, flight.to_airport);
    const arrivalTime = new Date();
    arrivalTime.setHours(departureHour);
    arrivalTime.setMinutes(departureMinute);
    arrivalTime.setMinutes(arrivalTime.getMinutes() + flightDuration);
    
    enriched.arrival_time = `${arrivalTime.getHours().toString().padStart(2, '0')}:${arrivalTime.getMinutes().toString().padStart(2, '0')}`;
    enriched.duration = this.formatDuration(flightDuration);
    enriched.stops = 0; // Assume direct flights for simplicity

    return enriched;
  }

  private estimateFlightDuration(from: string, to: string): number {
    // Rough flight duration estimates in minutes
    const domesticFlights = {
      'JFK-LAX': 360, 'LAX-JFK': 320,
      'JFK-ORD': 150, 'ORD-JFK': 130,
      'LAX-ORD': 240, 'ORD-LAX': 270
    };

    const route = `${from}-${to}`;
    return domesticFlights[route] || 180; // Default 3 hours
  }

  private formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  private generateBookingReference(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let ref = '';
    for (let i = 0; i < 3; i++) {
      ref += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    for (let i = 0; i < 3; i++) {
      ref += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return ref;
  }

  private async handleNoFlights(criteria: FlightCriteria): Promise<BookingResponse> {
    // Try alternative cabin classes
    const alternatives = await this.findAlternatives(criteria);
    
    if (alternatives.length > 0) {
      return {
        status: 'no_flights',
        message: `No flights found in ${criteria.cabinClass} class. Would you like to see these alternatives?`,
        alternatives
      };
    }

    return {
      status: 'no_flights',
      message: `No flights found for ${criteria.origin} to ${criteria.destination}. Please try different dates or destinations.`
    };
  }

  private async findAlternatives(criteria: FlightCriteria): Promise<Flight[]> {
    // Search in other cabin classes
    const altClasses = ['economy', 'premium_economy', 'business', 'first']
      .filter(cls => cls !== criteria.cabinClass);
    
    for (const altClass of altClasses) {
      const altParams: FlightSearchParams = {
        ...criteria,
        ticket_class: altClass,
        limit: 3
      };
      
      const flights = await this.queryFlightDatabase(altParams);
      if (flights.length > 0) {
        return flights;
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