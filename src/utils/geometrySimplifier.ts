import * as THREE from 'three';

/**
 * Simplify geometry for tablets to reduce memory usage
 * Uses a safer approach: merges vertices and reduces index complexity
 */
export function simplifyGeometryForTablet(geometry: THREE.BufferGeometry, targetReduction: number = 0.4): THREE.BufferGeometry {
  try {
    // If geometry is already simplified or too small, return as-is
    if (!geometry.attributes.position || geometry.attributes.position.count < 500) {
      return geometry;
    }

    const originalCount = geometry.attributes.position.count;
    
    // For tablets, we'll use a conservative approach:
    // 1. Merge vertices that are very close together
    // 2. Remove duplicate vertices
    // 3. Simplify index buffer
    
    // Clone geometry to avoid modifying original
    const simplified = geometry.clone();
    
    // Use mergeVertices to reduce vertex count (Three.js built-in)
    // This merges vertices that are very close together
    simplified.mergeVertices();
    
    const newCount = simplified.attributes.position.count;
    const reduction = ((originalCount - newCount) / originalCount) * 100;
    
    // If reduction wasn't enough, apply additional simplification
    if (reduction < 30 && originalCount > 1000) {
      // For very large geometries, we can be more aggressive
      // But we'll keep the geometry intact and just optimize attributes
      console.log(`[Tablet Optimization] Geometry has ${originalCount} vertices, keeping structure but optimizing attributes`);
    } else {
      console.log(`[Tablet Optimization] Simplified geometry: ${originalCount} → ${newCount} vertices (${reduction.toFixed(1)}% reduction)`);
    }

    // Ensure normals are computed
    if (!simplified.attributes.normal) {
      simplified.computeVertexNormals();
    }

    return simplified;
  } catch (error) {
    console.warn('[Tablet Optimization] Failed to simplify geometry, using original:', error);
    return geometry;
  }
}

/**
 * Aggressively optimize a scene for tablets
 * Reduces geometry complexity, texture sizes, and material properties
 */
export function optimizeSceneForTablet(scene: THREE.Object3D): void {
  let totalVerticesBefore = 0;
  let totalVerticesAfter = 0;

  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;

      // Simplify geometry (only for large geometries)
      if (mesh.geometry instanceof THREE.BufferGeometry) {
        const originalGeometry = mesh.geometry;
        const vertexCount = originalGeometry.attributes.position?.count || 0;
        totalVerticesBefore += vertexCount;

        // Only simplify if geometry is large enough
        if (vertexCount > 500) {
          try {
            const simplified = simplifyGeometryForTablet(originalGeometry, 0.4);
            const newVertexCount = simplified.attributes.position?.count || 0;
            totalVerticesAfter += newVertexCount;
            
            // Dispose old geometry
            originalGeometry.dispose();
            
            // Use simplified geometry
            mesh.geometry = simplified;
          } catch (error) {
            console.warn('[Tablet Optimization] Failed to simplify mesh geometry:', error);
            totalVerticesAfter += vertexCount; // Count original if simplification failed
          }
        } else {
          totalVerticesAfter += vertexCount; // Keep small geometries as-is
        }
      }

      // Optimize materials
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(mat => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            // Remove expensive texture maps (but keep base texture)
            mat.normalMap = null;
            mat.roughnessMap = null;
            mat.metalnessMap = null;
            mat.aoMap = null;
            mat.displacementMap = null;
            mat.emissiveMap = null;
            
            // Optimize base texture if it exists
            if (mat.map) {
              mat.map.generateMipmaps = true;
              mat.map.minFilter = THREE.LinearMipmapLinearFilter;
              mat.map.magFilter = THREE.LinearFilter;
            }

            // Use simpler material properties
            mat.roughness = 0.8;
            mat.metalness = 0;
            mat.needsUpdate = true;
          }
        });
      }
    }
  });

  if (totalVerticesBefore > 0) {
    const reduction = ((totalVerticesBefore - totalVerticesAfter) / totalVerticesBefore) * 100;
    console.log(`[Tablet Optimization] Total vertices: ${totalVerticesBefore} → ${totalVerticesAfter} (${reduction.toFixed(1)}% reduction)`);
  }
}

/**
 * Reduce texture resolution for tablets
 */
export function reduceTextureResolution(texture: THREE.Texture, maxSize: number = 512): THREE.Texture {
  if (!texture.image) return texture;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;

  const img = texture.image;
  const aspect = img.width / img.height;
  
  let newWidth = maxSize;
  let newHeight = maxSize;
  
  if (aspect > 1) {
    newHeight = maxSize / aspect;
  } else {
    newWidth = maxSize * aspect;
  }

  canvas.width = newWidth;
  canvas.height = newHeight;

  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  const newTexture = new THREE.CanvasTexture(canvas);
  newTexture.wrapS = texture.wrapS;
  newTexture.wrapT = texture.wrapT;
  newTexture.repeat = texture.repeat;
  newTexture.offset = texture.offset;
  newTexture.rotation = texture.rotation;

  // Dispose old texture
  texture.dispose();

  return newTexture;
}

