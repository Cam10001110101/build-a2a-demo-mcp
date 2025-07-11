import { BaseAgent, AgentCard } from '@a2a-workers/shared/agent-base';
import { A2AAgentResponse } from '@a2a-workers/shared/a2a-protocol';
import { BookingEngine } from './booking-engine';
import { BookingState, HotelCriteria } from './types';

interface Env {
  AI: Ai;
  BOOKINGS: KVNamespace;
  MCP_REGISTRY: Fetcher;
}

export class HotelsAgent extends BaseAgent {
  private env: Env;
  private bookingEngine: BookingEngine;

  constructor(env: Env) {
    const agentCard: AgentCard = {
      name: "Hotel Booking Agent",
      description: "Specialized agent for booking hotel accommodations with comprehensive search and booking capabilities",
      url: "https://agent.hotels.demos.build",
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
        id: "book_hotels",
        name: "Hotel Booking & Search",
        description: "Search and book hotel accommodations with comprehensive options and pricing",
        tags: ["hotels", "booking", "accommodation", "travel", "lodging"],
        examples: [
          "Book a hotel in New York for next week",
          "Find accommodation in London for 3 nights",
          "I need a double room in Tokyo",
          "Book a suite in Paris for 2 guests"
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
        content: "Processing your hotel booking request...",
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
      } else if (bookingResult.status === 'no_hotels') {
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
    let confirmation = `🏨 **Hotel Booking Confirmed!**\n\n`;
    confirmation += `**Hotel:** ${booking.name}\n`;
    confirmation += `**Location:** ${booking.city}\n`;
    confirmation += `**Booking Reference:** ${booking.booking_reference}\n`;
    confirmation += `**Confirmation Number:** ${booking.confirmation_number}\n\n`;

    confirmation += `**Stay Details:**\n`;
    confirmation += `Check-in: ${new Date(booking.check_in_date).toLocaleDateString()} at ${booking.check_in_time}\n`;
    confirmation += `Check-out: ${new Date(booking.check_out_date).toLocaleDateString()} at ${booking.check_out_time}\n`;
    confirmation += `Duration: ${booking.nights} night(s)\n`;
    confirmation += `Guests: ${booking.guest_count}\n\n`;

    confirmation += `**Room Information:**\n`;
    confirmation += `Property Type: ${booking.hotel_type.replace('_', ' ')}\n`;
    confirmation += `Room Type: ${booking.room_type}\n`;
    confirmation += `Rate: ${booking.price_per_night} per night\n`;
    confirmation += `**Total Cost: ${booking.total_rate_usd}**\n\n`;

    if (booking.amenities && booking.amenities.length > 0) {
      confirmation += `**Amenities:**\n`;
      booking.amenities.forEach((amenity: string) => {
        confirmation += `• ${amenity}\n`;
      });
      confirmation += `\n`;
    }

    if (booking.contact_info) {
      confirmation += `**Hotel Contact:**\n`;
      if (booking.contact_info.phone) {
        confirmation += `Phone: ${booking.contact_info.phone}\n`;
      }
      if (booking.contact_info.email) {
        confirmation += `Email: ${booking.contact_info.email}\n`;
      }
      if (booking.contact_info.address) {
        confirmation += `Address: ${booking.contact_info.address}\n`;
      }
      confirmation += `\n`;
    }

    confirmation += `**Important Information:**\n`;
    confirmation += `• Cancellation Policy: ${booking.cancellation_policy}\n`;
    confirmation += `• Please bring valid photo ID for check-in\n`;
    confirmation += `• Contact the hotel directly for special requests\n`;
    confirmation += `• Booking date: ${new Date(booking.booking_date).toLocaleDateString()}\n\n`;

    confirmation += `**Check-in Instructions:**\n`;
    confirmation += `• Arrive after ${booking.check_in_time} on your check-in date\n`;
    confirmation += `• Have your booking reference ready: ${booking.booking_reference}\n`;
    confirmation += `• Checkout before ${booking.check_out_time} on your departure date\n`;

    return confirmation;
  }

  private async loadBookingState(contextId: string): Promise<BookingState> {
    try {
      const data = await this.env.BOOKINGS.get(`hotel_booking_state:${contextId}`);
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
      currentStep: 'city',
      messages: [],
      lastActivity: Date.now(),
      attempts: 0
    };
  }

  private async saveBookingState(contextId: string, state: BookingState): Promise<void> {
    try {
      state.lastActivity = Date.now();
      await this.env.BOOKINGS.put(
        `hotel_booking_state:${contextId}`,
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
        status: 'confirmed',
        type: 'hotel'
      };

      await this.env.BOOKINGS.put(
        `hotel_booking:${booking.booking_reference}`,
        JSON.stringify(bookingRecord),
        { expirationTtl: 86400 * 30 } // 30 days
      );

      // Also save by context for easy retrieval
      await this.env.BOOKINGS.put(
        `hotel_booking_by_context:${contextId}`,
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
        bookingData = await this.env.BOOKINGS.get(`hotel_booking:${reference}`);
      } else if (contextId) {
        bookingData = await this.env.BOOKINGS.get(`hotel_booking_by_context:${contextId}`);
      }

      if (!bookingData) {
        return new Response(JSON.stringify({
          error: 'Hotel booking not found'
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
        error: 'Failed to lookup hotel booking',
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