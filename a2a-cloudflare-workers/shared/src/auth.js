// Authentication and Authorization Module for A2A Agents
// Provides API key validation, Bearer token support, and request signing
export class AuthenticationError extends Error {
    code;
    constructor(message, code = 401) {
        super(message);
        this.code = code;
        this.name = 'AuthenticationError';
    }
}
export class Authenticator {
    config;
    constructor(config) {
        this.config = config;
    }
    async authenticate(request) {
        // Check HTTPS requirement
        if (this.config.requireHttps && !request.url.startsWith('https://')) {
            return {
                authenticated: false,
                reason: 'HTTPS required'
            };
        }
        // Check origin if specified
        if (this.config.allowedOrigins && this.config.allowedOrigins.length > 0) {
            const origin = request.headers.get('Origin');
            if (origin && !this.config.allowedOrigins.includes(origin)) {
                return {
                    authenticated: false,
                    reason: 'Origin not allowed'
                };
            }
        }
        // Handle different authentication schemes
        switch (this.config.scheme) {
            case 'none':
                return { authenticated: true, clientId: 'anonymous' };
            case 'bearer':
                return this.validateBearerToken(request);
            case 'api-key':
                return this.validateApiKey(request);
            default:
                return {
                    authenticated: false,
                    reason: 'Unknown authentication scheme'
                };
        }
    }
    async validateBearerToken(request) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                authenticated: false,
                reason: 'Missing or invalid Authorization header'
            };
        }
        const token = authHeader.substring(7);
        // In a production environment, you would validate this against a token service
        // For now, we'll check against configured API keys
        if (this.config.apiKeys && this.config.apiKeys.includes(token)) {
            // Hash the token to create a client ID
            const clientId = await this.hashToken(token);
            return {
                authenticated: true,
                clientId
            };
        }
        return {
            authenticated: false,
            reason: 'Invalid bearer token'
        };
    }
    async validateApiKey(request) {
        // Check multiple header locations for API key
        const apiKey = request.headers.get('X-API-Key') ||
            request.headers.get('X-Api-Key') ||
            request.headers.get('Api-Key');
        if (!apiKey) {
            return {
                authenticated: false,
                reason: 'Missing API key'
            };
        }
        if (this.config.apiKeys && this.config.apiKeys.includes(apiKey)) {
            // Hash the API key to create a client ID
            const clientId = await this.hashToken(apiKey);
            return {
                authenticated: true,
                clientId
            };
        }
        return {
            authenticated: false,
            reason: 'Invalid API key'
        };
    }
    async hashToken(token) {
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
    }
}
// Middleware function for easy integration
export function createAuthMiddleware(config) {
    const authenticator = new Authenticator(config);
    return async function authMiddleware(request, next) {
        const authResult = await authenticator.authenticate(request);
        if (!authResult.authenticated) {
            return new Response(JSON.stringify({
                error: 'Authentication failed',
                reason: authResult.reason
            }), {
                status: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'WWW-Authenticate': `${config.scheme} realm="A2A Agent"`
                }
            });
        }
        return next(request, authResult);
    };
}
// Helper to load API keys from environment
export function loadApiKeysFromEnv(env) {
    const apiKeys = [];
    // Check for individual API keys
    if (env.API_KEY) {
        apiKeys.push(env.API_KEY);
    }
    // Check for comma-separated list
    if (env.API_KEYS) {
        apiKeys.push(...env.API_KEYS.split(',').map((key) => key.trim()).filter(Boolean));
    }
    // Check for numbered API keys (API_KEY_1, API_KEY_2, etc.)
    for (let i = 1; i <= 10; i++) {
        const key = env[`API_KEY_${i}`];
        if (key) {
            apiKeys.push(key);
        }
    }
    return apiKeys;
}
// Update agent card with security schemes
export function addSecuritySchemeToAgentCard(agentCard, authConfig) {
    const updatedCard = { ...agentCard };
    // Add security schemes based on config
    updatedCard.securitySchemes = {};
    switch (authConfig.scheme) {
        case 'bearer':
            updatedCard.securitySchemes.bearerAuth = {
                type: 'http',
                scheme: 'bearer',
                description: 'Bearer token authentication'
            };
            updatedCard.security = [{ bearerAuth: [] }];
            break;
        case 'api-key':
            updatedCard.securitySchemes.apiKeyAuth = {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-Key',
                description: 'API key authentication'
            };
            updatedCard.security = [{ apiKeyAuth: [] }];
            break;
        case 'none':
            updatedCard.authentication.schemes = ['public'];
            break;
    }
    return updatedCard;
}
