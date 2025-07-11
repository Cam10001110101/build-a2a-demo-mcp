// A2A Protocol Types and Utilities
// Based on https://github.com/a2aproject/A2A

export interface Message {
  parts: MessagePart[];
}

// Rich content types following A2A standard
export interface TextPart {
  type: 'text';
  text: string;
  metadata?: any;
}

export interface FilePart {
  type: 'file';
  file: FileContent;
  metadata?: any;
}

export interface FileContent {
  name: string;
  contentType?: string;
  content: string; // Base64 encoded for binary files
  size?: number;
}

export interface DataPart {
  type: 'data';
  data: any;
  metadata?: any;
}

export type Part = TextPart | FilePart | DataPart;

// Legacy MessagePart interface for backward compatibility
export interface MessagePart {
  root?: {
    type: string;
    text?: string;
    data?: any;
  };
  // Alternative format
  text?: string;
  type?: string;
  data?: any;
  // New standard fields
  kind?: 'text' | 'file' | 'data';
  file?: FileContent;
  metadata?: any;
}

export interface TaskStatusUpdateEvent {
  type: 'task.status_update';
  taskId: string;
  contextId?: string;
  state: 'submitted' | 'working' | 'completed' | 'failed' | 'cancelled' | 'input-required' | 'unknown';
  message?: Message;
}

export interface TaskArtifactUpdateEvent {
  type: 'task.artifact_update';
  taskId: string;
  contextId?: string;
  artifact: Array<{
    type: string;
    name?: string;
    parts?: MessagePart[];
    data?: any;
  }>;
}

export interface Task {
  id: string;
  contextId: string;
  sessionId?: string;
  agentId?: string;
  createdAt: string;
  state: 'submitted' | 'working' | 'completed' | 'failed' | 'cancelled' | 'input-required' | 'unknown';
  message?: Message;
  artifacts?: Artifact[];
}

export interface Artifact {
  name?: string;
  description?: string;
  parts: MessagePart[];
  metadata?: any;
  index?: number;
  append?: boolean;
  lastChunk?: boolean;
}

export interface SendStreamingMessageSuccessResponse {
  response_type?: string;
  result?: TaskStatusUpdateEvent | TaskArtifactUpdateEvent;
}

export interface A2AAgentResponse {
  response_type?: string;
  is_task_complete: boolean;
  require_user_input: boolean;
  content: string;
  context_id?: string;
}

// Helper functions

export function createTextMessage(text: string): Message {
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

export function createTextPart(text: string, metadata?: any): MessagePart {
  return {
    kind: 'text',
    type: 'text',
    text,
    metadata
  };
}

export function createFilePart(file: FileContent, metadata?: any): MessagePart {
  return {
    kind: 'file',
    type: 'file',
    file,
    metadata
  };
}

export function createDataPart(data: any, metadata?: any): MessagePart {
  return {
    kind: 'data',
    type: 'data',
    data,
    metadata
  };
}

export function createMultipartMessage(parts: MessagePart[]): Message {
  return { parts };
}

export function createTaskStatusEvent(
  taskId: string,
  state: TaskStatusUpdateEvent['state'],
  message?: string,
  contextId?: string
): TaskStatusUpdateEvent {
  return {
    type: 'task.status_update',
    taskId,
    contextId,
    state,
    ...(message ? { message: createTextMessage(message) } : {})
  };
}

export function requiresUserInput(
  taskId: string,
  prompt: string,
  contextId?: string
): TaskStatusUpdateEvent {
  return createTaskStatusEvent(taskId, 'input-required', prompt, contextId);
}

export function createTaskArtifactEvent(
  taskId: string,
  artifactType: string,
  content: string,
  contextId?: string
): TaskArtifactUpdateEvent {
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

export function formatSSEMessage(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function parseSSEMessage(message: string): any {
  if (message.startsWith('data: ')) {
    const jsonStr = message.substring(6).trim();
    if (jsonStr === '[DONE]') {
      return { done: true };
    }
    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse SSE message:', error);
      return null;
    }
  }
  return null;
}