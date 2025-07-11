import { Env, AgentCard } from './types';
import { generateEmbedding, cosineSimilarity } from './embeddings';
import { executeSafeQuery } from './sql-validator';

export async function findAgent(query: string, env: Env): Promise<AgentCard | null> {
  console.log(`[MCP-Registry] findAgent - Query: "${query}"`);
  
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query, env);
    console.log(`[MCP-Registry] findAgent - Generated embedding for query (length: ${queryEmbedding.length})`);

    // Get all agent cards
    const agentCardsList = await env.AGENT_CARDS.list();
    let bestMatch: { card: AgentCard; score: number } | null = null;

    for (const key of agentCardsList.keys) {
      const cardData = await env.AGENT_CARDS.get(key.name, 'json') as AgentCard;
      if (!cardData) continue;

      // Get or generate embedding for agent card
      const embeddingKey = `agent_embedding:${key.name}`;
      let cardEmbedding = await env.EMBEDDINGS_CACHE.get(embeddingKey, 'json') as number[] | null;
      
      if (!cardEmbedding) {
        // Generate embedding from agent card content
        const cardText = JSON.stringify({
          name: cardData.name,
          description: cardData.description,
          skills: cardData.skills
        });
        cardEmbedding = await generateEmbedding(cardText, env);
        await env.EMBEDDINGS_CACHE.put(embeddingKey, JSON.stringify(cardEmbedding), {
          expirationTtl: 86400 * 90 // 90 days
        });
      }

      // Calculate similarity
      const score = cosineSimilarity(queryEmbedding, cardEmbedding);
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { card: cardData, score };
      }
    }

    if (bestMatch) {
      console.log(`[MCP-Registry] findAgent - Found best match: ${bestMatch.card.name} (score: ${bestMatch.score})`);
      return bestMatch.card;
    } else {
      console.log(`[MCP-Registry] findAgent - No match found for query: "${query}"`);
      return null;
    }
  } catch (error) {
    console.error(`[MCP-Registry] findAgent - Error:`, error);
    return null;
  }
}

export async function queryTravelData(query: string, env: Env): Promise<any> {
  console.log(`[MCP-Registry] queryTravelData - Query: "${query}"`);
  
  try {
    // Use secure query execution with parameterized queries
    console.log(`[MCP-Registry] queryTravelData - Parsing and validating SQL query`);
    const result = await executeSafeQuery(query, env.TRAVEL_DB);
    console.log(`[MCP-Registry] queryTravelData - Query successful, rows returned: ${result.results?.length || 0}`);
    
    return {
      results: result.results,
      meta: result.meta,
      // Include available tables and columns in response for user guidance
      schema: {
        tables: ['flights', 'hotels', 'car_rentals', 'places'],
        hint: 'Use SELECT queries with these tables. Example: SELECT * FROM flights WHERE origin = "SFO" AND destination = "LAX"'
      }
    };
  } catch (error) {
    console.error(`[MCP-Registry] queryTravelData - Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Provide helpful error messages for common issues
    if (errorMessage.includes('Invalid table')) {
      return {
        error: errorMessage,
        availableTables: ['flights', 'hotels', 'car_rentals', 'places']
      };
    } else if (errorMessage.includes('Invalid column')) {
      return {
        error: errorMessage,
        hint: 'Use * to select all columns or check the schema for valid column names'
      };
    }
    
    return {
      error: errorMessage,
      hint: 'Query format: SELECT columns FROM table [WHERE conditions] [ORDER BY column] [LIMIT n]'
    };
  }
}

export async function queryPlacesData(query: string): Promise<any> {
  // This is a placeholder since we don't have Google Places API key in Workers
  // In production, you might want to use a different API or proxy through your backend
  return {
    places: [],
    message: 'Places API not configured for Cloudflare Workers'
  };
}