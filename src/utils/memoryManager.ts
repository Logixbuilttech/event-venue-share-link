/**
 * Memory Management System for 3D Views
 * Prevents WebGL Context Loss by managing GPU memory efficiently
 */

import * as THREE from 'three';

// Memory tracking
let totalGeometryMemory = 0;
let totalTextureMemory = 0;
const MAX_MEMORY_MB = 400; // Conservative limit to prevent context loss
const WARNING_THRESHOLD = 0.7; // Warn at 70%

// Geometry and material pools
const geometryPool = new Map<string, THREE.BufferGeometry>();
const materialPool = new Map<string, THREE.Material>();
const texturePool = new Map<string, THREE.Texture>();

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  geometryMB: number;
  textureMB: number;
  totalMB: number;
  maxMB: number;
  percentage: number;
  isWarning: boolean;
  isCritical: boolean;
}

/**
 * Get current memory statistics
 */
export function getMemoryStats(): MemoryStats {
  const totalMB = totalGeometryMemory + totalTextureMemory;
  const percentage = (totalMB / MAX_MEMORY_MB) * 100;
  
  return {
    geometryMB: totalGeometryMemory,
    textureMB: totalTextureMemory,
    totalMB,
    maxMB: MAX_MEMORY_MB,
    percentage,
    isWarning: percentage > WARNING_THRESHOLD * 100,
    isCritical: percentage > 90
  };
}

/**
 * Estimate geometry memory usage
 */
export function estimateGeometryMemory(geometry: THREE.BufferGeometry): number {
  let bytes = 0;
  const attributes = geometry.attributes;
  
  for (const key in attributes) {
    const attribute = attributes[key];
    bytes += attribute.count * attribute.itemSize * attribute.array.BYTES_PER_ELEMENT;
  }
  
  if (geometry.index) {
    bytes += geometry.index.count * geometry.index.array.BYTES_PER_ELEMENT;
  }
  
  return bytes / (1024 * 1024); // Convert to MB
}

/**
 * Estimate texture memory usage
 */
export function estimateTextureMemory(texture: THREE.Texture): number {
  if (!texture.image) return 0;
  
  const width = texture.image.width || 0;
  const height = texture.image.height || 0;
  const bytesPerPixel = 4; // RGBA
  
  // Account for mipmaps (adds ~33% more memory)
  const mipmapMultiplier = texture.generateMipmaps ? 1.33 : 1;
  
  return (width * height * bytesPerPixel * mipmapMultiplier) / (1024 * 1024);
}

/**
 * Get or create pooled geometry
 */
export function getPooledGeometry(key: string, creator: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (geometryPool.has(key)) {
    return geometryPool.get(key)!;
  }
  
  const geometry = creator();
  const memory = estimateGeometryMemory(geometry);
  totalGeometryMemory += memory;
  geometryPool.set(key, geometry);
    
  return geometry;
}

/**
 * Get or create pooled material
 */
export function getPooledMaterial(key: string, creator: () => THREE.Material): THREE.Material {
  if (materialPool.has(key)) {
    return materialPool.get(key)!;
  }
  
  const material = creator();
  materialPool.set(key, material);
  
  return material;
}

/**
 * Get or create pooled texture
 */
export function getPooledTexture(key: string, creator: () => THREE.Texture): THREE.Texture {
  if (texturePool.has(key)) {
    return texturePool.get(key)!;
  }
  
  const texture = creator();
  const memory = estimateTextureMemory(texture);
  totalTextureMemory += memory;
  texturePool.set(key, texture);
  
  return texture;
}

/**
 * Dispose of an object and free its memory
 */
export function disposeObject(object: THREE.Object3D): number {
  let freedMemory = 0;
  
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      
      // Dispose geometry (only if not pooled)
      if (mesh.geometry && !geometryPool.has(mesh.geometry.uuid)) {
        const memory = estimateGeometryMemory(mesh.geometry);
        mesh.geometry.dispose();
        freedMemory += memory;
        totalGeometryMemory = Math.max(0, totalGeometryMemory - memory);
      }
      
      // Dispose materials and textures
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          if (!materialPool.has(mat.uuid)) {
            disposeTextures(mat);
            mat.dispose();
          }
        });
      }
    }
  });
  
  return freedMemory;
}

/**
 * Dispose textures from a material
 */
function disposeTextures(material: THREE.Material): void {
  const textures = [
    'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap',
    'envMap', 'alphaMap', 'aoMap', 'displacementMap', 'emissiveMap',
    'metalnessMap', 'roughnessMap'
  ];
  
  textures.forEach((texName) => {
    const texture = (material as any)[texName];
    if (texture && texture.dispose && !texturePool.has(texture.uuid)) {
      const memory = estimateTextureMemory(texture);
      texture.dispose();
      totalTextureMemory = Math.max(0, totalTextureMemory - memory);
    }
  });
}

/**
 * Clear all pools and reset memory tracking
 */
export function clearAllPools(): void {
  // Dispose geometries
  geometryPool.forEach((geometry) => {
    geometry.dispose();
  });
  geometryPool.clear();
  
  // Dispose materials
  materialPool.forEach((material) => {
    material.dispose();
  });
  materialPool.clear();
  
  // Dispose textures
  texturePool.forEach((texture) => {
    texture.dispose();
  });
  texturePool.clear();
  
  totalGeometryMemory = 0;
  totalTextureMemory = 0;
  
}

/**
 * Reduce memory usage by lowering quality
 */
export function reduceMemoryUsage(scene: THREE.Scene): void {
  
  let freed = 0;
  
  scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      const mesh = object as THREE.Mesh;
      
      // Reduce texture quality
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            // Remove expensive maps
            if (mat.normalMap) {
              const memory = estimateTextureMemory(mat.normalMap);
              mat.normalMap.dispose();
              mat.normalMap = null;
              freed += memory;
              totalTextureMemory = Math.max(0, totalTextureMemory - memory);
            }
            if (mat.roughnessMap) {
              mat.roughnessMap = null;
            }
            if (mat.metalnessMap) {
              mat.metalnessMap = null;
            }
            
            // Reduce texture size for remaining maps
            if (mat.map) {
              mat.map.minFilter = THREE.LinearFilter;
              mat.map.magFilter = THREE.LinearFilter;
              mat.map.generateMipmaps = false;
            }
          }
        });
      }
      
      // Disable shadows on some objects
      if (Math.random() > 0.5) { // Keep shadows on 50% of objects
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    }
  });
  
}

/**
 * Check if we should reduce quality automatically
 */
export function shouldReduceQuality(): boolean {
  const stats = getMemoryStats();
  return stats.isCritical;
}

/**
 * Log current memory status
 */
export function logMemoryStatus(): void {
  const stats = getMemoryStats();
  const status = stats.isCritical ? '🔴 CRITICAL' : stats.isWarning ? '⚠️ WARNING' : '✅ OK';

}

