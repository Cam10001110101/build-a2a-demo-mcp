/**
 * Agent Registry Functions - Dynamic agent registration and management
 */

import { AgentCard, Env } from './types';
import { getEmbedding } from './embeddings';

/**
 * Register or update an agent in the registry
 */
export async function registerAgent(
  agentCard: AgentCard,
  ttl: number = 86400, // 24 hours default
  env: Env
): Promise<{ success: boolean; message: string; agentId: string }> {
  try {
    // Validate agent card
    if (!agentCard.name || !agentCard.description || !agentCard.url) {
      throw new Error('Agent card must have name, description, and url');
    }

    // Generate agent ID from name
    const agentId = agentCard.name.toLowerCase().replace(/\s+/g, '_');
    const key = `agent_card:${agentId}`;

    // Add registration metadata
    const registeredCard = {
      ...agentCard,
      registered_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      ttl: ttl
    };

    // Store the agent card
    await env.AGENT_CARDS.put(key, JSON.stringify(registeredCard), {
      expirationTtl: ttl
    });

    // Generate and cache embedding for the agent
    const embedding = await getEmbedding(
      `${agentCard.name} ${agentCard.description} ${agentCard.skills?.map(s => s.description).join(' ')}`,
      env.AI,
      env.EMBEDDINGS_CACHE
    );

    // Store embedding
    await env.EMBEDDINGS_CACHE.put(
      `embedding:${agentId}`,
      JSON.stringify(embedding),
      { expirationTtl: ttl }
    );

    return {
      success: true,
      message: `Agent '${agentCard.name}' registered successfully`,
      agentId: agentId
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to register agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      agentId: ''
    };
  }
}

/**
 * List all agents with optional filtering
 */
export async function listAgents(
  filters?: {
    capabilities?: string[];
    tags?: string[];
    available?: boolean;
  },
  env?: Env
): Promise<AgentCard[]> {
  if (!env) return [];

  try {
    const agents: AgentCard[] = [];
    const list = await env.AGENT_CARDS.list({ prefix: 'agent_card:' });

    for (const key of list.keys) {
      const agentData = await env.AGENT_CARDS.get(key.name, 'json') as AgentCard;
      if (!agentData) continue;

      // Apply filters
      let include = true;

      // Filter by capabilities
      if (filters?.capabilities && filters.capabilities.length > 0) {
        const agentCaps = Object.keys(agentData.capabilities || {});
        include = filters.capabilities.every(cap => 
          agentCaps.some(agentCap => agentCap.toLowerCase().includes(cap.toLowerCase()))
        );
      }

      // Filter by tags
      if (include && filters?.tags && filters.tags.length > 0) {
        const agentTags = agentData.skills?.flatMap(skill => skill.tags || []) || [];
        include = filters.tags.some(tag => 
          agentTags.some(agentTag => agentTag.toLowerCase().includes(tag.toLowerCase()))
        );
      }

      // Filter by availability (check if URL is reachable)
      if (include && filters?.available !== undefined) {
        // For now, assume all agents are available
        // In production, you might want to ping the agent URL
        include = true;
      }

      if (include) {
        agents.push(agentData);
      }
    }

    return agents;
  } catch (error) {
    console.error('Error listing agents:', error);
    return [];
  }
}

/**
 * Update an agent's capabilities
 */
export async function updateCapabilities(
  agentId: string,
  capabilities: Record<string, any>,
  env: Env
): Promise<{ success: boolean; message: string }> {
  try {
    const key = `agent_card:${agentId}`;
    const agentData = await env.AGENT_CARDS.get(key, 'json') as AgentCard;

    if (!agentData) {
      return {
        success: false,
        message: `Agent '${agentId}' not found`
      };
    }

    // Update capabilities
    agentData.capabilities = {
      ...agentData.capabilities,
      ...capabilities
    };

    // Update metadata
    (agentData as any).last_updated = new Date().toISOString();

    // Save updated agent card
    const ttl = (agentData as any).ttl || 86400;
    await env.AGENT_CARDS.put(key, JSON.stringify(agentData), {
      expirationTtl: ttl
    });

    return {
      success: true,
      message: `Capabilities updated for agent '${agentId}'`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to update capabilities: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Get agent health status (simplified for now)
 */
export async function getAgentHealth(
  agentId: string,
  env: Env
): Promise<{ available: boolean; lastSeen?: string; responseTime?: number }> {
  try {
    const key = `agent_card:${agentId}`;
    const agentData = await env.AGENT_CARDS.get(key, 'json') as any;

    if (!agentData) {
      return { available: false };
    }

    // In a real implementation, you might:
    // 1. Ping the agent URL
    // 2. Check recent activity logs
    // 3. Monitor response times

    return {
      available: true,
      lastSeen: agentData.last_updated || agentData.registered_at,
      responseTime: 100 // Mock response time in ms
    };
  } catch (error) {
    return { available: false };
  }
}

/**
 * Remove an agent from the registry
 */
export async function unregisterAgent(
  agentId: string,
  env: Env
): Promise<{ success: boolean; message: string }> {
  try {
    const key = `agent_card:${agentId}`;
    const agentData = await env.AGENT_CARDS.get(key);

    if (!agentData) {
      return {
        success: false,
        message: `Agent '${agentId}' not found`
      };
    }

    // Delete agent card
    await env.AGENT_CARDS.delete(key);

    // Delete embedding
    await env.EMBEDDINGS_CACHE.delete(`embedding:${agentId}`);

    return {
      success: true,
      message: `Agent '${agentId}' unregistered successfully`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to unregister agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}