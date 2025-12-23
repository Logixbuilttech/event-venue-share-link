import * as THREE from 'three';

/**
 * Shared Model Resources Manager
 * Stores geometries and materials that can be reused across multiple instances
 * This dramatically reduces memory usage for repeated models (booths, cameraman, etc.)
 */
class SharedModelResources {
  private geometries: Map<string, THREE.BufferGeometry> = new Map();
  private materials: Map<string, THREE.Material> = new Map();
  private textures: Map<string, THREE.Texture> = new Map();

  /**
   * Get or create a shared geometry
   */
  getGeometry(key: string, createFn: () => THREE.BufferGeometry): THREE.BufferGeometry {
    if (!this.geometries.has(key)) {
      const geometry = createFn();
      this.geometries.set(key, geometry);
    }
    return this.geometries.get(key)!;
  }

  /**
   * Get or create a shared material
   */
  getMaterial(key: string, createFn: () => THREE.Material): THREE.Material {
    if (!this.materials.has(key)) {
      const material = createFn();
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }

  /**
   * Get or create a shared texture
   */
  getTexture(key: string, createFn: () => THREE.Texture): THREE.Texture {
    if (!this.textures.has(key)) {
      const texture = createFn();
      this.textures.set(key, texture);
    }
    return this.textures.get(key)!;
  }

  /**
   * Extract and cache geometries and materials from a scene
   * Returns a lightweight clone that shares geometries/materials
   */
  createSharedInstance(scene: THREE.Object3D, instanceKey: string): THREE.Group {
    const group = new THREE.Group();
    const processed = new Set<THREE.Object3D>(); // Track processed objects to prevent infinite recursion
    
    // Helper function to process a single object
    const processObject = (obj: THREE.Object3D, parentGroup: THREE.Group) => {
      // Skip if already processed
      if (processed.has(obj)) return;
      processed.add(obj);
      
      // Check for SkinnedMesh FIRST - it needs special handling
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        const sourceSkinned = obj as THREE.SkinnedMesh;
        // For SkinnedMesh, we need to preserve the skeleton and bindMatrix
        // Deep clone to preserve skeleton structure - this preserves geometry bindings
        const skinnedClone = sourceSkinned.clone(true);
        
        // Get shared material for memory efficiency
        const material = sourceSkinned.material;
        const materialKey = `${instanceKey}_material_${Array.isArray(material) 
          ? material.map(m => m.uuid).join('_') 
          : material.uuid}`;
        
        let sharedMaterial: THREE.Material | THREE.Material[];
        if (Array.isArray(material)) {
          sharedMaterial = material.map((mat, idx) => 
            this.getMaterial(`${materialKey}_${idx}`, () => {
              const cloned = mat.clone();
              const anyMat = cloned as any;
              if (anyMat.map) {
                const textureKey = `${instanceKey}_texture_${anyMat.map.uuid}`;
                anyMat.map = this.getTexture(textureKey, () => {
                  const tex = anyMat.map.clone();
                  tex.minFilter = THREE.LinearFilter;
                  tex.magFilter = THREE.LinearFilter;
                  return tex;
                });
              }
              if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
                anyMat.normalMap = null;
                anyMat.bumpMap = null;
                anyMat.roughnessMap = null;
                anyMat.metalnessMap = null;
                anyMat.aoMap = null;
                anyMat.envMap = null;
                anyMat.lightMap = null;
                cloned.needsUpdate = true;
              }
              return cloned;
            })
          );
        } else {
          sharedMaterial = this.getMaterial(materialKey, () => {
            const cloned = material.clone();
            const anyMat = cloned as any;
            if (anyMat.map) {
              const textureKey = `${instanceKey}_texture_${anyMat.map.uuid}`;
              anyMat.map = this.getTexture(textureKey, () => {
                const tex = anyMat.map.clone();
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                return tex;
              });
            }
            if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
              anyMat.normalMap = null;
              anyMat.bumpMap = null;
              anyMat.roughnessMap = null;
              anyMat.metalnessMap = null;
              anyMat.aoMap = null;
              anyMat.envMap = null;
              anyMat.lightMap = null;
              cloned.needsUpdate = true;
            }
            return cloned;
          });
        }
        
        // Use shared material but keep cloned geometry (with skeleton bindings)
        skinnedClone.material = sharedMaterial;
        
        // Ensure skeleton is properly bound and updated
        if (skinnedClone.skeleton) {
          skinnedClone.skeleton.update();
        }
        
        // Copy transform properties
        skinnedClone.position.copy(sourceSkinned.position);
        skinnedClone.rotation.copy(sourceSkinned.rotation);
        skinnedClone.scale.copy(sourceSkinned.scale);
        skinnedClone.castShadow = sourceSkinned.castShadow;
        skinnedClone.receiveShadow = sourceSkinned.receiveShadow;
        skinnedClone.matrix.copy(sourceSkinned.matrix);
        skinnedClone.matrixAutoUpdate = sourceSkinned.matrixAutoUpdate;
        skinnedClone.userData = { ...sourceSkinned.userData };
        
        parentGroup.add(skinnedClone);
        return;
      }
      
      // Handle regular Mesh objects
      if ((obj as THREE.Mesh).isMesh) {
        const sourceMesh = obj as THREE.Mesh;
        const geometry = sourceMesh.geometry;
        const material = sourceMesh.material;
        
        // Create unique keys for this geometry/material combination
        // Use the original geometry/material UUID to share across instances
        const geometryKey = `${instanceKey}_geometry_${geometry.uuid}`;
        const materialKey = `${instanceKey}_material_${Array.isArray(material) 
          ? material.map(m => m.uuid).join('_') 
          : material.uuid}`;
        
        // Get or create shared geometry (clone once, then share)
        const sharedGeometry = this.getGeometry(geometryKey, () => {
          // Clone geometry once and share it across all instances
          // This is safe because geometries are read-only during rendering
          const cloned = geometry.clone();
          return cloned;
        });
        
        // Get or create shared material(s) (clone once, then share)
        let sharedMaterial: THREE.Material | THREE.Material[];
        if (Array.isArray(material)) {
          sharedMaterial = material.map((mat, idx) => 
            this.getMaterial(`${materialKey}_${idx}`, () => {
              // Clone material once and share it
              // This dramatically reduces memory usage for repeated models
              const cloned = mat.clone();
              const anyMat = cloned as any;
              
              // Optimize textures - reduce size and quality to save memory
              if (anyMat.map) {
                const textureKey = `${instanceKey}_texture_${anyMat.map.uuid}`;
                anyMat.map = this.getTexture(textureKey, () => {
                  const tex = anyMat.map.clone();
                  // Reduce texture size if it's too large (max 1024x1024)
                  if (tex.image && (tex.image.width > 1024 || tex.image.height > 1024)) {
                    // Use lower quality filtering to save memory
                    tex.minFilter = THREE.LinearFilter;
                    tex.magFilter = THREE.LinearFilter;
                    tex.generateMipmaps = false; // Disable mipmaps to save memory
                  } else {
                    tex.minFilter = THREE.LinearFilter;
                    tex.magFilter = THREE.LinearFilter;
                  }
                  return tex;
                });
              }
              
              // Remove expensive material features to save memory
              if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
                // Disable normal maps, bump maps, etc. to save memory
                anyMat.normalMap = null;
                anyMat.bumpMap = null;
                anyMat.roughnessMap = null;
                anyMat.metalnessMap = null;
                anyMat.aoMap = null;
                anyMat.envMap = null;
                anyMat.lightMap = null;
                cloned.needsUpdate = true;
              }
              
              return cloned;
            })
          );
        } else {
          sharedMaterial = this.getMaterial(materialKey, () => {
            // Clone material once and share it
            const cloned = material.clone();
            const anyMat = cloned as any;
            
            // Optimize textures - reduce size and quality to save memory
            if (anyMat.map) {
              const textureKey = `${instanceKey}_texture_${anyMat.map.uuid}`;
              anyMat.map = this.getTexture(textureKey, () => {
                const tex = anyMat.map.clone();
                // Reduce texture size if it's too large (max 1024x1024)
                if (tex.image && (tex.image.width > 1024 || tex.image.height > 1024)) {
                  // Use lower quality filtering to save memory
                  tex.minFilter = THREE.LinearFilter;
                  tex.magFilter = THREE.LinearFilter;
                  tex.generateMipmaps = false; // Disable mipmaps to save memory
                } else {
                  tex.minFilter = THREE.LinearFilter;
                  tex.magFilter = THREE.LinearFilter;
                }
                return tex;
              });
            }
            
            // Remove expensive material features to save memory
            if (cloned instanceof THREE.MeshStandardMaterial || cloned instanceof THREE.MeshPhysicalMaterial) {
              // Disable normal maps, bump maps, etc. to save memory
              anyMat.normalMap = null;
              anyMat.bumpMap = null;
              anyMat.roughnessMap = null;
              anyMat.metalnessMap = null;
              anyMat.aoMap = null;
              anyMat.envMap = null;
              anyMat.lightMap = null;
              cloned.needsUpdate = true;
            }
            
            return cloned;
          });
        }

        // Create new mesh with shared geometry and material
        const newMesh = new THREE.Mesh(sharedGeometry, sharedMaterial);
        newMesh.position.copy(sourceMesh.position);
        newMesh.rotation.copy(sourceMesh.rotation);
        newMesh.scale.copy(sourceMesh.scale);
        newMesh.castShadow = sourceMesh.castShadow;
        newMesh.receiveShadow = sourceMesh.receiveShadow;
        newMesh.matrix.copy(sourceMesh.matrix);
        newMesh.matrixAutoUpdate = sourceMesh.matrixAutoUpdate;
        
        // Copy user data
        newMesh.userData = { ...sourceMesh.userData };
        
        parentGroup.add(newMesh);
      } else if (obj instanceof THREE.Group || obj instanceof THREE.Object3D) {
        // Create a new group for this object
        const childGroup = new THREE.Group();
        childGroup.position.copy(obj.position);
        childGroup.rotation.copy(obj.rotation);
        childGroup.scale.copy(obj.scale);
        childGroup.name = obj.name;
        childGroup.userData = { ...obj.userData };
        
        // Process children directly without recursion
        if (obj.children && obj.children.length > 0) {
          obj.children.forEach(child => {
            processObject(child, childGroup);
          });
        }
        
        parentGroup.add(childGroup);
      }
    };
    
    // Process the root scene and its direct children
    if (scene.children && scene.children.length > 0) {
      scene.children.forEach(child => {
        processObject(child, group);
      });
    }
    
    // Also process the scene itself if it's a mesh
    if ((scene as THREE.Mesh).isMesh) {
      processObject(scene, group);
    }
    
    return group;
  }

  /**
   * Create a lightweight clone that shares geometries and materials
   * Only clones the object structure, not the heavy data
   */
  createLightweightClone(scene: THREE.Object3D, modelKey: string): THREE.Group {
    return this.createSharedInstance(scene, modelKey);
  }

  /**
   * Clear all cached resources
   */
  clear(): void {
    // Dispose geometries
    this.geometries.forEach(geometry => geometry.dispose());
    this.geometries.clear();
    
    // Dispose materials
    this.materials.forEach(material => {
      const anyMat = material as any;
      // Dispose textures
      ['map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap', 
       'envMap', 'aoMap', 'emissiveMap', 'metalnessMap', 'roughnessMap'].forEach(prop => {
        if (anyMat[prop]?.dispose) anyMat[prop].dispose();
      });
      material.dispose();
    });
    this.materials.clear();
    
    // Dispose textures
    this.textures.forEach(texture => texture.dispose());
    this.textures.clear();
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      geometries: this.geometries.size,
      materials: this.materials.size,
      textures: this.textures.size
    };
  }
}

// Singleton instance
const sharedResources = new SharedModelResources();

/**
 * Create a lightweight clone of a scene that shares geometries and materials
 * This dramatically reduces memory usage for repeated models
 */
export function createSharedModelInstance(
  scene: THREE.Object3D, 
  modelKey: string
): THREE.Group {
  return sharedResources.createLightweightClone(scene, modelKey);
}

/**
 * Clear all shared resources (use with caution)
 */
export function clearSharedResources(): void {
  sharedResources.clear();
}

/**
 * Get resource statistics
 */
export function getSharedResourceStats() {
  return sharedResources.getStats();
}

export default sharedResources;

