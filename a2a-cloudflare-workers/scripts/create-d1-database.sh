#!/bin/bash

# Create D1 database for A2A Cloudflare Workers

set -e  # Exit on error

echo "🚀 Creating D1 Database for A2A Multi-Agent System"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: Wrangler CLI not found!${NC}"
    echo "Please install Wrangler: npm install -g wrangler"
    exit 1
fi

# Check if logged in to Cloudflare
echo -e "${BLUE}Checking Cloudflare authentication...${NC}"
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Cloudflare. Running 'wrangler login'...${NC}"
    wrangler login
fi

# Create D1 database
echo -e "\n${BLUE}Creating D1 database: travel-db${NC}"
D1_RESULT=$(wrangler d1 create travel-db 2>&1)

if [[ $D1_RESULT =~ database_id[[:space:]]*=[[:space:]]*\"([^\"]+)\" ]]; then
    DATABASE_ID="${BASH_REMATCH[1]}"
    echo -e "${GREEN}✓ D1 database created successfully!${NC}"
    echo -e "${GREEN}Database ID: ${DATABASE_ID}${NC}"
else
    echo -e "${RED}✗ Failed to create D1 database${NC}"
    echo "$D1_RESULT"
    exit 1
fi

# Create SQL schema file
echo -e "\n${BLUE}Creating database schema file...${NC}"
cat > ../mcp-registry/schema.sql << 'EOF'
-- D1 Database Schema for Travel Data

-- Drop existing tables if they exist
DROP TABLE IF EXISTS flights;
DROP TABLE IF EXISTS hotels;
DROP TABLE IF EXISTS rental_cars;

-- Flights table
CREATE TABLE flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flight_number TEXT NOT NULL,
    airline TEXT NOT NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    price REAL NOT NULL,
    class TEXT NOT NULL,
    available_seats INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Hotels table
CREATE TABLE hotels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT,
    property_type TEXT NOT NULL, -- HOTEL, AIRBNB, PRIVATE_PROPERTY
    room_type TEXT NOT NULL,
    price_per_night REAL NOT NULL,
    available_rooms INTEGER NOT NULL,
    amenities TEXT, -- JSON array
    rating REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Rental cars table
CREATE TABLE rental_cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    city TEXT NOT NULL,
    car_type TEXT NOT NULL, -- SEDAN, SUV, TRUCK
    model TEXT,
    price_per_day REAL NOT NULL,
    available_units INTEGER NOT NULL,
    features TEXT, -- JSON array
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_flights_origin_dest ON flights(origin, destination);
CREATE INDEX idx_flights_departure ON flights(departure_time);
CREATE INDEX idx_hotels_city ON hotels(city);
CREATE INDEX idx_hotels_type ON hotels(property_type);
CREATE INDEX idx_cars_city ON rental_cars(city);
CREATE INDEX idx_cars_type ON rental_cars(car_type);

-- Insert sample data
INSERT INTO flights (flight_number, airline, origin, destination, departure_time, arrival_time, price, class, available_seats) VALUES
('AA100', 'American Airlines', 'NYC', 'LAX', '2024-03-15 08:00:00', '2024-03-15 11:00:00', 350.00, 'ECONOMY', 50),
('AA101', 'American Airlines', 'NYC', 'LAX', '2024-03-15 14:00:00', '2024-03-15 17:00:00', 450.00, 'BUSINESS', 20),
('UA200', 'United Airlines', 'SFO', 'ORD', '2024-03-16 09:00:00', '2024-03-16 15:00:00', 280.00, 'ECONOMY', 75),
('DL300', 'Delta Airlines', 'LAX', 'NYC', '2024-03-17 10:00:00', '2024-03-17 18:00:00', 380.00, 'ECONOMY', 60);

INSERT INTO hotels (name, city, address, property_type, room_type, price_per_night, available_rooms, amenities, rating) VALUES
('Grand Plaza Hotel', 'NYC', '123 5th Avenue', 'HOTEL', 'STANDARD', 200.00, 25, '["wifi","pool","gym","spa"]', 4.5),
('Luxury Suites', 'NYC', '456 Park Ave', 'HOTEL', 'SUITE', 500.00, 10, '["wifi","pool","gym","spa","restaurant","bar"]', 4.8),
('Cozy Apartment', 'LAX', '789 Beach Blvd', 'AIRBNB', 'ENTIRE_PLACE', 150.00, 1, '["wifi","kitchen","parking"]', 4.2),
('Beach House', 'LAX', '321 Ocean Dr', 'PRIVATE_PROPERTY', 'ENTIRE_PLACE', 350.00, 1, '["wifi","kitchen","parking","beach_access"]', 4.7);

INSERT INTO rental_cars (company, city, car_type, model, price_per_day, available_units, features) VALUES
('Hertz', 'NYC', 'SEDAN', 'Toyota Camry', 60.00, 15, '["automatic","gps","bluetooth"]'),
('Enterprise', 'NYC', 'SUV', 'Ford Explorer', 90.00, 10, '["automatic","gps","bluetooth","4wd"]'),
('Budget', 'LAX', 'SEDAN', 'Honda Accord', 55.00, 20, '["automatic","gps"]'),
('Avis', 'LAX', 'TRUCK', 'Ford F-150', 110.00, 5, '["automatic","4wd","towing"]');
EOF

echo -e "${GREEN}✓ Schema file created${NC}"

# Execute schema
echo -e "\n${BLUE}Initializing database schema...${NC}"
if wrangler d1 execute travel-db --file=../mcp-registry/schema.sql; then
    echo -e "${GREEN}✓ Database schema initialized successfully!${NC}"
else
    echo -e "${RED}✗ Failed to initialize database schema${NC}"
    exit 1
fi

# Test database
echo -e "\n${BLUE}Testing database...${NC}"
TEST_RESULT=$(wrangler d1 execute travel-db --command="SELECT COUNT(*) as count FROM flights" 2>&1)
if [[ $TEST_RESULT =~ \"count\"[[:space:]]*:[[:space:]]*4 ]]; then
    echo -e "${GREEN}✓ Database test successful! Found 4 flights.${NC}"
else
    echo -e "${YELLOW}⚠ Database test returned unexpected results${NC}"
fi

# Save database ID to file
cat > d1-database-id.txt << EOF
# D1 Database ID - Created $(date)
DATABASE_ID="${DATABASE_ID}"

# Add to mcp-registry/wrangler.toml:
[[d1_databases]]
binding = "DB"
database_name = "travel-db"
database_id = "${DATABASE_ID}"
EOF

echo -e "\n${GREEN}Database ID saved to: d1-database-id.txt${NC}"

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}D1 Database Creation Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ D1 database created successfully${NC}"
echo -e "${GREEN}✓ Schema initialized with sample data${NC}"
echo -e "${GREEN}✓ Database ID: ${DATABASE_ID}${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update mcp-registry/wrangler.toml with the database configuration shown above"
echo "2. Deploy workers: ./deploy-all.sh"
echo "3. Register agents: ./register-agents.sh"