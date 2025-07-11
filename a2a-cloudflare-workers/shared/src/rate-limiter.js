// Rate Limiting Module for A2A Agents
// Provides rate limiting functionality using Cloudflare's rate limiting API
export class RateLimiter {
    config;
    storage;
    constructor(config, storage) {
        this.config = config;
        this.storage = storage || null;
    }
    async checkLimit(request) {
        const key = this.getClientKey(request);
        const now = Date.now();
        const windowStart = Math.floor(now / (this.config.period * 1000)) * (this.config.period * 1000);
        const windowEnd = windowStart + (this.config.period * 1000);
        if (!this.storage) {
            // If no storage available, allow all requests but log warning
            console.warn('Rate limiter: No storage configured, allowing request');
            return {
                allowed: true,
                limit: this.config.limit,
                remaining: this.config.limit,
                reset: windowEnd
            };
        }
        // Get current count for this window
        const countKey = `ratelimit:${key}:${windowStart}`;
        let count = 0;
        if ('get' in this.storage) {
            // KV storage
            const stored = await this.storage.get(countKey);
            count = stored ? parseInt(stored, 10) : 0;
        }
        else {
            // Durable Object storage - would need different implementation
            console.warn('Durable Object rate limiting not implemented');
            return {
                allowed: true,
                limit: this.config.limit,
                remaining: this.config.limit,
                reset: windowEnd
            };
        }
        if (count >= this.config.limit) {
            // Rate limit exceeded
            const retryAfter = Math.ceil((windowEnd - now) / 1000);
            return {
                allowed: false,
                limit: this.config.limit,
                remaining: 0,
                reset: windowEnd,
                retryAfter
            };
        }
        // Increment counter
        count++;
        if ('put' in this.storage) {
            await this.storage.put(countKey, count.toString(), {
                expirationTtl: this.config.period + 60 // Expire shortly after window ends
            });
        }
        return {
            allowed: true,
            limit: this.config.limit,
            remaining: this.config.limit - count,
            reset: windowEnd
        };
    }
    getClientKey(request) {
        if (this.config.keyFunc) {
            return this.config.keyFunc(request);
        }
        // Default key extraction strategy
        // 1. Try to get authenticated client ID from header
        const clientId = request.headers.get('X-Client-Id');
        if (clientId)
            return clientId;
        // 2. Try to get API key (hashed)
        const apiKey = request.headers.get('X-API-Key') ||
            request.headers.get('Authorization');
        if (apiKey) {
            // Simple hash to avoid storing raw API keys
            return this.simpleHash(apiKey);
        }
        // 3. Fall back to IP address
        const ip = request.headers.get('CF-Connecting-IP') ||
            request.headers.get('X-Forwarded-For') ||
            'unknown';
        return `ip:${ip}`;
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }
}
// Middleware function for easy integration
export function createRateLimitMiddleware(config, storage) {
    const limiter = new RateLimiter(config, storage);
    return async function rateLimitMiddleware(request, next) {
        const result = await limiter.checkLimit(request);
        // Add rate limit headers to all responses
        const response = result.allowed
            ? await next(request)
            : new Response(JSON.stringify({
                error: 'Rate limit exceeded',
                message: `API rate limit of ${config.limit} requests per ${config.period} seconds exceeded`,
                retryAfter: result.retryAfter
            }), {
                status: 429,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        // Add rate limit headers
        response.headers.set('X-RateLimit-Limit', result.limit.toString());
        response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
        response.headers.set('X-RateLimit-Reset', result.reset.toString());
        if (!result.allowed && result.retryAfter) {
            response.headers.set('Retry-After', result.retryAfter.toString());
        }
        return response;
    };
}
// Helper function for Cloudflare's built-in rate limiter
export async function checkCloudflareRateLimit(request, rateLimiter // Cloudflare RateLimiter binding
) {
    if (!rateLimiter) {
        console.warn('No Cloudflare rate limiter configured');
        return {
            allowed: true,
            limit: 100,
            remaining: 100,
            reset: Date.now() + 60000
        };
    }
    try {
        // Get client identifier
        const clientId = request.headers.get('CF-Connecting-IP') || 'unknown';
        // Check rate limit
        const { success } = await rateLimiter.limit({ key: clientId });
        return {
            allowed: success,
            limit: 100, // From wrangler.toml config
            remaining: success ? 99 : 0, // Approximate
            reset: Date.now() + 60000, // 1 minute window
            retryAfter: success ? undefined : 60
        };
    }
    catch (error) {
        console.error('Rate limit check failed:', error);
        // Allow request on error to avoid blocking legitimate traffic
        return {
            allowed: true,
            limit: 100,
            remaining: 100,
            reset: Date.now() + 60000
        };
    }
}
