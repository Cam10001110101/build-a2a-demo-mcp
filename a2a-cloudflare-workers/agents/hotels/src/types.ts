// Type definitions for hotels agent

export interface HotelCriteria {
  city?: string;
  checkInDate?: string; // ISO date string
  checkOutDate?: string; // ISO date string
  guests?: number;
  propertyType?: 'HOTEL' | 'AIRBNB' | 'PRIVATE_PROPERTY';
  roomType?: 'STANDARD' | 'SINGLE' | 'DOUBLE' | 'SUITE';
  budget?: number;
  priceRange?: {
    min?: number;
    max?: number;
  };
  amenities?: string[];
  location?: string; // Specific area within city
  starRating?: number;
}

export interface Hotel {
  id: number;
  name: string;
  city: string;
  hotel_type: string;
  room_type: string;
  price_per_night: number;
  // Additional derived fields
  address?: string;
  star_rating?: number;
  amenities?: string[];
  description?: string;
  images?: string[];
  phone?: string;
  email?: string;
}

export interface HotelBooking {
  name: string;
  city: string;
  hotel_type: string;
  room_type: string;
  price_per_night: string;
  check_in_time: string;
  check_out_time: string;
  total_rate_usd: string;
  status: 'completed' | 'pending' | 'failed';
  description: string;
  booking_reference?: string;
  guest_count: number;
  nights: number;
  check_in_date: string;
  check_out_date: string;
  booking_date: string;
  // Additional booking details
  confirmation_number?: string;
  cancellation_policy?: string;
  amenities?: string[];
  contact_info?: {
    phone?: string;
    email?: string;
    address?: string;
  };
}

export type BookingResponse = 
  | { status: 'input_required'; question: string; context?: any }
  | { status: 'completed'; booking: HotelBooking }
  | { status: 'no_hotels'; message: string; alternatives?: Hotel[] }
  | { status: 'error'; message: string; error?: string };

export interface BookingState {
  contextId: string;
  criteria: HotelCriteria;
  currentStep: 'city' | 'dates' | 'property_type' | 'room_type' | 'guests' | 'booking' | 'complete';
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  lastActivity: number;
  attempts: number;
}

export interface HotelSearchParams {
  city?: string;
  hotel_type?: string;
  room_type?: string;
  max_price?: number;
  min_price?: number;
  star_rating?: number;
  limit?: number;
}

export interface BookingStep {
  step: string;
  question: string;
  validation?: (input: string) => boolean;
  parser?: (input: string) => any;
  required: boolean;
}