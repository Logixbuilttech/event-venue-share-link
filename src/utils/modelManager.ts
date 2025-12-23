/**
 * Model Manager - Prevents WebGL Context Loss
 * Manages progressive loading and unloading of 3D models based on memory constraints
 */

import * as THREE from 'three';
import { getMemoryStats, shouldReduceQuality, disposeObject } from './memoryManager';

export interface ModelLoadRequest {
  id: string;
  priority: number; // Higher priority loads first
  loadFn: () => Promise<THREE.Object3D | null>;
  onLoaded?: (object: THREE.Object3D) => void;
  onError?: (error: Error) => void;
}

export interface ModelInstance {
  id: string;
  object: THREE.Object3D;
  loadedAt: number;
  lastUsedAt: number;
  memoryEstimate: number;
  priority: number;
}

class ModelManager {
  private queue: ModelLoadRequest[] = [];
  private loadedModels = new Map<string, ModelInstance>();
  private isLoading = false;
  private maxConcurrentLoads = 2; // Load 2 models at a time
  private currentLoads = 0;
  private maxLoadedModels = 50; // Maximum number of loaded models
  private memoryThreshold = 0.75; // Unload when memory exceeds 75%
  private checkInterval: NodeJS.Timeout | null = null;
  private contextLost = false;

  constructor() {
    this.startMonitoring();
  }

  /**
   * Start monitoring memory and context loss
   */
  private startMonitoring(): void {
    // Check memory every 2 seconds
    this.checkInterval = setInterval(() => {
      this.checkMemoryAndUnload();
    }, 2000);

    // Monitor for context loss
    if (typeof window !== 'undefined') {
      window.addEventListener('webglcontextlost', this.handleContextLost.bind(this));
      window.addEventListener('webglcontextrestored', this.handleContextRestored.bind(this));
    }
  }

  /**
   * Handle WebGL context loss
   */
  private handleContextLost(event: Event): void {
    event.preventDefault();
    console.error('🚨 WebGL Context Lost - Model Manager handling recovery...');
    this.contextLost = true;
    
    // Clear all loaded models
    this.clearAll();
    
    // Pause loading
    this.isLoading = false;
    this.currentLoads = 0;
  }

  /**
   * Handle WebGL context restoration
   */
  private handleContextRestored(): void {
    console.log('✅ WebGL Context Restored - Resuming model loading...');
    this.contextLost = false;
    
    // Resume loading after a short delay
    setTimeout(() => {
      this.processQueue();
    }, 500);
  }

  /**
   * Check memory usage and unload least-used models if needed
   */
  private checkMemoryAndUnload(): void {
    if (this.contextLost) return;

    const stats = getMemoryStats();
    
    // If memory is high, unload least-used models
    if (stats.percentage > this.memoryThreshold * 100) {
      this.unloadLeastUsedModels(Math.ceil(this.loadedModels.size * 0.2)); // Unload 20% of models
    }

    // If we have too many loaded models, unload some
    if (this.loadedModels.size > this.maxLoadedModels) {
      const toUnload = this.loadedModels.size - this.maxLoadedModels;
      this.unloadLeastUsedModels(toUnload);
    }
  }

  /**
   * Unload least recently used models
   */
  private unloadLeastUsedModels(count: number): void {
    const models = Array.from(this.loadedModels.values())
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt); // Sort by last used time

    let unloaded = 0;
    for (const model of models) {
      if (unloaded >= count) break;
      
      console.log(`🗑️ Unloading model: ${model.id} (memory: ${model.memoryEstimate.toFixed(2)}MB)`);
      disposeObject(model.object);
      this.loadedModels.delete(model.id);
      unloaded++;
    }

    if (unloaded > 0) {
      console.log(`✅ Unloaded ${unloaded} models to free memory`);
    }
  }

  /**
   * Estimate memory usage of an object
   */
  private estimateMemory(object: THREE.Object3D): number {
    let memory = 0;
    
    object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        
        // Estimate geometry memory
        if (mesh.geometry) {
          const attributes = mesh.geometry.attributes;
          for (const key in attributes) {
            const attr = attributes[key];
            memory += attr.count * attr.itemSize * 4; // Assume float32 (4 bytes)
          }
          if (mesh.geometry.index) {
            memory += mesh.geometry.index.count * 4;
          }
        }
        
        // Estimate texture memory
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((mat: any) => {
            if (mat.map && mat.map.image) {
              const width = mat.map.image.width || 0;
              const height = mat.map.image.height || 0;
              memory += width * height * 4; // RGBA
            }
          });
        }
      }
    });
    
    return memory / (1024 * 1024); // Convert to MB
  }

  /**
   * Request a model to be loaded
   */
  requestLoad(request: ModelLoadRequest): void {
    // Check if already loaded
    if (this.loadedModels.has(request.id)) {
      const instance = this.loadedModels.get(request.id)!;
      instance.lastUsedAt = Date.now();
      if (request.onLoaded) {
        request.onLoaded(instance.object);
      }
      return;
    }

    // Add to queue
    this.queue.push(request);
    this.queue.sort((a, b) => b.priority - a.priority); // Sort by priority

    // Start processing if not already loading
    if (!this.isLoading && !this.contextLost) {
      this.processQueue();
    }
  }

  /**
   * Process the loading queue
   */
  private async processQueue(): Promise<void> {
    if (this.contextLost || this.isLoading || this.queue.length === 0) {
      return;
    }

    this.isLoading = true;

    while (this.queue.length > 0 && this.currentLoads < this.maxConcurrentLoads && !this.contextLost) {
      const request = this.queue.shift();
      if (!request) break;

      this.currentLoads++;
      
      // Check memory before loading
      const stats = getMemoryStats();
      if (stats.isCritical) {
        console.warn('⚠️ Memory critical, pausing model loading');
        this.queue.unshift(request); // Put back in queue
        this.currentLoads--;
        break;
      }

      try {
        const object = await request.loadFn();
        
        if (object && !this.contextLost) {
          const memoryEstimate = this.estimateMemory(object);
          
          const instance: ModelInstance = {
            id: request.id,
            object,
            loadedAt: Date.now(),
            lastUsedAt: Date.now(),
            memoryEstimate,
            priority: request.priority
          };

          this.loadedModels.set(request.id, instance);
          
          if (request.onLoaded) {
            request.onLoaded(object);
          }
        }
      } catch (error) {
        console.error(`❌ Error loading model ${request.id}:`, error);
        if (request.onError) {
          request.onError(error as Error);
        }
      } finally {
        this.currentLoads--;
      }

      // Small delay between loads to prevent overwhelming GPU
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isLoading = false;

    // Continue processing if queue is not empty
    if (this.queue.length > 0 && !this.contextLost) {
      setTimeout(() => this.processQueue(), 200);
    }
  }

  /**
   * Get a loaded model
   */
  getModel(id: string): THREE.Object3D | null {
    const instance = this.loadedModels.get(id);
    if (instance) {
      instance.lastUsedAt = Date.now();
      return instance.object;
    }
    return null;
  }

  /**
   * Check if a model is loaded
   */
  isLoaded(id: string): boolean {
    return this.loadedModels.has(id);
  }

  /**
   * Unload a specific model
   */
  unloadModel(id: string): void {
    const instance = this.loadedModels.get(id);
    if (instance) {
      disposeObject(instance.object);
      this.loadedModels.delete(id);
    }
  }

  /**
   * Clear all loaded models
   */
  clearAll(): void {
    this.loadedModels.forEach((instance) => {
      disposeObject(instance.object);
    });
    this.loadedModels.clear();
    this.queue = [];
    this.currentLoads = 0;
    this.isLoading = false;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      loaded: this.loadedModels.size,
      queued: this.queue.length,
      loading: this.currentLoads,
      contextLost: this.contextLost,
      totalMemory: Array.from(this.loadedModels.values())
        .reduce((sum, m) => sum + m.memoryEstimate, 0)
    };
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.clearAll();
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('webglcontextlost', this.handleContextLost.bind(this));
      window.removeEventListener('webglcontextrestored', this.handleContextRestored.bind(this));
    }
  }
}

// Singleton instance
export const modelManager = new ModelManager();

// Export for cleanup on unmount
export function destroyModelManager(): void {
  modelManager.destroy();
}

