'use client';

import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html, useProgress } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import React from 'react';
import { useHallStore } from '@store/hallStore';
import type { StageConfig } from '@config/stages';
import type { EventConfig } from '@config/events';
import { OptimizedStageAndEvents, OptimizedStage3D, OptimizedEventObject3D, ProgressiveEventObjects } from './OptimizedStageAndEvents';
import type { HallObject } from '@models/objects';
import { calculateTableAreaAfterStage, updateTableAreaPoints } from '@config/venues';
import { handleStageSelection } from '@utils/simpleStageTablePoints';
import { getStageDXFData } from '@utils/stageDXFHelper';
import { optimizeMaterialTextures } from '@utils/textureOptimizer';

type HallObjectWithGLB = HallObject & {
  glbWidth?: number;
  glbHeight?: number;
  glbDepth?: number;
};

interface HallCanvas3DGlobalProps {
  selectedStage: StageConfig | null;
  selectedEvent: EventConfig | null;
  guestCount: number;
  venueConfig: any;
  floorPlan: any;
  onStageUpdate?: (updatedStage: StageConfig) => void;
}

function FloorPlanModel({ glbPath }: { glbPath: string }) {
  const { scene } = useGLTF(`/${glbPath}`);

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [scene]);

  return <primitive object={scene} scale={1} />;
}

// Scale factor for DXF to Three.js coordinate conversion
const SCALE_FACTOR = 50;

// Single Table GLB Model component
function SingleTableModel({ 
  glbPath, 
  targetWidth,
  targetDepth,
  targetHeight,
  tableIndex = 0 
}: { 
  glbPath: string; 
  targetWidth: number; // Target width in 3D units
  targetDepth: number; // Target depth in 3D units
  targetHeight?: number; // Optional target height in 3D units
  tableIndex?: number;
}) {
  const gltf = useGLTF(`/${glbPath}`);
  const [tableScale, setTableScale] = useState<number>(1);

  // Calculate proper scale based on actual model size - ONLY ONCE
  useEffect(() => {
    if (!gltf.scene || tableScale !== 1) return; // Skip if already calculated

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    
    // Use width and depth of the table model
    const modelWidth = size.x;
    const modelDepth = size.z;
    
    const scales: number[] = [];
    if (modelWidth !== 0) {
      scales.push(targetWidth / modelWidth);
    }
    if (modelDepth !== 0) {
      scales.push(targetDepth / modelDepth);
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

function Tables3D({ 
  centerOffset, 
  tableGlbPath, 
  tableWidth = 72,
  tableGlbRotation = 0
}: { 
  centerOffset: { x: number; y: number };
  tableGlbPath?: string;
  tableWidth?: number;
  tableGlbRotation?: number;
}) {
  const { objects } = useHallStore();
  const tables = objects.filter((obj): obj is HallObjectWithGLB => obj.type === 'table');
  const columnIndexMap = useMemo(() => {
    const uniqueXs = Array.from(new Set(tables.map(table => table.x))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueXs.forEach((x, index) => map.set(x, index));
    return map;
  }, [tables]);
  const rowIndexMap = useMemo(() => {
    const uniqueYs = Array.from(new Set(tables.map(table => table.y))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueYs.forEach((y, index) => map.set(y, index));
    return map;
  }, [tables]);

  return (
    <>
      {tables.map((table, index) => {
        const layoutWidth = table.width ?? tableWidth;
        const layoutDepth = table.height ?? tableWidth;
        const glbWidth = table.glbWidth ?? layoutWidth;
        const glbDepth = table.glbDepth ?? layoutDepth;
        const glbHeight = table.glbHeight ?? 0;
        const columnIndex = columnIndexMap.get(table.x) ?? 0;
        const rowIndex = rowIndexMap.get(table.y) ?? 0;
        const adjustedX = table.x + columnIndex * (glbWidth - layoutWidth);
        const adjustedY = table.y + rowIndex * (glbDepth - layoutDepth);

        // Convert DXF coordinates to Three.js (same coordinate system as floor plan)
        // Negate X to fix horizontal mirroring (2D right = 3D right)
        const x = (adjustedX - centerOffset.x) / SCALE_FACTOR;
        const z = -(adjustedY - centerOffset.y) / SCALE_FACTOR;
        
        // Use GLB-specific dimensions if available for scaling, fallback to layout size
        const glbTargetWidth = glbWidth / SCALE_FACTOR;
        const glbTargetDepth = glbDepth / SCALE_FACTOR;
        const glbTargetHeight = glbHeight ? glbHeight / SCALE_FACTOR : undefined;

        // Combine GLB base rotation with table placement rotation
        // glbRotation corrects the model orientation, table.rotation is placement angle
        const baseRotation = THREE.MathUtils.degToRad(tableGlbRotation);
        const placementRotation = THREE.MathUtils.degToRad(table.rotation || 0);
        const totalRotation = baseRotation + placementRotation;

        return (
          <group 
            key={table.id} 
            position={[x, 0, z]}
            rotation={[0, totalRotation, 0]}
          >
            {tableGlbPath ? (
              <SingleTableModel 
                glbPath={tableGlbPath} 
                targetWidth={glbTargetWidth}
                targetDepth={glbTargetDepth}
                targetHeight={glbTargetHeight}
                tableIndex={index} 
              />
            ) : (
              // Fallback: Default cylinder geometry if no GLB available
              <>
                <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
                  <cylinderGeometry args={[glbTargetWidth / 2, glbTargetDepth / 2, glbTargetHeight ?? 0.8, 32]} />
                  <meshStandardMaterial color="#8B4513" />
                </mesh>
              </>
            )}
          </group>
        );
      })}
    </>
  );
}

// Single Chair GLB Model component - creates a fresh clone for each instance
function SingleChairModel({ 
  glbPath, 
  targetWidth,
  targetDepth,
  targetHeight,
  chairIndex = 0 
}: { 
  glbPath: string; 
  targetWidth: number; // Target width in 3D units
  targetDepth: number; // Target depth in 3D units
  targetHeight: number; // Target height in 3D units
  chairIndex?: number;
}) {
  const gltf = useGLTF(`/${glbPath}`);
  const [chairScale, setChairScale] = useState<number>(1);

  // Calculate proper scale based on actual model size - ONLY ONCE
  useEffect(() => {
    if (!gltf.scene || chairScale !== 1) return; // Skip if already calculated

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    
    const scales: number[] = [];
    if (size.x !== 0) scales.push(targetWidth / size.x);
    if (size.z !== 0) scales.push(targetDepth / size.z);
    if (size.y !== 0) scales.push(targetHeight / size.y);

    const calculatedScale = scales.length > 0
      ? scales.reduce((sum, value) => sum + value, 0) / scales.length
      : 1;

    setChairScale(calculatedScale);
  }, [gltf.scene, targetWidth, targetDepth, targetHeight, chairIndex, chairScale]);

  // Create a UNIQUE clone for THIS specific chair instance (not memoized!)
  // Important: Each call creates a new clone so multiple chairs can render
  const clonedScene = useMemo(() => {
    const clone = gltf.scene.clone(true); // deep clone

    // Setup shadows on the clone
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    return clone;
  }, [gltf.scene, chairIndex]);

  return <primitive object={clonedScene} scale={chairScale} />;
}

function Chairs3D({ centerOffset, chairGlbPath, chairWidth = 18, chairHeight = 18 }: {
  centerOffset: { x: number; y: number };
  chairGlbPath?: string;
  chairWidth?: number;
  chairHeight?: number;
}) {
  const { objects } = useHallStore();
  const chairs = objects.filter((obj): obj is HallObjectWithGLB => obj.type === 'chair');
  const columnIndexMap = useMemo(() => {
    const uniqueXs = Array.from(new Set(chairs.map(chair => chair.x))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueXs.forEach((x, index) => map.set(x, index));
    return map;
  }, [chairs]);
  const rowIndexMap = useMemo(() => {
    const uniqueYs = Array.from(new Set(chairs.map(chair => chair.y))).sort((a, b) => a - b);
    const map = new Map<number, number>();
    uniqueYs.forEach((y, index) => map.set(y, index));
    return map;
  }, [chairs]);

  return (
    <>
      {chairs.map((chair, index) => {
        const layoutWidth = chair.width ?? chairWidth;
        const layoutDepth = chair.height ?? chairHeight;
        const glbWidth = chair.glbWidth ?? layoutWidth;
        const glbDepth = chair.glbDepth ?? layoutDepth;
        const glbHeight = chair.glbHeight ?? chairHeight;
        const columnIndex = columnIndexMap.get(chair.x) ?? 0;
        const rowIndex = rowIndexMap.get(chair.y) ?? 0;
        const adjustedX = chair.x + columnIndex * (glbWidth - layoutWidth);
        const adjustedY = chair.y + rowIndex * (glbDepth - layoutDepth);

        // Convert DXF coordinates to Three.js (same as floor plan and tables)
        // Negate X to fix horizontal mirroring (2D right = 3D right)
        const x = (adjustedX - centerOffset.x) / SCALE_FACTOR;
        const z = -(adjustedY - centerOffset.y) / SCALE_FACTOR;

        const glbTargetWidth = glbWidth / SCALE_FACTOR;
        const glbTargetDepth = glbDepth / SCALE_FACTOR;
        const glbTargetHeight = glbHeight / SCALE_FACTOR;

        return (
          <group
            key={`chair-${index}-${chair.x}-${chair.y}`}
            position={[x, 0, z]}
            rotation={[0, THREE.MathUtils.degToRad(chair.rotation || 0), 0]}
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

// Stage3D component is now handled by OptimizedStageAndEvents component

// Optimized Model component with proper cleanup and error handling
function Model({ 
  src = "/floor-plan.glb", 
  scale = 1, 
  position = [0, 0, 0],
  dxfBounds,
  onLoaded
}: { 
  src?: string; 
  scale?: number; 
  position?: [number, number, number];
  dxfBounds?: { width: number; height: number; centerX: number; centerY: number };
  onLoaded?: () => void;
}) {
  const gltf = useGLTF(src);
  const modelRef = useRef<THREE.Group>(null);
  const [modelTransform, setModelTransform] = useState<{
    modelScale: number;
    modelOffset: { x: number; y: number };
  } | null>(null);

  // Calculate proper scale and centering based on DXF bounds - ONLY ONCE
  useEffect(() => {
    if (!gltf.scene || !dxfBounds || modelTransform) return; // Skip if already calculated

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const glbCenter = box.getCenter(new THREE.Vector3());
    
    // GLB model size (in its own units)
    const glbWidth = size.x;
    const glbDepth = size.z;
    
    // DXF bounds size (in DXF units)
    const dxfWidth = dxfBounds.width;
    const dxfHeight = dxfBounds.height;
    
    // Calculate scale to match DXF dimensions
    // We divide by SCALE_FACTOR to convert to 3D units
    const scaleX = (dxfWidth / SCALE_FACTOR) / glbWidth;
    const scaleZ = (dxfHeight / SCALE_FACTOR) / glbDepth;
    
    // Use the average scale to maintain aspect ratio
    const calculatedScale = (scaleX + scaleZ) / 2;
    
    // Calculate offset to center the model at origin
    // The GLB model has its own center, we need to account for it
    const offsetX = -glbCenter.x * calculatedScale;
    const offsetZ = -glbCenter.z * calculatedScale;
    
    setModelTransform({ 
      modelScale: calculatedScale,
      modelOffset: { x: offsetX, y: offsetZ }
    });
    
    // Notify that model is loaded
    if (onLoaded) {
      onLoaded();
    }
  }, [gltf.scene, dxfBounds, modelTransform, onLoaded]);

  // Use default values if not yet calculated
  const { modelScale, modelOffset } = modelTransform || { 
    modelScale: scale, 
    modelOffset: { x: 0, y: 0 } 
  };

  useEffect(() => {
    if (!gltf.scene) return;

    // Calculate bounding box to understand model's internal coordinates
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Optimize materials and geometry
    gltf.scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;

        // Enable shadows
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Optimize material
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.needsUpdate = true;
              }
            });
          } else if (mesh.material instanceof THREE.MeshStandardMaterial) {
            mesh.material.needsUpdate = true;
          }
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

  return (
    <group position={[modelOffset.x, 0, modelOffset.y]}>
      <primitive
        ref={modelRef}
        object={gltf.scene}
        scale={modelScale}
        position={position}
      />
    </group>
  );
}

// Coordinate Tracker Component - optimized for performance
function CoordinateTracker({
  onCameraUpdate,
  onCursorUpdate
}: {
  onCameraUpdate: (pos: THREE.Vector3) => void;
  onCursorUpdate: (pos: THREE.Vector3 | null) => void;
}) {
  const { camera, raycaster, mouse, scene } = useThree();
  const planeRef = useRef<THREE.Mesh>(null);
  const lastCameraUpdate = useRef<number>(0);
  const cameraUpdateThrottle = 100; // Update camera position every 100ms
  const cursorUpdateThrottle = 50; // Throttle cursor updates
  const lastCursorUpdate = useRef<number>(0);
  const pendingCursorUpdate = useRef<THREE.Vector3 | null>(null);

  // Create an invisible ground plane for raycasting
  useEffect(() => {
    const geometry = new THREE.PlaneGeometry(10000, 10000);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    scene.add(plane);
    planeRef.current = plane;

    return () => {
      scene.remove(plane);
      geometry.dispose();
      material.dispose();
    };
  }, [scene]);

  // Track camera position with throttling for better performance
  useFrame((state, delta) => {
    const now = Date.now();
    if (now - lastCameraUpdate.current >= cameraUpdateThrottle) {
      onCameraUpdate(camera.position.clone());
      lastCameraUpdate.current = now;
    }
  });

  // Track cursor position on mouse move with throttling
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!planeRef.current) return;

      const now = Date.now();
      
      // Always calculate the position for immediate use if needed
      const canvas = event.target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Throttle the callback execution
      if (now - lastCursorUpdate.current >= cursorUpdateThrottle) {
        // Update raycaster
        raycaster.setFromCamera(mouse, camera);

        // Check intersection with ground plane
        const intersects = raycaster.intersectObject(planeRef.current);
        if (intersects.length > 0) {
          onCursorUpdate(intersects[0].point);
        } else {
          onCursorUpdate(null);
        }
        lastCursorUpdate.current = now;
      } else {
        // Store for later processing
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(planeRef.current);
        pendingCursorUpdate.current = intersects.length > 0 ? intersects[0].point : null;
      }
    };

    // Process pending updates periodically
    const interval = setInterval(() => {
      if (pendingCursorUpdate.current !== null) {
        onCursorUpdate(pendingCursorUpdate.current);
        pendingCursorUpdate.current = null;
      }
    }, cursorUpdateThrottle);

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove, { passive: true });
      return () => {
        canvas.removeEventListener('mousemove', handleMouseMove);
        clearInterval(interval);
      };
    }

    return () => {
      clearInterval(interval);
    };
  }, [camera, raycaster, mouse, onCursorUpdate]);

  return null;
}

// Error Boundary Component for 3D objects
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('3D Object Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
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
      console.error('🚨 WebGL context lost in Global mode.');
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

// Loading fallback component with progress percentage
function LoadingFallback() {
  const { progress, active, loaded, total } = useProgress();

  return (
    <Html center>
      <div className="bg-black bg-opacity-90 text-white px-8 py-6 rounded-lg shadow-2xl min-w-[300px] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col items-center gap-4">
          {/* Animated Spinner */}
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-600 border-t-blue-500"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold">{Math.round(progress)}%</span>
            </div>
          </div>

          {/* Loading Text */}
          <div className="text-center">
            <p className="text-lg font-semibold mb-1">Loading 3D Model...</p>
            <p className="text-xs text-gray-400">
              {loaded} of {total} items loaded
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Additional Info */}
          {progress < 100 && (
            <p className="text-xs text-gray-500 animate-pulse">
              Please wait, this may take a moment...
            </p>
          )}

          {progress >= 100 && (
            <p className="text-xs text-green-400 font-semibold">
              ✓ Almost ready!
            </p>
          )}
        </div>
      </div>
    </Html>
  );
}

export default function HallCanvas3DGlobal({
  selectedStage,
  selectedEvent,
  guestCount,
  venueConfig,
  floorPlan,
  onStageUpdate
}: HallCanvas3DGlobalProps) {
  const { setTableArrangement, selectedTableArea, floorPlanBounds } = useHallStore();
  const [loadModel, setLoadModel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraPosition, setCameraPosition] = useState<THREE.Vector3 | null>(null);
  const [cursorPosition, setCursorPosition] = useState<THREE.Vector3 | null>(null);
  const [areaBoundsByLayer, setAreaBoundsByLayer] = useState<Record<string, { minX: number; maxX: number; minY: number; maxY: number }>>({});
  
  // Progressive loading states
  const [loadingStage, setLoadingStage] = useState<'floor' | 'tables' | 'chairs' | 'stage' | 'events' | 'complete'>('floor');
  const [floorLoaded, setFloorLoaded] = useState(false);
  const [tablesLoaded, setTablesLoaded] = useState(false);
  const [chairsLoaded, setChairsLoaded] = useState(false);
  const [stageLoaded, setStageLoaded] = useState(false);
  const [previousStageId, setPreviousStageId] = useState<string | null>(null);

  // Get chair GLB path and width from venue config (from singleChair configuration)
  const chairConfig = useMemo(() => {

    // Check if venue config has table areas with singleChair config
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
    // Check floor plan table areas
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
    return { glbPath: undefined, width: 18, height: 18 }; // Defaults
  }, [venueConfig, floorPlan]);

  // Get table GLB path and dimensions from venue config
  const tableConfig = useMemo(() => {
    // Check if venue config has table areas with GLB filename
    if (venueConfig?.tableAreas) {
      for (const tableArea of venueConfig.tableAreas) {
        if (tableArea.glbFileName) {
          return {
            glbPath: tableArea.glbFileName,
            width: tableArea.width || 72,
            height: tableArea.height || 72,
            glbRotation: tableArea.glbRotation || 0
          };
        }
      }
    }
    // Check floor plan table areas
    if (floorPlan?.tableAreas) {
      for (const tableArea of floorPlan.tableAreas) {
        if (tableArea.glbFileName) {
          return {
            glbPath: tableArea.glbFileName,
            width: tableArea.width || 72,
            height: tableArea.height || 72,
            glbRotation: tableArea.glbRotation || 0
          };
        }
      }
    }
    return { glbPath: undefined, width: 72, height: 72, glbRotation: 0 }; // Defaults
  }, [venueConfig, floorPlan]);

  // Get floor plan bounds from store (calculated in 2D view)
  // Fallback to default bounds if not yet available
  const currentBounds = useMemo(() => {
    return floorPlanBounds || {
      minX: -3000, maxX: 3000, minY: -2000, maxY: 2000,
      centerX: 0, centerY: 0,
      width: 6000, height: 4000
    };
  }, [floorPlanBounds]);

  // Calculate floor plan center - use bounds from store first, then corner points
  const floorPlanCenter = useMemo(() => {
    // Use center from store bounds (most reliable)
    if (floorPlanBounds) {
      return { x: floorPlanBounds.centerX, y: floorPlanBounds.centerY, z: 0 };
    }
    // Fallback to corner points calculation
    if (floorPlan?.cornerPoints) {
      const { topLeft, topRight, bottomRight, bottomLeft } = floorPlan.cornerPoints;
      const centerX = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
      const centerY = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;
      return { x: centerX, y: centerY, z: 0 };
    }
    return { x: 1855, y: 1570, z: 0 }; // Default center
  }, [floorPlanBounds, floorPlan]);

  // Calculate floor plan dimensions for grid size
  const floorPlanDimensions = useMemo(() => {
    if (floorPlan?.cornerPoints) {
      const { topLeft, topRight, bottomRight, bottomLeft } = floorPlan.cornerPoints;
      const width = Math.max(
        Math.abs(topRight.x - topLeft.x),
        Math.abs(bottomRight.x - bottomLeft.x)
      );
      const height = Math.max(
        Math.abs(topLeft.y - bottomLeft.y),
        Math.abs(topRight.y - bottomRight.y)
      );
      return { width, height };
    }
    return { width: 3000, height: 2000 }; // Default dimensions
  }, [floorPlan]);

  // Update table arrangement when guest count, table area, or stage changes (keep 3D in sync with 2D logic)
  useEffect(() => {
    const tableConfig = selectedTableArea || floorPlan?.tableAreas?.[0];

    if (!tableConfig) {
      return;
    }

    if (guestCount <= 0) {
      setTableArrangement(0, tableConfig, floorPlan?.doorAreas);
      return;
    }

    if (!selectedStage) {
      setTableArrangement(guestCount, tableConfig, floorPlan?.doorAreas);
      return;
    }

    if (selectedStage.isCustom) {
      const updatedTableConfig = calculateTableAreaAfterStage(selectedStage, tableConfig, 15);
      setTableArrangement(guestCount, updatedTableConfig, floorPlan?.doorAreas);
      return;
    }

    let isCancelled = false;

    (async () => {
      try {
        const dxfData = await getStageDXFData(selectedStage, floorPlan?.fileName);

        if (isCancelled) return;

        if (dxfData) {
          const tableAreaPoints = handleStageSelection(
            selectedStage,
            tableConfig,
            'inches',
            dxfData.stageDxf
          );
          const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
          setTableArrangement(guestCount, updatedTableConfig, floorPlan?.doorAreas);
        } else {
          const tableAreaPoints = handleStageSelection(selectedStage, tableConfig, 'inches');
          const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
          setTableArrangement(guestCount, updatedTableConfig, floorPlan?.doorAreas);
        }
      } catch (error) {
        console.error('Error calculating tables for 3D view:', error);
        if (isCancelled) return;
        const tableAreaPoints = handleStageSelection(selectedStage, tableConfig, 'inches');
        const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
        setTableArrangement(guestCount, updatedTableConfig, floorPlan?.doorAreas);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [guestCount, selectedTableArea, selectedStage, floorPlan, setTableArrangement]);

  // Preload chair GLB model if available
  useEffect(() => {
    if (chairConfig.glbPath) {
      useGLTF.preload(`/${chairConfig.glbPath}`);
    }
  }, [chairConfig.glbPath]);

  // Preload table GLB model if available
  useEffect(() => {
    if (tableConfig.glbPath) {
      useGLTF.preload(`/${tableConfig.glbPath}`);
    }
  }, [tableConfig.glbPath]);

  // Preload stage GLB if available (same approach as chairs/tables)
  useEffect(() => {
    if (selectedStage?.glbFileName) {
      useGLTF.preload(`/${selectedStage.glbFileName}`);
    }
  }, [selectedStage]);

  // Preload event object GLBs if available (same approach as chairs/tables)
  useEffect(() => {
    if (selectedEvent?.objects) {
      selectedEvent.objects.forEach((obj) => {
        if (obj.glbFileName) {
          useGLTF.preload(`/${obj.glbFileName}`);
        }
      });
    }
  }, [selectedEvent]);

  // Handle stage change - reset loading when stage changes
  useEffect(() => {
    const currentStageId = selectedStage?.id || null;
    
    if (currentStageId !== previousStageId) {
      setPreviousStageId(currentStageId);
      
      // If we're past the chairs stage and stage changed, reload stage
      if (chairsLoaded && (loadingStage === 'stage' || loadingStage === 'events' || loadingStage === 'complete')) {
        setStageLoaded(false);
        
        if (currentStageId) {
          // New stage selected, go to stage loading
          setLoadingStage('stage');
          setTimeout(() => setStageLoaded(true), 300);
        } else {
          // No stage, check for events or complete
          if (selectedEvent && selectedEvent.objects && selectedEvent.objects.length > 0) {
            setLoadingStage('events');
          } else {
            setLoadingStage('complete');
          }
        }
      }
    }
  }, [selectedStage, previousStageId, chairsLoaded, loadingStage, selectedEvent]);

  // Progressive loading - floor plan first
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoadModel(true);
      setLoadingStage('floor');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Progressive loading sequence - dynamic based on what's available
  useEffect(() => {
    if (!loadModel) return;

    const timers: NodeJS.Timeout[] = [];

    if (loadingStage === 'floor' && floorLoaded) {
      // Floor loaded, move to tables
      const timer = setTimeout(() => {
        setLoadingStage('tables');
        setTablesLoaded(true);
      }, 300);
      timers.push(timer);
    } else if (loadingStage === 'tables' && tablesLoaded) {
      // Tables loaded, move to chairs
      const timer = setTimeout(() => {
        setLoadingStage('chairs');
        setChairsLoaded(true);
      }, 200);
      timers.push(timer);
    } else if (loadingStage === 'chairs' && chairsLoaded) {
      // Chairs loaded, check if stage exists
      const timer = setTimeout(() => {
        if (selectedStage) {
          setLoadingStage('stage');
          setStageLoaded(true);
        } else {
          // No stage, check if events exist
          if (selectedEvent && selectedEvent.objects && selectedEvent.objects.length > 0) {
            setLoadingStage('events');
          } else {
            // No stage or events, we're done
            setLoadingStage('complete');
          }
        }
      }, 200);
      timers.push(timer);
    } else if (loadingStage === 'stage' && stageLoaded) {
      // Stage loaded, check if events exist
      const timer = setTimeout(() => {
        if (selectedEvent && selectedEvent.objects && selectedEvent.objects.length > 0) {
          setLoadingStage('events');
        } else {
          // No events, we're done
          setLoadingStage('complete');
        }
      }, 200);
      timers.push(timer);
    } else if (loadingStage === 'events') {
      // Events loaded, we're done
      const timer = setTimeout(() => {
        setLoadingStage('complete');
      }, 200);
      timers.push(timer);
    }

    return () => timers.forEach(clearTimeout);
  }, [loadModel, loadingStage, floorLoaded, tablesLoaded, chairsLoaded, stageLoaded, selectedStage, selectedEvent]);

  return (
    <div className="relative w-full h-full bg-gray-900">
      {/* Instructions */}
      {/* <div className="absolute top-4 left-4 z-10 bg-black bg-opacity-75 text-white p-4 rounded-lg shadow-lg">
        <h3 className="text-lg font-bold mb-2">3D Global View</h3>
        <p className="text-sm">🖱️ Left-click + drag to rotate</p>
        <p className="text-sm">🔍 Scroll to zoom (zooms to cursor position)</p>
        <p className="text-sm">🤚 Right-click + drag to pan anywhere</p>
        <div className="mt-2 pt-2 border-t border-gray-600">
          <p className="text-xs">✅ Grid centered at origin</p>
          <p className="text-xs">📍 Check top-right for coordinates</p>
          <p className="text-xs text-gray-400">💡 Floor plan: {floorPlan?.glbFileName || 'N/A'}</p>
          {tableConfig.glbPath && (
            <p className="text-xs text-blue-400">🪑 Table: {tableConfig.glbPath} ({tableConfig.width} units, {tableConfig.glbRotation}°)</p>
          )}
          {chairConfig.glbPath && (
            <p className="text-xs text-green-400">💺 Chair: {chairConfig.glbPath} ({chairConfig.width} units)</p>
          )}
        </div>
      </div> */}

      {/* Progressive Loading Indicator */}
      {loadingStage !== 'complete' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-black bg-opacity-90 text-white px-6 py-4 rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-blue-500"></div>
            <div>
              <p className="text-sm font-semibold">Loading Scene...</p>
              <p className="text-xs text-gray-400">
                {loadingStage === 'floor' && 'Loading floor plan...'}
                {loadingStage === 'tables' && 'Adding tables...'}
                {loadingStage === 'chairs' && 'Adding chairs...'}
                {loadingStage === 'stage' && 'Adding stage...'}
                {loadingStage === 'events' && 'Adding event objects...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Coordinate Tracker - Top Right */}
      <div className="absolute top-4 right-4 z-10 bg-blue-900 bg-opacity-90 text-white p-3 rounded-lg shadow-lg min-w-[200px]">
        <h4 className="text-xs font-bold mb-2 border-b border-blue-700 pb-1">📍 Coordinates</h4>

        {/* Camera Position */}
        <div className="mb-2">
          <p className="text-xs text-blue-300 mb-1">Camera (3D):</p>
          <div className="text-xs font-mono space-y-0.5">
            <p>X: {cameraPosition ? cameraPosition.x.toFixed(2) : '--'}</p>
            <p>Y: {cameraPosition ? cameraPosition.y.toFixed(2) : '--'}</p>
            <p>Z: {cameraPosition ? cameraPosition.z.toFixed(2) : '--'}</p>
          </div>
        </div>

        {/* Cursor Position - Convert back to DXF coordinates */}
        <div className="pt-2 border-t border-blue-700">
          <p className="text-xs text-blue-300 mb-1">Cursor (DXF):</p>
          <div className="text-xs font-mono space-y-0.5">
            <p>X: {cursorPosition ? (cursorPosition.x * SCALE_FACTOR + floorPlanCenter.x).toFixed(2) : '--'}</p>
            <p>Y: {cursorPosition ? (cursorPosition.z * SCALE_FACTOR + floorPlanCenter.y).toFixed(2) : '--'}</p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg">
          <h3 className="text-lg font-bold mb-2">Error Loading Model</h3>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoadModel(false);
              setTimeout(() => setLoadModel(true), 100);
            }}
            className="mt-3 bg-white text-red-600 px-4 py-2 rounded hover:bg-gray-100"
          >
            Retry
          </button>
        </div>
      )}

      <Canvas
        shadows
        camera={{ 
          position: [0, 150, 0.1], // Almost top-down view to match 2D layout
          fov: 50,
          near: 0.1,
          far: 10000
        }}
        gl={{
          antialias: false, // Disable for better performance with many objects
          alpha: true,
          powerPreference: 'high-performance',
          // Optimize for large models
          precision: 'mediump',
          logarithmicDepthBuffer: true,
          preserveDrawingBuffer: false, // Don't preserve buffer to save memory
          stencil: false, // Disable stencil buffer if not needed
        }}
        onCreated={({ gl }) => {
          // Optimize renderer for large models
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.BasicShadowMap; // Use basic shadows to save memory
          
          // Optimize shadow map for smooth interaction - only update when needed
          gl.shadowMap.autoUpdate = true;
          gl.shadowMap.needsUpdate = false;

          // Set pixel ratio for better performance - optimize for smooth interaction
          const pixelRatio = Math.min(window.devicePixelRatio, 2);
          gl.setPixelRatio(pixelRatio);

          // Additional performance optimizations
          gl.setClearColor('#000000', 1);
        }}
      >
        {/* Lighting optimized for large scenes */}
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

        {/* Context loss handler */}
        <ContextLossHandler />

        {/* Grid Helper at origin (0,0,0) - matching 2D grid */}
        {/* Grid sized to match 3D space (DXF coordinates / SCALE_FACTOR) */}
        {/* GridHelper is already on XZ plane (horizontal), no rotation needed */}
        <primitive
          object={
            new THREE.GridHelper(
              Math.max(
                currentBounds.width / SCALE_FACTOR,
                currentBounds.height / SCALE_FACTOR
              ),
              50, // More grid divisions for better visibility
              '#ff0000', // Red center line
              '#333333'  // Gray grid lines
            )
          }
          position={[0, 0.01, 0]} // Slightly above ground to prevent z-fighting
        />

        {/* Axis Helper at origin - Red=X, Green=Y, Blue=Z */}
        <axesHelper args={[30]} position={[0, 0, 0]} />

        {/* Ground plane for reference - slightly below grid */}
        <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[
            Math.max(currentBounds.width / SCALE_FACTOR, currentBounds.height / SCALE_FACTOR) * 1.2,
            Math.max(currentBounds.width / SCALE_FACTOR, currentBounds.height / SCALE_FACTOR) * 1.2
          ]} />
          <meshStandardMaterial color="#1a1a1a" transparent opacity={0.5} />
        </mesh>

        {/* Progressive Loading - Floor Plan First */}
        {loadModel && floorPlan?.glbFileName && (
          <Suspense fallback={<LoadingFallback />}>
            <Model
              src={`/${floorPlan.glbFileName}`}
              scale={1}
              position={[0, 0, 0]}
              dxfBounds={floorPlanBounds ? {
                // IMPORTANT: Use raw DXF extents (max - min) here, NOT the padded width/height
                // Padded width/height are only for 2D camera framing. Using them for scale
                // introduces a proportional error that grows with distance from center.
                width: floorPlanBounds.maxX - floorPlanBounds.minX,
                height: floorPlanBounds.maxY - floorPlanBounds.minY,
                centerX: floorPlanBounds.centerX,
                centerY: floorPlanBounds.centerY
              } : undefined}
              onLoaded={() => setFloorLoaded(true)}
            />
          </Suspense>
        )}

        {/* Tables - Load after floor */}
        {tablesLoaded && (
          <Tables3D 
            centerOffset={floorPlanCenter}
            tableGlbPath={tableConfig.glbPath}
            tableWidth={tableConfig.width}
            tableGlbRotation={tableConfig.glbRotation}
          />
        )}

        {/* Chairs - Load after tables */}
        {chairsLoaded && (
          <Chairs3D
            centerOffset={floorPlanCenter}
            chairGlbPath={chairConfig.glbPath}
            chairWidth={chairConfig.width}
            chairHeight={chairConfig.height}
          />
        )}

        {/* Stage - Render when in stage/events/complete phase */}
        {(loadingStage === 'stage' || loadingStage === 'events' || loadingStage === 'complete') && selectedStage && (
          <Suspense fallback={
              <group>
                <mesh position={[0, 10, 0]}>
                  <sphereGeometry args={[0.5, 8, 8]} />
                  <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.5} />
                </mesh>
              </group>
            }>
              <ErrorBoundary fallback={
                <group position={[
                  (selectedStage.x - floorPlanCenter.x) / SCALE_FACTOR,
                  0.5,
                  (selectedStage.y - floorPlanCenter.y) / SCALE_FACTOR
                ]}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[4, 1, 2]} />
                    <meshStandardMaterial color="#ff0000" />
                  </mesh>
                </group>
              }>
              <OptimizedStage3D stage={selectedStage} centerOffset={floorPlanCenter} />
            </ErrorBoundary>
          </Suspense>
        )}

        {/* Events - Load after stage with error boundary and progressive loading */}
        {(loadingStage === 'events' || loadingStage === 'complete') && selectedEvent && selectedEvent.objects && selectedEvent.objects.length > 0 && (
          <Suspense fallback={
            <group>
              <mesh position={[0, 12, 0]}>
                <sphereGeometry args={[0.5, 8, 8]} />
                <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={0.5} />
              </mesh>
            </group>
          }>
            <ErrorBoundary fallback={<group />}>
              <ProgressiveEventObjects 
                event={selectedEvent} 
                centerOffset={floorPlanCenter}
                batchSize={1} // Load 1 object at a time to prevent context loss
                delayBetweenBatches={500} // 500ms delay between batches for GPU to recover
              />
            </ErrorBoundary>
          </Suspense>
        )}

        {/* Coordinate Tracker */}
        <CoordinateTracker
          onCameraUpdate={setCameraPosition}
          onCursorUpdate={setCursorPosition}
        />

        {/* OrbitControls - center at origin (0,0,0) - optimized for super smooth interaction */}
        <OrbitControls
          target={[0, 0, 0]}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          enableDamping={true}
          dampingFactor={0.15}
          // minDistance={20}
          maxDistance={500}
          maxPolarAngle={Math.PI * 0.49} // Limit to near top-down view
          minPolarAngle={0.1} // Prevent going under the floor
          screenSpacePanning={true}
          panSpeed={1.8}
          rotateSpeed={0.8}
          zoomSpeed={1.2}
          autoRotate={false}
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
          }}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
          }}
          makeDefault
          zoomToCursor={true}
        />
      </Canvas>
    </div>
  );
}

