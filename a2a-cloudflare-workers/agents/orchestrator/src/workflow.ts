// Workflow management for orchestrator
// Simplified implementation using basic graph structures

export type NodeState = 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';

export interface WorkflowNodeConfig {
  id: string;
  type: 'agent' | 'task';
  agentName?: string;
  query?: string;
  dependencies: string[];
  metadata?: any;
}

export interface WorkflowNode {
  id: string;
  type: 'agent' | 'task';
  agentName?: string;
  query?: string;
  dependencies: string[];
  state: NodeState;
  result?: any;
  error?: string;
  metadata?: any;
  createdAt: number;
  updatedAt: number;
}

export class WorkflowGraph {
  private nodes: Map<string, WorkflowNode> = new Map();
  private edges: Map<string, Set<string>> = new Map();

  addNode(config: WorkflowNodeConfig): void {
    const node: WorkflowNode = {
      ...config,
      state: 'READY',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.nodes.set(config.id, node);
    this.edges.set(config.id, new Set());

    // Add dependency edges
    for (const depId of config.dependencies) {
      if (!this.edges.has(depId)) {
        this.edges.set(depId, new Set());
      }
      this.edges.get(depId)!.add(config.id);
    }
  }

  getNode(id: string): WorkflowNode | undefined {
    return this.nodes.get(id);
  }

  updateNode(id: string, updates: Partial<WorkflowNode>): void {
    const node = this.nodes.get(id);
    if (node) {
      Object.assign(node, updates, { updatedAt: Date.now() });
      this.nodes.set(id, node);
    }
  }

  getReadyNodes(): WorkflowNode[] {
    const ready: WorkflowNode[] = [];

    for (const node of this.nodes.values()) {
      if (node.state === 'READY') {
        // Check if all dependencies are completed
        const allDepsCompleted = node.dependencies.every(depId => {
          const depNode = this.nodes.get(depId);
          return depNode?.state === 'COMPLETED';
        });

        if (allDepsCompleted) {
          ready.push(node);
        }
      }
    }

    return ready;
  }

  getAllNodes(): WorkflowNode[] {
    return Array.from(this.nodes.values());
  }

  isComplete(): boolean {
    return Array.from(this.nodes.values()).every(
      node => node.state === 'COMPLETED' || node.state === 'FAILED'
    );
  }

  hasPausedNodes(): boolean {
    return Array.from(this.nodes.values()).some(
      node => node.state === 'PAUSED'
    );
  }

  getCompletedArtifacts(): any[] {
    const artifacts: any[] = [];
    
    for (const node of this.nodes.values()) {
      if (node.state === 'COMPLETED' && node.result) {
        artifacts.push({
          nodeId: node.id,
          agentName: node.agentName,
          type: node.type,
          result: node.result,
          completedAt: node.updatedAt
        });
      }
    }

    return artifacts.sort((a, b) => a.completedAt - b.completedAt);
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }

  // Serialize for storage
  serialize(): any {
    return {
      nodes: Array.from(this.nodes.entries()),
      edges: Array.from(this.edges.entries()).map(([key, value]) => [key, Array.from(value)])
    };
  }

  // Deserialize from storage
  deserialize(data: any): void {
    this.clear();
    
    if (data.nodes) {
      for (const [id, node] of data.nodes) {
        this.nodes.set(id, node);
      }
    }

    if (data.edges) {
      for (const [key, value] of data.edges) {
        this.edges.set(key, new Set(value));
      }
    }
  }
}