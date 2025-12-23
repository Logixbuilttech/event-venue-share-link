import * as THREE from 'three';

/**
 * Optimize textures to reduce memory usage
 * Reduces texture quality and size for better performance
 */
export function optimizeTexture(texture: THREE.Texture, maxSize: number = 1024): THREE.Texture {
  if (!texture.image) return texture;
  
  const width = texture.image.width || texture.image.videoWidth || 0;
  const height = texture.image.height || texture.image.videoHeight || 0;
  
  // If texture is larger than maxSize, we'll use lower quality filtering
  if (width > maxSize || height > maxSize) {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; // Disable mipmaps to save memory
  } else {
    // Use linear filtering for smaller textures (faster, less memory)
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  
  // Note: Texture format is set by Three.js automatically based on image data
  // We don't need to change it manually as RGBFormat was removed in newer Three.js versions
  
  return texture;
}

/**
 * Optimize all textures in a material
 */
export function optimizeMaterialTextures(material: THREE.Material): void {
  const mat = material as any;
  const textureProps = [
    'map', 'normalMap', 'bumpMap', 'roughnessMap', 
    'metalnessMap', 'aoMap', 'emissiveMap', 'lightMap'
  ];
  
  textureProps.forEach(prop => {
    if (mat[prop] && mat[prop] instanceof THREE.Texture) {
      optimizeTexture(mat[prop]);
    }
  });
}

/**
 * Remove expensive texture maps from material to save memory
 */
export function removeExpensiveMaps(material: THREE.Material): void {
  const mat = material as any;
  
  // Remove maps that consume a lot of memory
  mat.normalMap = null;
  mat.bumpMap = null;
  mat.roughnessMap = null;
  mat.metalnessMap = null;
  mat.aoMap = null;
  mat.envMap = null;
  mat.lightMap = null;
  
  // Keep only the base color map (most important)
  // Keep emissive map if it exists (usually small)
  
  if (material instanceof THREE.MeshStandardMaterial || 
      material instanceof THREE.MeshPhysicalMaterial) {
    material.needsUpdate = true;
  }
}

