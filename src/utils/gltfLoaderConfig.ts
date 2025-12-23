import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Custom texture loader that handles blob URLs gracefully
 * Prevents errors when textures have blob URLs that can't be loaded
 */
class SafeTextureLoader extends THREE.TextureLoader {
  load(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent<EventTarget>) => void,
    onError?: (event: ErrorEvent) => void
  ): THREE.Texture {
    // Check if URL is a blob URL
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      console.warn(`⚠️ Skipping blob URL texture: ${url.substring(0, 50)}...`);
      
      // Create a placeholder texture instead
      const placeholderTexture = new THREE.Texture();
      placeholderTexture.image = new Image();
      placeholderTexture.needsUpdate = false;
      
      // Call onLoad with placeholder if provided
      if (onLoad) {
        setTimeout(() => onLoad(placeholderTexture), 0);
      }
      
      return placeholderTexture;
    }
    
    // For non-blob URLs, use the default loader behavior
    return super.load(url, onLoad, onProgress, onError);
  }
}

/**
 * Configure GLTFLoader to handle blob URLs safely
 * This should be called once at app initialization
 */
export function configureGLTFLoader(): void {
  // Get the default loader manager
  const loaderManager = THREE.DefaultLoadingManager;
  
  // Override the texture loader
  loaderManager.setURLModifier((url: string) => {
    // If it's a blob URL, return empty string to skip loading
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      console.warn(`⚠️ Skipping blob URL: ${url.substring(0, 50)}...`);
      return ''; // Return empty string to skip
    }
    return url;
  });
}

/**
 * Create a GLTFLoader with safe texture handling
 */
export function createSafeGLTFLoader(): GLTFLoader {
  const loader = new GLTFLoader(THREE.DefaultLoadingManager);
  
  // Override the texture loader in the manager
  const originalLoad = THREE.DefaultLoadingManager.itemStart;
  THREE.DefaultLoadingManager.itemStart = function(url: string, loaded: number, total: number) {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      console.warn(`⚠️ Skipping blob URL in loader: ${url.substring(0, 50)}...`);
      return; // Skip loading blob URLs
    }
    return originalLoad.call(this, url, loaded, total);
  };
  
  return loader;
}

