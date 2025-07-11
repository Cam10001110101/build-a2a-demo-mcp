#!/bin/bash

# Test local Cloudflare Workers setup

set -e  # Exit on error

echo "🧪 Testing Local A2A Cloudflare Workers Setup"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js installed: ${NODE_VERSION}${NC}"
else
    echo -e "${RED}✗ Node.js not found${NC}"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm installed: ${NPM_VERSION}${NC}"
else
    echo -e "${RED}✗ npm not found${NC}"
    exit 1
fi

# Check Wrangler
if command -v wrangler &> /dev/null; then
    WRANGLER_VERSION=$(wrangler --version 2>&1 | head -n1)
    echo -e "${GREEN}✓ Wrangler installed: ${WRANGLER_VERSION}${NC}"
else
    echo -e "${RED}✗ Wrangler not found${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

# Check authentication
echo -e "\n${BLUE}Checking Cloudflare authentication...${NC}"
if wrangler whoami &> /dev/null; then
    echo -e "${GREEN}✓ Authenticated with Cloudflare${NC}"
else
    echo -e "${YELLOW}⚠ Not authenticated with Cloudflare${NC}"
    echo "Run: wrangler login"
fi

# Check directory structure
echo -e "\n${BLUE}Checking directory structure...${NC}"
REQUIRED_DIRS=(
    "../mcp-registry"
    "../agents/orchestrator"
    "../agents/planner"
    "../agents/air-tickets"
    "../agents/hotels"
    "../agents/car-rental"
    "../shared"
    "../tests"
)

for DIR in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$DIR" ]; then
        echo -e "${GREEN}✓ Directory exists: ${DIR}${NC}"
    else
        echo -e "${RED}✗ Directory missing: ${DIR}${NC}"
    fi
done

# Check package.json files
echo -e "\n${BLUE}Checking package.json files...${NC}"
WORKERS=(
    "../mcp-registry"
    "../agents/orchestrator"
    "../agents/planner"
    "../agents/air-tickets"
    "../agents/hotels"
    "../agents/car-rental"
)

for WORKER in "${WORKERS[@]}"; do
    if [ -f "$WORKER/package.json" ]; then
        echo -e "${GREEN}✓ package.json exists: ${WORKER}${NC}"
    else
        echo -e "${RED}✗ package.json missing: ${WORKER}${NC}"
    fi
done

# Check wrangler.toml files
echo -e "\n${BLUE}Checking wrangler.toml files...${NC}"
for WORKER in "${WORKERS[@]}"; do
    if [ -f "$WORKER/wrangler.toml" ]; then
        echo -e "${GREEN}✓ wrangler.toml exists: ${WORKER}${NC}"
        
        # Check for placeholder IDs
        if grep -q "YOUR_.*_ID" "$WORKER/wrangler.toml"; then
            echo -e "${YELLOW}  ⚠ Contains placeholder IDs - needs configuration${NC}"
        fi
    else
        echo -e "${RED}✗ wrangler.toml missing: ${WORKER}${NC}"
    fi
done

# Check TypeScript compilation
echo -e "\n${BLUE}Checking TypeScript compilation...${NC}"
for WORKER in "${WORKERS[@]}"; do
    WORKER_NAME=$(basename "$WORKER")
    echo -e "${BLUE}Checking ${WORKER_NAME}...${NC}"
    
    cd "$WORKER"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "  Installing dependencies..."
        npm install --silent
    fi
    
    # Try to build
    if npm run build &> /dev/null; then
        echo -e "${GREEN}  ✓ TypeScript compilation successful${NC}"
    else
        echo -e "${RED}  ✗ TypeScript compilation failed${NC}"
        npm run build 2>&1 | head -10
    fi
    
    cd - > /dev/null
done

# Check agent cards
echo -e "\n${BLUE}Checking agent cards...${NC}"
AGENT_CARDS=(
    "../agents/orchestrator/.well-known/agent.json"
    "../agents/planner/.well-known/agent.json"
    "../agents/air-tickets/.well-known/agent.json"
    "../agents/hotels/.well-known/agent.json"
    "../agents/car-rental/.well-known/agent.json"
)

for CARD in "${AGENT_CARDS[@]}"; do
    if [ -f "$CARD" ]; then
        echo -e "${GREEN}✓ Agent card exists: ${CARD}${NC}"
        
        # Validate JSON
        if jq empty "$CARD" 2>/dev/null; then
            echo -e "${GREEN}  ✓ Valid JSON${NC}"
        else
            echo -e "${RED}  ✗ Invalid JSON${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Agent card missing: ${CARD}${NC}"
    fi
done

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Local Setup Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. If any wrangler.toml files need configuration:"
echo "   - Run: ./create-kv-namespaces.sh"
echo "   - Run: ./create-d1-database.sh"
echo "   - Update wrangler.toml files with generated IDs"
echo ""
echo "2. To test locally:"
echo "   - Run: cd ../tests && ./start-local-workers.sh"
echo "   - In another terminal: npm run test:e2e:local"
echo "   - Stop workers: ./stop-local-workers.sh"
echo ""
echo "3. To deploy:"
echo "   - Run: cd .. && ./deploy-all.sh"
echo "   - Register agents: cd scripts && ./register-agents.sh"
echo "   - Test deployment: ./test-deployment.sh"

echo -e "\n${GREEN}Local setup validation complete!${NC}"