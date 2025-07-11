// Agent health and metadata tracking functionality

import { Env, AgentCard } from './types';

export interface AgentMetadata {
  agentId: string;
  health: 'healthy' | 'unhealthy' | 'unknown';
  lastSeen: string;
  responseTime?: number;
  errorCount?: number;
  lastError?: string;
  version?: string;
}

export async function checkAgentHealth(agentId: string, env: Env): Promise<AgentMetadata> {
  try {
    // Get agent card
    const cardData = await env.AGENT_CARDS.get(`agent_card:${agentId}`, 'json') as AgentCard | null;
    if (!cardData) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Try to call the agent's well-known endpoint
    const startTime = Date.now();
    const healthUrl = new URL('/.well-known/agent.json', cardData.url).toString();
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      // Add timeout
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    const responseTime = Date.now() - startTime;

    // Get existing metadata
    const existingMetadata = await env.AGENT_CARDS.get(`agent_metadata:${agentId}`, 'json') as AgentMetadata | null;
    
    const metadata: AgentMetadata = {
      agentId,
      health: response.ok ? 'healthy' : 'unhealthy',
      lastSeen: new Date().toISOString(),
      responseTime,
      errorCount: response.ok ? 0 : (existingMetadata?.errorCount || 0) + 1,
      version: cardData.version
    };

    if (!response.ok) {
      metadata.lastError = `HTTP ${response.status}: ${response.statusText}`;
    }

    // Store metadata
    await env.AGENT_CARDS.put(`agent_metadata:${agentId}`, JSON.stringify(metadata), {
      expirationTtl: 86400 // 24 hours
    });

    return metadata;

  } catch (error) {
    // Get existing metadata for error count
    const existingMetadata = await env.AGENT_CARDS.get(`agent_metadata:${agentId}`, 'json') as AgentMetadata | null;
    
    const metadata: AgentMetadata = {
      agentId,
      health: 'unhealthy',
      lastSeen: existingMetadata?.lastSeen || new Date().toISOString(),
      errorCount: (existingMetadata?.errorCount || 0) + 1,
      lastError: error instanceof Error ? error.message : 'Unknown error'
    };

    // Store metadata
    await env.AGENT_CARDS.put(`agent_metadata:${agentId}`, JSON.stringify(metadata), {
      expirationTtl: 86400 // 24 hours
    });

    return metadata;
  }
}

export async function updateAgentMetadata(
  agentId: string, 
  metadata: Partial<AgentMetadata>, 
  env: Env
): Promise<AgentMetadata> {
  // Get existing metadata
  const existingMetadata = await env.AGENT_CARDS.get(`agent_metadata:${agentId}`, 'json') as AgentMetadata | null;
  
  // Merge with new metadata
  const updatedMetadata: AgentMetadata = {
    agentId,
    health: metadata.health || existingMetadata?.health || 'unknown',
    lastSeen: metadata.lastSeen || existingMetadata?.lastSeen || new Date().toISOString(),
    responseTime: metadata.responseTime || existingMetadata?.responseTime,
    errorCount: metadata.errorCount ?? existingMetadata?.errorCount,
    lastError: existingMetadata?.lastError,
    version: existingMetadata?.version
  };

  // Store updated metadata
  await env.AGENT_CARDS.put(`agent_metadata:${agentId}`, JSON.stringify(updatedMetadata), {
    expirationTtl: 86400 // 24 hours
  });

  return updatedMetadata;
}

export async function getAllAgentHealth(env: Env): Promise<AgentMetadata[]> {
  const healthData: AgentMetadata[] = [];
  
  // List all agent cards
  const agentCardsList = await env.AGENT_CARDS.list({ prefix: 'agent_card:' });
  
  for (const key of agentCardsList.keys) {
    const agentId = key.name.replace('agent_card:', '');
    
    // Get metadata for each agent
    const metadata = await env.AGENT_CARDS.get(`agent_metadata:${agentId}`, 'json') as AgentMetadata | null;
    
    if (metadata) {
      healthData.push(metadata);
    } else {
      // No metadata yet, mark as unknown
      healthData.push({
        agentId,
        health: 'unknown',
        lastSeen: 'never',
        errorCount: 0
      });
    }
  }
  
  return healthData;
}

// Background health check for all agents
export async function performHealthChecks(env: Env): Promise<void> {
  const agentCardsList = await env.AGENT_CARDS.list({ prefix: 'agent_card:' });
  
  const healthChecks = [];
  for (const key of agentCardsList.keys) {
    const agentId = key.name.replace('agent_card:', '');
    healthChecks.push(checkAgentHealth(agentId, env));
  }
  
  // Run all health checks in parallel
  await Promise.allSettled(healthChecks);
}