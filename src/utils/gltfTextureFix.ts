import * as THREE from 'three';

/**
 * Fix texture loading issues in GLB models
 * Handles blob URL errors and ensures textures are loaded properly
 */
export function fixGLTFTextures(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        
        materials.forEach((material) => {
          const mat = material as any;
          
          // List of texture properties to check
          const textureProps = [
            'map',
            'normalMap',
            'bumpMap',
            'roughnessMap',
            'metalnessMap',
            'aoMap',
            'emissiveMap',
            'lightMap',
            'envMap'
          ];
          
          textureProps.forEach((prop) => {
            const texture = mat[prop] as THREE.Texture | null;
            
            if (texture && texture instanceof THREE.Texture) {
              // Check if texture source is a blob URL
              let hasBlobUrl = false;
              
              if (texture.image) {
                // Check various ways blob URLs might be stored
                const image = texture.image as any;
                const source = image.src || image.currentSrc || texture.source?.data?.src || '';
                
                if (typeof source === 'string' && source.startsWith('blob:')) {
                  hasBlobUrl = true;
                  console.warn(`⚠️ Found blob URL texture in ${prop}, removing to prevent loading errors`);
                }
              }
              
              // Also check the texture's source data
              if (!hasBlobUrl && texture.source) {
                const sourceData = texture.source.data;
                if (sourceData && typeof sourceData === 'string' && sourceData.startsWith('blob:')) {
                  hasBlobUrl = true;
                  console.warn(`⚠️ Found blob URL in texture source for ${prop}, removing to prevent loading errors`);
                }
              }
              
              if (hasBlobUrl) {
                // Remove the texture to prevent loading errors
                mat[prop] = null;
                
                // If it's the base map, set a fallback color
                if (prop === 'map') {
                  if (material instanceof THREE.MeshStandardMaterial || 
                      material instanceof THREE.MeshPhysicalMaterial ||
                      material instanceof THREE.MeshBasicMaterial ||
                      material instanceof THREE.MeshLambertMaterial ||
                      material instanceof THREE.MeshPhongMaterial) {
                    material.color.setHex(0xcccccc); // Light gray fallback
                  }
                }
              } else if (texture.image instanceof Image || texture.image instanceof HTMLImageElement) {
                // Check if image failed to load
                const img = texture.image as HTMLImageElement;
                
                if (!img.complete || img.naturalWidth === 0) {
                  // Set up error handler for images that haven't loaded yet
                  const originalOnError = img.onerror;
                  img.onerror = (error) => {
                    console.warn(`⚠️ Texture ${prop} failed to load, using fallback`);
                    mat[prop] = null;
                    
                    if (prop === 'map') {
                      if (material instanceof THREE.MeshStandardMaterial || 
                          material instanceof THREE.MeshPhysicalMaterial ||
                          material instanceof THREE.MeshBasicMaterial ||
                          material instanceof THREE.MeshLambertMaterial ||
                          material instanceof THREE.MeshPhongMaterial) {
                        material.color.setHex(0xcccccc);
                      }
                    }
                    
                    // Call original error handler if it exists
                    if (originalOnError) {
                      originalOnError.call(img, error);
                    }
                  };
                }
              }
            }
          });
          
          // Update material if needed
          if (material instanceof THREE.MeshStandardMaterial || 
              material instanceof THREE.MeshPhysicalMaterial) {
            material.needsUpdate = true;
          }
        });
      }
    }
  });
}

/**
 * Process GLTF scene and fix any texture issues
 * Call this after loading a GLB model
 */
export function processGLTFScene(gltf: { scene: THREE.Object3D }): void {
  try {
    fixGLTFTextures(gltf.scene);
  } catch (error) {
    console.error('Error processing GLTF textures:', error);
  }
}

// Track if error handler is already set up
let errorHandlerSetup = false;

/**
 * Setup global error handler for GLTFLoader texture loading errors
 * This prevents blob URL errors from breaking the app
 */
export function setupGLTFErrorHandler(): void {
  // Only setup once
  if (errorHandlerSetup || typeof window === 'undefined') {
    return;
  }
  
  errorHandlerSetup = true;
  
  // Store original console.error to intercept GLTFLoader errors
  const originalError = console.error;
  
  console.error = (...args: any[]) => {
    // Check if this is a GLTFLoader texture error with blob URL
    const message = args.join(' ');
    if (message.includes('THREE.GLTFLoader') && 
        (message.includes("Couldn't load texture") || message.includes('load texture')) && 
        message.includes('blob:')) {
      // Suppress blob URL texture errors - we'll handle them in fixGLTFTextures
      // Don't log to avoid console spam - this is expected behavior
      return;
    }
    
    // For all other errors, use original console.error
    originalError.apply(console, args);
  };
  
  // Also handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.toString() || '';
    if (reason.includes('THREE.GLTFLoader') && 
        (reason.includes("Couldn't load texture") || reason.includes('load texture')) && 
        reason.includes('blob:')) {
      // Suppress blob URL texture promise rejections
      event.preventDefault();
    }
  }, { once: false });
  
  // Also catch errors in the error event
  window.addEventListener('error', (event) => {
    const message = event.message || '';
    if (message.includes('THREE.GLTFLoader') && 
        (message.includes("Couldn't load texture") || message.includes('load texture')) && 
        message.includes('blob:')) {
      // Suppress blob URL texture error events
      event.preventDefault();
    }
  }, { once: false });
}

