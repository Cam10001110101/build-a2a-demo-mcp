import { BaseAgent, AgentCard } from '@a2a-workers/shared/agent-base';
import { A2AAgentResponse } from '@a2a-workers/shared/a2a-protocol';
import { BookingEngine } from './booking-engine';
import { BookingState, FlightCriteria } from './types';

interface Env {
  AI: Ai;
  BOOKINGS: KVNamespace;
  MCP_REGISTRY: Fetcher;
}

export class AirTicketsAgent extends BaseAgent {
  private env: Env;
  private bookingEngine: BookingEngine;

  constructor(env: Env) {
    const agentCard: AgentCard = {
      name: "Air Ticketing Agent",
      description: "Specialized agent for booking airline tickets with comprehensive flight search and booking capabilities",
      url: "https://agent.air-tickets.demos.build",
      version: "1.0.0",
      capabilities: {
        streaming: "true",
        pushNotifications: "true",
        stateTransitionHistory: "true"
      },
      authentication: {
        schemes: ["none"]
      },
      defaultInputModes: ["text"],
      defaultOutputModes: ["text"],
      skills: [{
        id: "book_air_tickets",
        name: "Flight Booking & Search",
        description: "Search and book airline tickets with comprehensive flight options and pricing",
        tags: ["flights", "booking", "travel", "airlines", "tickets"],
        examples: [
          "Book a round-trip flight from NYC to London",
          "Find flights from JFK to LAX for next Tuesday",
          "I need business class tickets to Tokyo",
          "Book economy flights for 2 passengers to Miami"
        ]
      }]
    };

    super(agentCard);
    this.env = env;
    this.bookingEngine = new BookingEngine(env.AI, env.MCP_REGISTRY);
    
    // Set KV storage for A2A state persistence
    this.setKVStorage(env.BOOKINGS);
  }

  async *stream(query: string, contextId: string, taskId?: string): AsyncGenerator<A2AAgentResponse> {
    try {
      // Load booking state
      const state = await this.loadBookingState(contextId);

      yield {
        response_type: "status",
        is_task_complete: false,
        require_user_input: false,
        content: "Processing your flight booking request...",
        context_id: contextId
      };

      // Process the booking request
      const bookingResult = await this.bookingEngine.processBookingRequest(query, state);

      // Save updated state
      await this.saveBookingState(contextId, state);

      // Handle different response types
      if (bookingResult.status === 'input_required') {
        yield {
          response_type: "input_required",
          is_task_complete: false,
          require_user_input: true,
          content: bookingResult.question,
          context_id: contextId
        };
      } else if (bookingResult.status === 'completed') {
        // Save the booking
        await this.saveBooking(contextId, bookingResult.booking);
        
        yield {
          response_type: "booking_confirmed",
          is_task_complete: true,
          require_user_input: false,
          content: this.formatBookingConfirmation(bookingResult.booking),
          context_id: contextId
        };
      } else if (bookingResult.status === 'no_flights') {
        yield {
          response_type: "no_results",
          is_task_complete: false,
          require_user_input: true,
          content: bookingResult.message,
          context_id: contextId
        };
      } else if (bookingResult.status === 'error') {
        yield {
          response_type: "error",
          is_task_complete: true,
          require_user_input: false,
          content: bookingResult.message,
          context_id: contextId
        };
      }

    } catch (error) {
      yield {
        response_type: "error",
        is_task_complete: true,
        require_user_input: false,
        content: `Booking error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context_id: contextId
      };
    }
  }

  private formatBookingConfirmation(booking: any): string {
    let confirmation = `✈️ **Flight Booking Confirmed!**\n\n`;
    confirmation += `**Booking Reference:** ${booking.booking_reference}\n`;
    confirmation += `**Total Price:** ${booking.total_price} for ${booking.passenger_count} passenger(s)\n\n`;

    // Outbound flight
    confirmation += `**Outbound Flight:**\n`;
    confirmation += `${booking.onward.carrier} ${booking.onward.flight_number}\n`;
    confirmation += `${booking.onward.from_airport} → ${booking.onward.to_airport}\n`;
    confirmation += `Departure: ${booking.onward.departure_time}\n`;
    confirmation += `Arrival: ${booking.onward.arrival_time}\n`;
    confirmation += `Duration: ${booking.onward.duration}\n`;
    confirmation += `Class: ${booking.onward.ticket_class}\n`;
    confirmation += `Price: $${booking.onward.price} per person\n\n`;

    // Return flight if exists
    if (booking.return) {
      confirmation += `**Return Flight:**\n`;
      confirmation += `${booking.return.carrier} ${booking.return.flight_number}\n`;
      confirmation += `${booking.return.from_airport} → ${booking.return.to_airport}\n`;
      confirmation += `Departure: ${booking.return.departure_time}\n`;
      confirmation += `Arrival: ${booking.return.arrival_time}\n`;
      confirmation += `Duration: ${booking.return.duration}\n`;
      confirmation += `Class: ${booking.return.ticket_class}\n`;
      confirmation += `Price: $${booking.return.price} per person\n\n`;
    }

    confirmation += `**Important Notes:**\n`;
    confirmation += `• Please arrive at the airport 2 hours early for domestic flights, 3 hours for international\n`;
    confirmation += `• Bring valid photo ID and travel documents\n`;
    confirmation += `• Check baggage policies with the airline\n`;
    confirmation += `• Booking date: ${new Date(booking.booking_date).toLocaleDateString()}\n`;

    return confirmation;
  }

  private async loadBookingState(contextId: string): Promise<BookingState> {
    try {
      const data = await this.env.BOOKINGS.get(`booking_state:${contextId}`);
      if (data) {
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading booking state:', error);
    }

    // Return fresh state
    return {
      contextId,
      criteria: {},
      currentStep: 'origin',
      messages: [],
      lastActivity: Date.now(),
      attempts: 0
    };
  }

  private async saveBookingState(contextId: string, state: BookingState): Promise<void> {
    try {
      state.lastActivity = Date.now();
      await this.env.BOOKINGS.put(
        `booking_state:${contextId}`,
        JSON.stringify(state),
        { expirationTtl: 86400 } // 24 hours
      );
    } catch (error) {
      console.error('Error saving booking state:', error);
    }
  }

  private async saveBooking(contextId: string, booking: any): Promise<void> {
    try {
      const bookingRecord = {
        contextId,
        booking,
        timestamp: Date.now(),
        status: 'confirmed'
      };

      await this.env.BOOKINGS.put(
        `booking:${booking.booking_reference}`,
        JSON.stringify(bookingRecord),
        { expirationTtl: 86400 * 30 } // 30 days
      );

      // Also save by context for easy retrieval
      await this.env.BOOKINGS.put(
        `booking_by_context:${contextId}`,
        JSON.stringify(bookingRecord),
        { expirationTtl: 86400 * 30 }
      );
    } catch (error) {
      console.error('Error saving booking:', error);
    }
  }

  async handleBookingLookup(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const reference = url.searchParams.get('reference');
      const contextId = url.searchParams.get('context_id');

      if (!reference && !contextId) {
        return new Response(JSON.stringify({
          error: 'Booking reference or context_id required'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      let bookingData;
      if (reference) {
        bookingData = await this.env.BOOKINGS.get(`booking:${reference}`);
      } else if (contextId) {
        bookingData = await this.env.BOOKINGS.get(`booking_by_context:${contextId}`);
      }

      if (!bookingData) {
        return new Response(JSON.stringify({
          error: 'Booking not found'
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      return new Response(bookingData, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Failed to lookup booking',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }

  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Handle booking lookup endpoint
    if (url.pathname === '/booking' && request.method === 'GET') {
      return this.handleBookingLookup(request);
    }

    // Delegate to BaseAgent for standard A2A protocol handling
    return super.handleRequest(request);
  }

  private async _oldHandleMainEndpoint(request: Request): Promise<Response> {
    // This method is kept for reference but not used
    if (request.method === 'POST') {
      try {
        const body = await request.json() as any;
        const query = body.query || body.message || '';
        const contextId = body.context_id || body.contextId || this.generateContextId();
        const taskId = body.task_id || body.taskId || this.generateTaskId();

        // Check if streaming is requested
        const acceptHeader = request.headers.get('Accept');
        const wantsStream = acceptHeader?.includes('text/event-stream');

        if (wantsStream) {
          return this.handleStreamingResponse(query, contextId, taskId);
        } else {
          return this.handleSyncResponse(query, contextId, taskId);
        }
      } catch (error) {
        return new Response(JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    return new Response('Method not allowed', { 
      status: 405,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}