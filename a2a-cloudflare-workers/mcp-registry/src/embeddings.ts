import { Env } from './types';

const EMBEDDING_MODEL = '@cf/baai/bge-large-en-v1.5';
const EMBEDDING_DIMENSIONS = 1024;

export async function getEmbedding(text: string, ai: Ai, cache: KVNamespace): Promise<number[]> {
  // Check cache first
  const cacheKey = `embedding:${await hashText(text)}`;
  const cached = await cache.get(cacheKey, 'json');
  if (cached) {
    return cached as number[];
  }

  // Generate new embedding
  const response = await ai.run(EMBEDDING_MODEL, {
    text: [text]
  });

  const embedding = response.data[0];
  
  // Cache for future use
  await cache.put(cacheKey, JSON.stringify(embedding), {
    expirationTtl: 90 * 24 * 60 * 60 // 90 days
  });

  return embedding;
}

export async function generateEmbedding(text: string, env: Env): Promise<number[]> {
  // Check cache first
  const cacheKey = `embedding:${await hashText(text)}`;
  const cached = await env.EMBEDDINGS_CACHE.get(cacheKey, 'json');
  if (cached) {
    return cached as number[];
  }

  // Generate new embedding
  const response = await env.AI.run(EMBEDDING_MODEL, {
    text: [text]
  });

  const embedding = response.data[0];
  
  // Cache the result
  await env.EMBEDDINGS_CACHE.put(cacheKey, JSON.stringify(embedding), {
    expirationTtl: 86400 * 30 // 30 days
  });

  return embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}