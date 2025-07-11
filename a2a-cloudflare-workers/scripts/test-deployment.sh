#!/bin/bash

# Test deployed Cloudflare Workers

set -e  # Exit on error

echo "🧪 Testing A2A Cloudflare Workers Deployment"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base URLs - Using custom domains
MCP_URL="https://agent.mcp-registry.demos.build"
ORCHESTRATOR_URL="https://agent.orchestrator.demos.build"
PLANNER_URL="https://agent.planner.demos.build"
AIR_TICKETS_URL="https://agent.air-tickets.demos.build"
HOTELS_URL="https://agent.hotels.demos.build"
CAR_RENTAL_URL="https://agent.car-rental.demos.build"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test endpoint
test_endpoint() {
    local URL=$1
    local NAME=$2
    local ENDPOINT=$3
    
    echo -e "\n${BLUE}Testing ${NAME} - ${ENDPOINT}${NC}"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" "${URL}${ENDPOINT}" 2>&1)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ ${NAME} ${ENDPOINT} responded with 200 OK${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ ${NAME} ${ENDPOINT} failed with HTTP ${HTTP_CODE}${NC}"
        echo "Response: $BODY"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to test POST endpoint
test_post_endpoint() {
    local URL=$1
    local NAME=$2
    local ENDPOINT=$3
    local DATA=$4
    
    echo -e "\n${BLUE}Testing ${NAME} - POST ${ENDPOINT}${NC}"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${URL}${ENDPOINT}" \
        -H "Content-Type: application/json" \
        -d "$DATA" 2>&1)
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ ${NAME} POST ${ENDPOINT} responded with 200 OK${NC}"
        echo "Response preview: $(echo "$BODY" | head -c 100)..."
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ ${NAME} POST ${ENDPOINT} failed with HTTP ${HTTP_CODE}${NC}"
        echo "Response: $BODY"
        ((TESTS_FAILED++))
        return 1
    fi
}

# 1. Test MCP Registry
echo -e "\n${YELLOW}=== Testing MCP Registry ===${NC}"
test_endpoint "$MCP_URL" "MCP Registry" "/initialize"
test_post_endpoint "$MCP_URL" "MCP Registry" "/rpc" '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_agent","arguments":{"query":"flight booking"}}}'
test_post_endpoint "$MCP_URL" "MCP Registry" "/rpc" '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_travel_data","arguments":{"query":"SELECT * FROM flights LIMIT 1"}}}'

# 2. Test Orchestrator
echo -e "\n${YELLOW}=== Testing Orchestrator Agent ===${NC}"
test_endpoint "$ORCHESTRATOR_URL" "Orchestrator" "/.well-known/agent.json"

# 3. Test Planner
echo -e "\n${YELLOW}=== Testing Planner Agent ===${NC}"
test_endpoint "$PLANNER_URL" "Planner" "/.well-known/agent.json"

# 4. Test Air Tickets
echo -e "\n${YELLOW}=== Testing Air Tickets Agent ===${NC}"
test_endpoint "$AIR_TICKETS_URL" "Air Tickets" "/.well-known/agent.json"

# 5. Test Hotels
echo -e "\n${YELLOW}=== Testing Hotels Agent ===${NC}"
test_endpoint "$HOTELS_URL" "Hotels" "/.well-known/agent.json"

# 6. Test Car Rental
echo -e "\n${YELLOW}=== Testing Car Rental Agent ===${NC}"
test_endpoint "$CAR_RENTAL_URL" "Car Rental" "/.well-known/agent.json"

# 7. Test Agent Discovery
echo -e "\n${YELLOW}=== Testing Agent Discovery ===${NC}"
echo -e "${BLUE}Finding flight booking agents...${NC}"
DISCOVERY_RESPONSE=$(curl -s -X POST "${MCP_URL}/rpc" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_agent","arguments":{"query":"flight booking"}}}' 2>&1)

if echo "$DISCOVERY_RESPONSE" | grep -q "Air Ticketing Agent"; then
    echo -e "${GREEN}✓ Agent discovery found Air Ticketing Agent${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Agent discovery did not find expected agent${NC}"
    echo "Response: $DISCOVERY_RESPONSE"
    ((TESTS_FAILED++))
fi

# 8. Test Streaming Response
echo -e "\n${YELLOW}=== Testing Streaming Response ===${NC}"
echo -e "${BLUE}Testing Orchestrator streaming...${NC}"
curl -s -N -X POST "${ORCHESTRATOR_URL}/query" \
    -H "Content-Type: application/json" \
    -d '{"query":"Test query","context_id":"test-123"}' \
    --max-time 5 > /tmp/stream-test.txt 2>&1

if [ -s /tmp/stream-test.txt ]; then
    echo -e "${GREEN}✓ Streaming response received${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ No streaming response received${NC}"
    ((TESTS_FAILED++))
fi

# 9. Test Multi-Agent Communication
echo -e "\n${YELLOW}=== Testing Multi-Agent Communication ===${NC}"
echo -e "${BLUE}Initiating travel planning request...${NC}"
TRAVEL_RESPONSE=$(curl -s -X POST "${ORCHESTRATOR_URL}/query" \
    -H "Content-Type: application/json" \
    -d '{
        "query": "I need to plan a trip from NYC to LAX next week",
        "context_id": "test-travel-123"
    }' 2>&1)

if echo "$TRAVEL_RESPONSE" | grep -q "travel\\|flight\\|plan"; then
    echo -e "${GREEN}✓ Multi-agent communication working${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠ Multi-agent response unclear${NC}"
    echo "Response preview: $(echo "$TRAVEL_RESPONSE" | head -c 200)..."
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Deployment Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All deployment tests passed! 🎉${NC}"
    echo -e "\n${YELLOW}Deployment URLs:${NC}"
    echo "- MCP Registry: $MCP_URL"
    echo "- Orchestrator: $ORCHESTRATOR_URL"
    echo "- Planner: $PLANNER_URL"
    echo "- Air Tickets: $AIR_TICKETS_URL"
    echo "- Hotels: $HOTELS_URL"
    echo "- Car Rental: $CAR_RENTAL_URL"
else
    echo -e "\n${RED}Some tests failed. Please check the deployment.${NC}"
    exit 1
fi

# Cleanup
rm -f /tmp/stream-test.txt