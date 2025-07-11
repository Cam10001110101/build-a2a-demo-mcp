-- Seed flights data
INSERT INTO flights (flight_number, departure_airport, arrival_airport, departure_time, arrival_time, price, class, available_seats) VALUES
('AA101', 'JFK', 'LAX', '2025-06-15 08:00:00', '2025-06-15 11:30:00', 450.00, 'Economy', 50),
('AA102', 'LAX', 'JFK', '2025-06-20 14:00:00', '2025-06-20 22:30:00', 480.00, 'Economy', 45),
('BA201', 'LHR', 'JFK', '2025-06-01 10:00:00', '2025-06-01 13:00:00', 1200.00, 'Business', 20),
('BA202', 'JFK', 'LHR', '2025-06-10 19:00:00', '2025-06-11 07:00:00', 1250.00, 'Business', 18),
('UA301', 'SFO', 'LHR', '2025-06-03 11:00:00', '2025-06-04 06:00:00', 850.00, 'Economy', 100),
('UA302', 'LHR', 'SFO', '2025-06-09 13:00:00', '2025-06-09 16:00:00', 900.00, 'Economy', 95),
('DL401', 'ATL', 'CDG', '2025-07-01 17:00:00', '2025-07-02 08:00:00', 780.00, 'Economy', 120),
('DL402', 'CDG', 'ATL', '2025-07-15 11:00:00', '2025-07-15 15:00:00', 820.00, 'Economy', 115),
('LH501', 'FRA', 'JFK', '2025-08-05 09:00:00', '2025-08-05 12:00:00', 950.00, 'Business', 30),
('LH502', 'JFK', 'FRA', '2025-08-12 18:00:00', '2025-08-13 08:00:00', 980.00, 'Business', 28);

-- Seed hotels data
INSERT INTO hotels (name, city, address, hotel_type, room_type, price_per_night, available_rooms, check_in_date, check_out_date) VALUES
('Grand Plaza Hotel', 'New York', '5th Avenue, Manhattan', 'Luxury', 'Suite', 450.00, 15, '2025-06-01', '2025-12-31'),
('Comfort Inn Times Square', 'New York', '42nd Street, Manhattan', 'Budget', 'Standard', 150.00, 50, '2025-06-01', '2025-12-31'),
('The Ritz London', 'London', '150 Piccadilly, St. James', 'Luxury', 'Deluxe', 850.00, 10, '2025-06-01', '2025-12-31'),
('Premier Inn London County Hall', 'London', 'Belvedere Road, Lambeth', 'Budget', 'Standard', 120.00, 80, '2025-06-01', '2025-12-31'),
('Hilton San Francisco', 'San Francisco', '333 O''Farrell Street', 'Business', 'Executive', 280.00, 40, '2025-06-01', '2025-12-31'),
('Hotel Zephyr', 'San Francisco', 'Beach Street, Fisherman''s Wharf', 'Boutique', 'Ocean View', 320.00, 25, '2025-06-01', '2025-12-31'),
('Le Meridien Paris', 'Paris', '21 Rue de Castiglione', 'Luxury', 'Suite', 680.00, 20, '2025-07-01', '2025-12-31'),
('Hotel des Grands Boulevards', 'Paris', '17 Boulevard Poissonnière', 'Boutique', 'Deluxe', 380.00, 30, '2025-07-01', '2025-12-31'),
('Marriott Frankfurt', 'Frankfurt', 'Hamburger Allee 2', 'Business', 'Executive', 220.00, 60, '2025-08-01', '2025-12-31'),
('Hilton Atlanta', 'Atlanta', '255 Courtland Street NE', 'Business', 'Standard', 180.00, 100, '2025-07-01', '2025-12-31');

-- Seed car rentals data
INSERT INTO car_rentals (company, car_type, car_class, location, price_per_day, available_cars, pickup_date, return_date) VALUES
('Hertz', 'Toyota Camry', 'Midsize', 'JFK Airport', 65.00, 25, '2025-06-01', '2025-12-31'),
('Avis', 'Honda Civic', 'Compact', 'LAX Airport', 55.00, 30, '2025-06-01', '2025-12-31'),
('Enterprise', 'Chevrolet Suburban', 'SUV', 'SFO Airport', 120.00, 15, '2025-06-01', '2025-12-31'),
('Budget', 'Nissan Versa', 'Economy', 'LHR Airport', 45.00, 40, '2025-06-01', '2025-12-31'),
('National', 'BMW 3 Series', 'Luxury', 'Manhattan NYC', 150.00, 10, '2025-06-01', '2025-12-31'),
('Europcar', 'Volkswagen Golf', 'Compact', 'CDG Airport', 50.00, 35, '2025-07-01', '2025-12-31'),
('Sixt', 'Mercedes-Benz E-Class', 'Luxury', 'FRA Airport', 180.00, 8, '2025-08-01', '2025-12-31'),
('Thrifty', 'Ford Focus', 'Compact', 'ATL Airport', 48.00, 28, '2025-07-01', '2025-12-31'),
('Alamo', 'Jeep Grand Cherokee', 'SUV', 'Downtown London', 110.00, 12, '2025-06-01', '2025-12-31'),
('Dollar', 'Toyota Corolla', 'Midsize', 'Paris City Center', 60.00, 20, '2025-07-01', '2025-12-31');