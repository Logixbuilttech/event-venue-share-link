import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { useState, useEffect } from 'react';

/**
 * Hook to check if an object is within the camera's frustum
 * Returns true if object should be rendered, false if it can be culled
 */
export function useFrustumCulling(position: THREE.Vector3, boundingRadius: number = 10): boolean {
  const { camera } = useThree();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!camera) return;

    const frustum = new THREE.Frustum();
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(matrix);

    // Create a bounding sphere for the object
    const boundingSphere = new THREE.Sphere(position, boundingRadius);
    
    // Check if sphere intersects frustum
    const visible = frustum.intersectsSphere(boundingSphere);
    setIsVisible(visible);
  }, [camera, position, boundingRadius]);

  return isVisible;
}

/**
 * Calculate distance-based LOD level
 * Returns 0 (high detail) to 2 (low detail)
 */
export function calculateLODLevel(
  position: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  nearDistance: number = 50,
  farDistance: number = 200
): number {
  const distance = position.distanceTo(cameraPosition);
  
  if (distance < nearDistance) return 0; // High detail
  if (distance < farDistance) return 1;  // Medium detail
  return 2; // Low detail
}
