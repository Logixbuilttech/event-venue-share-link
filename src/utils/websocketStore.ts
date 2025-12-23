// In-memory store for real-time updates
// This works with Next.js API routes without needing a custom server
// Uses polling with a shared store that API routes can update

type UpdateListener = (shareId: string) => void;

class WebSocketStore {
  private updateQueue: Map<string, number> = new Map(); // shareId -> timestamp
  private listeners: Map<string, Set<UpdateListener>> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  // Add an update notification (called from API routes)
  notifyUpdate(shareId: string): void {
    this.updateQueue.set(shareId, Date.now());
    
    // Immediately notify listeners if any
    const callbacks = this.listeners.get(shareId);
    if (callbacks) {
      callbacks.forEach(callback => callback(shareId));
    }
  }

  // Subscribe to updates for a shareId
  subscribe(shareId: string, callback: UpdateListener): () => void {
    if (!this.listeners.has(shareId)) {
      this.listeners.set(shareId, new Set());
    }
    
    this.listeners.get(shareId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(shareId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(shareId);
        }
      }
    };
  }

  // Check if there are pending updates (for polling fallback)
  hasUpdate(shareId: string, lastCheck: number): boolean {
    const updateTime = this.updateQueue.get(shareId);
    return updateTime ? updateTime > lastCheck : false;
  }

  // Clear update notification after it's been processed
  clearUpdate(shareId: string): void {
    this.updateQueue.delete(shareId);
  }
}

// Singleton instance - shared across all API routes and client code
export const websocketStore = new WebSocketStore();

// Export for use in API routes
export function notifyShareUpdate(shareId: string): void {
  websocketStore.notifyUpdate(shareId);
}

