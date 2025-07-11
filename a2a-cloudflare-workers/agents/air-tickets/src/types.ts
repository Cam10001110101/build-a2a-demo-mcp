// Type definitions for air tickets agent

export interface FlightCriteria {
  origin?: string;
  destination?: string;
  departDate?: string; // ISO date string
  returnDate?: string; // ISO date string
  passengers?: number;
  cabinClass?: 'economy' | 'premium_economy' | 'business' | 'first';
  budget?: number;
  flexible?: boolean;
}

export interface Flight {
  id: number;
  carrier: string;
  flight_number: number;
  from_airport: string;
  to_airport: string;
  ticket_class: string;
  price: number;
  // Additional derived fields
  departure_time?: string;
  arrival_time?: string;
  duration?: string;
  stops?: number;
}

export interface FlightBooking {
  onward: Flight;
  return?: Flight;
  total_price: string;
  status: 'completed' | 'pending' | 'failed';
  description: string;
  booking_reference?: string;
  passenger_count: number;
  booking_date: string;
}

export type BookingResponse = 
  | { status: 'input_required'; question: string; context?: any }
  | { status: 'completed'; booking: FlightBooking }
  | { status: 'no_flights'; message: string; alternatives?: Flight[] }
  | { status: 'error'; message: string; error?: string };

export interface BookingState {
  contextId: string;
  criteria: FlightCriteria;
  currentStep: 'origin' | 'destination' | 'dates' | 'class' | 'passengers' | 'booking' | 'complete';
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  lastActivity: number;
  attempts: number;
}

export interface FlightSearchParams {
  origin?: string;
  destination?: string;
  ticket_class?: string;
  max_price?: number;
  carrier?: string;
  limit?: number;
}

export interface BookingStep {
  step: string;
  question: string;
  validation?: (input: string) => boolean;
  parser?: (input: string) => any;
  required: boolean;
}