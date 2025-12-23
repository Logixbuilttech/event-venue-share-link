// Real-time update manager using Server-Sent Events (SSE)
// Works with Next.js API routes without needing a custom server
'use client';

type UpdateCallback = (shareId: string) => void;

class RealtimeManager {
  private eventSources: Map<string, EventSource> = new Map();
  private listeners: Map<string, Set<UpdateCallback>> = new Map();

  private getEventSourceUrl(shareId: string): string {
    return `/api/ws?shareId=${encodeURIComponent(shareId)}`;
  }

  subscribe(shareId: string, callback: UpdateCallback): () => void {
    if (!this.listeners.has(shareId)) {
      this.listeners.set(shareId, new Set());
    }
    
    this.listeners.get(shareId)!.add(callback);

    // Create or reuse EventSource for this shareId
    if (!this.eventSources.has(shareId)) {
      const eventSource = new EventSource(this.getEventSourceUrl(shareId));
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'config-updated' && data.shareId === shareId) {
            // Notify all listeners for this shareId
            const callbacks = this.listeners.get(shareId);
            if (callbacks) {
              callbacks.forEach(cb => cb(shareId));
            }
          }
        } catch (error) {
          console.error('[Realtime] Error parsing message:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[Realtime] EventSource error:', error);
        // EventSource will automatically reconnect
      };

      this.eventSources.set(shareId, eventSource);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(shareId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          // Close EventSource if no more listeners
          const eventSource = this.eventSources.get(shareId);
          if (eventSource) {
            eventSource.close();
            this.eventSources.delete(shareId);
          }
          this.listeners.delete(shareId);
        }
      }
    };
  }

  disconnect(): void {
    // Close all EventSources
    this.eventSources.forEach((eventSource) => {
      eventSource.close();
    });
    this.eventSources.clear();
    this.listeners.clear();
  }
}

// Singleton instance
export const realtimeManager = new RealtimeManager();

// Hook for React components
export function useWebSocket(shareId: string | null, onUpdate: () => void) {
  if (typeof window === 'undefined') {
    // Server-side: do nothing
    return;
  }

  // Import React hooks at runtime to avoid SSR issues
  const { useEffect, useRef } = require('react');
  const unsubscribeRef = useRef(null);
  const onUpdateRef = useRef(onUpdate);

  // Keep callback ref updated
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!shareId) {
      return;
    }

    // Subscribe to updates for this shareId using SSE
    unsubscribeRef.current = realtimeManager.subscribe(shareId, () => {
      onUpdateRef.current();
    });

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [shareId]);
}

