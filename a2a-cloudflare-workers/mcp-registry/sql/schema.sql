-- Create flights table
CREATE TABLE IF NOT EXISTS flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_number TEXT NOT NULL,
    departure_airport TEXT NOT NULL,
    arrival_airport TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    price REAL NOT NULL,
    class TEXT NOT NULL,
    available_seats INTEGER NOT NULL
);

-- Create hotels table
CREATE TABLE IF NOT EXISTS hotels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    hotel_type TEXT NOT NULL,
    room_type TEXT NOT NULL,
    price_per_night REAL NOT NULL,
    available_rooms INTEGER NOT NULL,
    check_in_date TEXT,
    check_out_date TEXT
);

-- Create car_rentals table
CREATE TABLE IF NOT EXISTS car_rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    car_type TEXT NOT NULL,
    car_class TEXT NOT NULL,
    location TEXT NOT NULL,
    price_per_day REAL NOT NULL,
    available_cars INTEGER NOT NULL,
    pickup_date TEXT,
    return_date TEXT
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_flights_airports ON flights(departure_airport, arrival_airport);
CREATE INDEX IF NOT EXISTS idx_flights_times ON flights(departure_time, arrival_time);
CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels(city);
CREATE INDEX IF NOT EXISTS idx_hotels_dates ON hotels(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_car_rentals_location ON car_rentals(location);
CREATE INDEX IF NOT EXISTS idx_car_rentals_dates ON car_rentals(pickup_date, return_date);