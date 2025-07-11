// Input Validation and Sanitization Module
// Provides schema validation and input sanitization for A2A and MCP protocols

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  sanitized?: any;
}

export class InputValidator {
  // Validate A2A message format
  static validateA2AMessage(input: any): ValidationResult {
    const errors: string[] = [];

    // Check required fields
    if (!input || typeof input !== 'object') {
      return { valid: false, errors: ['Input must be an object'] };
    }

    // Check if this is an A2A RPC method call
    if (input.jsonrpc === '2.0' && input.method) {
      return this.validateA2ARPCMethod(input);
    }

    // Validate message/query field - check multiple possible field names and nested structures
    let message = input.query || input.message || input.content || input.text || input.prompt;
    
    // Check for nested message structures (e.g., input.params.message)
    if (!message && input.params) {
      message = input.params.query || input.params.message || input.params.content || input.params.text || input.params.prompt;
      
      // Check for Google A2A protocol structure: params.message.parts[0].text
      if (!message && input.params.message && typeof input.params.message === 'object') {
        if (input.params.message.parts && Array.isArray(input.params.message.parts) && input.params.message.parts.length > 0) {
          const firstPart = input.params.message.parts[0];
          if (firstPart && firstPart.text) {
            message = firstPart.text;
          }
        }
      }
    }
    
    // Check for A2A Inspector specific structure
    if (!message && input.input) {
      message = input.input;
    }
    
    if (!message || typeof message !== 'string') {
      errors.push('Message/query field is required and must be a string (expected fields: message, query, content, text, prompt, or input)');
    }

    // Validate contextId if provided
    if (input.context_id || input.contextId) {
      const contextId = input.context_id || input.contextId;
      if (typeof contextId !== 'string' || !contextId.match(/^ctx_[a-zA-Z0-9_]+$/)) {
        errors.push('Invalid context ID format. Expected: ctx_*');
      }
    }

    // Validate taskId if provided
    if (input.task_id || input.taskId) {
      const taskId = input.task_id || input.taskId;
      if (typeof taskId !== 'string' || !taskId.match(/^task_[a-zA-Z0-9_]+$/)) {
        errors.push('Invalid task ID format. Expected: task_*');
      }
    }

    // Sanitize input
    const sanitized = {
      message: this.sanitizeString(message),
      contextId: input.context_id || input.contextId || null,
      taskId: input.task_id || input.taskId || null
    };

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitized
    };
  }

  // Validate MCP request format
  static validateMCPRequest(input: any): ValidationResult {
    const errors: string[] = [];

    if (!input || typeof input !== 'object') {
      return { valid: false, errors: ['Input must be an object'] };
    }

    // JSON-RPC 2.0 validation
    if (input.jsonrpc !== '2.0') {
      errors.push('jsonrpc must be "2.0"');
    }

    // id can be string, number, or null (for notifications in JSON-RPC 2.0)
    if (input.id !== null && input.id !== undefined && typeof input.id !== 'string' && typeof input.id !== 'number') {
      errors.push('id must be string, number, or null');
    }

    if (!input.method || typeof input.method !== 'string') {
      errors.push('method is required and must be a string');
    }

    // Validate method format
    if (input.method && !input.method.match(/^[a-zA-Z][a-zA-Z0-9_\/]*$/)) {
      errors.push('Invalid method format');
    }

    // Method-specific parameter validation
    if (input.method) {
      const paramErrors = this.validateMCPMethodParams(input.method, input.params);
      errors.push(...paramErrors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitized: input
    };
  }

  // Validate MCP method parameters
  private static validateMCPMethodParams(method: string, params: any): string[] {
    const errors: string[] = [];

    switch (method) {
      case 'tools/list':
        // No parameters required
        break;

      case 'tools/call':
        if (!params || typeof params !== 'object') {
          errors.push('tools/call requires params object');
        } else {
          if (!params.name || typeof params.name !== 'string') {
            errors.push('tools/call requires params.name as string');
          }
          if (!params.arguments || typeof params.arguments !== 'object') {
            errors.push('tools/call requires params.arguments as object');
          }
        }
        break;

      case 'resources/list':
        // No parameters required
        break;

      case 'resources/read':
        if (!params || typeof params !== 'object') {
          errors.push('resources/read requires params object');
        } else if (!params.uri || typeof params.uri !== 'string') {
          errors.push('resources/read requires params.uri as string');
        }
        break;

      case 'initialize':
        // No parameters required
        break;
    }

    return errors;
  }

  // Validate A2A RPC method calls
  static validateA2ARPCMethod(input: any): ValidationResult {
    const errors: string[] = [];

    // JSON-RPC 2.0 validation
    if (input.jsonrpc !== '2.0') {
      errors.push('jsonrpc must be "2.0"');
    }

    if (!input.method || typeof input.method !== 'string') {
      errors.push('method is required and must be a string');
    }

    // Validate A2A specific methods
    if (input.method) {
      const methodErrors = this.validateA2AMethodParams(input.method, input.params);
      errors.push(...methodErrors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitized: input
    };
  }

  // Validate A2A method parameters
  private static validateA2AMethodParams(method: string, params: any): string[] {
    const errors: string[] = [];

    // Map standard A2A methods to our implementation
    const methodMapping: Record<string, string> = {
      'tasks/send': 'message/send',
      'tasks/sendSubscribe': 'message/stream',
      'tasks/get': 'tasks/get',
      'tasks/list': 'tasks/list',
      'tasks/cancel': 'tasks/cancel',
      'tasks/resubscribe': 'tasks/resubscribe',
      'messages/get': 'messages/get',
      'messages/list': 'messages/list'
    };

    // Use mapped method or original if no mapping exists
    const normalizedMethod = methodMapping[method] || method;

    switch (normalizedMethod) {
      case 'message/stream':
      case 'message/send':
        if (!params || typeof params !== 'object') {
          errors.push(`${method} requires params object`);
        } else if (!params.message || typeof params.message !== 'object') {
          errors.push(`${method} requires params.message as object`);
        } else {
          if (!params.message.parts || !Array.isArray(params.message.parts)) {
            errors.push(`${method} requires params.message.parts as array`);
          } else if (params.message.parts.length === 0) {
            errors.push(`${method} requires at least one message part`);
          } else {
            // Validate each part
            for (let i = 0; i < params.message.parts.length; i++) {
              const part = params.message.parts[i];
              const partErrors = this.validateMessagePart(part, i);
              errors.push(...partErrors);
            }
          }
        }
        // Validate sessionId/contextId
        if (params.sessionId && typeof params.sessionId !== 'string') {
          errors.push(`${method} params.sessionId must be string if provided`);
        }
        if (params.contextId && typeof params.contextId !== 'string') {
          errors.push(`${method} params.contextId must be string if provided`);
        }
        // Validate historyLength if provided
        if (params.historyLength !== undefined && (typeof params.historyLength !== 'number' || params.historyLength < 0)) {
          errors.push(`${method} params.historyLength must be a non-negative number if provided`);
        }
        break;

      case 'tasks/get':
        if (!params || typeof params !== 'object') {
          errors.push('tasks/get requires params object');
        } else if (!params.taskId || typeof params.taskId !== 'string') {
          errors.push('tasks/get requires params.taskId as string');
        }
        break;

      case 'tasks/list':
        // Optional contextId parameter
        if (params && params.contextId && typeof params.contextId !== 'string') {
          errors.push('tasks/list params.contextId must be string if provided');
        }
        break;

      case 'tasks/cancel':
        if (!params || typeof params !== 'object') {
          errors.push('tasks/cancel requires params object');
        } else if (!params.taskId || typeof params.taskId !== 'string') {
          errors.push('tasks/cancel requires params.taskId as string');
        }
        break;

      case 'messages/get':
        if (!params || typeof params !== 'object') {
          errors.push('messages/get requires params object');
        } else if (!params.messageId || typeof params.messageId !== 'string') {
          errors.push('messages/get requires params.messageId as string');
        }
        break;

      case 'messages/list':
        // Optional contextId or taskId parameters
        if (params) {
          if (params.contextId && typeof params.contextId !== 'string') {
            errors.push('messages/list params.contextId must be string if provided');
          }
          if (params.taskId && typeof params.taskId !== 'string') {
            errors.push('messages/list params.taskId must be string if provided');
          }
        }
        break;

      case 'tasks/resubscribe':
        if (!params || typeof params !== 'object') {
          errors.push('tasks/resubscribe requires params object');
        } else if (!params.taskId || typeof params.taskId !== 'string') {
          errors.push('tasks/resubscribe requires params.taskId as string');
        }
        break;

      case 'tasks/submitInput':
        if (!params || typeof params !== 'object') {
          errors.push('tasks/submitInput requires params object');
        } else {
          if (!params.taskId || typeof params.taskId !== 'string') {
            errors.push('tasks/submitInput requires params.taskId as string');
          }
          if (!params.input || typeof params.input !== 'string') {
            errors.push('tasks/submitInput requires params.input as string');
          }
        }
        break;

      default:
        errors.push(`Unsupported A2A method: ${method}`);
    }

    return errors;
  }

  // Validate message part structure
  private static validateMessagePart(part: any, index: number): string[] {
    const errors: string[] = [];
    
    if (!part || typeof part !== 'object') {
      errors.push(`Message part[${index}] must be an object`);
      return errors;
    }

    // Support multiple part formats for compatibility
    // Standard A2A format: { type: 'text', text: '...' } or { type: 'file', file: {...} }
    // Legacy format: { text: '...' } or { root: { type: 'text', text: '...' } }
    
    // Determine part type
    let partType = part.type || part.kind;
    if (!partType && part.root?.type) {
      partType = part.root.type;
    }
    if (!partType && part.text) {
      partType = 'text';
    }

    switch (partType) {
      case 'text':
        // Validate text content exists
        const textContent = part.text || part.root?.text;
        if (!textContent || typeof textContent !== 'string') {
          errors.push(`Message part[${index}] of type 'text' requires text content`);
        }
        break;

      case 'file':
        if (!part.file || typeof part.file !== 'object') {
          errors.push(`Message part[${index}] of type 'file' requires file object`);
        } else {
          if (!part.file.name || typeof part.file.name !== 'string') {
            errors.push(`Message part[${index}].file requires name as string`);
          }
          if (!part.file.content || typeof part.file.content !== 'string') {
            errors.push(`Message part[${index}].file requires content as string`);
          }
        }
        break;

      case 'data':
        if (part.data === undefined) {
          errors.push(`Message part[${index}] of type 'data' requires data field`);
        }
        break;

      default:
        // For backward compatibility, accept parts with just text field
        if (!part.text && !part.root?.text) {
          errors.push(`Message part[${index}] has unknown type '${partType}' and no text content`);
        }
    }

    return errors;
  }

  // Validate tool input against schema
  static validateToolInput(toolName: string, input: any, schema: any): ValidationResult {
    const errors: string[] = [];
    
    if (!schema || !schema.properties) {
      return { valid: true, sanitized: input };
    }

    const sanitized: any = {};

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in input)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Validate and sanitize each property
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
      if (key in input) {
        const value = input[key];
        const validation = this.validateProperty(key, value, propSchema);
        
        if (!validation.valid) {
          errors.push(...(validation.errors || []));
        } else {
          sanitized[key] = validation.sanitized;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitized
    };
  }

  // Validate individual property
  private static validateProperty(name: string, value: any, schema: any): ValidationResult {
    const errors: string[] = [];
    let sanitized = value;

    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${name} must be a string`);
        } else {
          sanitized = this.sanitizeString(value);
          
          // Check string constraints
          if (schema.minLength && sanitized.length < schema.minLength) {
            errors.push(`${name} must be at least ${schema.minLength} characters`);
          }
          if (schema.maxLength && sanitized.length > schema.maxLength) {
            errors.push(`${name} must be at most ${schema.maxLength} characters`);
          }
          if (schema.pattern && !sanitized.match(new RegExp(schema.pattern))) {
            errors.push(`${name} does not match required pattern`);
          }
          if (schema.enum && !schema.enum.includes(sanitized)) {
            errors.push(`${name} must be one of: ${schema.enum.join(', ')}`);
          }
        }
        break;

      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${name} must be a number`);
        } else {
          if (schema.minimum !== undefined && value < schema.minimum) {
            errors.push(`${name} must be >= ${schema.minimum}`);
          }
          if (schema.maximum !== undefined && value > schema.maximum) {
            errors.push(`${name} must be <= ${schema.maximum}`);
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${name} must be a boolean`);
        }
        break;

      case 'object':
        if (typeof value !== 'object' || value === null) {
          errors.push(`${name} must be an object`);
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          errors.push(`${name} must be an array`);
        } else {
          if (schema.minItems !== undefined && value.length < schema.minItems) {
            errors.push(`${name} must have at least ${schema.minItems} items`);
          }
          if (schema.maxItems !== undefined && value.length > schema.maxItems) {
            errors.push(`${name} must have at most ${schema.maxItems} items`);
          }
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      sanitized
    };
  }

  // String sanitization
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .substring(0, 10000); // Limit length
  }

  // Sanitize SQL-like strings (extra careful)
  static sanitizeSQLString(input: string): string {
    return this.sanitizeString(input)
      .replace(/['";\\]/g, '') // Remove quotes and escape characters
      .replace(/--/g, '') // Remove SQL comments
      .replace(/\/\*/g, '') // Remove multi-line comments
      .replace(/\*\//g, '');
  }

  // Validate and sanitize URLs
  static validateURL(input: string): ValidationResult {
    try {
      const url = new URL(input);
      
      // Only allow http and https
      if (!['http:', 'https:'].includes(url.protocol)) {
        return {
          valid: false,
          errors: ['Only HTTP and HTTPS URLs are allowed']
        };
      }

      // Check for localhost/private IPs (security)
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'localhost' || 
          hostname.startsWith('127.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname === '0.0.0.0') {
        return {
          valid: false,
          errors: ['Private/local URLs are not allowed']
        };
      }

      return {
        valid: true,
        sanitized: url.toString()
      };
    } catch (error) {
      return {
        valid: false,
        errors: ['Invalid URL format']
      };
    }
  }
}

// Middleware for request validation
export function createValidationMiddleware() {
  return async function validationMiddleware(
    request: Request,
    next: (request: Request) => Promise<Response>
  ): Promise<Response> {
    // Only validate POST requests with JSON bodies
    if (request.method !== 'POST') {
      return next(request);
    }

    let body: any;
    try {
      body = await request.json();
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Invalid JSON body'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Determine protocol and validate accordingly
    const url = new URL(request.url);
    let validation: ValidationResult;

    if (url.pathname === '/rpc' || url.pathname === '/sse') {
      // MCP protocol
      validation = InputValidator.validateMCPRequest(body);
    } else {
      // A2A protocol
      validation = InputValidator.validateA2AMessage(body);
    }

    if (!validation.valid) {
      return new Response(JSON.stringify({
        error: 'Validation failed',
        errors: validation.errors
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Create new request with sanitized body
    const sanitizedRequest = new Request(request, {
      body: JSON.stringify(validation.sanitized || body)
    });

    return next(sanitizedRequest);
  };
}