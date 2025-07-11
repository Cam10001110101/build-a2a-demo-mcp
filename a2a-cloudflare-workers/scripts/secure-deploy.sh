#!/bin/bash

# Secure Deployment Script for A2A Cloudflare Workers
# This script handles API key generation and secure deployment

set -e

echo "🔐 A2A Secure Deployment Script"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to generate secure API key
generate_api_key() {
    openssl rand -hex 32 2>/dev/null || (python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null) || echo "$(date +%s)$(uuidgen | tr -d '-')$(date +%s)"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from a2a-cloudflare-workers directory${NC}"
    exit 1
fi

# Check if API keys are already set
echo -e "${BLUE}Checking for existing API keys...${NC}"

# Generate API keys if not set
if [ -z "$A2A_API_KEY" ]; then
    echo -e "${YELLOW}No API key found. Generating secure API key...${NC}"
    export A2A_API_KEY=$(generate_api_key)
    echo -e "${GREEN}Generated API key: ${A2A_API_KEY:0:10}...${NC}"
    echo -e "${YELLOW}⚠️  Save this API key securely! You'll need it to access the services.${NC}"
    
    # Ask if user wants to save to .env file
    echo -n "Save API key to .env file for future use? (y/n): "
    read save_env
    if [ "$save_env" = "y" ] || [ "$save_env" = "Y" ]; then
        echo "A2A_API_KEY=$A2A_API_KEY" >> .env
        echo -e "${GREEN}API key saved to .env file${NC}"
    fi
else
    echo -e "${GREEN}Using existing API key from environment${NC}"
fi

# Function to deploy a service with API key
deploy_service() {
    local service_dir=$1
    local service_name=$2
    
    echo -e "\n${BLUE}Deploying $service_name...${NC}"
    cd "$service_dir"
    
    # Add API key to wrangler.toml if [vars] section exists
    if grep -q "\[vars\]" wrangler.toml; then
        # Create temporary wrangler.toml with API key
        cp wrangler.toml wrangler.toml.bak
        
        # Add API_KEY to vars section if not present
        if ! grep -q "API_KEY" wrangler.toml; then
            awk '/\[vars\]/{print; print "API_KEY = \"'$A2A_API_KEY'\""; next}1' wrangler.toml > wrangler.toml.tmp
            mv wrangler.toml.tmp wrangler.toml
        fi
    fi
    
    # Deploy the service
    npx wrangler deploy
    
    # Restore original wrangler.toml
    if [ -f "wrangler.toml.bak" ]; then
        mv wrangler.toml.bak wrangler.toml
    fi
    
    cd - > /dev/null
}

# Function to set secret for a service
set_service_secret() {
    local service_dir=$1
    local service_name=$2
    
    echo -e "\n${BLUE}Setting API key secret for $service_name...${NC}"
    cd "$service_dir"
    
    # Set the API key as a secret
    echo "$A2A_API_KEY" | npx wrangler secret put API_KEY
    
    cd - > /dev/null
}

# Install shared library dependencies
echo -e "\n${BLUE}Installing shared library dependencies...${NC}"
cd shared
npm install
cd ..

# Deploy services in correct order
echo -e "\n${YELLOW}Starting deployment...${NC}"

# 1. Deploy MCP Registry first
deploy_service "mcp-registry" "MCP Registry"
set_service_secret "mcp-registry" "MCP Registry"

# 2. Deploy Agent Gateway
deploy_service "agent-gateway" "Agent Gateway"
set_service_secret "agent-gateway" "Agent Gateway"

# 3. Deploy Agents
for agent_dir in agents/*; do
    if [ -d "$agent_dir" ] && [ -f "$agent_dir/wrangler.toml" ]; then
        agent_name=$(basename "$agent_dir")
        deploy_service "$agent_dir" "Agent: $agent_name"
        set_service_secret "$agent_dir" "Agent: $agent_name"
    fi
done

echo -e "\n${GREEN}✅ Deployment complete!${NC}"
echo -e "\n${YELLOW}Important Information:${NC}"
echo -e "1. API Key: ${A2A_API_KEY:0:10}... (full key saved in .env if you chose to save it)"
echo -e "2. Authentication is now required for all endpoints except:"
echo -e "   - /.well-known/agent.json (agent discovery)"
echo -e "   - /initialize (setup endpoint)"
echo -e "\n3. To make authenticated requests, include one of these headers:"
echo -e "   - X-API-Key: $A2A_API_KEY"
echo -e "   - Authorization: Bearer $A2A_API_KEY"
echo -e "\n4. Rate limiting is set to 100 requests/minute per client"

# Test deployment
echo -e "\n${BLUE}Testing deployment...${NC}"
echo -n "Run deployment tests? (y/n): "
read run_tests

if [ "$run_tests" = "y" ] || [ "$run_tests" = "Y" ]; then
    # Test MCP Registry (public endpoint)
    echo -e "\n${BLUE}Testing MCP Registry (public endpoint)...${NC}"
    curl -s https://agent.mcp-registry.demos.build/initialize | jq '.' || echo "Failed to test MCP Registry"
    
    # Test authenticated endpoint
    echo -e "\n${BLUE}Testing authenticated endpoint...${NC}"
    curl -s -X POST https://agent.mcp-registry.demos.build/rpc \
        -H "Content-Type: application/json" \
        -H "X-API-Key: $A2A_API_KEY" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq '.' || echo "Failed to test authenticated endpoint"
fi

echo -e "\n${GREEN}🎉 Secure deployment complete!${NC}"