'use client';

import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useGLTF, Html, useProgress } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState, useMemo, memo, createContext, useContext, useCallback } from 'react';
import * as THREE from 'three';
import { useHallStore } from '@store/hallStore';
import type { StageConfig } from '@config/stages';
import type { EventConfig } from '@config/events';
import { OptimizedStageAndEvents } from './OptimizedStageAndEvents';
import { getMemoryUsage, isMemoryLimitApproached } from '@utils/optimizedGlbLoader';
import {
  getMemoryStats,
  clearAllPools,
  reduceMemoryUsage,
  shouldReduceQuality,
  logMemoryStatus
} from '@utils/memoryManager';
import { createSharedModelInstance } from '@utils/sharedModelResources';
import { optimizeMaterialTextures } from '@utils/textureOptimizer';
import { processGLTFScene, setupGLTFErrorHandler } from '@utils/gltfTextureFix';
import { getDeviceInfo, hasLimitedMemory } from '@utils/deviceDetection';
import { calculateTableAreaAfterStage, updateTableAreaPoints, type DoorArea } from '@config/venues';
import { isObjectInAnyDoorArea, isObjectInDoorArea } from '@utils/doorAreaUtils';
import { modelManager } from '@utils/modelManager';
import { handleStageSelection } from '@utils/simpleStageTablePoints';
import { getStageDXFData } from '@utils/stageDXFHelper';
import type { HallObject } from '@models/objects';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { FloorPlanBorder } from './FloorPlanBorder';
import { optimizeSceneForTablet, reduceTextureResolution } from '@utils/geometrySimplifier';
import LoadingScreen3D from '@components/LoadingScreen3D';
import Minimap2D from './Minimap2D';
type HallObjectWithGLB = HallObject & {
  glbWidth?: number;
  glbHeight?: number;
  glbDepth?: number;
};


// Context for sharing auto-calculated SCALE_FACTOR
const ScaleFactorContext = createContext<number>(50);

export function useScaleFactor() {
  return useContext(ScaleFactorContext);
}

interface HallCanvas3DWalkProps {
  selectedStage: StageConfig | null;
  selectedEvent: EventConfig | null;
  guestCount: number;
  venueConfig: any;
  floorPlan: any;
  onStageUpdate?: (updatedStage: StageConfig) => void;
}

// Scale factor for coordinate conversion - Will be calculated automatically
let SCALE_FACTOR = 50; // Default fallback

/**
 * Calculate optimal SCALE_FACTOR automatically based on GLB model size vs DXF bounds
 * This ensures perfect alignment between 2D DXF layout and 3D GLB model
 */
export function calculateOptimalScaleFactor(
  glbSize: { width: number; depth: number },
  dxfBounds: { width: number; height: number }
): number {
  // Calculate scale factors for both dimensions
  // GLB width (in 3D units) should match DXF width (in DXF units) / SCALE_FACTOR
  // So: GLB_width = DXF_width / SCALE_FACTOR
  // Therefore: SCALE_FACTOR = DXF_width / GLB_width

  const scaleFactorX = dxfBounds.width / glbSize.width;
  const scaleFactorZ = dxfBounds.height / glbSize.depth;

  // Use average to maintain aspect ratio
  const optimalScale = (scaleFactorX + scaleFactorZ) / 2;

  return optimalScale;
}

type CursorDebugInfo = {
  world: { x: number; y: number; z: number };
  dxf: { x: number; y: number; z: number };
};

interface CapturedPoint extends CursorDebugInfo {
  id: string;
  timestamp: number;
}

// Floor Plan Model - Auto-calculates SCALE_FACTOR for perfect alignment
// For tablets: Uses optimized/simplified version to reduce memory usage
function FloorPlanModel({
  glbPath,
  dxfBounds,
  onScaleFactorCalculated,
  onLoaded,
  onError,
  isTablet = false
}: {
  glbPath: string;
  dxfBounds?: { width: number; height: number; centerX: number; centerY: number };
  onScaleFactorCalculated?: (scaleFactor: number) => void;
  onLoaded?: () => void;
  onError?: (error: Error) => void;
  isTablet?: boolean;
}) {
  // useGLTF must be called unconditionally - errors during loading will be caught by ErrorBoundary
  // The hook itself doesn't throw, but the async loading might fail
  const gltf = useGLTF(`/${glbPath}`);
  const modelRef = useRef<THREE.Group>(null);
  const [modelTransform, setModelTransform] = useState<{
    modelScale: number;
    modelOffset: { x: number; y: number };
  } | null>(null);
  const [calculatedScaleFactor, setCalculatedScaleFactor] = useState<number | null>(null);
  const [isOptimized, setIsOptimized] = useState(false);

  // Fix texture loading issues (blob URLs, etc.) - Fix for server deployment
  // For tablets: Apply aggressive optimization to reduce memory usage
  useEffect(() => {
    if (gltf.scene && !isOptimized) {
      try {
        processGLTFScene(gltf);

        // For tablets: Apply aggressive geometry and texture optimization
        if (isTablet) {
          console.log('[Tablet Optimization] Applying aggressive optimization to floor plan...');

          // Optimize scene (simplifies geometry, reduces textures)
          optimizeSceneForTablet(gltf.scene);

          // Reduce texture resolutions
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                materials.forEach(mat => {
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    // Reduce texture sizes for tablets
                    if (mat.map) {
                      mat.map = reduceTextureResolution(mat.map, 512); // Max 512px for tablets
                    }
                    if (mat.emissiveMap) {
                      mat.emissiveMap = reduceTextureResolution(mat.emissiveMap, 256);
                    }
                    mat.needsUpdate = true;
                  }
                });
              }
            }
          });

          setIsOptimized(true);
          console.log('[Tablet Optimization] Floor plan optimization complete');
        }
      } catch (error) {
        console.error('Error fixing GLTF textures for floor plan:', error);
      }
    }
  }, [gltf, isTablet, isOptimized]);

  // Calculate optimal SCALE_FACTOR and model transform - SAME AS GLOBAL VIEW
  useEffect(() => {
    if (!gltf.scene || !dxfBounds || modelTransform) return;

    // SMART BOUNDS CALCULATION:
    // Instead of using the entire scene bounds (which includes outliers/environment),
    // find the single largest "floor-like" mesh to use as the reference.
    let bestMesh: THREE.Mesh | null = null;
    let maxArea = 0;

    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // precise bounding box for this mesh
        const meshBox = new THREE.Box3().setFromObject(mesh);
        const meshSize = meshBox.getSize(new THREE.Vector3());

        // Look for the object with largest footprint area (Width * Depth)
        const area = meshSize.x * meshSize.z;

        if (area > maxArea) {
          maxArea = area;
          bestMesh = mesh;
        }
      }
    });

    // Use the best mesh found, or fall back to scene bounds if something weird happens
    const box = bestMesh
      ? new THREE.Box3().setFromObject(bestMesh)
      : new THREE.Box3().setFromObject(gltf.scene);

    const size = box.getSize(new THREE.Vector3());
    const glbCenter = box.getCenter(new THREE.Vector3());

    console.log(`[FloorPlanModel] Auto-scaling based on reference mesh: "${(bestMesh as any)?.name || 'Whole Scene'}"`, {
      size: { x: size.x.toFixed(2), z: size.z.toFixed(2) }
    });

    // GLB model size (in its own 3D units)
    const glbWidth = size.x;
    const glbDepth = size.z;

    // DXF bounds size (in DXF units)
    const dxfWidth = dxfBounds.width;
    const dxfHeight = dxfBounds.height;

    // AUTOMATIC SCALE_FACTOR CALCULATION
    // To align perfectly: GLB_width (3D) = DXF_width / SCALE_FACTOR
    // So: SCALE_FACTOR = DXF_width / GLB_width
    const autoScaleFactorX = dxfWidth / glbWidth;
    const autoScaleFactorZ = dxfHeight / glbDepth;
    const optimalScaleFactor = Math.max(autoScaleFactorX, autoScaleFactorZ);

    // Update global SCALE_FACTOR
    if (calculatedScaleFactor !== optimalScaleFactor) {
      setCalculatedScaleFactor(optimalScaleFactor);
      // Update the module-level SCALE_FACTOR
      (window as any).__AUTO_SCALE_FACTOR__ = optimalScaleFactor;
      if (onScaleFactorCalculated) {
        onScaleFactorCalculated(optimalScaleFactor);
      }
    }

    // Now use the calculated SCALE_FACTOR for model scaling
    // The model should be scaled so that 1 DXF unit = 1/SCALE_FACTOR 3D units
    const scaleX = (dxfWidth / optimalScaleFactor) / glbWidth;
    const scaleZ = (dxfHeight / optimalScaleFactor) / glbDepth;
    const calculatedScale = (scaleX + scaleZ) / 2;

    // Calculate offset to center the model at origin
    const offsetX = -glbCenter.x * calculatedScale;
    const offsetZ = -glbCenter.z * calculatedScale;

    const wasNotLoaded = !modelTransform;
    setModelTransform({
      modelScale: calculatedScale,
      modelOffset: { x: offsetX, y: offsetZ }
    });


    // Notify that floor plan is fully loaded and ready (only once when first loaded)
    if (onLoaded && wasNotLoaded) {
      // Use setTimeout to ensure state is updated
      setTimeout(() => {
        onLoaded();
      }, 100);
    }
  }, [gltf.scene, dxfBounds, modelTransform, calculatedScaleFactor, onScaleFactorCalculated, onLoaded]);

  // Use default values if not yet calculated
  const { modelScale, modelOffset } = modelTransform || {
    modelScale: 1,
    modelOffset: { x: 0, y: 0 }
  };

  // Optimize materials and geometry - SAME AS GLOBAL VIEW
  useEffect(() => {
    if (!gltf.scene) return;

    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = false; // Floor doesn't cast shadows
        mesh.receiveShadow = true;

        // Optimize materials
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(mat => {
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.roughness = 0.8;
              mat.metalness = 0;
              mat.normalMap = null;
              mat.roughnessMap = null;
              mat.needsUpdate = true;
            }
          });
        }

        // Optimize geometry
        if (mesh.geometry) {
          mesh.geometry.computeBoundingSphere();
          mesh.geometry.computeBoundingBox();
        }
      }
    });

    return () => {
      // Cleanup on unmount
      gltf.scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach(mat => mat.dispose());
            } else {
              mesh.material.dispose();
            }
          }
        }
      });
    };
  }, [gltf.scene]);

  // Render with same group structure as Global view
  return (
    <group position={[modelOffset.x, 0, modelOffset.y]}>
      <primitive
        ref={modelRef}
        object={gltf.scene}
        scale={modelScale}
        position={[0, 0, 0]}
      />
    </group>
  );
}

// Loading fallback with progress percentage
function LoadingFallback() {
  const { progress, active, loaded, total } = useProgress();

  return (
    <Html center>
      <div className="bg-black bg-opacity-90 text-white px-8 py-6 rounded-lg shadow-2xl min-w-[300px]">
        <div className="flex flex-col items-center gap-4">
          {/* Animated Spinner */}
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-600 border-t-purple-500"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold">{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Loading Text */}
          <div className="text-center">
            <p className="text-lg font-semibold mb-1">Loading 3D Environment...</p>
            <p className="text-xs text-gray-400">
              {loaded} of {total} items loaded
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-purple-500 to-purple-600 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Additional Info */}
          {progress < 100 && (
            <p className="text-xs text-gray-500 animate-pulse">
              Preparing walk mode...
            </p>
          )}

          {progress >= 100 && (
            <p className="text-xs text-green-400 font-semibold">
              ✓ Ready to explore!
            </p>
          )}
        </div>
      </div>
    </Html>
  );
}

// Enhanced Context loss recovery with automatic recovery
function ContextLossHandler() {
  const { gl } = useThree();
  const [contextLost, setContextLost] = useState(false);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      console.error('🚨 WebGL context lost in Walk mode.');
      setContextLost(true);
      setShowRecovery(true);
      setRecoveryAttempts(prev => prev + 1);

      // Try to recover after a delay
      setTimeout(() => {
        try {
          // Force context restoration attempt
          const restored = gl.getContext() !== null;
          if (!restored) {
            console.warn('⚠️ Context not restored automatically, user action may be required');
          }
        } catch (error) {
          console.error('Error attempting context recovery:', error);
        }
      }, 1000);
    };

    const handleContextRestored = () => {
      console.log('✅ WebGL context restored successfully.');
      setContextLost(false);
      setShowRecovery(false);
      setRecoveryAttempts(0);

      // Force re-render by reloading the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 500);
    };

    // Also listen to global context loss events
    const handleGlobalContextLost = (event: Event) => {
      event.preventDefault();
      handleContextLost(event);
    };

    const handleGlobalContextRestored = () => {
      handleContextRestored();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    window.addEventListener('webglcontextlost', handleGlobalContextLost);
    window.addEventListener('webglcontextrestored', handleGlobalContextRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      window.removeEventListener('webglcontextlost', handleGlobalContextLost);
      window.removeEventListener('webglcontextrestored', handleGlobalContextRestored);
    };
  }, [gl]);

  if (contextLost || showRecovery) {
    return (
      <Html center>
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white px-8 py-6 rounded-lg shadow-2xl max-w-md">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-3xl animate-spin">⚠️</div>
            <div>
              <p className="font-bold text-lg">WebGL Context Lost</p>
              <p className="text-sm opacity-90">Attempting to recover...</p>
            </div>
          </div>

          {recoveryAttempts > 1 && (
            <div className="mt-4 pt-4 border-t border-red-500">
              <p className="text-sm mb-2">Recovery attempt #{recoveryAttempts}</p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-white text-red-600 px-4 py-2 rounded font-semibold hover:bg-gray-100 transition-colors"
              >
                Reload Page Now
              </button>
            </div>
          )}

          <p className="text-xs mt-4 opacity-75">
            If this persists, try refreshing the page or reducing the number of objects.
          </p>
        </div>
      </Html>
    );
  }

  return null;
}

interface WorldCoordinateHelperProps {
  centerOffset: { x: number; y: number };
  scaleFactor: number;
  onUpdate: (info: CursorDebugInfo | null) => void;
}

function WorldCoordinateHelper({ centerOffset, scaleFactor, onUpdate }: WorldCoordinateHelperProps) {
  const { camera, pointer, scene } = useThree();
  const raycasterRef = useRef(new THREE.Raycaster());
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const lastInfoRef = useRef<CursorDebugInfo | null>(null);
  const tempVector = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const effectiveScale = !Number.isFinite(scaleFactor) || scaleFactor === 0 ? SCALE_FACTOR : scaleFactor;
    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(scene.children, true);

    let hitPoint: THREE.Vector3 | null = null;
    for (const hit of intersections) {
      if (hit.object.userData?.ignoreCoordinateHelper) {
        continue;
      }
      hitPoint = hit.point;
      break;
    }

    if (!hitPoint) {
      hitPoint = raycaster.ray.intersectPlane(plane, tempVector);
    }

    if (hitPoint) {
      const worldX = parseFloat(hitPoint.x.toFixed(3));
      const worldY = parseFloat(hitPoint.y.toFixed(3));
      const worldZ = parseFloat(hitPoint.z.toFixed(3));

      const dxfX = Math.round(worldX * effectiveScale + centerOffset.x);
      const dxfY = Math.round(centerOffset.y - worldZ * effectiveScale);
      const dxfZ = Math.round(worldY * effectiveScale);

      const nextInfo: CursorDebugInfo = {
        world: { x: worldX, y: worldY, z: worldZ },
        dxf: { x: dxfX, y: dxfY, z: dxfZ }
      };

      const prev = lastInfoRef.current;
      if (
        !prev ||
        prev.world.x !== nextInfo.world.x ||
        prev.world.y !== nextInfo.world.y ||
        prev.world.z !== nextInfo.world.z
      ) {
        lastInfoRef.current = nextInfo;
        onUpdate(nextInfo);
      }
    } else if (lastInfoRef.current) {
      lastInfoRef.current = null;
      onUpdate(null);
    }
  });

  useEffect(() => {
    return () => {
      lastInfoRef.current = null;
      onUpdate(null);
    };
  }, [onUpdate]);

  return null;
}

// Single Table Model - For table sets with multiple meshes (table + chairs)
function SingleTableModel({
  glbPath,
  targetWidth,
  targetDepth,
  targetHeight,
  tableIndex = 0
}: {
  glbPath: string;
  targetWidth: number;
  targetDepth: number;
  targetHeight?: number;
  tableIndex?: number;
}) {
  const gltf = useGLTF(`/${glbPath}`);
  const [tableScale, setTableScale] = useState<number>(1);

  // Fix texture loading issues (blob URLs, etc.) - Fix for server deployment
  useEffect(() => {
    if (gltf.scene) {
      try {
        processGLTFScene(gltf);
      } catch (error) {
        console.error('Error fixing GLTF textures for table:', error);
      }
    }
  }, [gltf]);

  // Calculate scale - SAME AS GLOBAL VIEW
  useEffect(() => {
    if (!gltf.scene || tableScale !== 1) return;

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());

    const scales: number[] = [];
    if (size.x !== 0) {
      scales.push(targetWidth / size.x);
    }
    if (size.z !== 0) {
      scales.push(targetDepth / size.z);
    }
    if (targetHeight !== undefined && size.y !== 0) {
      scales.push(targetHeight / size.y);
    }

    const calculatedScale = scales.length > 0
      ? scales.reduce((sum, value) => sum + value, 0) / scales.length
      : 1;
    setTableScale(calculatedScale);
  }, [gltf.scene, targetWidth, targetDepth, targetHeight, tableIndex, tableScale]);

  // Use deep clone for table models to ensure all children (chairs) are preserved
  // This is important for table_with_8_chair.glb which contains both table and chairs
  const clonedScene = useMemo(() => {
    if (!gltf.scene) return null;

    // Use deep clone to preserve all children (table + chairs) exactly as in the GLB file
    // This ensures chairs are not lost during cloning
    const deepClone = gltf.scene.clone(true);

    // Configure shadows and optimize materials
    deepClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Optimize materials to reduce memory usage
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(mat => {
            optimizeMaterialTextures(mat);
          });
        }
      }
    });

    return deepClone;
  }, [gltf.scene, glbPath, tableIndex]);

  if (!clonedScene) return null;

  return <primitive object={clonedScene} scale={tableScale} />;
}

// Single Chair Model - Similar to SingleTableModel but for chairs
function SingleChairModel({
  glbPath,
  targetWidth,
  targetDepth,
  targetHeight,
  chairIndex = 0
}: {
  glbPath: string;
  targetWidth: number;
  targetDepth: number;
  targetHeight: number;
  chairIndex?: number;
}) {
  const gltf = useGLTF(`/${glbPath}`);
  const [chairScale, setChairScale] = useState<number>(1);

  // Fix texture loading issues (blob URLs, etc.) - Fix for server deployment
  useEffect(() => {
    if (gltf.scene) {
      try {
        processGLTFScene(gltf);
      } catch (error) {
        console.error('Error fixing GLTF textures for chair:', error);
      }
    }
  }, [gltf]);

  // Calculate scale - SAME AS TABLE MODEL
  useEffect(() => {
    if (!gltf.scene || chairScale !== 1) return;

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());

    const scales: number[] = [];
    if (size.x !== 0) {
      scales.push(targetWidth / size.x);
    }
    if (size.z !== 0) {
      scales.push(targetDepth / size.z);
    }
    if (size.y !== 0) {
      scales.push(targetHeight / size.y);
    }

    const calculatedScale = scales.length > 0
      ? scales.reduce((sum, value) => sum + value, 0) / scales.length
      : 1;
    setChairScale(calculatedScale);
  }, [gltf.scene, targetWidth, targetDepth, targetHeight, chairIndex, chairScale]);

  // Use shared model resources to dramatically reduce memory usage
  // This shares geometries and materials across all chair instances
  const clonedScene = useMemo(() => {
    if (!gltf.scene) return null;

    // Use shared resources to create a lightweight clone
    // This shares geometries and materials across all instances of the same chair model
    const modelKey = `chair_${glbPath}`;
    const lightweightClone = createSharedModelInstance(gltf.scene, modelKey);

    // Configure shadows and optimize materials
    lightweightClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Optimize materials to reduce memory usage
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(mat => {
            optimizeMaterialTextures(mat);
          });
        }
      }
    });

    return lightweightClone;
  }, [gltf.scene, glbPath, chairIndex]);

  if (!clonedScene) return null;

  return <primitive object={clonedScene} scale={chairScale} />;
}

// Helper function to calculate column spacing offsets based on 2D door areas
// Uses 2D door areas to determine which columns have doors (same logic as 2D view)
// Then calculates spacing amount using 3D door area coordinates for each door area
// Returns a map of column index to spacing offset (cumulative)
function calculateColumnSpacingOffsets(
  objects: HallObjectWithGLB[],
  columnIndexMap: Map<number, number>,
  centerOffset: { x: number; y: number },
  scaleFactor: number,
  objectWidth: number,
  doorAreas: DoorArea[]
): Map<number, number> {
  const spacingOffsets = new Map<number, number>();
  if (!doorAreas || doorAreas.length === 0) return spacingOffsets;

  // Get all unique column indices sorted
  const columnIndices = Array.from(new Set(columnIndexMap.values())).sort((a, b) => a - b);

  // Process each door area separately to calculate spacing
  // This ensures each door area gets proper spacing, even if there are multiple doors
  // The logic matches 2D: columns that overlap doors get spacing to move them after the door,
  // and all subsequent columns get the same cumulative spacing
  for (const doorArea of doorAreas) {
    if (!doorArea.coordinates3D) continue;

    // Get 2D door area bounds (same as 2D view logic)
    const doorMinX2D = Math.min(doorArea.topLeft.x, doorArea.topRight.x, doorArea.bottomLeft.x, doorArea.bottomRight.x);
    const doorMaxX2D = Math.max(doorArea.topLeft.x, doorArea.topRight.x, doorArea.bottomLeft.x, doorArea.bottomRight.x);

    // Get 3D door area right edge (end point) - this is where columns should start after the door
    const doorRightEdge3D = Math.max(
      doorArea.coordinates3D.topRight.x,
      doorArea.coordinates3D.bottomRight.x
    );

    // Find the first column that overlaps with this door area (using 2D coordinates)
    // In 2D, when a column overlaps a door, it's skipped and subsequent columns start after the door
    // In 3D, we add spacing to the overlapping column and all subsequent columns
    let firstOverlappingColumnIdx: number | null = null;
    let maxSpacingNeeded = 0;

    for (const columnIdx of columnIndices) {
      // Find objects in this column
      const columnObjects = objects.filter(obj => {
        return columnIndexMap.get(obj.updateX ?? obj.x) === columnIdx;
      });

      if (columnObjects.length === 0) continue;

      // Get the column's X position in DXF coordinates (use first object as reference)
      const firstObj = columnObjects[0];
      const layoutWidth = firstObj.width ?? objectWidth;
      const glbWidth = firstObj.glbWidth ?? layoutWidth;
      // Match the calculation in Tables3D: tableX = table.x + 0, then adjustedX = tableX + columnIndex * (glbWidth - layoutWidth)
      const tableX = firstObj.updateX ?? firstObj.x; // Same as tableX = table.x + 0
      const adjustedX = tableX + columnIdx * (glbWidth - layoutWidth); // Same as in Tables3D
      const columnDXFWidth = glbWidth;

      // Check if this column overlaps with this door area (same logic as 2D table calculator)
      // In 2D: columnOverlapsDoor = currentX < doorMaxX && (currentX + tableConfig.width) > doorMinX
      const columnOverlapsDoor = adjustedX < doorMaxX2D && (adjustedX + columnDXFWidth) > doorMinX2D;

      if (columnOverlapsDoor) {
        // Track the first overlapping column
        if (firstOverlappingColumnIdx === null) {
          firstOverlappingColumnIdx = columnIdx;
        }

        // Calculate spacing needed to move this column after the door
        // Convert column position to 3D for spacing calculation (same as in Tables3D)
        const columnX3D = (adjustedX - centerOffset.x) / scaleFactor;
        const columnHalfWidth = (columnDXFWidth / scaleFactor) / 2;
        const columnLeft3D = columnX3D - columnHalfWidth;

        // Spacing = distance needed to push column's left edge past door's right edge in 3D
        // This ensures the entire column (including its left edge) is after the door area
        const spacing = doorRightEdge3D - columnLeft3D + 0.2; // 0.2 units buffer

        // Track the maximum spacing needed for this door area
        if (spacing > maxSpacingNeeded) {
          maxSpacingNeeded = spacing;
        }
      }
    }

    // Apply spacing to all columns from the first overlapping column onwards (cumulative)
    // This maintains the 2D structure: columns before door get no spacing, columns from door onwards get spacing
    if (firstOverlappingColumnIdx !== null && maxSpacingNeeded > 0) {
      for (let i = firstOverlappingColumnIdx; i < columnIndices.length; i++) {
        const currentOffset = spacingOffsets.get(i) || 0;
        // Use maximum spacing needed (in case multiple doors affect same columns)
        spacingOffsets.set(i, Math.max(currentOffset, maxSpacingNeeded));
      }
    }
  }

  return spacingOffsets;
}

// Tables3D - Clone entire table sets (table + chairs together)
function Tables3D({
  centerOffset,
  tableGlbPath,
  tableWidth = 72,
  tableGlbRotation = 0,
  doorAreas = []
}: {
  centerOffset: { x: number; y: number };
  tableGlbPath?: string;
  tableWidth?: number;
  tableGlbRotation?: number;
  doorAreas?: DoorArea[];
}) {
  const { objects } = useHallStore();
  // Keep ALL tables to maintain column structure (same as 2D view)
  const tables = objects.filter((obj): obj is HallObjectWithGLB => obj.type === 'table');
  const scaleFactor = useScaleFactor();
  // Calculate column and row indices from ALL tables to maintain column structure
  const columnIndexMap = useMemo(() => {
    // Map using table X values directly (no offset needed)
    const uniqueXs = Array.from(new Set(tables.map(table => table.updateX ?? table.x))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueXs.forEach((x, index) => {
      map.set(x, index);
    });
    return map;
  }, [tables]);
  const rowIndexMap = useMemo(() => {
    const uniqueYs = Array.from(new Set(tables.map(table => table.updateY ?? table.y))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueYs.forEach((y, index) => map.set(y, index));
    return map;
  }, [tables]);

  // Calculate column spacing offsets based on 3D door areas
  // This adds space before columns that have door areas, and applies same spacing to all subsequent columns
  const columnSpacingOffsets = useMemo(() => {
    return calculateColumnSpacingOffsets(tables, columnIndexMap, centerOffset, scaleFactor, tableWidth, doorAreas);
  }, [tables, columnIndexMap, centerOffset, scaleFactor, tableWidth, doorAreas]);

  // Track table positions to detect overlaps - only for safety net, not primary positioning
  const tablePositions: Array<{
    x: number;
    z: number;
    halfWidth: number;
    halfDepth: number;
    columnIndex: number;
    rowIndex: number;
  }> = [];

  return (
    <>
      {tables.map((table, index) => {
        const tableX = (table.updateX ?? table.x) + 143;
        const layoutWidth = table.width ?? tableWidth;
        const layoutDepth = table.height ?? tableWidth;
        const glbWidth = table.glbWidth ?? layoutWidth;
        const glbDepth = table.glbDepth ?? layoutDepth;
        const glbHeight = table.glbHeight ?? 0;
        const columnIndex = columnIndexMap.get(tableX) ?? 0;
        const rowIndex = rowIndexMap.get(table.updateY ?? table.y) ?? 0;
        const adjustedX = tableX + columnIndex * (glbWidth - layoutWidth);
        const adjustedY = table.updateY ?? table.y + rowIndex * (glbDepth - layoutDepth);

        // Convert DXF coordinates to Three.js (same coordinate system as floor plan)
        // Negate X to fix horizontal mirroring (2D right = 3D right)
        let x = (adjustedX - centerOffset.x) / scaleFactor;
        let z = -(adjustedY - centerOffset.y) / scaleFactor;

        // Add small X offset to push tables back slightly (creates door space)
        const doorSpaceOffset = 2.5; // Small offset in 3D units to create door space
        // x += doorSpaceOffset;

        // Check if table is under a door area BEFORE applying spacing (for red box visualization)
        // Door areas only change in X, so check if table's 3D X coordinate is within door area's X range
        let tableInDoorArea = false;
        let tableDoorAreaName = '';
        const xBeforeSpacing = x; // Store position before spacing for door area check
        const glbTargetWidth = glbWidth / scaleFactor;
        const glbTargetDepth = glbDepth / scaleFactor;

        // Calculate table bounds (considering table width, not just center point)
        // FIX: tableHalfWidth should be half the width, not full width
        const tableHalfWidth = glbTargetWidth / 2;
        const tableHalfDepth = glbTargetDepth / 2;
        const tableMinX = xBeforeSpacing - tableHalfWidth;
        const tableMaxX = xBeforeSpacing + tableHalfWidth;

        for (const doorArea of doorAreas) {
          if (!doorArea.coordinates3D) continue;

          // Get door area X bounds in 3D
          const doorMinX3D = Math.min(
            doorArea.coordinates3D.topLeft.x,
            doorArea.coordinates3D.topRight.x,
            doorArea.coordinates3D.bottomLeft.x,
            doorArea.coordinates3D.bottomRight.x
          );
          const doorMaxX3D = Math.max(
            doorArea.coordinates3D.topLeft.x,
            doorArea.coordinates3D.topRight.x,
            doorArea.coordinates3D.bottomLeft.x,
            doorArea.coordinates3D.bottomRight.x
          );

          // Check if table overlaps with door area (considering table width)
          // Table overlaps if: tableMinX < doorMaxX3D && tableMaxX > doorMinX3D
          if (tableMinX < doorMaxX3D && tableMaxX > doorMinX3D) {
            tableInDoorArea = true;
            tableDoorAreaName = doorArea.name;
            break;
          }
        }

        // Add column spacing offset if this column has objects in door areas
        // This maintains column structure - all columns after a door area get the same spacing
        const spacingOffset = columnSpacingOffsets.get(columnIndex) || 0;
        x += spacingOffset;

        // After applying spacing, check if table still overlaps with door area
        // If it does, add additional spacing to push it completely out
        if (tableInDoorArea) {
          for (const doorArea of doorAreas) {
            if (!doorArea.coordinates3D) continue;

            const doorMinX3D = Math.min(
              doorArea.coordinates3D.topLeft.x,
              doorArea.coordinates3D.topRight.x,
              doorArea.coordinates3D.bottomLeft.x,
              doorArea.coordinates3D.bottomRight.x
            );
            const doorMaxX3D = Math.max(
              doorArea.coordinates3D.topLeft.x,
              doorArea.coordinates3D.topRight.x,
              doorArea.coordinates3D.bottomLeft.x,
              doorArea.coordinates3D.bottomRight.x
            );

            // Check if table still overlaps after spacing
            const tableMinXAfterSpacing = x - tableHalfWidth;
            const tableMaxXAfterSpacing = x + tableHalfWidth;

            if (tableMinXAfterSpacing < doorMaxX3D && tableMaxXAfterSpacing > doorMinX3D) {
              // Calculate additional spacing needed to push table completely past the door
              const additionalSpacing = doorMaxX3D - tableMinXAfterSpacing + 0.2; // 0.2 units buffer
              x += additionalSpacing;
              break;
            }
          }
        }

        // Safety net: Check for overlaps with previously positioned tables
        // Only apply minimal adjustments to prevent visual overlap while preserving structure
        // This should rarely trigger if positioning is correct
        for (const prevTable of tablePositions) {
          const currentMinX = x - tableHalfWidth;
          const currentMaxX = x + tableHalfWidth;
          const currentMinZ = z - tableHalfDepth;
          const currentMaxZ = z + tableHalfDepth;

          const prevMinX = prevTable.x - prevTable.halfWidth;
          const prevMaxX = prevTable.x + prevTable.halfWidth;
          const prevMinZ = prevTable.z - prevTable.halfDepth;
          const prevMaxZ = prevTable.z + prevTable.halfDepth;

          // Check if tables overlap (both X and Z axes)
          const overlapX = Math.min(currentMaxX, prevMaxX) - Math.max(currentMinX, prevMinX);
          const overlapZ = Math.min(currentMaxZ, prevMaxZ) - Math.max(currentMinZ, prevMinZ);

          // Only adjust if there's a significant overlap (more than just touching edges)
          // Use a small threshold (5% of table size) to avoid adjusting for minor edge cases
          const overlapThreshold = Math.min(tableHalfWidth, tableHalfDepth) * 0.05;

          if (overlapX > overlapThreshold && overlapZ > overlapThreshold) {
            // Tables significantly overlap - apply minimal adjustment
            // Only adjust if tables are in the same column (for Z) or same row (for X)
            // This preserves the column/row structure

            if (prevTable.columnIndex === columnIndex) {
              // Same column - adjust Z only (vertical spacing)
              // Move current table away from previous in Z direction
              if (z > prevTable.z) {
                // Current is below previous - move it further down
                z = prevMaxZ + tableHalfDepth + overlapThreshold;
              } else {
                // Current is above previous - move it further up
                z = prevMinZ - tableHalfDepth - overlapThreshold;
              }
            } else if (prevTable.rowIndex === rowIndex) {
              // Same row - adjust X only (horizontal spacing)
              // Move current table away from previous in X direction
              if (x > prevTable.x) {
                // Current is to the right - move it further right
                x = prevMaxX + tableHalfWidth + overlapThreshold;
              } else {
                // Current is to the left - move it further left
                x = prevMinX - tableHalfWidth - overlapThreshold;
              }
            }
            // If tables are in different columns AND different rows, don't adjust
            // This preserves the grid structure
          }
        }

        // Store this table's position for future overlap checks
        tablePositions.push({
          x,
          z,
          halfWidth: tableHalfWidth,
          halfDepth: tableHalfDepth,
          columnIndex,
          rowIndex
        });

        const glbTargetHeight = glbHeight ? glbHeight / scaleFactor : undefined;


        // Combine GLB base rotation with table placement rotation
        const baseRotation = THREE.MathUtils.degToRad(tableGlbRotation);
        const placementRotation = THREE.MathUtils.degToRad(table.rotation || 0);
        const totalRotation = baseRotation + placementRotation;

        return (
          <group
            key={table.id}
            position={[x, 0, z]}
            rotation={[0, totalRotation, 0]}
          >
            {/* Visual indicator if table is in door area - Red box above table */}
            {tableInDoorArea && (
              <>
                {/* <mesh position={[0, 2, 0]}>
                  <boxGeometry args={[glbTargetWidth, 0.1, glbTargetDepth]} />
                  <meshStandardMaterial color="#ff0000" transparent opacity={0.5} />
                </mesh>
                <lineSegments position={[0, 2.1, 0]}>
                  <edgesGeometry args={[new THREE.BoxGeometry(glbTargetWidth, 0.1, glbTargetDepth)]} />
                  <lineBasicMaterial color="#ff0000" linewidth={2} />
                </lineSegments> */}
                {/* Text label showing coordinates */}
                {/* <Html position={[0, 3, 0]} center>
                  <div style={{
                    background: 'rgba(255, 0, 0, 0.9)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    border: '2px solid #ff0000'
                  }}>
                    <div>DXF: ({tableX}, {table.y})</div>
                    <div>3D: ({x.toFixed(2)}, {z.toFixed(2)})</div>
                    <div>Door: {tableDoorAreaName}</div>
                  </div>
                </Html> */}
              </>
            )}
            {/* <Html position={[0, 3, 0]} center>
                  <div style={{
                    background: 'green',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    border: '2px solid green'
                  }}>
                    <div>DXF: ({tableX}, {table.updateY ?? table.y})</div>
                    <div>3D: ({x.toFixed(2)}, {z.toFixed(2)})</div>
                    <div>Door: {tableDoorAreaName}</div>
                  </div>
                </Html> */}
            {/* Visual indicator if table is in door area */}
            {/* {tableInDoorArea && (
              <>
                <mesh position={[0, 2, 0]}>
                  <boxGeometry args={[glbTargetWidth, 0.1, glbTargetDepth]} />
                  <meshStandardMaterial color="#ff0000" transparent opacity={0.5} />
                </mesh>
                <lineSegments position={[0, 2.1, 0]}>
                  <edgesGeometry args={[new THREE.BoxGeometry(glbTargetWidth, 0.1, glbTargetDepth)]} />
                  <lineBasicMaterial color="#ff0000" linewidth={2} />
                </lineSegments>
              </>
            )} */}

            {tableGlbPath ? (
              <SingleTableModel
                glbPath={tableGlbPath}
                targetWidth={glbTargetWidth}
                targetDepth={glbTargetDepth}
                targetHeight={glbTargetHeight}
                tableIndex={index}
              />
            ) : (
              <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[glbTargetWidth / 2, glbTargetDepth / 2, glbTargetHeight ?? 0.8, 16]} />
                <meshStandardMaterial color="#8B4513" />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

// Chairs3D - Individual chair groups (same as tables for reliable visibility)
function Chairs3D({
  centerOffset,
  chairGlbPath,
  chairWidth = 18,
  chairHeight = 18,
  doorAreas = []
}: {
  centerOffset: { x: number; y: number };
  chairGlbPath?: string;
  chairWidth?: number;
  chairHeight?: number;
  doorAreas?: DoorArea[];
}) {
  const { objects } = useHallStore();
  // Keep ALL chairs to maintain column structure (same as 2D view)
  const layoutSpacing = 0;
  const allChairs = objects.filter((obj): obj is HallObjectWithGLB => obj.type === 'chair');
  const scaleFactor = useScaleFactor();
  const updatedChairs = allChairs.map(chair => ({ ...chair, x: chair.updateX ?? chair.x + layoutSpacing }));
  const chairs = updatedChairs;
  // Calculate column and row indices from ALL chairs to maintain column structure
  const columnIndexMap = useMemo(() => {
    const uniqueXs = Array.from(new Set(updatedChairs.map(chair => chair.updateX ?? chair.x))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueXs.forEach((x, index) => map.set(x, index));
    return map;
  }, [updatedChairs]);
  const rowIndexMap = useMemo(() => {
    const uniqueYs = Array.from(new Set(updatedChairs.map(chair => chair.updateY ?? chair.y))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueYs.forEach((y, index) => map.set(y, index));
    return map;
  }, [updatedChairs]);

  // Get all objects to calculate unified spacing (tables + chairs together)
  const { objects: allObjectsStore } = useHallStore();
  const allTablesForSpacing = useMemo(() => {
    return allObjectsStore.filter((obj): obj is HallObjectWithGLB => obj.type === 'table');
  }, [allObjectsStore]);

  // Create unified column index map using both tables and chairs (no offset - same as tables)
  // This ensures chairs use the same column spacing as tables
  const unifiedColumnIndexMap = useMemo(() => {
    const allObjects = [...allTablesForSpacing, ...updatedChairs];
    const uniqueXs = Array.from(new Set(allObjects.map(obj => obj.updateX ?? obj.x))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueXs.forEach((x, index) => {
      map.set(x, index);
    });
    return map;
  }, [allTablesForSpacing, updatedChairs]);

  // Calculate column spacing offsets using ALL objects (tables + chairs) together
  // This ensures consistent spacing across tables and chairs
  // Use 72 as default object width (table width) for spacing calculation
  const unifiedSpacingOffsets = useMemo(() => {
    const allObjectsForSpacing = [...allTablesForSpacing, ...updatedChairs];
    return calculateColumnSpacingOffsets(allObjectsForSpacing, unifiedColumnIndexMap, centerOffset, scaleFactor, 72, doorAreas);
  }, [allTablesForSpacing, updatedChairs, unifiedColumnIndexMap, centerOffset, scaleFactor, doorAreas]);

  // Use unified spacing offsets for chairs (same as tables)
  const chairColumnSpacingOffsets = unifiedSpacingOffsets;

  return (
    <>
      {chairs.map((chair, index) => {
        const chairX = (chair.updateX ?? chair.x) + 143;
        const layoutWidth = chair.width ?? chairWidth;
        const layoutDepth = chair.height ?? chairHeight;
        const glbWidth = chair.glbWidth ?? layoutWidth;
        const glbDepth = chair.glbDepth ?? layoutDepth;
        const glbHeight = chair.glbHeight ?? chairHeight;
        const columnIndex = columnIndexMap.get(chair.updateX ?? chair.x) ?? 0;
        const rowIndex = rowIndexMap.get(chair.updateY ?? chair.y) ?? 0;
        const adjustedX = chairX + columnIndex * (glbWidth - layoutWidth);
        const adjustedY = chair.updateY ?? chair.y + rowIndex * (glbDepth - layoutDepth);

        // Convert DXF coordinates to Three.js (same coordinate system as floor plan)
        // Negate X to fix horizontal mirroring (2D right = 3D right)
        let x = (adjustedX - centerOffset.x) / scaleFactor;
        let z = -(adjustedY - centerOffset.y) / scaleFactor;

        // Check if chair is under a door area BEFORE applying spacing (for visualization)
        // Door areas only change in X, so check if chair's 3D X coordinate is within door area's X range
        let chairInDoorArea = false;
        let chairDoorAreaName = '';
        const xBeforeSpacing = x; // Store position before spacing for door area check
        const glbTargetWidth = glbWidth / scaleFactor;
        const glbTargetDepth = glbDepth / scaleFactor;

        // Calculate chair bounds (considering chair width, not just center point)
        const chairHalfWidth = glbTargetWidth / 2;
        const chairHalfDepth = glbTargetDepth / 2;
        const chairMinX = xBeforeSpacing - chairHalfWidth;
        const chairMaxX = xBeforeSpacing + chairHalfWidth;

        for (const doorArea of doorAreas) {
          if (!doorArea.coordinates3D) continue;

          // Get door area X bounds in 3D
          const doorMinX3D = Math.min(
            doorArea.coordinates3D.topLeft.x,
            doorArea.coordinates3D.topRight.x,
            doorArea.coordinates3D.bottomLeft.x,
            doorArea.coordinates3D.bottomRight.x
          );
          const doorMaxX3D = Math.max(
            doorArea.coordinates3D.topLeft.x,
            doorArea.coordinates3D.topRight.x,
            doorArea.coordinates3D.bottomLeft.x,
            doorArea.coordinates3D.bottomRight.x
          );

          // Check if chair overlaps with door area (considering chair width)
          if (chairMinX < doorMaxX3D && chairMaxX > doorMinX3D) {
            chairInDoorArea = true;
            chairDoorAreaName = doorArea.name;
            break;
          }
        }

        // Add column spacing offset if this column has objects in door areas
        // This maintains column structure - all columns after a door area get the same spacing
        const spacingOffset = chairColumnSpacingOffsets.get(columnIndex) || 0;
        x += spacingOffset;

        // After applying spacing, check if chair still overlaps with door area
        // If it does, add additional spacing to push it completely out
        if (chairInDoorArea) {
          for (const doorArea of doorAreas) {
            if (!doorArea.coordinates3D) continue;

            const doorMinX3D = Math.min(
              doorArea.coordinates3D.topLeft.x,
              doorArea.coordinates3D.topRight.x,
              doorArea.coordinates3D.bottomLeft.x,
              doorArea.coordinates3D.bottomRight.x
            );
            const doorMaxX3D = Math.max(
              doorArea.coordinates3D.topLeft.x,
              doorArea.coordinates3D.topRight.x,
              doorArea.coordinates3D.bottomLeft.x,
              doorArea.coordinates3D.bottomRight.x
            );

            // Check if chair still overlaps after spacing
            const chairMinXAfterSpacing = x - chairHalfWidth;
            const chairMaxXAfterSpacing = x + chairHalfWidth;

            if (chairMinXAfterSpacing < doorMaxX3D && chairMaxXAfterSpacing > doorMinX3D) {
              // Calculate additional spacing needed to push chair completely past the door
              const additionalSpacing = doorMaxX3D - chairMinXAfterSpacing + 0.2; // 0.2 units buffer
              x += additionalSpacing;
              break;
            }
          }
        }

        const glbTargetHeight = glbHeight / scaleFactor;
        const rotation = THREE.MathUtils.degToRad(chair.rotation || 0);

        return (
          <group
            key={chair.id || `chair-${index}-${chair.x}-${chair.y}`}
            position={[x, 0, z]}
            rotation={[0, rotation, 0]}
          >
            {chairGlbPath ? (
              <SingleChairModel
                glbPath={chairGlbPath}
                targetWidth={glbTargetWidth}
                targetDepth={glbTargetDepth}
                targetHeight={glbTargetHeight}
                chairIndex={index}
              />
            ) : (
              // Default box geometry if no GLB available
              <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
                <boxGeometry args={[glbTargetWidth, glbTargetHeight, glbTargetDepth]} />
                <meshStandardMaterial color="#654321" />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

// Door Areas Visualization - Red lines around door areas
function DoorAreas3D({
  doorAreas = [],
  centerOffset,
  scaleFactor
}: {
  doorAreas?: DoorArea[];
  centerOffset: { x: number; y: number };
  scaleFactor: number;
}) {
  if (!doorAreas || doorAreas.length === 0) return null;

  return (
    <>
      {doorAreas.map((doorArea) => {
        // Use 3D coordinates if available, otherwise convert from 2D
        let points: Array<{ x: number; y: number; z: number }>;

        if (doorArea.coordinates3D) {
          // Use 3D coordinates directly
          points = [
            doorArea.coordinates3D.topLeft,
            doorArea.coordinates3D.topRight,
            doorArea.coordinates3D.bottomRight,
            doorArea.coordinates3D.bottomLeft
          ];
        } else {
          // Convert 2D coordinates to 3D
          points = [
            {
              x: (doorArea.topLeft.x - centerOffset.x) / scaleFactor,
              y: 0,
              z: -(doorArea.topLeft.y - centerOffset.y) / scaleFactor
            },
            {
              x: (doorArea.topRight.x - centerOffset.x) / scaleFactor,
              y: 0,
              z: -(doorArea.topRight.y - centerOffset.y) / scaleFactor
            },
            {
              x: (doorArea.bottomRight.x - centerOffset.x) / scaleFactor,
              y: 0,
              z: -(doorArea.bottomRight.y - centerOffset.y) / scaleFactor
            },
            {
              x: (doorArea.bottomLeft.x - centerOffset.x) / scaleFactor,
              y: 0,
              z: -(doorArea.bottomLeft.y - centerOffset.y) / scaleFactor
            }
          ];
        }

        // Create line geometry connecting all points (closed loop)
        // Use LineLoop to create a continuous closed line
        const linePoints = [
          new THREE.Vector3(points[0].x, points[0].y + 0.1, points[0].z),
          new THREE.Vector3(points[1].x, points[1].y + 0.1, points[1].z),
          new THREE.Vector3(points[2].x, points[2].y + 0.1, points[2].z),
          new THREE.Vector3(points[3].x, points[3].y + 0.1, points[3].z)
          // LineLoop automatically closes the loop, so we don't need to repeat the first point
        ];

        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);

        return (
          <group key={`door-area-${doorArea.id}`}>
            {/* Red line outline - Use LineLoop for continuous closed loop */}
            <lineLoop geometry={lineGeometry}>
              <lineBasicMaterial color="#ff0000" linewidth={3} />
            </lineLoop>
            {/* Also add a semi-transparent plane to show the area */}
            <mesh position={[
              (points[0].x + points[1].x + points[2].x + points[3].x) / 4,
              0.05,
              (points[0].z + points[1].z + points[2].z + points[3].z) / 4
            ]}>
              <planeGeometry args={[
                Math.abs(points[1].x - points[0].x),
                Math.abs(points[0].z - points[3].z)
              ]} />
              <meshBasicMaterial color="#ff0000" transparent opacity={0.1} />
            </mesh>
            {/* Label with DXF and 3D coordinates */}
            <Html position={[
              (points[0].x + points[1].x + points[2].x + points[3].x) / 4,
              1,
              (points[0].z + points[1].z + points[2].z + points[3].z) / 4
            ]} center>
              <div style={{
                background: 'rgba(255, 0, 0, 0.9)',
                color: 'white',
                padding: '6px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                border: '2px solid #ff0000',
                fontWeight: 'bold'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{doorArea.name}</div>
                <div style={{ fontSize: '10px', opacity: 0.9 }}>
                  DXF: ({doorArea.topLeft.x}, {doorArea.topLeft.y}) to ({doorArea.bottomRight.x}, {doorArea.bottomRight.y})
                </div>
                {doorArea.coordinates3D ? (
                  <div style={{ fontSize: '10px', opacity: 0.9 }}>
                    3D: ({doorArea.coordinates3D.topLeft.x.toFixed(2)}, {doorArea.coordinates3D.topLeft.z.toFixed(2)}) to ({doorArea.coordinates3D.bottomRight.x.toFixed(2)}, {doorArea.coordinates3D.bottomRight.z.toFixed(2)})
                  </div>
                ) : (
                  <div style={{ fontSize: '10px', opacity: 0.9 }}>
                    3D: ({points[0].x.toFixed(2)}, {points[0].z.toFixed(2)}) to ({points[2].x.toFixed(2)}, {points[2].z.toFixed(2)})
                  </div>
                )}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}

// Stage3D component is now handled by OptimizedStageAndEvents component

// First Person Controls with WASD movement and smooth camera rotation
function FirstPersonControls({
  floorPlanBounds,
  onLockChange,
  onCameraUpdate,
  initialRotationX,
  initialRotationY
}: {
  floorPlanBounds: any;
  onLockChange?: (locked: boolean) => void;
  onCameraUpdate?: (position: { x: number; y: number; z: number; rotationX: number; rotationY: number }) => void;
  initialRotationX?: number;
  initialRotationY?: number;
}) {
  const { camera, gl, raycaster, scene } = useThree();
  const moveSpeed = 5; // Units per second
  const lookSpeed = 0.0015; // Mouse sensitivity - optimized for smoother rotation
  const [isActive, setIsActive] = useState(false);

  // Movement state
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });

  // Camera rotation state
  const euler = useRef(new THREE.Euler(initialRotationX || 0, initialRotationY || 0, 0, 'YXZ'));
  const isMouseDown = useRef(false);
  const lastMouseX = useRef(0);
  const lastMouseY = useRef(0);

  // Throttle camera updates to avoid excessive calls
  const lastUpdateTime = useRef(0);
  const updateThrottle = 500; // Update every 500ms

  // Scroll zoom - immediate movement (no accumulation/decay)
  const scrollMovement = useRef(0);
  const scrollStopTimeout = useRef<NodeJS.Timeout | null>(null);

  // Initialize camera euler from saved rotation or current rotation
  useEffect(() => {
    if (initialRotationX !== undefined || initialRotationY !== undefined) {
      euler.current.x = initialRotationX || 0;
      euler.current.y = initialRotationY || 0;
      camera.quaternion.setFromEuler(euler.current);
    } else {
      euler.current.setFromQuaternion(camera.quaternion);
    }
  }, [camera, initialRotationX, initialRotationY]);

  // Mouse controls for camera rotation
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      // Right click or left click to rotate
      if (event.button === 2 || event.button === 0) {
        isMouseDown.current = true;
        lastMouseX.current = event.clientX;
        lastMouseY.current = event.clientY;
        setIsActive(true);
        if (onLockChange) onLockChange(true);
      }
    };

    const handleMouseUp = () => {
      isMouseDown.current = false;
      setIsActive(false);
      if (onLockChange) onLockChange(false);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isMouseDown.current) return;

      const deltaX = event.clientX - lastMouseX.current;
      const deltaY = event.clientY - lastMouseY.current;

      lastMouseX.current = event.clientX;
      lastMouseY.current = event.clientY;

      // Apply rotation with smoothing
      euler.current.y += deltaX * lookSpeed; // Yaw (left-right)
      euler.current.x += deltaY * lookSpeed; // Pitch (up-down)

      // Limit pitch to prevent gimbal lock and unnatural head movements
      const PI_2 = Math.PI / 2;
      euler.current.x = Math.max(-PI_2 + 0.1, Math.min(PI_2 - 0.1, euler.current.x));

      // Apply rotation to camera
      camera.quaternion.setFromEuler(euler.current);
    };

    // Click-to-teleport on double-click
    const handleDoubleClick = (event: MouseEvent) => {
      // Get mouse position
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      // Raycast to find intersection with ground
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        // Teleport to clicked position, maintaining eye level
        camera.position.x = point.x;
        camera.position.z = point.z;
        camera.position.y = Math.max(1.7, point.y + 1.7);
      }
    };

    // Prevent context menu on right click
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    // Scroll to zoom - move forward/backward with immediate response
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();

      // Calculate forward direction for immediate movement
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0; // Keep movement on horizontal plane
      forward.normalize();

      // Negative deltaY = scroll up/forward = zoom in = move forward
      // Positive deltaY = scroll down/backward = zoom out = move backward
      // Use realistic, gradual movement - proportional to moveSpeed but slower
      // Mouse wheel deltaY is typically ~100 per tick, so divide by 100 for normalization
      const scrollSensitivity = 0.2; // Realistic movement speed (slower than keyboard)
      const normalizedDelta = event.deltaY / 100; // Normalize to ~1 per scroll tick
      const scrollDelta = -normalizedDelta * scrollSensitivity;

      // Apply movement immediately (no accumulation)
      const movement = forward.multiplyScalar(scrollDelta);
      camera.position.add(movement);

      // Clear any pending stop timeout
      if (scrollStopTimeout.current) {
        clearTimeout(scrollStopTimeout.current);
        scrollStopTimeout.current = null;
      }

      // Track scroll state for potential smoothing (optional)
      scrollMovement.current = scrollDelta;

      // Reset scroll state after scroll ends (50ms of no scrolling)
      scrollStopTimeout.current = setTimeout(() => {
        scrollMovement.current = 0;
        scrollStopTimeout.current = null;
      }, 50);
    };

    const canvas = gl.domElement;
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.addEventListener('wheel', handleWheel, { passive: false }); // Prevent default scroll behavior
    document.addEventListener('mouseup', handleMouseUp); // Catch mouseup outside canvas

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.removeEventListener('wheel', handleWheel);
      document.removeEventListener('mouseup', handleMouseUp);

      // Cleanup scroll timeout
      if (scrollStopTimeout.current) {
        clearTimeout(scrollStopTimeout.current);
        scrollStopTimeout.current = null;
      }
    };
  }, [camera, gl, raycaster, scene, onLockChange]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = true;
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          moveState.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          moveState.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          moveState.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          moveState.current.right = false;
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Focus management - activate on canvas click
  useEffect(() => {
    const handleFocus = () => {
      setIsActive(true);
      if (onLockChange) onLockChange(true);
    };

    const handleBlur = () => {
      // Don't deactivate immediately, let mouse controls handle it
    };

    const canvas = gl.domElement;
    canvas.addEventListener('focus', handleFocus);
    canvas.addEventListener('blur', handleBlur);

    return () => {
      canvas.removeEventListener('focus', handleFocus);
      canvas.removeEventListener('blur', handleBlur);
    };
  }, [gl, onLockChange]);

  // Get scale factor from context (outside useFrame)
  const scaleFactor = useScaleFactor();
  const { gl: glContext } = useThree();

  // Track movement speed for adaptive quality
  const lastPosition = useRef(new THREE.Vector3());
  const lastRotation = useRef(new THREE.Quaternion());
  const movementSpeed = useRef(0);
  const isMovingFast = useRef(false);
  const shadowUpdateThrottle = useRef(0);

  // Movement update - works anytime, no pointer lock needed
  useFrame((state, delta) => {
    // Calculate movement speed for adaptive quality
    const positionDelta = camera.position.distanceTo(lastPosition.current);
    const rotationDelta = camera.quaternion.angleTo(lastRotation.current);
    movementSpeed.current = (positionDelta + rotationDelta * 10) / delta; // Combined speed metric

    // Consider fast movement if speed > threshold
    const fastThreshold = 50; // Adjust based on testing
    isMovingFast.current = movementSpeed.current > fastThreshold;

    // Update last position/rotation
    lastPosition.current.copy(camera.position);
    lastRotation.current.copy(camera.quaternion);

    // During fast movement, reduce shadow updates to prevent context loss
    shadowUpdateThrottle.current += delta;
    const shouldUpdateShadows = !isMovingFast.current || shadowUpdateThrottle.current > 0.1; // Update shadows max 10x per second during fast movement

    if (shouldUpdateShadows && isMovingFast.current) {
      shadowUpdateThrottle.current = 0;
    }

    // Temporarily disable shadow map updates during fast movement
    if (isMovingFast.current) {
      glContext.shadowMap.autoUpdate = false;
    } else {
      glContext.shadowMap.autoUpdate = true;
    }

    // Calculate movement direction in camera space
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    camera.getWorldDirection(forward);
    forward.y = 0; // Keep movement on horizontal plane
    forward.normalize();

    // Calculate right vector: cross product of forward and up gives right
    // Use forward x up (not up x forward) to get correct right direction
    // This works correctly for any floor plan orientation
    right.crossVectors(forward, camera.up).normalize();

    // Calculate desired movement based on input
    const moveDirection = new THREE.Vector3();

    if (moveState.current.forward) moveDirection.add(forward);
    if (moveState.current.backward) moveDirection.sub(forward);
    if (moveState.current.right) moveDirection.add(right);
    if (moveState.current.left) moveDirection.sub(right);

    // Normalize to prevent faster diagonal movement
    if (moveDirection.length() > 0) {
      moveDirection.normalize();
    }

    // Apply keyboard movement with frame rate limiting during fast movement
    const effectiveDelta = isMovingFast.current ? Math.min(delta, 0.033) : delta; // Cap at ~30fps during fast movement
    if (moveDirection.length() > 0) {
      const movement = moveDirection.multiplyScalar(moveSpeed * effectiveDelta);
      camera.position.add(movement);
    }

    // Scroll zoom movement is now applied immediately in handleWheel
    // No accumulation or decay needed - movement is direct and responsive

    // Boundary checking - restrict movement to floor plan bounds with 30 feet padding
    // Convert DXF bounds to 3D coordinates for accurate boundary checking
    if (floorPlanBounds) {
      // Add 30 feet padding around the floor plan (30 feet = 360 inches in DXF units)
      const paddingFeet = 50;
      const paddingDXFUnits = paddingFeet * 12; // 360 inches

      // Calculate padded bounds in DXF coordinates
      const paddedMinX = floorPlanBounds.minX - paddingDXFUnits;
      const paddedMaxX = floorPlanBounds.maxX + paddingDXFUnits;
      const paddedMinY = floorPlanBounds.minY - paddingDXFUnits;
      const paddedMaxY = floorPlanBounds.maxY + paddingDXFUnits;

      // Convert padded DXF coordinates to 3D space
      // x_3d = (dxf_x - centerX) / scaleFactor
      // z_3d = -(dxf_y - centerY) / scaleFactor (Y is flipped)
      const minX_3D = (paddedMinX - floorPlanBounds.centerX) / scaleFactor;
      const maxX_3D = (paddedMaxX - floorPlanBounds.centerX) / scaleFactor;
      const minZ_3D = -(paddedMaxY - floorPlanBounds.centerY) / scaleFactor; // maxY becomes minZ
      const maxZ_3D = -(paddedMinY - floorPlanBounds.centerY) / scaleFactor; // minY becomes maxZ

      // Add small padding to prevent camera from touching the border walls
      const wallPadding = 0.5; // 0.5 units padding from walls

      camera.position.x = THREE.MathUtils.clamp(camera.position.x, minX_3D + wallPadding, maxX_3D - wallPadding);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, minZ_3D + wallPadding, maxZ_3D - wallPadding);
    }

    // Keep camera at reasonable height (allow some vertical movement)
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.5, 5);

    // Update camera position callback (throttled)
    const now = Date.now();
    if (onCameraUpdate && (now - lastUpdateTime.current) > updateThrottle) {
      lastUpdateTime.current = now;
      onCameraUpdate({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        rotationX: euler.current.x,
        rotationY: euler.current.y
      });
    }
  });

  return null; // No visual component needed
}

export default function HallCanvas3DWalk({
  selectedStage,
  selectedEvent,
  guestCount,
  venueConfig,
  floorPlan,
  onStageUpdate
}: HallCanvas3DWalkProps) {
  // Setup global error handler for blob URL texture errors (only once)
  useEffect(() => {
    setupGLTFErrorHandler();
  }, []);

  // Setup global error handler for GLB loading errors (Array buffer allocation, etc.)
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.toString() || '';
      const message = event.reason?.message || reason;

      // Check if it's a GLB loading error
      if (
        message.includes('Array buffer allocation failed') ||
        message.includes('Could not load') ||
        message.includes('.glb') ||
        message.includes('GLTFLoader')
      ) {
        console.error('GLB loading error caught:', event.reason);
        setGlbLoadError(new Error(message || 'Failed to load 3D model'));
        event.preventDefault(); // Prevent default error logging
      }
    };

    const handleError = (event: ErrorEvent) => {
      const message = event.message || '';

      // Check if it's a GLB loading error
      if (
        message.includes('Array buffer allocation failed') ||
        message.includes('Could not load') ||
        message.includes('.glb') ||
        message.includes('GLTFLoader')
      ) {
        console.error('GLB loading error caught:', event.error);
        setGlbLoadError(new Error(message || 'Failed to load 3D model'));
        event.preventDefault(); // Prevent default error logging
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Detect device type for optimizations
  const deviceInfo = useMemo(() => getDeviceInfo(), []);
  const isTabletOrMobile = deviceInfo.isTablet || deviceInfo.isMobile;
  const hasLimitedMem = hasLimitedMemory();
  const [glbLoadError, setGlbLoadError] = useState<Error | null>(null);
  const { setTableArrangement, selectedTableArea, floorPlanBounds, walkCameraPosition, setWalkCameraPosition } = useHallStore();
  const [loadModel, setLoadModel] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ stage: 'initializing', percent: 0, message: 'Initializing...' });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [showFloor, setShowFloor] = useState(false);
  const [showTables, setShowTables] = useState(false);
  const [showChairs, setShowChairs] = useState(false);
  const [showStage, setShowStage] = useState(false);
  const [showDebug, setShowDebug] = useState(false); // Debug mode toggle
  const [showInfoPanel, setShowInfoPanel] = useState(true); // Info panel visibility
  const [cursorDebugInfo, setCursorDebugInfo] = useState<CursorDebugInfo | null>(null);
  const [capturedPoints, setCapturedPoints] = useState<CapturedPoint[]>([]);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'need4' | 'error'>('idle');

  // Auto-close info panel after 5 seconds
  useEffect(() => {
    if (showInfoPanel) {
      const timer = setTimeout(() => {
        setShowInfoPanel(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showInfoPanel]);

  useEffect(() => {
    if (!showDebug) {
      setCursorDebugInfo(null);
      setCapturedPoints([]);
      setCopyStatus('idle');
    }
  }, [showDebug]);

  useEffect(() => {
    setCopyStatus('idle');
  }, [capturedPoints]);

  const captureCurrentPoint = useCallback(() => {
    if (!cursorDebugInfo) return;

    setCapturedPoints(prev => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.world.x === cursorDebugInfo.world.x &&
        last.world.y === cursorDebugInfo.world.y &&
        last.world.z === cursorDebugInfo.world.z
      ) {
        return prev;
      }

      const next: CapturedPoint = {
        id: `P${prev.length + 1}`,
        timestamp: Date.now(),
        world: cursorDebugInfo.world,
        dxf: cursorDebugInfo.dxf
      };

      const combined = [...prev, next];
      return combined.slice(-12);
    });
  }, [cursorDebugInfo]);

  const clearCapturedPoints = useCallback(() => {
    setCapturedPoints([]);
    setCopyStatus('idle');
  }, []);

  const copyMountPointsWorld = useCallback(async () => {
    if (capturedPoints.length < 4) {
      setCopyStatus('need4');
      return;
    }

    const points = capturedPoints.slice(0, 4);
    const labels = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
    const formatPoint = (point: CapturedPoint) =>
      `{ x: ${point.world.x.toFixed(3)}, y: ${point.world.y.toFixed(3)}, z: ${point.world.z.toFixed(3)} }`;

    const snippet = `mountPointsWorld: {\n${points
      .map((point, index) => `  ${labels[index] ?? `p${index + 1}`}: ${formatPoint(point)}`)
      .join(',\n')}\n},`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(snippet);
        setCopyStatus('copied');
      } else {
        console.log('mountPointsWorld snippet:\n', snippet);
        setCopyStatus('copied');
      }
    } catch (error) {
      console.warn('Failed to copy mountPointsWorld snippet:', error);
      setCopyStatus('error');
    }
  }, [capturedPoints]);

  const handleCanvasPointerDown = useCallback((event: any) => {
    if (!showDebug || !cursorDebugInfo) return;
    if (event?.nativeEvent?.button !== 0) return;
    captureCurrentPoint();
  }, [showDebug, cursorDebugInfo, captureCurrentPoint]);
  const [floorPlanLoaded, setFloorPlanLoaded] = useState(false); // Track when floor plan is fully loaded

  // Count objects for display (no limits with InstancedMesh!)
  const { objects } = useHallStore();
  const tableCount = objects.filter(obj => obj.type === 'table').length;
  const chairCount = objects.filter(obj => obj.type === 'chair').length;
  const totalObjects = tableCount + chairCount;
  // Get floor plan bounds (same as Global view)
  const currentBounds = useMemo(() => {
    return floorPlanBounds || {
      minX: -3000, maxX: 3000, minY: -2000, maxY: 2000,
      centerX: 0, centerY: 0,
      width: 6000, height: 4000
    };
  }, [floorPlanBounds]);

  // Monitor memory usage with automatic quality reduction and model management
  useEffect(() => {
    const interval = setInterval(() => {
      const glbUsage = getMemoryUsage();
      const stats = getMemoryStats();
      const modelStats = modelManager.getStats();

      setMemoryUsage(stats.totalMB);

      // Log status periodically
      if (stats.isWarning) {
        logMemoryStatus();
        console.log(`[Model Manager] Loaded: ${modelStats.loaded}, Queued: ${modelStats.queued}, Memory: ${modelStats.totalMemory.toFixed(2)}MB`);
      }

      // Automatic quality reduction if critical
      if (shouldReduceQuality() && sceneRef.current) {
        console.error('[Memory] CRITICAL! Reducing quality to prevent context loss...');
        reduceMemoryUsage(sceneRef.current);

        // Also unload some models
        if (modelStats.loaded > 10) {
          console.warn('[Memory] Unloading models to free memory...');
          // Model manager will automatically unload least-used models
        }
      }

      // Warn if approaching memory limit
      if (isMemoryLimitApproached()) {
        console.warn(`[Memory] GLB Loader approaching limit: ${glbUsage.toFixed(2)} MB`);
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, []);

  // Cleanup on unmount - CRITICAL for preventing memory leaks
  useEffect(() => {
    return () => {
      // Clear all geometry/material pools when leaving 3D view
      if (sceneRef.current) {
        // Don't clear pools, just dispose scene objects
        // Pools will be reused if user comes back
      }

      logMemoryStatus();
      // Note: Don't destroy model manager here as it's a singleton
      // It will be cleaned up when the app unmounts
    };
  }, []);

  // Auto-calculated SCALE_FACTOR from floor plan
  const [autoScaleFactor, setAutoScaleFactor] = useState<number>(50); // Default fallback

  // Calculate floor plan center - use same logic as Global view for consistent positioning
  const floorPlanCenter = useMemo(() => {
    let center;
    // Use center from store bounds (most reliable)
    if (floorPlanBounds) {
      center = { x: floorPlanBounds.centerX, y: floorPlanBounds.centerY };
      return center;
    }
    // Fallback to corner points calculation
    if (floorPlan?.cornerPoints) {
      const { topLeft, topRight, bottomRight, bottomLeft } = floorPlan.cornerPoints;
      const centerX = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
      const centerY = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;
      center = { x: centerX, y: centerY };
      return center;
    }
    // Default center for Infinity Ballroom
    center = { x: 1855, y: 1570 };
    return center;
  }, [floorPlanBounds, floorPlan]);

  // Use auto-calculated SCALE_FACTOR, fallback to default
  const currentScaleFactor = autoScaleFactor || 50;

  // Get camera start position - use saved position if available, otherwise use config
  const cameraStartPosition = useMemo(() => {
    // First priority: use saved camera position from previous session
    if (walkCameraPosition) {
      return {
        x: walkCameraPosition.x,
        y: walkCameraPosition.y,
        z: walkCameraPosition.z,
        rotation: walkCameraPosition.rotationY || 0,
        rotationX: walkCameraPosition.rotationX || 0
      };
    }

    // Second priority: use configured walk start position
    const walkPos = floorPlan?.walkStartPosition;
    if (walkPos) {
      // Use 3D coordinates directly
      const x = walkPos.x;
      const y = walkPos.y;
      const z = walkPos.z;
      // Convert rotation from degrees to radians (THREE.Euler expects radians)
      const rotationRad = THREE.MathUtils.degToRad(walkPos.rotation || 0);
      return { x, y, z, rotation: rotationRad, rotationX: 0 };
    }

    // Default: start at origin, eye level
    return { x: 0, y: 1.7, z: 0, rotation: 0, rotationX: 0 };
  }, [floorPlan, floorPlanCenter, walkCameraPosition, currentScaleFactor]);

  // Get chair GLB path and width from venue config
  const chairConfig = useMemo(() => {
    if (venueConfig?.tableAreas) {
      for (const tableArea of venueConfig.tableAreas) {
        if (tableArea.singleChair) {
          return {
            glbPath: tableArea.singleChair.glbFileName,
            width: tableArea.singleChair.width || 18,
            height: tableArea.singleChair.height || 18
          };
        }
      }
    }
    if (floorPlan?.tableAreas) {
      for (const tableArea of floorPlan.tableAreas) {
        if (tableArea.singleChair) {
          return {
            glbPath: tableArea.singleChair.glbFileName,
            width: tableArea.singleChair.width || 18,
            height: tableArea.singleChair.height || 18
          };
        }
      }
    }
    return { glbPath: undefined, width: 18, height: 18 };
  }, [venueConfig, floorPlan]);

  // Get table GLB path and dimensions from venue config
  const tableConfig = useMemo(() => {
    let config;
    if (floorPlan?.tableAreas) {
      for (const tableArea of floorPlan.tableAreas) {
        if (tableArea.glbFileName) {
          config = {
            glbPath: tableArea.glbFileName,
            width: tableArea.width || 72,
            height: tableArea.height || 72,
            glbRotation: tableArea.glbRotation || 0
          };
          return config;
        }
      }
    }
    return { glbPath: undefined, width: 72, height: 72, glbRotation: 0 };
  }, [floorPlan]);

  // Update table arrangement when guest count, table area, or stage changes (keep 3D walk in sync with 2D logic)
  // Door areas are used the same way as 2D view - tables/chairs automatically skip door areas and start placing after that space
  // The same table calculation logic is used for both 2D and 3D views, ensuring consistency
  // Note: For 3D view, we convert 3D coordinates to DXF coordinates before passing to table calculator
  // useEffect(() => {
  //   const tableConfig = selectedTableArea || floorPlan?.tableAreas?.[0];

  //   if (!tableConfig) {
  //     return;
  //   }

  //   // Don't use door areas in calculation - calculate all tables to maintain column structure
  //   // We'll filter tables in 3D door areas during rendering (just add space, don't skip columns)
  //   // This ensures: Column 1, Column 2, [door space], Column 3 structure is maintained
  //   const doorAreasForCalculation: DoorArea[] = [];

  //   if (guestCount <= 0) {
  //     setTableArrangement(0, tableConfig, doorAreasForCalculation, true);
  //     return;
  //   }

  //   if (!selectedStage) {
  //     setTableArrangement(guestCount, tableConfig, doorAreasForCalculation, true);
  //     return;
  //   }

  //   if (selectedStage) {
  //     const updatedTableConfig = calculateTableAreaAfterStage(selectedStage, tableConfig, 15);
  //     setTableArrangement(guestCount, updatedTableConfig, doorAreasForCalculation, true);
  //     return;
  //   }

  //   let isCancelled = false;

  //   (async () => {
  //     try {
  //       const dxfData = await getStageDXFData(selectedStage, floorPlan?.fileName);

  //       if (isCancelled) return;

  //       if (dxfData) {
  //         const tableAreaPoints = handleStageSelection(
  //           selectedStage,
  //           tableConfig,
  //           'inches',
  //           dxfData.stageDxf
  //         );
  //         const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
  //         setTableArrangement(guestCount, updatedTableConfig, doorAreasForCalculation);
  //       } else {
  //         const tableAreaPoints = handleStageSelection(selectedStage, tableConfig, 'inches');
  //         const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
  //         setTableArrangement(guestCount, updatedTableConfig, doorAreasForCalculation);
  //       }
  //     } catch (error) {
  //       console.error('Error calculating tables for 3D walk view:', error);
  //       if (isCancelled) return;
  //       const tableAreaPoints = handleStageSelection(selectedStage, tableConfig, 'inches');
  //       const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
  //       setTableArrangement(guestCount, updatedTableConfig, doorAreasForCalculation);
  //     }
  //   })();

  //   return () => {
  //     isCancelled = true;
  //   };
  // }, [guestCount, selectedTableArea, selectedStage, floorPlan, setTableArrangement]);

  // Preload chair GLB model if available
  useEffect(() => {
    if (chairConfig.glbPath) {
      try {
        useGLTF.preload(`/${chairConfig.glbPath}`);
      } catch (error) {
        // Silently handle blob URL errors during preload
        if (error instanceof Error && error.message.includes('blob:')) {
          console.warn(`⚠️ Skipped preload for chair model with blob URL textures`);
        } else {
          console.error('Error preloading chair model:', error);
        }
      }
    }
  }, [chairConfig.glbPath]);

  // Preload table GLB model if available
  useEffect(() => {
    if (tableConfig.glbPath) {
      try {
        useGLTF.preload(`/${tableConfig.glbPath}`);
      } catch (error) {
        // Silently handle blob URL errors during preload
        if (error instanceof Error && error.message.includes('blob:')) {
          console.warn(`⚠️ Skipped preload for table model with blob URL textures`);
        } else {
          console.error('Error preloading table model:', error);
        }
      }
    }
  }, [tableConfig.glbPath]);

  // Preload stage GLB if available
  useEffect(() => {
    if (selectedStage?.glbFileName) {
      useGLTF.preload(`/${selectedStage.glbFileName}`);
    }
  }, [selectedStage]);

  // Preload event object GLBs if available
  useEffect(() => {
    if (selectedEvent?.objects) {
      selectedEvent.objects.forEach((obj) => {
        if (obj.glbFileName) {
          useGLTF.preload(`/${obj.glbFileName}`);
        }
      });
    }
  }, [selectedEvent]);

  // Progressive loading with stages and proper feedback - Wait for floor plan to load
  useEffect(() => {
    let mounted = true;

    const progressiveLoad = async () => {

      // Stage 1: Initialize
      if (!mounted) return;
      setLoadingProgress({ stage: 'initializing', percent: 5, message: 'Preparing 3D environment...' });
      await new Promise(resolve => setTimeout(resolve, 300));

      // Stage 2: Floor Plan - Start loading
      if (!mounted) return;
      setLoadingProgress({ stage: 'floor', percent: 10, message: 'Loading floor plan...' });
      setLoadModel(true);
      setShowFloor(true);

      // Wait for floor plan to fully load (will be triggered by onLoaded callback)
      let waitCount = 0;
      while (!floorPlanLoaded && waitCount < 100 && mounted) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }

      if (!mounted) return;
      setLoadingProgress({ stage: 'floor', percent: 40, message: 'Floor plan ready' });
      await new Promise(resolve => setTimeout(resolve, 200));

      // Stage 3: Tables - Only load after floor plan is ready
      if (!mounted) return;
      const tableCount = objects.filter(obj => obj.type === 'table').length;
      setLoadingProgress({ stage: 'tables', percent: 50, message: `Loading ${tableCount} tables...` });
      setShowTables(true);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!mounted) return;
      setLoadingProgress({ stage: 'tables', percent: 65, message: `${tableCount} tables rendered` });
      await new Promise(resolve => setTimeout(resolve, 200));

      // Stage 4: Chairs
      if (!mounted) return;
      const chairCount = objects.filter(obj => obj.type === 'chair').length;
      setLoadingProgress({ stage: 'chairs', percent: 75, message: `Loading ${chairCount} chairs...` });
      setShowChairs(true);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!mounted) return;
      setLoadingProgress({ stage: 'chairs', percent: 85, message: `${chairCount} chairs rendered` });
      await new Promise(resolve => setTimeout(resolve, 200));

      // Stage 5: Stage & Events - Only after floor plan is loaded
      if (!mounted) return;
      setLoadingProgress({ stage: 'stage', percent: 92, message: 'Loading stage & events...' });
      setShowStage(true);
      await new Promise(resolve => setTimeout(resolve, 300));

      // Complete
      if (!mounted) return;
      setLoadingProgress({ stage: 'complete', percent: 100, message: 'Ready!' });

      // Check memory after loading
      setTimeout(() => {
        logMemoryStatus();
      }, 500);
    };

    // Only start loading if floor plan has GLB file, otherwise mark as loaded immediately
    if (floorPlan?.glbFileName) {
      progressiveLoad();
    } else {
      // No floor plan GLB, mark as loaded and proceed
      if (!floorPlanLoaded) {
        setFloorPlanLoaded(true);
      }
      progressiveLoad();
    }

    return () => {
      mounted = false;
    };
  }, [objects, floorPlanLoaded, floorPlan]);

  // Mark floor plan as loaded if no GLB file exists
  useEffect(() => {
    if (showFloor && !floorPlan?.glbFileName && !floorPlanLoaded) {
      setFloorPlanLoaded(true);
      setLoadingProgress(prev => ({ ...prev, percent: 40, message: 'Floor plan ready' }));
    }
  }, [showFloor, floorPlan?.glbFileName, floorPlanLoaded]);

  // Save camera position when component unmounts (switching views)
  useEffect(() => {
    return () => {
      // Component is unmounting, save the current camera position
      // This will be called when switching from 3D Walk to another view
    };
  }, [setWalkCameraPosition]);
  return (
    <div className="relative w-full h-full bg-gray-900">
      {/* GLB Loading Error Display */}
      {glbLoadError && (
        <div className="absolute inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center p-4">
          <div className="bg-red-900 bg-opacity-95 text-white px-6 py-6 rounded-lg shadow-2xl max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="text-4xl">⚠️</div>
              <div>
                <p className="font-bold text-xl">Failed to Load 3D Model</p>
                <p className="text-sm opacity-90 mt-1">Array buffer allocation failed</p>
              </div>
            </div>
            <p className="text-sm mb-4 opacity-90">
              The floor plan model could not be loaded due to insufficient memory on your device.
            </p>
            <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 mb-4">
              <p className="text-yellow-200 font-semibold mb-2 text-sm">💡 Recommended Solutions:</p>
              <ul className="text-yellow-100 text-xs space-y-1">
                <li>• Use a tablet or computer with more memory</li>
                <li>• Close other applications to free up memory</li>
                <li>• Try refreshing the page</li>
                <li>• Use the 2D view instead</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setGlbLoadError(null);
                  window.location.reload();
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={() => setGlbLoadError(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen Loading Overlay */}
      {loadingProgress.percent < 100 && !glbLoadError && (
        <LoadingScreen3D progress={loadingProgress.percent} stage={loadingProgress.stage as 'initializing' | 'floor' | 'tables' | 'chairs' | 'stage' | 'events' | 'complete'} />
      )}

      {/* Object Count Display */}
      {/* {totalObjects > 0 && loadingProgress.percent >= 100 && (
        <div className="absolute top-20 right-4 z-10 bg-blue-600 bg-opacity-90 text-white px-4 py-3 rounded-lg shadow-lg max-w-xs">
          <div className="flex items-start gap-2">
            <span className="text-lg">🏛️</span>
            <div className="text-sm">
              <p className="font-bold mb-1">3D Walk Mode</p>
              <p className="text-xs">Table Sets: {tableCount}</p>
              <p className="text-xs">Individual Chairs: {chairCount}</p>
              {chairCount > 0 && (
                <p className="text-xs mt-2 text-green-200">
                  ⚡ Chairs: InstancedMesh (1 draw call)
                </p>
              )}
            </div>
          </div>
        </div>
      )} */}

      {/* Debug Toggle & Coordinate Info */}
      {/* {loadingProgress.percent >= 100 && (
        <div className="absolute bottom-4 right-4 z-10 bg-gray-900 bg-opacity-90 text-white p-3 rounded-lg shadow-lg max-w-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold">🔍 Debug Mode</span>
            <button
              onClick={() => setShowDebug(!showDebug)}
              className={`px-3 py-1 text-xs rounded ${showDebug ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
                }`}
            >
              {showDebug ? 'ON' : 'OFF'}
            </button>
          </div>
          {showDebug && (
            <div className="text-xs font-mono space-y-1 pt-2 border-t border-gray-700">
              <p className="text-gray-400">Coordinate System:</p>
              <p>• <span className="text-red-400">Red</span> = X axis (East/West)</p>
              <p>• <span className="text-green-400">Green</span> = Y axis (Up/Down)</p>
              <p>• <span className="text-blue-400">Blue</span> = Z axis (North/South)</p>
              <p className="pt-2 text-gray-400">DXF → 3D Conversion:</p>
              <p>• Scale Factor: <span className="text-green-400">{currentScaleFactor.toFixed(4)}</span> <span className="text-xs">(auto)</span></p>
              <p>• Floor Center: ({floorPlanCenter.x}, {floorPlanCenter.y})</p>
              <p>• Formula: 3D = (DXF - Center) / {currentScaleFactor.toFixed(2)}</p>
              {cursorDebugInfo && (
                <div className="pt-2 border-t border-gray-700 mt-2 space-y-1">
                  <p className="text-gray-400">Cursor (hover point):</p>
                  <p>• World: <span className="text-cyan-300">
                    X {cursorDebugInfo.world.x.toFixed(2)} | Y {cursorDebugInfo.world.y.toFixed(2)} | Z {cursorDebugInfo.world.z.toFixed(2)}
                  </span></p>
                  <p>• DXF: <span className="text-yellow-300">
                    X {cursorDebugInfo.dxf.x.toFixed(0)} | Y {cursorDebugInfo.dxf.y.toFixed(0)} | Z {cursorDebugInfo.dxf.z.toFixed(0)}
                  </span></p>
                </div>
              )}
              <div className="pt-2 border-t border-gray-700 mt-2 space-y-1">
                <p className="text-gray-400">Capture Corners:</p>
                <p>• Toggle Debug ON</p>
                <p>• Hover corner → <span className="text-green-300">Left-click</span> to store</p>
                <p>• Recommended order: top-left → top-right → bottom-right → bottom-left</p>
              </div>
              {capturedPoints.length > 0 && (
                <div className="pt-2 border-t border-gray-700 mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-gray-400">Captured Points ({capturedPoints.length})</p>
                    <button
                      type="button"
                      onClick={clearCapturedPoints}
                      className="text-[10px] text-red-300 hover:text-red-200 transition"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto pr-1 space-y-1">
                    {capturedPoints.map((point, idx) => (
                      <div
                        key={point.timestamp}
                        className="bg-gray-800/70 border border-gray-700/70 rounded px-2 py-1"
                      >
                        <p className="text-[10px] text-gray-400 mb-1">#{idx + 1} ({point.id})</p>
                        <p className="text-[10px] text-cyan-300">
                          W: {point.world.x.toFixed(2)}, {point.world.y.toFixed(2)}, {point.world.z.toFixed(2)}
                        </p>
                        <p className="text-[10px] text-yellow-200">
                          DXF: {point.dxf.x}, {point.dxf.y}, {point.dxf.z}
                        </p>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={copyMountPointsWorld}
                    className={`w-full text-[11px] font-semibold py-1.5 rounded transition ${copyStatus === 'copied'
                        ? 'bg-green-600 text-white'
                        : copyStatus === 'need4'
                          ? 'bg-yellow-600 text-white'
                          : copyStatus === 'error'
                            ? 'bg-red-600 text-white'
                            : 'bg-blue-600 text-white hover:bg-blue-500'
                      }`}
                  >
                    {copyStatus === 'copied' && 'Copied mountPointsWorld!'}
                    {copyStatus === 'need4' && 'Need 4 points (TL, TR, BR, BL)'}
                    {copyStatus === 'error' && 'Copy failed (check console)'}
                    {copyStatus === 'idle' && 'Copy mountPointsWorld snippet'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}  */}

      {/* Controls Status Indicator */}
      {controlsLocked && (
        <div className="absolute top-4 right-4 z-10 bg-blue-600 bg-opacity-90 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span className="text-sm font-semibold">Camera Active</span>
        </div>
      )}

      {/* Instructions & Memory Monitor - Auto-close after 5 seconds */}
      {showInfoPanel && (
        <div className="absolute top-4 left-4 z-10 bg-black bg-opacity-75 text-white p-4 rounded-lg shadow-lg max-w-xs animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-bold">3D Walk Mode</h3>
            <button
              onClick={() => setShowInfoPanel(false)}
              className="text-gray-400 hover:text-white transition-colors ml-2 cursor-pointer"
              aria-label="Close info"
            >
              ✕
            </button>
          </div>
          <p className="text-sm">⌨️ WASD or Arrow keys to move</p>
          <p className="text-sm">🖱️ Click & drag to look around</p>
          <p className="text-sm">👆 Double-click floor to teleport</p>
          <p className="text-sm">🎯 Right-click + drag also works</p>

          {showDebug && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <p className="text-xs font-bold text-yellow-400 mb-2">🐛 Debug Active</p>
              <p className="text-xs">• Green sphere = Origin (0,0,0)</p>
              <p className="text-xs">• Red axes visible on ground</p>
              <p className="text-xs">• Check console for positions</p>
              <p className="text-xs">• Hover floor for live DXF & world coords</p>
              <p className="text-xs">• Left-click walls in order (TL → TR → BR → BL) to save corners</p>
              <p className="text-xs mt-2 text-gray-400">Formula:</p>
              <p className="text-xs font-mono">X = (DXF_X - {floorPlanCenter.x}) / {currentScaleFactor.toFixed(2)}</p>
              <p className="text-xs font-mono">Z = (DXF_Y - {floorPlanCenter.y}) / {currentScaleFactor.toFixed(2)}</p>
              <p className="text-xs mt-1 text-green-400">✨ Auto-calculated SCALE_FACTOR</p>
            </div>
          )}

          {/* Memory Usage Indicator - Only show after loading completes */}
          {memoryUsage > 0 && loadingProgress.percent >= 100 && (
            <div className="mt-3 pt-3 border-t border-gray-600">
              <p className="text-xs text-gray-400 mb-1">GPU Memory:</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${memoryUsage > 350 ? 'bg-red-500' : memoryUsage > 280 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                    style={{ width: `${Math.min(100, (memoryUsage / 400) * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-mono">{memoryUsage.toFixed(0)}MB</span>
              </div>
              {memoryUsage > 350 && (
                <p className="text-xs text-red-400 mt-1">⚠️ High memory usage</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info Panel Toggle Button */}
      {!showInfoPanel && (
        <button
          onClick={() => setShowInfoPanel(true)}
          className="absolute cursor-pointer top-4 left-4 z-10 bg-black bg-opacity-75 hover:bg-opacity-90 text-white p-2 rounded-lg shadow-lg transition-all duration-200"
          aria-label="Show controls info"
          title="Show controls info"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}

      <ScaleFactorContext.Provider value={currentScaleFactor}>
        <Canvas
          shadows
          camera={{
            position: [cameraStartPosition.x, cameraStartPosition.y, cameraStartPosition.z],
            fov: 75,
            near: 0.1,
            far: 1000
          }}
          gl={{
            antialias: !isTabletOrMobile, // Disable for tablets/mobile for better performance
            powerPreference: isTabletOrMobile ? 'default' : 'high-performance',
            precision: hasLimitedMem ? 'lowp' : 'mediump', // Lower precision for limited memory devices
            logarithmicDepthBuffer: true,
            alpha: false, // Disable for better performance
            stencil: false, // Disable for better performance
          }}
          onPointerDown={handleCanvasPointerDown}
          onCreated={({ gl, camera, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
            gl.shadowMap.enabled = !isTabletOrMobile; // Disable shadows on tablets/mobile for better performance
            gl.shadowMap.type = isTabletOrMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
            gl.shadowMap.autoUpdate = true;
            gl.shadowMap.needsUpdate = false;

            // Optimize pixel ratio for smooth interaction
            const maxPixelRatio = isTabletOrMobile ? 1.0 : (hasLimitedMem ? 1.0 : 2.0);
            gl.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));

            // Additional performance optimizations
            gl.setClearColor('#000000', 1);

            // Store scene reference for memory management
            sceneRef.current = scene;

            // Make canvas focusable for better control
            gl.domElement.setAttribute('tabindex', '0');
            gl.domElement.style.outline = 'none';

            // Set initial camera rotation if specified
            if (cameraStartPosition.rotation !== 0 || cameraStartPosition.rotationX !== 0) {
              const euler = new THREE.Euler(
                cameraStartPosition.rotationX || 0,
                cameraStartPosition.rotation || 0,
                0,
                'YXZ'
              );
              camera.quaternion.setFromEuler(euler);
            }

            // Log initial memory status
            logMemoryStatus();
          }}
          style={{ cursor: controlsLocked ? 'grabbing' : 'grab' }}
        >
          {/* Context loss handler */}
          <ContextLossHandler />

          {/* Lighting - Same as Global view */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[5, 10, 5]}
            intensity={0.8}
            castShadow
            shadow-mapSize-width={512}
            shadow-mapSize-height={512}
            shadow-camera-near={0.1}
            shadow-camera-far={50}
            shadow-radius={4}
            shadow-bias={-0.0001}
          />
          <hemisphereLight args={['#ffffff', '#444444', 0.3]} />

          {showDebug && (
            <WorldCoordinateHelper
              centerOffset={floorPlanCenter}
              scaleFactor={currentScaleFactor}
              onUpdate={setCursorDebugInfo}
            />
          )}

          {showDebug && cursorDebugInfo && (
            <>
              <mesh
                position={[cursorDebugInfo.world.x, 0.05, cursorDebugInfo.world.z]}
                userData={{ ignoreCoordinateHelper: true }}
              >
                <sphereGeometry args={[0.2, 16, 16]} />
                <meshStandardMaterial
                  color="#00ff88"
                  emissive="#00ff88"
                  emissiveIntensity={0.9}
                />
              </mesh>
              <Html position={[cursorDebugInfo.world.x, 2, cursorDebugInfo.world.z]} center>
                <div style={{
                  background: 'rgba(0, 0, 0, 0.9)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#00ff88',
                  border: '1px solid #00ff88'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '4px' }}>Cursor</div>
                  <div style={{ color: '#7fffd4' }}>
                    World X {cursorDebugInfo.world.x.toFixed(2)} Y {cursorDebugInfo.world.y.toFixed(2)} Z {cursorDebugInfo.world.z.toFixed(2)}
                  </div>
                  <div style={{ color: '#ffd166', marginTop: '2px' }}>
                    DXF X {cursorDebugInfo.dxf.x.toFixed(0)} Y {cursorDebugInfo.dxf.y.toFixed(0)} Z {cursorDebugInfo.dxf.z.toFixed(0)}
                  </div>
                </div>
              </Html>
            </>
          )}

          {/* Grid Helper at origin (0,0,0) - Same as Global view */}
          {/* <primitive
          object={
            new THREE.GridHelper(
              Math.max(
                currentBounds.width / currentScaleFactor,
                currentBounds.height / currentScaleFactor
              ),
              50, // More grid divisions for better visibility
              '#ff0000', // Red center line
              '#333333'  // Gray grid lines
            )
          }
          position={[0, 0.01, 0]} // Slightly above ground to prevent z-fighting
        /> */}

          {/* Axis Helper at origin - Red=X, Green=Y, Blue=Z - Same as Global view */}
          {/* <axesHelper args={[30]} position={[0, 0, 0]} /> */}

          {/* Debug Coordinate Markers - Shows key positions */}
          {showDebug && (
            <group userData={{ ignoreCoordinateHelper: true }}>
              {/* Origin marker */}
              <mesh position={[0, 0.5, 0]}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
              </mesh>

              {/* Floor plan center marker (should be at 0,0,0 after transformation) */}
              <mesh position={[0, 1, 0]}>
                <sphereGeometry args={[0.5, 16, 16]} />
                <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.5} />
              </mesh>

              {/* Debug text for origin */}
              <Html position={[0, 2, 0]} center>
                <div style={{
                  background: 'rgba(0,0,0,0.8)',
                  color: '#00ff00',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap'
                }}>
                  <div>Origin (0, 0, 0)</div>
                  <div>DXF Center: ({floorPlanCenter.x}, {floorPlanCenter.y})</div>
                </div>
              </Html>

              {/* Stall Position Markers - Expected positions (CENTER-BASED, calculated dynamically) */}
              {(() => {
                const stalls = [
                  { name: 'Stage', dxf: [950, 1520], color: '#ff00ff' },
                ];

                return stalls.map((stall) => {
                  // Calculate 3D CENTER position using current scale factor (CENTER-BASED like stages)
                  // Negate X to fix horizontal mirroring (2D right = 3D right)
                  const x = (stall.dxf[0] - floorPlanCenter.x) / currentScaleFactor;
                  const z = -(stall.dxf[1] - floorPlanCenter.y) / currentScaleFactor; // SAME as tables/chairs

                  // Calculate stall size (108 DXF units = 108 / scaleFactor in 3D)
                  const stallSize = 108 / currentScaleFactor;

                  return { ...stall, pos: [x, z], size: stallSize };
                });
              })().map((stall) => {
                return (
                  <group key={stall.name}>
                    {/* Center marker - shows where CENTER should be */}
                    <mesh position={[stall.pos[0], 0.5, stall.pos[1]]}>
                      <sphereGeometry args={[0.2, 16, 16]} />
                      <meshStandardMaterial
                        color={stall.color}
                        emissive={stall.color}
                        emissiveIntensity={0.8}
                      />
                    </mesh>

                    {/* Position marker - wireframe box showing expected bounds */}
                    <mesh position={[stall.pos[0], 1, stall.pos[1]]}>
                      <boxGeometry args={[stall.size, 2, stall.size]} />
                      <meshStandardMaterial
                        color={stall.color}
                        transparent
                        opacity={0.2}
                        wireframe
                      />
                    </mesh>

                    {/* Label */}
                    <Html position={[stall.pos[0], 3, stall.pos[1]]} center>
                      <div style={{
                        background: 'rgba(0,0,0,0.9)',
                        color: stall.color,
                        padding: '6px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        whiteSpace: 'nowrap',
                        border: `2px solid ${stall.color}`
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{stall.name}</div>
                        <div style={{ fontSize: '10px', opacity: 0.9 }}>DXF Center: ({stall.dxf[0]}, {stall.dxf[1]})</div>
                        <div style={{ fontSize: '10px', opacity: 0.9 }}>3D Center: ({stall.pos[0].toFixed(2)}, {stall.pos[1].toFixed(2)})</div>
                        <div style={{ fontSize: '9px', opacity: 0.7, marginTop: '2px' }}>Size: {stall.size.toFixed(2)} | Scale: {currentScaleFactor.toFixed(2)}</div>
                      </div>
                    </Html>
                  </group>
                );
              })}

              {/* Grid coordinate labels at intervals */}
              {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((x) => (
                <Html key={`label-x-${x}`} position={[x, 0.1, 0]} center>
                  <div style={{
                    color: '#ff0000',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.6)',
                    padding: '2px 4px',
                    borderRadius: '2px'
                  }}>
                    X: {x}
                  </div>
                </Html>
              ))}
              {[-40, -20, 0, 20, 40].map((z) => (
                <Html key={`label-z-${z}`} position={[0, 0.1, z]} center>
                  <div style={{
                    color: '#0000ff',
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    background: 'rgba(0,0,0,0.6)',
                    padding: '2px 4px',
                    borderRadius: '2px'
                  }}>
                    Z: {z}
                  </div>
                </Html>
              ))}
            </group>
          )}

          {/* Ground plane for reference - Same as Global view */}
          <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[
              Math.max(currentBounds.width / currentScaleFactor, currentBounds.height / currentScaleFactor) * 1.2,
              Math.max(currentBounds.width / currentScaleFactor, currentBounds.height / currentScaleFactor) * 1.2
            ]} />
            <meshStandardMaterial color="#1a1a1a" transparent opacity={0.5} />
          </mesh>

          {/* Floor Plan Border - Visual boundary wall around floor plan */}
          {floorPlanBounds && floorPlanLoaded && (
            <FloorPlanBorder
              floorPlanBounds={floorPlanBounds}
              scaleFactor={currentScaleFactor}
              wallHeight={2.5}
            />
          )}

          {/* Floor Plan Model - Progressive loading - Auto-calculates SCALE_FACTOR */}
          {/* For tablets: Uses optimized version with simplified geometry */}
          {showFloor && floorPlan?.glbFileName && (
            <ErrorBoundary
              fallback={
                <Html center>
                  <div className="bg-red-900 bg-opacity-90 text-white px-6 py-4 rounded-lg shadow-2xl max-w-md">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="text-3xl">⚠️</div>
                      <div>
                        <p className="font-bold text-lg">Failed to Load 3D Model</p>
                        <p className="text-sm opacity-90">Array buffer allocation failed</p>
                      </div>
                    </div>
                    <p className="text-xs mt-2 opacity-75">
                      The floor plan model could not be loaded due to insufficient memory.
                      Please try using a tablet or computer with more memory.
                    </p>
                  </div>
                </Html>
              }
              onError={(error) => {
                console.error('Error loading floor plan GLB:', error);
                setGlbLoadError(error);
                setLoadingProgress(prev => ({ ...prev, percent: 40, message: 'Error loading floor plan' }));
              }}
            >
              <Suspense fallback={null}>
                <FloorPlanModel
                  glbPath={floorPlan.glbFileName}
                  dxfBounds={floorPlanBounds ? {
                    // Use raw DXF extents (max - min) for accurate SCALE_FACTOR.
                    // The store's width/height include padding for 2D camera framing;
                    // using them here would distort the 3D-to-2D distance mapping
                    // and make the minimap pointer drift more as you move away
                    // from the center of the hall.
                    width: floorPlanBounds.maxX - floorPlanBounds.minX,
                    height: floorPlanBounds.maxY - floorPlanBounds.minY,
                    centerX: floorPlanBounds.centerX,
                    centerY: floorPlanBounds.centerY
                  } : undefined}
                  onScaleFactorCalculated={setAutoScaleFactor}
                  onLoaded={() => {
                    setFloorPlanLoaded(true);
                    setLoadingProgress(prev => ({ ...prev, percent: 40, message: 'Floor plan ready' }));
                  }}
                  onError={(error) => {
                    console.error('Error in FloorPlanModel:', error);
                    setGlbLoadError(error);
                    setLoadingProgress(prev => ({ ...prev, percent: 40, message: 'Error loading floor plan' }));
                  }}
                  isTablet={deviceInfo.isTablet}
                />
              </Suspense>
            </ErrorBoundary>
          )}

          {/* Ground Plane (fallback) */}
          {showFloor && !floorPlan?.glbFileName && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
              <planeGeometry args={[100, 100]} />
              <meshStandardMaterial color="#cccccc" />
            </mesh>
          )}

          {/* Tables - InstancedMesh with progressive loading */}
          {showTables && (
            <Suspense fallback={null}>
              <Tables3D
                centerOffset={floorPlanCenter}
                tableGlbPath={tableConfig.glbPath}
                tableWidth={tableConfig.width}
                tableGlbRotation={tableConfig.glbRotation}
              // doorAreas={floorPlan?.doorAreas || []}
              />
            </Suspense>
          )}

          {/* Chairs - InstancedMesh with progressive loading */}
          {showChairs && (
            <Suspense fallback={null}>
              <Chairs3D
                centerOffset={floorPlanCenter}
                chairGlbPath={chairConfig.glbPath}
                chairWidth={chairConfig.width}
                chairHeight={chairConfig.height}
              // doorAreas={floorPlan?.doorAreas || []}
              />
            </Suspense>
          )}

          {/* Door Areas Visualization - Red lines around door areas */}
          {/* {floorPlan?.doorAreas && floorPlan.doorAreas.length > 0 && (
            <DoorAreas3D
              doorAreas={floorPlan.doorAreas}
              centerOffset={floorPlanCenter}
              scaleFactor={currentScaleFactor}
            />
          )} */}

          {/* Stage and Event Objects - Only show after floor plan is loaded */}
          {showStage && floorPlanLoaded && (
            <Suspense fallback={null}>
              <OptimizedStageAndEvents
                selectedStage={selectedStage}
                selectedEvent={selectedEvent}
                centerOffset={floorPlanCenter}
              />
            </Suspense>
          )}

          {/* First-Person Controls with WASD + Click-to-Teleport */}
          <FirstPersonControls
            floorPlanBounds={floorPlanBounds}
            onLockChange={setControlsLocked}
            onCameraUpdate={(pos) => {
              // Update camera position in store periodically
              setWalkCameraPosition({
                x: pos.x,
                y: pos.y,
                z: pos.z,
                rotationX: pos.rotationX,
                rotationY: pos.rotationY
              });
            }}
            initialRotationX={cameraStartPosition.rotationX}
            initialRotationY={cameraStartPosition.rotation}
          />
        </Canvas>
      </ScaleFactorContext.Provider>

      {/* 2D Minimap Overlay */}
      {floorPlanBounds && loadingProgress.percent >= 100 && (
        <Minimap2D
          floorPlanBounds={floorPlanBounds}
          floorPlan={floorPlan}
          scaleFactor={currentScaleFactor}
          cameraPosition={walkCameraPosition}
          selectedEvent={selectedEvent}
        />
      )}
    </div>
  );
}

