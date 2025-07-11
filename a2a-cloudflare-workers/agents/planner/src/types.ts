// Type definitions for the planner agent

export interface TripInfo {
  budget: number;
  destination: string;
  origin: string;
  departDate: string; // ISO date string
  returnDate: string; // ISO date string
  numTravelers: number;
  tripType: 'business' | 'leisure';
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
  budgetType: 'low' | 'mid' | 'high';
  
  // Hotel preferences
  hotelCheckIn?: string; // ISO date string
  hotelCheckOut?: string; // ISO date string
  propertyType?: 'hotel' | 'resort' | 'apartment' | 'villa' | 'any';
  roomType?: 'standard' | 'deluxe' | 'suite' | 'any';
  
  // Car rental preferences
  carPickupDate?: string; // ISO date string
  carReturnDate?: string; // ISO date string
  carType?: 'economy' | 'compact' | 'midsize' | 'fullsize' | 'luxury' | 'suv' | 'any';
  carPickupLocation?: string;
  carReturnLocation?: string;
  
  // Additional preferences
  additionalRequirements?: string;
  specialRequests?: string;
}

export interface PlannerTask {
  id: string;
  type: 'airfare' | 'hotel' | 'car_rental';
  agent: string;
  description: string;
  query: string;
  dependencies: string[];
  metadata: {
    priority: number;
    estimatedTime: string;
    requiresUserInput?: boolean;
    [key: string]: any;
  };
}

export interface TaskList {
  tripInfo: TripInfo;
  tasks: PlannerTask[];
  reasoning: string;
  totalEstimatedTime: string;
}

export type PlannerResponse = 
  | { status: 'input_required'; message: string; context?: any }
  | { status: 'completed'; data: TaskList }
  | { status: 'error'; message: string; error?: string };

export interface ConversationState {
  contextId: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  tripInfo: Partial<TripInfo>;
  currentStep: string;
  lastActivity: number;
}

export interface PlanningStep {
  id: string;
  question: string;
  required: boolean;
  fieldName: keyof TripInfo;
  validationPattern?: RegExp;
  options?: string[];
  followUp?: string;
}