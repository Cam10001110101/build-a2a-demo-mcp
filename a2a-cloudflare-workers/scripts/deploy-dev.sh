#!/bin/bash

# Development Deployment Script (No Authentication)
# Use this for testing only - NOT for production!

set -e

echo "🚀 A2A Development Deployment (No Auth)"
echo "======================================="
echo "⚠️  WARNING: This deployment has authentication disabled!"
echo "⚠️  Use only for development/testing purposes!"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from a2a-cloudflare-workers directory${NC}"
    exit 1
fi

# Function to deploy service with auth disabled
deploy_service_no_auth() {
    local service_dir=$1
    local service_name=$2
    
    echo -e "\n${BLUE}Deploying $service_name (no auth)...${NC}"
    cd "$service_dir"
    
    # Temporarily modify wrangler.toml to disable auth
    if grep -q "\[vars\]" wrangler.toml; then
        cp wrangler.toml wrangler.toml.bak
        
        # Set AUTH_SCHEME to none
        if grep -q "AUTH_SCHEME" wrangler.toml; then
            sed -i.tmp 's/AUTH_SCHEME = .*/AUTH_SCHEME = "none"/' wrangler.toml
        else
            awk '/\[vars\]/{print; print "AUTH_SCHEME = \"none\""; next}1' wrangler.toml > wrangler.toml.tmp
            mv wrangler.toml.tmp wrangler.toml
        fi
        
        # Remove REQUIRE_HTTPS for local testing
        sed -i.tmp '/REQUIRE_HTTPS/d' wrangler.toml
        rm -f wrangler.toml.tmp
    fi
    
    # Deploy
    npx wrangler deploy
    
    # Restore original
    if [ -f "wrangler.toml.bak" ]; then
        mv wrangler.toml.bak wrangler.toml
    fi
    
    cd - > /dev/null
}

# Install shared library dependencies
echo -e "\n${BLUE}Installing shared library dependencies...${NC}"
cd shared
npm install
cd ..

# Deploy all services
echo -e "\n${YELLOW}Starting deployment (no authentication)...${NC}"

# Deploy MCP Registry
deploy_service_no_auth "mcp-registry" "MCP Registry"

# Deploy Agent Gateway
deploy_service_no_auth "agent-gateway" "Agent Gateway"

# Deploy all agents
for agent_dir in agents/*; do
    if [ -d "$agent_dir" ] && [ -f "$agent_dir/wrangler.toml" ]; then
        agent_name=$(basename "$agent_dir")
        deploy_service_no_auth "$agent_dir" "Agent: $agent_name"
    fi
done

echo -e "\n${GREEN}✅ Development deployment complete!${NC}"
echo -e "\n${YELLOW}Testing endpoints...${NC}"

# Test without authentication
echo -e "\n${BLUE}Testing MCP Registry...${NC}"
curl -s -X POST https://agent.mcp-registry.demos.build/rpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.result.tools[].name' || echo "Test failed"

echo -e "\n${BLUE}Testing Orchestrator Agent...${NC}"
curl -s https://agent.orchestrator.demos.build/.well-known/agent.json | jq '.name' || echo "Test failed"

echo -e "\n${YELLOW}⚠️  Remember: Authentication is DISABLED in this deployment!${NC}"
echo -e "${YELLOW}⚠️  Enable authentication before deploying to production!${NC}"