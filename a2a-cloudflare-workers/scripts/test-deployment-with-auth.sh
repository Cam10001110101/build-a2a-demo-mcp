#!/bin/bash

# Test deployed Cloudflare Workers with authentication

set -e  # Exit on error

echo "🧪 Testing A2A Cloudflare Workers Deployment (with Authentication)"
echo "================================================================"

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

# Test API key (you should replace this with a real API key)
API_KEY="${MCP_API_KEY:-test-api-key-123}"

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
        echo "Response: $BODY" | head -c 200
        ((TESTS_FAILED++))
        return 1
    fi
}

# Function to test POST endpoint with authentication
test_post_endpoint_auth() {
    local URL=$1
    local NAME=$2
    local ENDPOINT=$3
    local DATA=$4
    
    echo -e "\n${BLUE}Testing ${NAME} - POST ${ENDPOINT} (with auth)${NC}"
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${URL}${ENDPOINT}" \
        -H "Content-Type: application/json" \
        -H "X-API-Key: ${API_KEY}" \
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
        echo "Response: $BODY" | head -c 200
        ((TESTS_FAILED++))
        return 1
    fi
}

# 1. Test MCP Registry
echo -e "\n${YELLOW}=== Testing MCP Registry ===${NC}"
echo -e "${BLUE}Note: Using API Key: ${API_KEY}${NC}"

# Initialize endpoint is public
test_endpoint "$MCP_URL" "MCP Registry" "/initialize"

# RPC endpoints require authentication
test_post_endpoint_auth "$MCP_URL" "MCP Registry" "/rpc" '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
test_post_endpoint_auth "$MCP_URL" "MCP Registry" "/rpc" '{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}}'

# Test agent discovery
echo -e "\n${YELLOW}=== Testing Agent Discovery ===${NC}"
echo -e "${BLUE}Finding flight booking agents...${NC}"
DISCOVERY_RESPONSE=$(curl -s -X POST "${MCP_URL}/rpc" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"find_agent","arguments":{"query":"flight booking"}}}' 2>&1)

if echo "$DISCOVERY_RESPONSE" | grep -q "Air Ticketing Agent"; then
    echo -e "${GREEN}✓ Agent discovery found Air Ticketing Agent${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ Agent discovery did not find expected agent${NC}"
    echo "Response: $DISCOVERY_RESPONSE" | head -c 200
    ((TESTS_FAILED++))
fi

# 2. Test Other Agents (these don't require auth by default)
echo -e "\n${YELLOW}=== Testing Other Agents ===${NC}"
test_endpoint "$ORCHESTRATOR_URL" "Orchestrator" "/.well-known/agent.json"
test_endpoint "$PLANNER_URL" "Planner" "/.well-known/agent.json"
test_endpoint "$AIR_TICKETS_URL" "Air Tickets" "/.well-known/agent.json"
test_endpoint "$HOTELS_URL" "Hotels" "/.well-known/agent.json"
test_endpoint "$CAR_RENTAL_URL" "Car Rental" "/.well-known/agent.json"

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
    
    echo -e "\n${YELLOW}Important: Authentication${NC}"
    echo "The MCP Registry requires API key authentication."
    echo "To set up API keys:"
    echo "1. Add them to your Cloudflare Worker environment variables"
    echo "2. Or modify AUTH_SCHEME to 'none' in wrangler.toml for testing"
else
    echo -e "\n${RED}Some tests failed. Please check the deployment.${NC}"
    
    if echo "$BODY" | grep -q "Missing API key"; then
        echo -e "\n${YELLOW}Note: MCP Registry requires authentication.${NC}"
        echo "Set MCP_API_KEY environment variable or add API keys to Cloudflare."
    fi
    exit 1
fi