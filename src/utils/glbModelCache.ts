import { useGLTF } from '@react-three/drei';
import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Shared GLB Model Cache
 * Prevents loading the same GLB file multiple times, reducing memory usage
 */
class GLBModelCache {
  private cache: Map<string, { scene: THREE.Group; refCount: number; lastUsed: number }> = new Map();
  private maxCacheSize = 20; // Maximum number of models to cache
  private maxAge = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Get a model from cache or load it
   */
  getModel(glbPath: string): THREE.Group | null {
    const key = glbPath;
    
    // Check cache first
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;
      entry.refCount++;
      entry.lastUsed = Date.now();
      return entry.scene;
    }

    // If cache is full, remove oldest unused entry
    if (this.cache.size >= this.maxCacheSize) {
      this.cleanup();
    }

    return null;
  }

  /**
   * Add a model to cache
   */
  addModel(glbPath: string, scene: THREE.Group): void {
    const key = glbPath;
    
    if (!this.cache.has(key)) {
      this.cache.set(key, {
        scene: scene.clone(true), // Clone for cache
        refCount: 1,
        lastUsed: Date.now()
      });
    } else {
      const entry = this.cache.get(key)!;
      entry.refCount++;
      entry.lastUsed = Date.now();
    }
  }

  /**
   * Release a model reference
   */
  releaseModel(glbPath: string): void {
    const key = glbPath;
    const entry = this.cache.get(key);
    
    if (entry) {
      entry.refCount--;
      entry.lastUsed = Date.now();
      
      // If no references and old, remove from cache
      if (entry.refCount <= 0 && Date.now() - entry.lastUsed > this.maxAge) {
        this.disposeModel(entry.scene);
        this.cache.delete(key);
      }
    }
  }

  /**
   * Cleanup old/unused entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.refCount <= 0 && now - entry.lastUsed > this.maxAge) {
        toRemove.push(key);
      }
    }

    // If still full, remove least recently used
    if (this.cache.size >= this.maxCacheSize) {
      const sorted = Array.from(this.cache.entries())
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      
      const toRemoveCount = this.cache.size - this.maxCacheSize + 1;
      for (let i = 0; i < toRemoveCount && i < sorted.length; i++) {
        if (sorted[i][1].refCount <= 0) {
          toRemove.push(sorted[i][0]);
        }
      }
    }

    toRemove.forEach(key => {
      const entry = this.cache.get(key);
      if (entry) {
        this.disposeModel(entry.scene);
        this.cache.delete(key);
      }
    });
  }

  /**
   * Dispose of a model and free memory
   */
  private disposeModel(scene: THREE.Group): void {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((mat) => {
            const anyMat = mat as any;
            // Dispose all textures
            ['map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 
             'envMap', 'aoMap', 'emissiveMap', 'metalnessMap', 'roughnessMap'].forEach(prop => {
              if (anyMat[prop]?.dispose) anyMat[prop].dispose();
            });
            mat.dispose();
          });
        }
      }
    });
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    for (const [key, entry] of this.cache.entries()) {
      this.disposeModel(entry.scene);
    }
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        path: key,
        refCount: entry.refCount,
        age: Date.now() - entry.lastUsed
      }))
    };
  }
}

// Singleton instance
const modelCache = new GLBModelCache();

/**
 * Hook to use a cached GLB model
 * This ensures models are only loaded once and shared across instances
 * Note: useGLTF from drei already caches, but we track references for cleanup
 */
export function useCachedGLB(glbPath: string, instanceId?: string | number) {
  const gltf = useGLTF(`/${glbPath}`);
  
  // Register this instance
  useEffect(() => {
    if (gltf.scene) {
      modelCache.addModel(glbPath, gltf.scene);
    }
    return () => {
      modelCache.releaseModel(glbPath);
    };
  }, [gltf.scene, glbPath]);

  // Return the scene directly (drei's useGLTF already handles caching)
  // We just track references for memory management
  return gltf.scene;
}

/**
 * Preload GLB models
 */
export function preloadGLBModels(glbPaths: string[]): void {
  glbPaths.forEach(path => {
    if (path) {
      useGLTF.preload(`/${path}`);
    }
  });
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  return modelCache.getStats();
}

/**
 * Clear the cache (use with caution)
 */
export function clearModelCache(): void {
  modelCache.clear();
}

export default modelCache;

