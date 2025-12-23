import { useGLTF } from '@react-three/drei';
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';

// Memory management tracking
let totalMemoryUsed = 0;
const MAX_MEMORY_MB = 512; // Maximum memory before triggering optimizations

/**
 * Estimate memory usage of a geometry
 */
function estimateGeometryMemory(geometry: THREE.BufferGeometry): number {
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
 * Simple GLB loader with proper cleanup and memory tracking
 */
export function useSimpleGLB(glbPath: string, instanceId?: string | number) {
  const gltf = useGLTF(`/${glbPath}`);

  // Create a simple clone of the scene
  const clonedScene = useMemo(() => {
    try {
      const clone = gltf.scene.clone(true);
      let sceneMemory = 0;

      // Optimize for low memory usage
      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          
          // Disable shadows in walk mode for performance
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          
          // Track memory usage
          if (mesh.geometry) {
            sceneMemory += estimateGeometryMemory(mesh.geometry);
            
            // Remove unnecessary attributes
            mesh.geometry.deleteAttribute('uv2'); // Remove lightmap UVs
            
            // Optimize geometry
            if (!mesh.geometry.boundingSphere) {
              mesh.geometry.computeBoundingSphere();
            }
            if (!mesh.geometry.boundingBox) {
              mesh.geometry.computeBoundingBox();
            }
          }
          
          // Reduce material complexity
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((mat) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                // Reduce material quality for walk mode
                mat.roughness = 0.8;
                mat.metalness = 0;
                mat.envMapIntensity = 0;
                mat.needsUpdate = false;
                
                // Disable expensive material features
                if (mat.map) mat.map.minFilter = THREE.LinearFilter;
                if (mat.normalMap) mat.normalMap = null; // Remove normal maps for walk mode
              }
            });
          }
        }
      });

      totalMemoryUsed += sceneMemory;
      console.log(`[Memory] Loaded ${glbPath}: ${sceneMemory.toFixed(2)} MB | Total: ${totalMemoryUsed.toFixed(2)} MB`);

      return clone;
    } catch (error) {
      console.error('Error cloning GLB scene:', glbPath, error);
      return null;
    }
  }, [gltf.scene, instanceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clonedScene) {
        const memoryFreed = disposeObject(clonedScene);
        totalMemoryUsed = Math.max(0, totalMemoryUsed - memoryFreed);
        console.log(`[Memory] Freed: ${memoryFreed.toFixed(2)} MB | Remaining: ${totalMemoryUsed.toFixed(2)} MB`);
      }
    };
  }, [clonedScene]);

  return clonedScene;
}

/**
 * Properly dispose of Three.js objects to free memory
 * Returns the estimated amount of memory freed in MB
 */
function disposeObject(obj: THREE.Object3D): number {
  let memoryFreed = 0;
  
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      
      // Dispose geometry
      if (mesh.geometry) {
        memoryFreed += estimateGeometryMemory(mesh.geometry);
        mesh.geometry.dispose();
      }
      
      // Dispose materials
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          // Dispose textures if they exist
          const anyMat = mat as any;
          if (anyMat.map?.dispose) anyMat.map.dispose();
          if (anyMat.lightMap?.dispose) anyMat.lightMap.dispose();
          if (anyMat.bumpMap?.dispose) anyMat.bumpMap.dispose();
          if (anyMat.normalMap?.dispose) anyMat.normalMap.dispose();
          if (anyMat.specularMap?.dispose) anyMat.specularMap.dispose();
          if (anyMat.envMap?.dispose) anyMat.envMap.dispose();
          if (anyMat.aoMap?.dispose) anyMat.aoMap.dispose();
          if (anyMat.emissiveMap?.dispose) anyMat.emissiveMap.dispose();
          if (anyMat.metalnessMap?.dispose) anyMat.metalnessMap.dispose();
          if (anyMat.roughnessMap?.dispose) anyMat.roughnessMap.dispose();
          
          mat.dispose();
        });
      }
    }
  });
  
  return memoryFreed;
}

/**
 * Get current memory usage
 */
export function getMemoryUsage(): number {
  return totalMemoryUsed;
}

/**
 * Check if we're approaching memory limits
 */
export function isMemoryLimitApproached(): boolean {
  return totalMemoryUsed > MAX_MEMORY_MB * 0.8; // 80% threshold
}

/**
 * Preload GLB models for better performance
 */
export function preloadGLB(glbPath: string) {
  if (glbPath) {
    useGLTF.preload(`/${glbPath}`);
  }
}

