import { Authenticator, addSecuritySchemeToAgentCard } from './auth';
import { InputValidator } from './validation';
export class BaseAgent {
    agentCard;
    authenticator;
    authConfig;
    // A2A Protocol State Storage (in-memory cache)
    tasks = new Map();
    messages = new Map();
    taskHistory = new Map(); // contextId -> taskId[]
    // KV Storage for persistence (optional - can be undefined for agents without KV)
    kvStorage;
    constructor(agentCard, authConfig) {
        this.agentCard = agentCard;
        // Set up authentication if config provided
        if (authConfig) {
            this.authConfig = authConfig;
            this.authenticator = new Authenticator(authConfig);
            // Update agent card with security schemes
            this.agentCard = addSecuritySchemeToAgentCard(agentCard, authConfig);
        }
    }
    getAgentCard() {
        return this.agentCard;
    }
    async handleRequest(request) {
        const url = new URL(request.url);
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return this.handleCors();
        }
        // Handle agent info endpoint (public, no auth required)
        if (url.pathname === '/.well-known/agent.json') {
            return new Response(JSON.stringify(this.agentCard), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        // Authenticate requests to main endpoints
        if (this.authenticator) {
            const authResult = await this.authenticator.authenticate(request);
            if (!authResult.authenticated) {
                return new Response(JSON.stringify({
                    error: 'Authentication failed',
                    reason: authResult.reason
                }), {
                    status: 401,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'WWW-Authenticate': `${this.authConfig?.scheme} realm="A2A Agent"`
                    }
                });
            }
        }
        // Handle main agent endpoint
        if (request.method === 'POST') {
            try {
                const body = await request.json();
                // Log the request for debugging
                console.log('[BaseAgent] Received request body:', JSON.stringify(body));
                // Check if this is an A2A RPC method call
                if (body.jsonrpc === '2.0' && body.method) {
                    return this.handleA2ARPCMethod(body);
                }
                // Validate input for regular message processing
                const validation = InputValidator.validateA2AMessage(body);
                if (!validation.valid) {
                    // Return SSE error format for A2A compatibility
                    const taskId = this.generateTaskId();
                    const contextId = body.context_id || body.contextId || this.generateContextId();
                    const { readable, writable } = new TransformStream();
                    const writer = writable.getWriter();
                    const encoder = new TextEncoder();
                    (async () => {
                        // Wrap error in JSON-RPC error response for A2A Inspector compatibility
                        const errorResponse = {
                            jsonrpc: '2.0',
                            id: body.id || null,
                            error: {
                                code: -32602,
                                message: `Invalid request format: ${validation.errors?.join(', ')}`
                            }
                        };
                        await writer.write(encoder.encode(JSON.stringify(errorResponse) + '\n'));
                        await writer.close();
                    })();
                    return new Response(readable, {
                        status: 200, // SSE should return 200 even for errors
                        headers: {
                            'Content-Type': 'text/event-stream',
                            'Cache-Control': 'no-cache',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
                // Use sanitized input
                const sanitized = validation.sanitized;
                const query = sanitized.message || '';
                const contextId = sanitized.contextId || this.generateContextId();
                const taskId = sanitized.taskId || this.generateTaskId();
                // Always use streaming response for A2A protocol
                // The A2A protocol expects SSE responses by default
                return this.handleStreamingResponse(query, contextId, taskId, sanitized.id || 'msg-1');
            }
            catch (error) {
                // Return SSE error format for A2A compatibility
                const taskId = this.generateTaskId();
                const contextId = this.generateContextId();
                const { readable, writable } = new TransformStream();
                const writer = writable.getWriter();
                const encoder = new TextEncoder();
                (async () => {
                    const errorResponse = {
                        jsonrpc: '2.0',
                        id: 'error',
                        error: {
                            code: -32603,
                            message: error instanceof Error ? error.message : 'Unknown error'
                        }
                    };
                    await writer.write(encoder.encode(JSON.stringify(errorResponse) + '\n'));
                    await writer.close();
                })();
                return new Response(readable, {
                    status: 200, // SSE should return 200 even for errors
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        }
        return new Response('Method not allowed', {
            status: 405,
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
    async handleStreamingResponse(query, contextId, taskId, requestId = 'msg-1', historyLength) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        // Start streaming in the background
        (async () => {
            try {
                let messageId = 0;
                // Send initial task creation event like Python reference implementation
                const history = [{
                        contextId: contextId,
                        kind: 'message',
                        messageId: `msg-${Date.now()}`,
                        parts: [{
                                kind: 'text',
                                text: query
                            }],
                        role: 'user',
                        taskId: taskId
                    }];
                // Apply historyLength limit if specified
                const limitedHistory = historyLength && historyLength > 0
                    ? history.slice(-historyLength)
                    : history;
                const initialTaskResponse = {
                    jsonrpc: '2.0',
                    id: requestId,
                    result: {
                        id: taskId,
                        kind: 'task',
                        contextId: contextId,
                        sessionId: contextId, // Include both for compatibility
                        history: limitedHistory,
                        status: {
                            state: 'submitted'
                        }
                    }
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(initialTaskResponse)}\n\n`));
                // Stream agent responses wrapped in A2A protocol format
                for await (const response of this.stream(query, contextId, taskId)) {
                    let a2aResponse;
                    if (!response.is_task_complete) {
                        // Status update event - match Python reference implementation format
                        a2aResponse = {
                            jsonrpc: '2.0',
                            id: requestId,
                            result: {
                                contextId: contextId,
                                final: false,
                                kind: 'status-update',
                                status: {
                                    message: {
                                        contextId: contextId,
                                        kind: 'message',
                                        messageId: `msg-${Date.now()}`,
                                        parts: [{
                                                kind: 'text',
                                                text: response.content
                                            }],
                                        role: 'agent',
                                        taskId: taskId
                                    },
                                    state: 'working',
                                    timestamp: new Date().toISOString()
                                },
                                taskId: taskId
                            }
                        };
                    }
                    else {
                        // Final status update with completion
                        a2aResponse = {
                            jsonrpc: '2.0',
                            id: requestId,
                            result: {
                                contextId: contextId,
                                final: true,
                                kind: 'status-update',
                                status: {
                                    message: {
                                        contextId: contextId,
                                        kind: 'message',
                                        messageId: `msg-${Date.now()}`,
                                        parts: [{
                                                kind: 'text',
                                                text: response.content
                                            }],
                                        role: 'agent',
                                        taskId: taskId
                                    },
                                    state: 'completed',
                                    timestamp: new Date().toISOString()
                                },
                                taskId: taskId
                            }
                        };
                    }
                    // Use proper SSE format like Python reference implementation
                    await writer.write(encoder.encode(`data: ${JSON.stringify(a2aResponse)}\n\n`));
                }
                // Don't send SSE [DONE] marker for NDJSON format
            }
            catch (error) {
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: 'error',
                    error: {
                        code: -32603,
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
                await writer.write(encoder.encode(JSON.stringify(errorResponse) + '\n'));
            }
            finally {
                await writer.close();
            }
        })();
        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
    async handleSyncResponse(query, contextId, taskId) {
        let finalResponse = null;
        for await (const response of this.stream(query, contextId, taskId)) {
            finalResponse = response;
        }
        if (!finalResponse) {
            return new Response(JSON.stringify({
                error: 'No response generated'
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        return new Response(JSON.stringify({
            ...finalResponse,
            context_id: contextId
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
    generateContextId() {
        return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
    handleCors() {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Api-Key, Api-Key',
                'Access-Control-Max-Age': '86400'
            }
        });
    }
    // Set KV storage for A2A state persistence
    setKVStorage(kv) {
        this.kvStorage = kv;
    }
    // Load task from persistent storage
    async loadTask(taskId) {
        // Check in-memory cache first
        const cachedTask = this.tasks.get(taskId);
        if (cachedTask) {
            return cachedTask;
        }
        // Load from KV storage if available
        if (this.kvStorage) {
            try {
                const taskData = await this.kvStorage.get(`a2a:task:${taskId}`);
                if (taskData) {
                    const task = JSON.parse(taskData);
                    this.tasks.set(taskId, task); // Cache it
                    return task;
                }
            }
            catch (error) {
                console.error('Error loading task from KV:', error);
            }
        }
        return null;
    }
    // Save task to persistent storage
    async saveTask(task) {
        // Update in-memory cache
        this.tasks.set(task.id, task);
        // Save to KV storage if available
        if (this.kvStorage) {
            try {
                await this.kvStorage.put(`a2a:task:${task.id}`, JSON.stringify(task), { expirationTtl: 86400 } // 24 hours
                );
            }
            catch (error) {
                console.error('Error saving task to KV:', error);
            }
        }
    }
    // Load message from persistent storage
    async loadMessage(messageId) {
        // Check in-memory cache first
        const cachedMessage = this.messages.get(messageId);
        if (cachedMessage) {
            return cachedMessage;
        }
        // Load from KV storage if available
        if (this.kvStorage) {
            try {
                const messageData = await this.kvStorage.get(`a2a:message:${messageId}`);
                if (messageData) {
                    const message = JSON.parse(messageData);
                    this.messages.set(messageId, message); // Cache it
                    return message;
                }
            }
            catch (error) {
                console.error('Error loading message from KV:', error);
            }
        }
        return null;
    }
    // Save message to persistent storage
    async saveMessage(message) {
        // Update in-memory cache
        this.messages.set(message.messageId, message);
        // Save to KV storage if available
        if (this.kvStorage) {
            try {
                await this.kvStorage.put(`a2a:message:${message.messageId}`, JSON.stringify(message), { expirationTtl: 86400 } // 24 hours
                );
            }
            catch (error) {
                console.error('Error saving message to KV:', error);
            }
        }
    }
    // Load task history for a context
    async loadTaskHistory(contextId) {
        // Check in-memory cache first
        const cachedHistory = this.taskHistory.get(contextId);
        if (cachedHistory) {
            return cachedHistory;
        }
        // Load from KV storage if available
        if (this.kvStorage) {
            try {
                const historyData = await this.kvStorage.get(`a2a:history:${contextId}`);
                if (historyData) {
                    const history = JSON.parse(historyData);
                    this.taskHistory.set(contextId, history); // Cache it
                    return history;
                }
            }
            catch (error) {
                console.error('Error loading task history from KV:', error);
            }
        }
        return [];
    }
    // Save task history for a context
    async saveTaskHistory(contextId, history) {
        // Update in-memory cache
        this.taskHistory.set(contextId, history);
        // Save to KV storage if available
        if (this.kvStorage) {
            try {
                await this.kvStorage.put(`a2a:history:${contextId}`, JSON.stringify(history), { expirationTtl: 86400 } // 24 hours
                );
            }
            catch (error) {
                console.error('Error saving task history to KV:', error);
            }
        }
    }
    // Record state transition and update task
    async recordStateTransition(task, newState, reason) {
        const fromState = task.status.state;
        const transition = {
            fromState: fromState,
            toState: newState,
            timestamp: new Date().toISOString(),
            reason
        };
        // Initialize state transitions array if not exists
        if (!task.stateTransitions) {
            task.stateTransitions = [];
        }
        // Add the transition
        task.stateTransitions.push(transition);
        // Update task status
        task.status.state = newState;
        task.status.timestamp = transition.timestamp;
        if (reason) {
            task.status.message = reason;
        }
        // Mark as final if appropriate
        if (newState === 'completed' || newState === 'failed' || newState === 'cancelled') {
            task.final = true;
        }
        // input-required is not final - task is waiting for input
        if (newState === 'input-required') {
            task.final = false;
        }
        // Save the updated task
        await this.saveTask(task);
        console.log(`[BaseAgent] State transition recorded: ${task.id} ${fromState} → ${newState}${reason ? ` (${reason})` : ''}`);
    }
    // A2A RPC Method Handler
    async handleA2ARPCMethod(body) {
        const { method, params, id } = body;
        try {
            let result;
            // Map standard A2A methods to our implementations
            const methodMapping = {
                'tasks/send': 'message/send',
                'tasks/sendSubscribe': 'message/stream'
            };
            const normalizedMethod = methodMapping[method] || method;
            switch (normalizedMethod) {
                case 'message/stream':
                    // Handle streaming message - convert to regular message processing
                    return this.handleMessageStream(body);
                case 'message/send':
                    // Handle non-streaming message
                    result = await this.handleMessageSend(params);
                    break;
                case 'tasks/get':
                    result = await this.handleTasksGet(params);
                    break;
                case 'tasks/list':
                    result = await this.handleTasksList(params);
                    break;
                case 'tasks/cancel':
                    result = await this.handleTasksCancel(params);
                    break;
                case 'tasks/resubscribe':
                    result = await this.handleTasksResubscribe(params);
                    break;
                case 'tasks/submitInput':
                    result = await this.handleTasksSubmitInput(params);
                    break;
                case 'messages/get':
                    result = await this.handleMessagesGet(params);
                    break;
                case 'messages/list':
                    result = await this.handleMessagesList(params);
                    break;
                default:
                    throw new Error(`Unsupported A2A RPC method: ${method}`);
            }
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id,
                result
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        catch (error) {
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: error instanceof Error ? error.message : 'Unknown error'
                }
            }), {
                status: 200, // JSON-RPC errors should return 200
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
    }
    async handleMessageStream(body) {
        // Extract message from A2A Inspector format
        if (body.params?.message?.parts?.[0]?.text) {
            const query = body.params.message.parts[0].text;
            // Support both sessionId (standard) and contextId (our implementation)
            const contextId = body.params.sessionId || body.params.contextId || body.params.message.contextId || this.generateContextId();
            const taskId = body.params.message.taskId || this.generateTaskId();
            const historyLength = body.params.historyLength;
            return this.handleStreamingResponse(query, contextId, taskId, body.id || 'msg-1', historyLength);
        }
        throw new Error('Invalid message/stream format');
    }
    async handleMessageSend(params) {
        if (!params?.message?.parts?.[0]?.text) {
            throw new Error('Invalid message format');
        }
        const query = params.message.parts[0].text;
        // Support both sessionId (standard) and contextId (our implementation)
        const contextId = params.sessionId || params.contextId || params.message.contextId || this.generateContextId();
        const taskId = params.message.taskId || this.generateTaskId();
        const historyLength = params.historyLength;
        // Create user message
        const userMessage = {
            contextId,
            kind: 'message',
            messageId: params.message.messageId || `msg-${Date.now()}`,
            parts: params.message.parts,
            role: 'user',
            taskId,
            timestamp: new Date().toISOString()
        };
        // Create task with initial state transition
        const timestamp = new Date().toISOString();
        const task = {
            id: taskId,
            kind: 'task',
            contextId,
            status: {
                state: 'submitted',
                timestamp: timestamp
            },
            history: [userMessage],
            stateTransitions: [{
                    toState: 'submitted',
                    timestamp: timestamp,
                    reason: 'Task created'
                }],
            validation_errors: []
        };
        // Save to persistent storage
        await this.saveTask(task);
        await this.saveMessage(userMessage);
        // Add to task history
        const history = await this.loadTaskHistory(contextId);
        history.push(taskId);
        await this.saveTaskHistory(contextId, history);
        // Process asynchronously
        this.processTaskAsync(taskId, query, contextId, historyLength);
        // Return task with sessionId for compatibility
        return {
            ...task,
            sessionId: contextId
        };
    }
    async processTaskAsync(taskId, query, contextId, historyLength) {
        const task = await this.loadTask(taskId);
        if (!task)
            return;
        try {
            // Record transition to working state
            await this.recordStateTransition(task, 'working', 'Task processing started');
            // Process with agent stream
            for await (const response of this.stream(query, contextId, taskId)) {
                // Add agent message to history
                const agentMessage = {
                    contextId,
                    kind: 'message',
                    messageId: `msg-${Date.now()}`,
                    parts: [{
                            kind: 'text',
                            text: response.content
                        }],
                    role: 'agent',
                    taskId,
                    timestamp: new Date().toISOString()
                };
                task.history.push(agentMessage);
                await this.saveMessage(agentMessage);
                await this.saveTask(task);
                if (response.is_task_complete) {
                    await this.recordStateTransition(task, 'completed', 'Task processing completed successfully');
                    break;
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await this.recordStateTransition(task, 'failed', `Task failed: ${errorMessage}`);
        }
    }
    async handleTasksGet(params) {
        if (!params?.taskId) {
            throw new Error('taskId parameter is required');
        }
        const task = await this.loadTask(params.taskId);
        if (!task) {
            return null;
        }
        // Apply historyLength if specified
        if (params.historyLength && params.historyLength > 0) {
            const limitedHistory = task.history.slice(-params.historyLength);
            return {
                ...task,
                sessionId: task.contextId, // Include sessionId for compatibility
                history: limitedHistory
            };
        }
        return {
            ...task,
            sessionId: task.contextId // Include sessionId for compatibility
        };
    }
    async handleTasksList(params) {
        const contextId = params?.contextId;
        if (contextId) {
            // Return tasks for specific context
            const taskIds = await this.loadTaskHistory(contextId);
            const tasks = [];
            for (const id of taskIds) {
                const task = await this.loadTask(id);
                if (task) {
                    tasks.push(task);
                }
            }
            return tasks;
        }
        // For all tasks, we'd need to implement a way to list all task keys from KV
        // For now, return in-memory tasks only
        return Array.from(this.tasks.values());
    }
    async handleTasksCancel(params) {
        if (!params?.taskId) {
            throw new Error('taskId parameter is required');
        }
        const task = await this.loadTask(params.taskId);
        if (!task) {
            return { success: false, message: 'Task not found' };
        }
        if (task.status.state === 'completed' || task.status.state === 'failed') {
            return { success: false, message: 'Task already completed' };
        }
        if (task.status.state === 'cancelled') {
            return { success: false, message: 'Task already cancelled' };
        }
        await this.recordStateTransition(task, 'cancelled', 'Task cancelled by user request');
        return { success: true, message: 'Task cancelled successfully' };
    }
    async handleTasksResubscribe(params) {
        if (!params?.taskId) {
            throw new Error('taskId parameter is required');
        }
        const task = await this.loadTask(params.taskId);
        if (!task) {
            throw new Error('Task not found');
        }
        // Create a streaming response that continues from the task's current state
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        (async () => {
            try {
                // Send current task state
                const currentState = {
                    jsonrpc: '2.0',
                    id: params.id || 'resubscribe-1',
                    result: {
                        id: task.id,
                        kind: 'task',
                        contextId: task.contextId,
                        sessionId: task.contextId, // Include both for compatibility
                        history: task.history,
                        status: task.status,
                        final: task.final || false
                    }
                };
                await writer.write(encoder.encode(`data: ${JSON.stringify(currentState)}\n\n`));
                // If task is not final, continue streaming updates
                if (!task.final) {
                    // In a real implementation, this would reconnect to the task's event stream
                    // For now, we'll just close the stream
                    console.log(`[BaseAgent] Resubscribe to task ${params.taskId} - task is still active`);
                }
            }
            catch (error) {
                const errorResponse = {
                    jsonrpc: '2.0',
                    id: 'error',
                    error: {
                        code: -32603,
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
                await writer.write(encoder.encode(JSON.stringify(errorResponse) + '\n'));
            }
            finally {
                await writer.close();
            }
        })();
        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
    async handleTasksSubmitInput(params) {
        if (!params?.taskId) {
            throw new Error('taskId parameter is required');
        }
        if (!params?.input) {
            throw new Error('input parameter is required');
        }
        const task = await this.loadTask(params.taskId);
        if (!task) {
            throw new Error('Task not found');
        }
        if (task.status.state !== 'input-required') {
            throw new Error(`Task is not waiting for input (current state: ${task.status.state})`);
        }
        // Add user input message to history
        const inputMessage = {
            contextId: task.contextId,
            kind: 'message',
            messageId: `msg-${Date.now()}`,
            parts: [{
                    kind: 'text',
                    text: params.input
                }],
            role: 'user',
            taskId: task.id,
            timestamp: new Date().toISOString()
        };
        task.history.push(inputMessage);
        await this.saveMessage(inputMessage);
        // Transition back to working state
        await this.recordStateTransition(task, 'working', 'User input received');
        // Resume task processing
        // In a real implementation, this would notify the agent to continue processing
        // For now, we'll just return the updated task
        return {
            ...task,
            sessionId: task.contextId
        };
    }
    async handleMessagesGet(params) {
        if (!params?.messageId) {
            throw new Error('messageId parameter is required');
        }
        return await this.loadMessage(params.messageId);
    }
    async handleMessagesList(params) {
        const contextId = params?.contextId;
        const taskId = params?.taskId;
        if (taskId) {
            // Return messages for specific task
            const task = await this.loadTask(taskId);
            return task?.history || [];
        }
        if (contextId) {
            // Return messages for specific context
            const taskIds = await this.loadTaskHistory(contextId);
            const messages = [];
            for (const id of taskIds) {
                const task = await this.loadTask(id);
                if (task) {
                    messages.push(...task.history);
                }
            }
            return messages.sort((a, b) => {
                const timeA = a.timestamp || '0';
                const timeB = b.timestamp || '0';
                return timeA.localeCompare(timeB);
            });
        }
        // For all messages, we'd need to implement a way to list all message keys from KV
        // For now, return in-memory messages only
        return Array.from(this.messages.values());
    }
}
