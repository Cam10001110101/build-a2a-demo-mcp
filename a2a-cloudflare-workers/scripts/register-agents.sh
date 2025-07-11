#!/bin/bash

# Register all agents with MCP Registry

set -e  # Exit on error

echo "🚀 Registering Agents with MCP Registry"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MCP_URL="${MCP_URL:-https://agent.mcp-registry.demos.build}"
LOCAL_MODE="${LOCAL_MODE:-false}"

if [ "$LOCAL_MODE" = "true" ]; then
    MCP_URL="http://localhost:8787"
    echo -e "${YELLOW}Running in LOCAL mode: ${MCP_URL}${NC}"
fi

# Function to register an agent
register_agent() {
    local AGENT_CARD_PATH=$1
    local AGENT_NAME=$2
    
    echo -e "\n${BLUE}Registering ${AGENT_NAME}...${NC}"
    
    if [ ! -f "$AGENT_CARD_PATH" ]; then
        echo -e "${RED}✗ Agent card not found: ${AGENT_CARD_PATH}${NC}"
        return 1
    fi
    
    # Read agent card
    AGENT_CARD=$(cat "$AGENT_CARD_PATH")
    
    # Register with MCP
    RESPONSE=$(curl -s -X POST "${MCP_URL}/tools/register_agent" \
        -H "Content-Type: application/json" \
        -d "$AGENT_CARD" 2>&1)
    
    # Check response
    if echo "$RESPONSE" | grep -q "error"; then
        echo -e "${RED}✗ Failed to register ${AGENT_NAME}${NC}"
        echo "Response: $RESPONSE"
        return 1
    else
        echo -e "${GREEN}✓ ${AGENT_NAME} registered successfully${NC}"
        return 0
    fi
}

# Check MCP Registry health
echo -e "${BLUE}Checking MCP Registry health...${NC}"
if curl -s -f "${MCP_URL}/initialize" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ MCP Registry is healthy${NC}"
else
    echo -e "${RED}✗ MCP Registry is not responding at ${MCP_URL}${NC}"
    echo "Please ensure MCP Registry is deployed and running."
    exit 1
fi

# Create agent cards if they don't exist
echo -e "\n${BLUE}Creating agent cards...${NC}"

# Orchestrator Agent Card
mkdir -p ../agents/orchestrator/.well-known
cat > ../agents/orchestrator/.well-known/agent.json << 'EOF'
{
  "name": "Travel Orchestrator",
  "description": "I coordinate travel planning and booking across multiple specialized agents",
  "tags": ["orchestration", "travel", "coordination", "workflow"],
  "capabilities": {
    "skills": ["multi-agent coordination", "travel planning", "booking management"],
    "protocols": ["a2a", "http"],
    "streaming": true
  },
  "endpoint": "https://agent.orchestrator.demos.build",
  "embedding": null
}
EOF

# Planner Agent Card
mkdir -p ../agents/planner/.well-known
cat > ../agents/planner/.well-known/agent.json << 'EOF'
{
  "name": "Travel Planner",
  "description": "I help plan travel itineraries and create comprehensive travel plans",
  "tags": ["planning", "travel", "itinerary", "recommendations"],
  "capabilities": {
    "skills": ["itinerary planning", "travel recommendations", "multi-destination planning"],
    "protocols": ["a2a", "http"],
    "streaming": true
  },
  "endpoint": "https://agent.planner.demos.build",
  "embedding": null
}
EOF

# Air Tickets Agent Card
mkdir -p ../agents/air-tickets/.well-known
cat > ../agents/air-tickets/.well-known/agent.json << 'EOF'
{
  "name": "Air Tickets Agent",
  "description": "I help search and book flights for your travel needs",
  "tags": ["flights", "airline", "booking", "travel"],
  "capabilities": {
    "skills": ["flight search", "airline booking", "price comparison", "seat selection"],
    "protocols": ["a2a", "http"],
    "streaming": true
  },
  "endpoint": "https://agent.air-tickets.demos.build",
  "embedding": null
}
EOF

# Hotels Agent Card
mkdir -p ../agents/hotels/.well-known
cat > ../agents/hotels/.well-known/agent.json << 'EOF'
{
  "name": "Hotels Agent",
  "description": "I help find and book accommodations including hotels, Airbnb, and private properties",
  "tags": ["hotels", "accommodation", "booking", "travel"],
  "capabilities": {
    "skills": ["hotel search", "accommodation booking", "property comparison", "room selection"],
    "protocols": ["a2a", "http"],
    "streaming": true
  },
  "endpoint": "https://agent.hotels.demos.build",
  "embedding": null
}
EOF

# Car Rental Agent Card
mkdir -p ../agents/car-rental/.well-known
cat > ../agents/car-rental/.well-known/agent.json << 'EOF'
{
  "name": "Car Rental Agent",
  "description": "I help find and book rental cars for your travel needs",
  "tags": ["car", "rental", "transportation", "booking"],
  "capabilities": {
    "skills": ["car rental search", "vehicle booking", "price comparison", "car type selection"],
    "protocols": ["a2a", "http"],
    "streaming": true
  },
  "endpoint": "https://agent.car-rental.demos.build",
  "embedding": null
}
EOF

echo -e "${GREEN}✓ Agent cards created${NC}"

# Register all agents
REGISTERED=0
FAILED=0

# Register each agent
AGENTS=(
    "../agents/orchestrator/.well-known/agent.json|Orchestrator"
    "../agents/planner/.well-known/agent.json|Planner"
    "../agents/air-tickets/.well-known/agent.json|Air Tickets"
    "../agents/hotels/.well-known/agent.json|Hotels"
    "../agents/car-rental/.well-known/agent.json|Car Rental"
)

for AGENT_INFO in "${AGENTS[@]}"; do
    IFS='|' read -r CARD_PATH AGENT_NAME <<< "$AGENT_INFO"
    if register_agent "$CARD_PATH" "$AGENT_NAME"; then
        ((REGISTERED++))
    else
        ((FAILED++))
    fi
done

# Test agent discovery
echo -e "\n${BLUE}Testing agent discovery...${NC}"
echo -e "${BLUE}Searching for flight booking agents...${NC}"

SEARCH_RESPONSE=$(curl -s -X POST "${MCP_URL}/tools/find_agent" \
    -H "Content-Type: application/json" \
    -d '{"skill_description": "flight booking"}' 2>&1)

if echo "$SEARCH_RESPONSE" | grep -q "Air Tickets Agent"; then
    echo -e "${GREEN}✓ Agent discovery working correctly${NC}"
else
    echo -e "${YELLOW}⚠ Agent discovery returned unexpected results${NC}"
    echo "Response: $SEARCH_RESPONSE"
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Agent Registration Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Registered: ${GREEN}${REGISTERED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All agents registered successfully!${NC}"
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo "1. Test agent endpoints: curl https://agent.[agent-name].demos.build/.well-known/agent.json"
    echo "2. Run end-to-end tests: cd ../tests && npm run test:e2e:production"
    echo "3. Monitor worker logs: wrangler tail [worker-name]"
else
    echo -e "\n${RED}Some agents failed to register. Please check the errors above.${NC}"
    exit 1
fi