// A2A Protocol Types and Utilities
// Based on https://github.com/a2aproject/A2A
// Helper functions
export function createTextMessage(text) {
    return {
        parts: [{
                root: {
                    type: 'text',
                    text
                },
                kind: 'text',
                text: text
            }]
    };
}
export function createTextPart(text, metadata) {
    return {
        kind: 'text',
        type: 'text',
        text,
        metadata
    };
}
export function createFilePart(file, metadata) {
    return {
        kind: 'file',
        type: 'file',
        file,
        metadata
    };
}
export function createDataPart(data, metadata) {
    return {
        kind: 'data',
        type: 'data',
        data,
        metadata
    };
}
export function createMultipartMessage(parts) {
    return { parts };
}
export function createTaskStatusEvent(taskId, state, message, contextId) {
    return {
        type: 'task.status_update',
        taskId,
        contextId,
        state,
        ...(message ? { message: createTextMessage(message) } : {})
    };
}
export function requiresUserInput(taskId, prompt, contextId) {
    return createTaskStatusEvent(taskId, 'input-required', prompt, contextId);
}
export function createTaskArtifactEvent(taskId, artifactType, content, contextId) {
    return {
        type: 'task.artifact_update',
        taskId,
        contextId,
        artifact: [{
                type: artifactType,
                data: {
                    parts: [{
                            root: {
                                type: 'text',
                                text: content
                            }
                        }]
                }
            }]
    };
}
export function formatSSEMessage(data) {
    return `data: ${JSON.stringify(data)}\n\n`;
}
export function parseSSEMessage(message) {
    if (message.startsWith('data: ')) {
        const jsonStr = message.substring(6).trim();
        if (jsonStr === '[DONE]') {
            return { done: true };
        }
        try {
            return JSON.parse(jsonStr);
        }
        catch (error) {
            console.error('Failed to parse SSE message:', error);
            return null;
        }
    }
    return null;
}
