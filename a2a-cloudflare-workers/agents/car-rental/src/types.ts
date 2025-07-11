// Car rental booking types

export type CarType = 'SEDAN' | 'SUV' | 'TRUCK';

export interface CarCriteria {
  city: string;
  pickupDate?: string;  // YYYY-MM-DD
  returnDate?: string;  // YYYY-MM-DD
  carType?: CarType;
  budget?: number;
  pickupLocation?: string;
}

export interface RentalCar {
  id: number;
  provider: string;
  city: string;
  type_of_car: CarType;
  daily_rate: number;
  availability?: string[];
}

export interface CarBooking {
  pickup_date: string;
  return_date: string;
  provider: string;
  city: string;
  car_type: CarType;
  status: 'booking_complete';
  price: string;
  daily_rate: string;
  total_days: number;
  description: string;
  booking_reference: string;
  confirmation_number: string;
  pickup_time: string;
  return_time: string;
  booking_date: string;
  features?: string[];
  pickup_location?: {
    name: string;
    address: string;
    phone: string;
    hours: string;
  };
  insurance_options?: {
    basic: string;
    premium: string;
  };
}

export interface BookingResponse {
  status: 'input_required' | 'completed' | 'no_cars' | 'error';
  question?: string;
  booking?: CarBooking;
  message?: string;
  alternatives?: RentalCar[];
  context?: {
    current_step: string;
    collected_info: Partial<CarCriteria>;
  };
  error?: string;
}

export interface BookingState {
  contextId: string;
  criteria: Partial<CarCriteria>;
  currentStep: 'city' | 'dates' | 'car_type' | 'booking';
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  lastActivity: number;
  attempts: number;
}

export interface CarSearchParams {
  city: string;
  type_of_car?: CarType;
  limit?: number;
  min_price?: number;
  max_price?: number;
}