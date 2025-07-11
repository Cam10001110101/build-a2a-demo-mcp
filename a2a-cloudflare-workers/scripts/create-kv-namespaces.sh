#!/bin/bash

# Create KV namespaces for A2A Cloudflare Workers

set -e  # Exit on error

echo "🚀 Creating KV Namespaces for A2A Multi-Agent System"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Store namespace IDs in a file instead of associative array
NAMESPACE_FILE="kv-namespace-ids.txt"
> "$NAMESPACE_FILE"  # Clear the file

# Function to create KV namespace
create_namespace() {
    local NAME=$1
    local BINDING=$2
    
    echo -e "\n${BLUE}Creating KV namespace: ${NAME}${NC}"
    
    # Create production namespace
    RESULT=$(wrangler kv:namespace create "$BINDING" 2>&1)
    
    if [[ $RESULT =~ id[[:space:]]*=[[:space:]]*\"([^\"]+)\" ]]; then
        PROD_ID="${BASH_REMATCH[1]}"
        echo -e "${GREEN}✓ Production namespace created: ${PROD_ID}${NC}"
    else
        echo -e "${RED}✗ Failed to create production namespace${NC}"
        echo "$RESULT"
        return 1
    fi
    
    # Create preview namespace
    PREVIEW_RESULT=$(wrangler kv:namespace create "$BINDING" --preview 2>&1)
    
    if [[ $PREVIEW_RESULT =~ id[[:space:]]*=[[:space:]]*\"([^\"]+)\" ]]; then
        PREVIEW_ID="${BASH_REMATCH[1]}"
        echo -e "${GREEN}✓ Preview namespace created: ${PREVIEW_ID}${NC}"
    else
        echo -e "${RED}✗ Failed to create preview namespace${NC}"
        echo "$PREVIEW_RESULT"
        return 1
    fi
    
    # Store the IDs in file
    echo "${BINDING}_PROD=$PROD_ID" >> "$NAMESPACE_FILE"
    echo "${BINDING}_PREVIEW=$PREVIEW_ID" >> "$NAMESPACE_FILE"
    
    echo -e "${GREEN}Success! Add to wrangler.toml:${NC}"
    echo "[[kv_namespaces]]"
    echo "binding = \"$BINDING\""
    echo "id = \"$PROD_ID\""
    echo "preview_id = \"$PREVIEW_ID\""
    echo ""
}

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

# Create namespaces for each worker
echo -e "\n${YELLOW}Creating KV namespaces for all workers...${NC}"

# MCP Registry namespaces
create_namespace "mcp-registry-agent-cards" "AGENT_CARDS"
create_namespace "mcp-registry-embeddings" "EMBEDDINGS"

# Orchestrator namespaces
create_namespace "orchestrator-sessions" "SESSIONS"
create_namespace "orchestrator-workflows" "WORKFLOWS"

# Agent namespaces
create_namespace "planner-memory" "MEMORY"
create_namespace "air-tickets-bookings" "BOOKINGS"
create_namespace "hotels-bookings" "BOOKINGS"
create_namespace "car-rental-bookings" "BOOKINGS"
create_namespace "summary-summaries" "SUMMARIES"

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}KV Namespace Creation Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All KV namespaces created successfully!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Update each worker's wrangler.toml with the namespace IDs shown above"
echo "2. Create the D1 database: ./create-d1-database.sh"
echo "3. Deploy workers: ./deploy-all.sh"

echo -e "\n${GREEN}Namespace IDs saved to: $NAMESPACE_FILE${NC}"
echo -e "\n${YELLOW}Summary of created namespaces:${NC}"
cat "$NAMESPACE_FILE"