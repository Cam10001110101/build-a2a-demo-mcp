import { BaseAgent } from '@a2a-workers/shared/agent-base';
import { BookingEngine } from './booking-engine';
export class CarRentalAgent extends BaseAgent {
    env;
    bookingEngine;
    constructor(env) {
        const agentCard = {
            name: "Car Rental Agent",
            description: "Specialized agent for booking rental cars with comprehensive search and booking capabilities",
            url: "https://agent.car-rental.demos.build",
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
                    id: "book_car_rental",
                    name: "Car Rental Booking & Search",
                    description: "Search and book rental cars with various vehicle types and competitive pricing",
                    tags: ["car", "rental", "vehicle", "travel", "transport"],
                    examples: [
                        "Book a rental car in London, starting on June 20, 2025, and ending on July 10, 2025",
                        "I need a car rental in San Francisco for next week",
                        "Find me an SUV rental in Miami",
                        "Book a truck in Denver for 3 days"
                    ]
                }]
        };
        super(agentCard);
        this.env = env;
        this.bookingEngine = new BookingEngine(env.AI, env.MCP_REGISTRY);
    }
    async *stream(query, contextId, taskId) {
        try {
            // Load booking state
            const state = await this.loadBookingState(contextId);
            yield {
                response_type: "status",
                is_task_complete: false,
                require_user_input: false,
                content: "Processing your car rental request...",
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
                    content: bookingResult.question || '',
                    context_id: contextId
                };
            }
            else if (bookingResult.status === 'completed') {
                // Save the booking
                await this.saveBooking(contextId, bookingResult.booking);
                yield {
                    response_type: "booking_confirmed",
                    is_task_complete: true,
                    require_user_input: false,
                    content: this.formatBookingConfirmation(bookingResult.booking),
                    context_id: contextId
                };
            }
            else if (bookingResult.status === 'no_cars') {
                yield {
                    response_type: "no_results",
                    is_task_complete: false,
                    require_user_input: true,
                    content: bookingResult.message || '',
                    context_id: contextId
                };
            }
            else if (bookingResult.status === 'error') {
                yield {
                    response_type: "error",
                    is_task_complete: true,
                    require_user_input: false,
                    content: bookingResult.message || '',
                    context_id: contextId
                };
            }
        }
        catch (error) {
            yield {
                response_type: "error",
                is_task_complete: true,
                require_user_input: false,
                content: `Booking error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                context_id: contextId
            };
        }
    }
    formatBookingConfirmation(booking) {
        let confirmation = `🚗 **Car Rental Booking Confirmed!**\n\n`;
        confirmation += `**Provider:** ${booking.provider}\n`;
        confirmation += `**Location:** ${booking.city}\n`;
        confirmation += `**Booking Reference:** ${booking.booking_reference}\n`;
        confirmation += `**Confirmation Number:** ${booking.confirmation_number}\n\n`;
        confirmation += `**Rental Details:**\n`;
        confirmation += `Pickup: ${new Date(booking.pickup_date).toLocaleDateString()} at ${booking.pickup_time}\n`;
        confirmation += `Return: ${new Date(booking.return_date).toLocaleDateString()} at ${booking.return_time}\n`;
        confirmation += `Duration: ${booking.total_days} day(s)\n`;
        confirmation += `Vehicle Type: ${booking.car_type}\n\n`;
        confirmation += `**Pricing:**\n`;
        confirmation += `Daily Rate: ${booking.daily_rate}\n`;
        confirmation += `**Total Cost: ${booking.price}**\n\n`;
        if (booking.features && booking.features.length > 0) {
            confirmation += `**Vehicle Features:**\n`;
            booking.features.forEach((feature) => {
                confirmation += `• ${feature}\n`;
            });
            confirmation += `\n`;
        }
        if (booking.pickup_location) {
            confirmation += `**Pickup Location:**\n`;
            confirmation += `${booking.pickup_location.name}\n`;
            confirmation += `${booking.pickup_location.address}\n`;
            confirmation += `Phone: ${booking.pickup_location.phone}\n`;
            confirmation += `Hours: ${booking.pickup_location.hours}\n\n`;
        }
        if (booking.insurance_options) {
            confirmation += `**Insurance Options:**\n`;
            confirmation += `• ${booking.insurance_options.basic}\n`;
            confirmation += `• ${booking.insurance_options.premium}\n\n`;
        }
        confirmation += `**Important Information:**\n`;
        confirmation += `• Valid driver's license required at pickup\n`;
        confirmation += `• Primary driver must be 25+ years old\n`;
        confirmation += `• Return with same fuel level to avoid charges\n`;
        confirmation += `• Late returns subject to additional daily charges\n`;
        confirmation += `• Booking date: ${new Date(booking.booking_date).toLocaleDateString()}\n\n`;
        confirmation += `**Pickup Instructions:**\n`;
        confirmation += `• Arrive at ${booking.pickup_time} on your pickup date\n`;
        confirmation += `• Have your driver's license and credit card ready\n`;
        confirmation += `• Present booking reference: ${booking.booking_reference}\n`;
        confirmation += `• Return vehicle by ${booking.return_time} on your return date\n`;
        return confirmation;
    }
    async loadBookingState(contextId) {
        try {
            const data = await this.env.BOOKINGS.get(`car_rental_state:${contextId}`);
            if (data) {
                return JSON.parse(data);
            }
        }
        catch (error) {
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
    async saveBookingState(contextId, state) {
        try {
            state.lastActivity = Date.now();
            await this.env.BOOKINGS.put(`car_rental_state:${contextId}`, JSON.stringify(state), { expirationTtl: 86400 } // 24 hours
            );
        }
        catch (error) {
            console.error('Error saving booking state:', error);
        }
    }
    async saveBooking(contextId, booking) {
        try {
            const bookingRecord = {
                contextId,
                booking,
                timestamp: Date.now(),
                status: 'confirmed',
                type: 'car_rental'
            };
            await this.env.BOOKINGS.put(`car_rental_booking:${booking.booking_reference}`, JSON.stringify(bookingRecord), { expirationTtl: 86400 * 30 } // 30 days
            );
            // Also save by context for easy retrieval
            await this.env.BOOKINGS.put(`car_rental_booking_by_context:${contextId}`, JSON.stringify(bookingRecord), { expirationTtl: 86400 * 30 });
        }
        catch (error) {
            console.error('Error saving booking:', error);
        }
    }
    async handleBookingLookup(request) {
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
                bookingData = await this.env.BOOKINGS.get(`car_rental_booking:${reference}`);
            }
            else if (contextId) {
                bookingData = await this.env.BOOKINGS.get(`car_rental_booking_by_context:${contextId}`);
            }
            if (!bookingData) {
                return new Response(JSON.stringify({
                    error: 'Car rental booking not found'
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
        }
        catch (error) {
            return new Response(JSON.stringify({
                error: 'Failed to lookup car rental booking',
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
    async handleRequest(request) {
        const url = new URL(request.url);
        // Handle agent info endpoint
        if (url.pathname === '/.well-known/agent.json') {
            return new Response(JSON.stringify(this.agentCard), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        // Handle booking lookup endpoint
        if (url.pathname === '/booking' && request.method === 'GET') {
            return this.handleBookingLookup(request);
        }
        // Handle main agent endpoint
        if (request.method === 'POST') {
            try {
                const body = await request.json();
                const query = body.query || body.message || '';
                const contextId = body.context_id || body.contextId || this.generateContextId();
                const taskId = body.task_id || body.taskId || this.generateTaskId();
                // Check if streaming is requested
                const acceptHeader = request.headers.get('Accept');
                const wantsStream = acceptHeader?.includes('text/event-stream');
                if (wantsStream) {
                    return this.handleStreamingResponse(query, contextId, taskId);
                }
                else {
                    return this.handleSyncResponse(query, contextId, taskId);
                }
            }
            catch (error) {
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
