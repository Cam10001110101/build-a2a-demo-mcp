// Core planning logic and conversation state management

import { 
  TripInfo, 
  PlannerTask, 
  TaskList, 
  PlannerResponse, 
  ConversationState, 
  PlanningStep 
} from './types';
import { 
  PLANNER_COT_INSTRUCTIONS, 
  TASK_GENERATION_PROMPT, 
  QUESTION_TEMPLATES,
  REASONING_TEMPLATES 
} from './prompts';

export class PlanningEngine {
  private ai: Ai;

  constructor(ai: Ai) {
    this.ai = ai;
  }

  async processUserInput(
    input: string, 
    state: ConversationState
  ): Promise<PlannerResponse> {
    
    // Add user message to conversation
    state.messages.push({
      role: 'user',
      content: input,
      timestamp: Date.now()
    });

    try {
      // Build conversation context
      const conversationHistory = state.messages
        .slice(-10) // Keep last 10 messages for context
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      // Create planning prompt
      const prompt = this.buildPlanningPrompt(input, state, conversationHistory);

      // Get AI response
      const response = await this.ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: PLANNER_COT_INSTRUCTIONS },
          { role: 'user', content: prompt }
        ]
      });

      const aiResponse = response.response;
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      // Parse AI response
      const parsed = this.parseAIResponse(aiResponse);
      
      // Update conversation state
      state.messages.push({
        role: 'assistant',
        content: aiResponse,
        timestamp: Date.now()
      });

      // Update trip info if new information was provided
      if (parsed.status === 'input_required' && parsed.context?.collected_info) {
        Object.assign(state.tripInfo, parsed.context.collected_info);
      }

      state.lastActivity = Date.now();

      return parsed;

    } catch (error) {
      return {
        status: 'error',
        message: 'I encountered an error while processing your request. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private buildPlanningPrompt(
    input: string, 
    state: ConversationState, 
    conversationHistory: string
  ): string {
    
    const currentInfo = JSON.stringify(state.tripInfo, null, 2);
    
    return `
Current user input: "${input}"

Conversation history:
${conversationHistory}

Currently collected trip information:
${currentInfo}

Task: Analyze the user input and determine if you have enough information to create a complete travel plan. If not, ask for the most important missing information. If yes, generate the complete task list.

Focus on gathering information in this priority order:
1. Destination and origin
2. Travel dates
3. Number of travelers
4. Budget and trip type
5. Specific preferences (hotels, car rental, etc.)

Respond with valid JSON only.
`;
  }

  private parseAIResponse(response: string): PlannerResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate response structure
      if (!parsed.status || !['input_required', 'completed', 'error'].includes(parsed.status)) {
        throw new Error('Invalid response status');
      }

      return parsed as PlannerResponse;

    } catch (error) {
      // Fallback: treat as input required with the raw response
      return {
        status: 'input_required',
        message: response || 'I need more information to help you plan your trip.'
      };
    }
  }

  generateTasksFromTripInfo(tripInfo: TripInfo): TaskList {
    const tasks: PlannerTask[] = [];
    let taskCounter = 1;

    // Always generate airfare task
    tasks.push({
      id: `task_${taskCounter++}`,
      type: 'airfare',
      agent: 'air_tickets',
      description: 'Book flight tickets',
      query: this.buildAirfareQuery(tripInfo),
      dependencies: [],
      metadata: {
        priority: 1,
        estimatedTime: '10-15 minutes',
        requiresUserInput: false
      }
    });

    // Generate hotel task if overnight stay is implied
    const tripDuration = this.calculateTripDuration(tripInfo.departDate, tripInfo.returnDate);
    if (tripDuration > 0) {
      tasks.push({
        id: `task_${taskCounter++}`,
        type: 'hotel',
        agent: 'hotels',
        description: 'Book hotel accommodation',
        query: this.buildHotelQuery(tripInfo),
        dependencies: ['task_1'], // Wait for flight confirmation
        metadata: {
          priority: 2,
          estimatedTime: '8-12 minutes',
          requiresUserInput: false
        }
      });
    }

    // Generate car rental task if specified or inferred
    if (this.shouldIncludeCarRental(tripInfo)) {
      tasks.push({
        id: `task_${taskCounter++}`,
        type: 'car_rental',
        agent: 'car_rental',
        description: 'Book car rental',
        query: this.buildCarRentalQuery(tripInfo),
        dependencies: ['task_1'], // Coordinate with flight times
        metadata: {
          priority: 3,
          estimatedTime: '5-8 minutes',
          requiresUserInput: false
        }
      });
    }

    const totalTime = this.calculateTotalEstimatedTime(tasks);
    const reasoning = this.generateReasoning(tripInfo, tasks);

    return {
      tripInfo,
      tasks,
      reasoning,
      totalEstimatedTime: totalTime
    };
  }

  private buildAirfareQuery(tripInfo: TripInfo): string {
    const passengers = tripInfo.numTravelers === 1 ? '1 passenger' : `${tripInfo.numTravelers} passengers`;
    const cabinClass = tripInfo.cabinClass || 'economy';
    const budget = tripInfo.budget ? ` Budget: $${tripInfo.budget} total.` : '';
    
    return `Book round-trip flights for ${passengers} from ${tripInfo.origin} to ${tripInfo.destination}, departing ${tripInfo.departDate}, returning ${tripInfo.returnDate}. Cabin class: ${cabinClass}.${budget} Trip type: ${tripInfo.tripType}. Find the best available options with good timing and value.`;
  }

  private buildHotelQuery(tripInfo: TripInfo): string {
    const guests = tripInfo.numTravelers === 1 ? '1 guest' : `${tripInfo.numTravelers} guests`;
    const checkIn = tripInfo.hotelCheckIn || tripInfo.departDate;
    const checkOut = tripInfo.hotelCheckOut || tripInfo.returnDate;
    const nights = this.calculateTripDuration(checkIn, checkOut);
    const propertyType = tripInfo.propertyType || 'hotel';
    const roomType = tripInfo.roomType || 'standard';
    
    let budget = '';
    if (tripInfo.budget) {
      const hotelBudget = Math.round(tripInfo.budget * 0.4); // Assume 40% of budget for hotels
      const perNight = Math.round(hotelBudget / nights);
      budget = ` Budget: $${perNight} per night.`;
    }

    return `Book ${propertyType} accommodation in ${tripInfo.destination} for ${guests}, check-in ${checkIn}, check-out ${checkOut} (${nights} nights). Room type: ${roomType}.${budget} Find well-rated properties in good locations with necessary amenities.`;
  }

  private buildCarRentalQuery(tripInfo: TripInfo): string {
    const pickupDate = tripInfo.carPickupDate || tripInfo.departDate;
    const returnDate = tripInfo.carReturnDate || tripInfo.returnDate;
    const carType = tripInfo.carType || 'economy';
    const pickupLocation = tripInfo.carPickupLocation || `${tripInfo.destination} airport`;
    const returnLocation = tripInfo.carReturnLocation || pickupLocation;
    const days = this.calculateTripDuration(pickupDate, returnDate);

    return `Book car rental in ${tripInfo.destination} for ${pickupDate} to ${returnDate}. Pickup: ${pickupLocation}. Return: ${returnLocation}. Car type: ${carType}. Duration: ${days} days. Coordinate pickup/return times with flight schedule.`;
  }

  private shouldIncludeCarRental(tripInfo: TripInfo): boolean {
    // Include car rental if explicitly requested or if it's inferred from trip type/destination
    return Boolean(
      tripInfo.carPickupDate || 
      tripInfo.carType || 
      tripInfo.carPickupLocation ||
      (tripInfo.tripType === 'leisure' && this.calculateTripDuration(tripInfo.departDate, tripInfo.returnDate) > 2)
    );
  }

  private calculateTripDuration(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private calculateTotalEstimatedTime(tasks: PlannerTask[]): string {
    const totalMinutes = tasks.reduce((total, task) => {
      const timeStr = task.metadata.estimatedTime;
      const minutes = this.parseEstimatedTime(timeStr);
      return total + minutes;
    }, 0);

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      return mins > 0 ? `${hours} hours ${mins} minutes` : `${hours} hours`;
    }
  }

  private parseEstimatedTime(timeStr: string): number {
    // Parse "10-15 minutes" or "1-2 hours" format
    const match = timeStr.match(/(\d+)[-–](\d+)\s*(minutes?|hours?)/);
    if (match) {
      const avg = (parseInt(match[1]) + parseInt(match[2])) / 2;
      return match[3].startsWith('hour') ? avg * 60 : avg;
    }
    return 10; // Default fallback
  }

  private generateReasoning(tripInfo: TripInfo, tasks: PlannerTask[]): string {
    const destination = tripInfo.destination;
    const duration = this.calculateTripDuration(tripInfo.departDate, tripInfo.returnDate);
    const tripType = tripInfo.tripType;
    const travelers = tripInfo.numTravelers;

    let reasoning = `I've created a comprehensive travel plan for your ${tripType} trip to ${destination}. `;
    
    if (duration === 1) {
      reasoning += `Since this is a day trip, `;
    } else {
      reasoning += `For your ${duration}-day trip, `;
    }

    reasoning += `I've organized ${tasks.length} main booking tasks in priority order:\n\n`;

    tasks.forEach((task, index) => {
      reasoning += `${index + 1}. **${task.description}**: ${task.query}\n`;
    });

    reasoning += `\nThe total estimated time for all bookings is ${this.calculateTotalEstimatedTime(tasks)}. `;
    
    if (tripType === 'business') {
      reasoning += REASONING_TEMPLATES.business_trip;
    } else if (travelers > 1 && travelers <= 4) {
      reasoning += REASONING_TEMPLATES.family_trip;
    } else if (travelers === 2 && tripType === 'leisure') {
      reasoning += REASONING_TEMPLATES.romantic_trip;
    } else {
      reasoning += REASONING_TEMPLATES.leisure_trip;
    }

    return reasoning;
  }
}