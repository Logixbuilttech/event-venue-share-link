'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, useGLTF } from '@react-three/drei';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useHallStore } from '@store/hallStore';
import type { HallObject } from '@models/objects';
import { AdvancedDXFModel } from '@utils/advancedDxfRenderer';
import { SimpleDxfOverlay } from './SimpleDxfOverlay';
import { defaultTableConfigs, getVenueConfig, updateTableAreaPoints, getCornerPoints, positionStageFromCorners, calculateTableAreaAfterStage, isPositionWithinBounds, constrainPositionToBounds, feetToDXFUnits } from '@config/venues';
import type { StageConfig } from '@config/stages';
import type { EventConfig } from '@config/events';
import type { DoorArea } from '@config/venues';
import DXFTableRenderer from './DXFTableRenderer';
import { handleStageSelection } from '@utils/simpleStageTablePoints';
import { getStageDXFData } from '@utils/stageDXFHelper';

interface DraggableObjectProps {
  object: HallObject;
  onDrag: (id: string, newPosition: { x: number; y: number }) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
  controlsRef: React.RefObject<any>;
  isDraggable?: boolean; // Optional prop to control if object can be dragged (default: true)
}

function DraggableObject({ object, onDrag, isSelected, onSelect, controlsRef, isDraggable = true }: DraggableObjectProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Memoize colors
  const colors = useMemo(() => ({
    normal: object.type === 'stage' ? '#ff0000' : object.type === 'table' ? '#8B4513' : '#0000ff',
    selected: object.type === 'stage' ? '#ff3333' : object.type === 'table' ? '#A0522D' : '#3333ff',
    dragging: object.type === 'stage' ? '#ff6666' : object.type === 'table' ? '#CD853F' : '#6666ff',
    hovered: object.type === 'stage' ? '#ff4444' : object.type === 'table' ? '#9A5A23' : '#4444ff'
  }), [object.type]);

  const currentColor = isDragging ? colors.dragging : isSelected ? colors.selected : hovered ? colors.hovered : colors.normal;

  const handlePointerDown = useCallback((event: any) => {
    if (!isDraggable) return; // Don't allow dragging if not draggable

    event.stopPropagation();
    setIsDragging(true);
    onSelect(object.id);

    // Disable OrbitControls while dragging
    if (controlsRef.current) controlsRef.current.enabled = false;

    if (event.target.setPointerCapture) {
      event.target.setPointerCapture(event.pointerId);
    }
    document.body.style.cursor = 'grabbing';
  }, [object.id, onSelect, isDraggable]);

  const handlePointerMove = useCallback((event: any) => {
    if (!isDragging) return;

    event.stopPropagation();

    // Use the event point directly for position
    if (groupRef.current) {
      groupRef.current.position.x = event.point.x;
      groupRef.current.position.y = event.point.y;
    }
  }, [isDragging, object.id]);


  const handlePointerUp = useCallback((event: any) => {
    if (!isDragging) return;
    event.stopPropagation();
    setIsDragging(false);

    // Re-enable OrbitControls after dragging
    if (controlsRef.current) controlsRef.current.enabled = true;

    if (event.target.releasePointerCapture) {
      event.target.releasePointerCapture(event.pointerId);
    }

    if (groupRef.current) {
      onDrag(object.id, {
        x: groupRef.current.position.x,
        y: groupRef.current.position.y
      });
    }

    document.body.style.cursor = 'default';
    // }, [isDragging, object.id, onDrag, object.type]);
  }, [isDragging, object.id, onDrag]);

  const handlePointerOver = useCallback(() => {
    setHovered(true);
    if (!isDragging && isDraggable) {
      document.body.style.cursor = 'grab';
    }
  }, [isDragging, isDraggable, object.type, object.id]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    if (!isDragging) {
      document.body.style.cursor = 'default';
    }
  }, [isDragging]);

  return (
    <group
      ref={groupRef}
      position={[object.x, object.y, 0]}
      rotation={[0, 0, (object.rotation ?? 0) * (Math.PI / 180)]}
    >
      {/* Use DXF renderer for tables and chairs, fallback to basic geometry for others */}
      {(object.type === 'table' || object.type === 'chair') ? (
        <group
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <DXFTableRenderer object={object} />
        </group>
      ) : (
        <mesh
          position={[0, 0, 0.1]}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          {/* <boxGeometry args={[object.width, object.height, 0.2]} />
          <meshBasicMaterial
            color={currentColor}
            transparent
            opacity={isDragging ? 0.8 : hovered ? 0.9 : 1}
          /> */}
        </mesh>
      )}

      {/* Selection border */}
      {isSelected && (
        <mesh position={[0, 0, 0.2]}>
          <ringGeometry args={[Math.max(object.width, object.height) / 2 + 0.2, Math.max(object.width, object.height) / 2 + 0.4, 16]} />
          <meshBasicMaterial color="#ffff00" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Boundary constraint indicator for stages */}
      {object.type === 'stage' && isSelected && (
        <mesh position={[0, 0, 0.1]}>
          <ringGeometry args={[Math.max(object.width, object.height) / 2 + 0.5, Math.max(object.width, object.height) / 2 + 0.7, 16]} />
          <meshBasicMaterial color="#ff6b35" transparent opacity={0.3} />
        </mesh>
      )}

      {/* Object label */}
      <mesh position={[0, 0, 0.25]}>
        <planeGeometry args={[Math.min(object.width * 0.8, 2), Math.min(object.height * 0.3, 0.5)]} />
        <meshBasicMaterial color="#1A1A1A" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

interface EventBanner2DProps {
  width: number;
  height: number;
  position: [number, number, number];
  rotation: number;
  fillColor: string;
  outlineColor: string;
  opacity: number;
}

function EventBanner2D({
  width,
  height,
  position,
  rotation,
  fillColor,
  outlineColor,
  opacity
}: EventBanner2DProps) {
  const outlineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const vertices = new Float32Array([
      -halfWidth, -halfHeight, 0,
      halfWidth, -halfHeight, 0,
      halfWidth, halfHeight, 0,
      -halfWidth, halfHeight, 0
    ]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
  }, [width, height]);

  useEffect(() => {
    return () => {
      outlineGeometry.dispose();
    };
  }, [outlineGeometry]);

  return (
    <group position={position} rotation={[0, 0, rotation]}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={fillColor}
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineLoop position={[0, 0, 0.01]}>
        <primitive object={outlineGeometry} attach="geometry" />
        <lineBasicMaterial color={outlineColor} linewidth={1} />
      </lineLoop>
    </group>
  );
}

interface HallCanvas2DProps {
  selectedStage?: StageConfig | null;
  selectedEvent?: EventConfig | null;
  guestCount: number;
  venueConfig?: any;
  floorPlan?: any;
  onStageUpdate?: (stage: StageConfig) => void;
  isShareView?: boolean;
}

export default function HallCanvas2D({ selectedStage, selectedEvent, guestCount, venueConfig, floorPlan, onStageUpdate, isShareView }: HallCanvas2DProps) {
  const {
    objects,
    updateObject,
    selectedObjectId,
    selectObject,
    setTableArrangement,
    getTableStats,
    currentTableConfig,
    selectedTableArea,
    hoverCoordinates,
    selectTableArea,
    setHoverCoordinates,
    customAreaPoints,
    isSelectingCustomArea,
    startCustomAreaSelection,
    addCustomAreaPoint,
    finishCustomAreaSelection,
    clearCustomAreaSelection,
    addStage,
    updateStage,
    removeStage,
    clearStages
  } = useHallStore();
  const [progress, setProgress] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const controlsRef = useRef<any>(null);
  const cameraRef = useRef<THREE.OrthographicCamera>(null);

  // Track loading state for all objects
  const [floorPlanLoaded, setFloorPlanLoaded] = useState(false);
  const [stageLoaded, setStageLoaded] = useState(false);
  const eventObjectsLoadedRef = useRef<Set<string>>(new Set());
  const [eventObjectsLoadedCount, setEventObjectsLoadedCount] = useState(0);
  const tablesRenderedRef = useRef(false);
  const [areaBoundsByLayer, setAreaBoundsByLayer] = useState<Record<string, { minX: number; maxX: number; minY: number; maxY: number }>>({});

  // Use provided venue configuration or fallback to default
  const currentVenueConfig = venueConfig || getVenueConfig('infinity-ballroom');
  const currentFloorPlan = floorPlan || currentVenueConfig?.floorPlans.find((plan: any) => plan.id === currentVenueConfig.defaultFloorPlanId);

  // Calculate dynamic bounds from floor plan
  const floorPlanBounds = useMemo(() => {
    const allLayers = Object.values(areaBoundsByLayer);
    if (allLayers.length === 0) {
      // Default bounds if no floor plan loaded yet
      return {
        minX: -3000, maxX: 3000, minY: -2000, maxY: 2000,
        centerX: 0, centerY: 0,
        width: 6000, height: 4000
      };
    }

    const minX = Math.min(...allLayers.map(b => b.minX));
    const maxX = Math.max(...allLayers.map(b => b.maxX));
    const minY = Math.min(...allLayers.map(b => b.minY));
    const maxY = Math.max(...allLayers.map(b => b.maxY));

    // Calculate center and dimensions
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const width = maxX - minX;
    const height = maxY - minY;

    // Add 20% padding to dimensions
    const paddedWidth = width * 1.2;
    const paddedHeight = height * 1.2;

    return {
      minX,
      maxX,
      minY,
      maxY,
      centerX,
      centerY,
      width: paddedWidth,
      height: paddedHeight
    };
  }, [areaBoundsByLayer]);

  // Save floor plan bounds to the store for use in 3D views
  useEffect(() => {
    const { setFloorPlanBounds } = useHallStore.getState();
    setFloorPlanBounds(floorPlanBounds);
  }, [floorPlanBounds]);

  // Preload floor plan GLB model when 2D view loads - this caches it for instant loading in 3D views
  useEffect(() => {
    if (currentFloorPlan?.glbFileName) {
      try {
        useGLTF.preload(`/${currentFloorPlan.glbFileName}`);
        console.log(`[Preload] Floor plan GLB cached: ${currentFloorPlan.glbFileName}`);
      } catch (error) {
        // Silently handle blob URL errors during preload
        if (error instanceof Error && error.message.includes('blob:')) {
          console.warn(`⚠️ Skipped preload for floor plan with blob URL textures`);
        } else {
          console.error('Error preloading floor plan model:', error);
        }
      }
    }
  }, [currentFloorPlan?.glbFileName]);

  // Configure camera frustum and position dynamically based on floor plan bounds
  useEffect(() => {
    if (cameraRef.current) { // Only center on floor plan if no event is selected
      const camera = cameraRef.current;
      // Position camera at the center of the floor plan
      camera.position.set(floorPlanBounds.centerX, floorPlanBounds.centerY, 400);

      // Set frustum relative to camera position (symmetric around center)
      const halfWidth = floorPlanBounds.width / 2;
      const halfHeight = floorPlanBounds.height / 2;

      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
    }

    // Update OrbitControls target to the center of the floor plan
    if (controlsRef.current) {
      controlsRef.current.target.set(floorPlanBounds.centerX, floorPlanBounds.centerY, 0);
      controlsRef.current.update();
    }
  }, [floorPlanBounds]);

  // Calculate overall loading state - all objects must be loaded
  const allObjectsLoaded = useMemo(() => {
    // Floor plan must be loaded
    if (!floorPlanLoaded) return false;

    // Stage must be loaded if selected
    if (selectedStage && !stageLoaded) return false;

    // Event objects must be loaded if event is selected
    if (selectedEvent) {
      const dxfEventObjects = selectedEvent.objects.filter(
        obj => obj.showIn2D !== false && obj.fileName &&
          obj.fileName !== 'camera_man.dxf' && obj.fileName !== 'female_model.dxf'
      );
      if (dxfEventObjects.length > 0 && eventObjectsLoadedCount < dxfEventObjects.length) {
        return false;
      }
    }

    // Tables must be rendered if guest count > 0
    if (guestCount > 0 && !tablesRenderedRef.current) return false;

    return true;
  }, [floorPlanLoaded, stageLoaded, selectedStage, selectedEvent, eventObjectsLoadedCount, guestCount]);

  // Reset loading states when floor plan changes
  useEffect(() => {
    setFloorPlanLoaded(false);
    setStageLoaded(false);
    eventObjectsLoadedRef.current.clear();
    setEventObjectsLoadedCount(0);
    tablesRenderedRef.current = false;
    setProgress(0);
    setSmoothProgress(0);
  }, [currentFloorPlan?.fileName]);

  // Reset stage loading when stage changes
  useEffect(() => {
    if (selectedStage) {
      if (selectedStage.isSimpleStage) {
        // Simple stages load instantly (no DXF to load)
        setStageLoaded(true);
      } else {
        // DXF stages need to load
        setStageLoaded(false);
      }
    } else {
      // No stage selected
      setStageLoaded(true); // Consider "loaded" if no stage needed
    }
  }, [selectedStage?.id, selectedStage?.isSimpleStage]);

  // Reset event objects loading when event changes
  useEffect(() => {
    eventObjectsLoadedRef.current.clear();
    setEventObjectsLoadedCount(0);
  }, [selectedEvent?.id]);

  // Update smooth progress based on overall loading state
  useEffect(() => {
    if (allObjectsLoaded) {
      // Everything loaded, set progress to 100%
      if (progress < 100) {
        setProgress(100);
      }
      // Smooth progress will catch up via the animation below
    } else {
      // Still loading, use floor plan progress as baseline
      // Floor plan progress is the main indicator
    }
  }, [allObjectsLoaded, progress]);

  // Smooth loading progress - continuous animation until caught up
  useEffect(() => {
    // If progress resets (new load started), reset smoothProgress immediately
    if (progress === 0 && smoothProgress > 0) {
      setSmoothProgress(0);
      return;
    }

    // If already caught up, ensure smoothProgress matches progress exactly
    if (smoothProgress >= progress) {
      if (Math.abs(smoothProgress - progress) > 0.1) {
        setSmoothProgress(progress);
      }
      return;
    }

    // If progress jumps to 100% (loaded), immediately set smoothProgress to 100% for instant completion
    if (progress === 100 && smoothProgress < 100) {
      // Only animate if we're not too far behind, otherwise set instantly
      if (smoothProgress < 90) {
        // Still animate if very far behind to show progress
      } else {
        // Close to 100%, set instantly
        setSmoothProgress(100);
        return;
      }
    }

    let animationFrameId: number;
    let currentSmoothProgress = smoothProgress;

    const animate = () => {
      const distance = progress - currentSmoothProgress;

      // Adaptive speed: faster when far behind, slower when close
      // Speed increases with distance to catch up quickly
      let speed: number;
      if (distance > 50) {
        speed = 12; // Very fast when far behind (e.g., 50-100%)
      } else if (distance > 20) {
        speed = 6; // Fast when moderately behind (e.g., 20-50%)
      } else if (distance > 5) {
        speed = 3; // Medium when close (e.g., 5-20%)
      } else {
        speed = 1.5; // Slow when very close (e.g., 0-5%)
      }

      currentSmoothProgress = Math.min(currentSmoothProgress + speed, progress);
      setSmoothProgress(currentSmoothProgress);

      // Continue animating if we haven't caught up
      if (currentSmoothProgress < progress) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [progress, smoothProgress]);

  // Auto-select first table area when floor plan loads
  useEffect(() => {
    if (currentFloorPlan?.tableAreas && currentFloorPlan.tableAreas.length > 0 && !selectedTableArea) {
      selectTableArea(currentFloorPlan.tableAreas[0]);
    }
  }, [currentFloorPlan, selectedTableArea, selectTableArea]);

  // Update table arrangement when guest count or selected table area changes
  useEffect(() => {
    tablesRenderedRef.current = false; // Reset tables rendered state when config changes

    if (guestCount > 0) {
      // Use selected table area if available, otherwise use default (first table area)
      const tableConfig = selectedTableArea || currentFloorPlan?.tableAreas[0];

      if (selectedStage) {
        // Check if it's a custom stage
        if (selectedStage.isCustom) {
          // For custom stages, position table area 15 feet after the stage
          const updatedTableConfig = calculateTableAreaAfterStage(selectedStage, tableConfig, 15);
          setTableArrangement(guestCount, updatedTableConfig, currentFloorPlan?.doorAreas);
          // Give tables time to render
          // setTimeout(() => {
          tablesRenderedRef.current = true;
          // }, 300);
        } else {
          // For predefined stages, use existing logic
          (async () => {
            try {
              // Get DXF data for stage calculations
              const dxfData = await getStageDXFData(selectedStage, currentFloorPlan?.fileName);

              if (dxfData) {
                // Calculate table area points with DXF data
                const tableAreaPoints = handleStageSelection(
                  selectedStage,
                  tableConfig,
                  // dxfData.dxfUnits, 
                  'inches',
                  dxfData.stageDxf
                );
                const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
                setTableArrangement(guestCount, updatedTableConfig, currentFloorPlan?.doorAreas);
                // Give tables time to render
                // setTimeout(() => {
                tablesRenderedRef.current = true;
                // }, 300);
              } else {
                // Fallback to basic calculation without DXF
                const tableAreaPoints = handleStageSelection(selectedStage, tableConfig, 'inches');
                const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
                setTableArrangement(guestCount, updatedTableConfig, currentFloorPlan?.doorAreas);
                // Give tables time to render
                // setTimeout(() => {
                tablesRenderedRef.current = true;
                // }, 300);
              }
            } catch (error) {
              console.error('Error calculating tables:', error);
              // Fallback to basic calculation without DXF
              const tableAreaPoints = handleStageSelection(selectedStage, tableConfig, 'inches');
              const updatedTableConfig = updateTableAreaPoints(tableConfig, tableAreaPoints);
              setTableArrangement(guestCount, updatedTableConfig, currentFloorPlan?.doorAreas);
              // Give tables time to render
              // setTimeout(() => {
              tablesRenderedRef.current = true;
              // }, 300);
            }
          })();
        }
      } else {
        if (tableConfig) {
          setTableArrangement(guestCount, tableConfig, currentFloorPlan?.doorAreas);
          // Give tables time to render
          // setTimeout(() => {
          tablesRenderedRef.current = true;
          // }, 300);
        }
      }
    } else {
      // Clear tables if no guests
      setTableArrangement(0, selectedTableArea || currentFloorPlan?.tableAreas[0] || {} as any, currentFloorPlan?.doorAreas);
      tablesRenderedRef.current = true; // No tables to render, consider done immediately
    }
  }, [guestCount, selectedTableArea, setTableArrangement, currentFloorPlan, selectedStage]);

  // Handle stage selection and positioning
  useEffect(() => {
    if (selectedStage && currentFloorPlan) {
      // Get corner points from floor plan
      const cornerPoints = getCornerPoints(currentFloorPlan);

      if (cornerPoints && !selectedStage.isCustom) {
        // Position predefined stage based on corner points (default to topLeft & bottomLeft as start)
        const positionedStage = positionStageFromCorners(selectedStage, cornerPoints, 'topLeft');
        addStage(positionedStage);
      } else {
        // For custom stages or when no corner points, use the stage as-is
        addStage(selectedStage);
      }
    } else if (!selectedStage) {
      // Clear stages when no stage is selected
      clearStages();
    }
  }, [selectedStage, currentFloorPlan, addStage, clearStages]);

  // Get current table stats
  const tableStats = getTableStats(guestCount);

  const handleObjectDrag = useCallback((id: string, newPosition: { x: number; y: number }) => {
    // Get the object being dragged
    const draggedObject = objects.find(obj => obj.id === id);
    if (!draggedObject) return;

    // If it's a stage, apply boundary constraints
    if (draggedObject.type === 'stage' && currentFloorPlan) {
      const cornerPoints = getCornerPoints(currentFloorPlan);
      if (cornerPoints) {
        // Constrain position to stay within bounds
        const constrainedPosition = constrainPositionToBounds(
          newPosition.x,
          newPosition.y,
          draggedObject.width,
          draggedObject.height,
          cornerPoints
        );

        // Update the object with constrained position
        updateObject(id, constrainedPosition);

        // If it's a custom stage, also update the stage config
        if (selectedStage && selectedStage.isCustom) {
          // Update the selected stage coordinates
          const updatedStage = { ...selectedStage, x: constrainedPosition.x, y: constrainedPosition.y };
          // This will trigger the stage update callback
          if (onStageUpdate) {
            onStageUpdate(updatedStage);
          }
        }
      } else {
        // No boundary constraints, update normally
        updateObject(id, newPosition);
      }
    } else {
      // For non-stage objects, update normally
      updateObject(id, newPosition);
    }
  }, [updateObject, objects, currentFloorPlan, selectedStage]);

  const handleCanvasClick = useCallback((event: any) => {

    if (isSelectingCustomArea && event.point) {
      // Add point for custom area selection
      const point = {
        x: Math.round(event.point.x * 100) / 100,
        y: Math.round(event.point.y * 100) / 100
      };
      addCustomAreaPoint(point);
    } else {
      selectObject(null);
    }
  }, [selectObject, isSelectingCustomArea, addCustomAreaPoint]);

  // Handle mouse move for hover coordinates
  const handleMouseMove = useCallback((event: any) => {
    if (event.point) {
      const coords = {
        x: Math.round(event.point.x * 100) / 100,
        y: Math.round(event.point.y * 100) / 100
      };
      setHoverCoordinates(coords);
    }
  }, [setHoverCoordinates]);

  // Handle mouse leave to clear coordinates
  const handleMouseLeave = useCallback(() => {
    setHoverCoordinates(null);
  }, [setHoverCoordinates]);

  // Handle table area selection
  // const handleTableAreaClick = useCallback((tableArea: any) => {
  //   selectTableArea(tableArea);
  // }, [selectTableArea]);

  // // Handle custom area selection start
  // const handleStartCustomArea = useCallback(() => {
  //   startCustomAreaSelection();
  // }, [startCustomAreaSelection]);

  // Handle clear custom area
  // const handleClearCustomArea = useCallback(() => {
  //   clearCustomAreaSelection();
  // }, [clearCustomAreaSelection]);

  /** ✅ UI Handlers */
  const handleZoomIn = () => {
    if (cameraRef.current) {
      cameraRef.current.zoom *= 1.2;
      cameraRef.current.updateProjectionMatrix();
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      cameraRef.current.zoom /= 1.2;
      cameraRef.current.updateProjectionMatrix();
    }
  };

  // const handlePan = (dx: number, dy: number) => {
  //   if (cameraRef.current) {
  //     cameraRef.current.position.x += dx;
  //     cameraRef.current.position.y += dy;
  //     controlsRef.current?.update();
  //   }
  // };

  return (
    <div className="relative w-full h-screen">

      {/* Loading Bar - Show until all objects are loaded */}
      {(!allObjectsLoaded || smoothProgress < 100) && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-3/4 h-4 bg-gray-300 rounded z-50">
          <div
            className="h-full bg-blue-500 rounded transition-all duration-150"
            style={{ width: `${Math.min(smoothProgress, 100)}%` }}
          />
        </div>
      )}

      {/* ✅ UI Controls */}
      <div className="absolute bottom-10 right-9 z-50 flex flex-col gap-2">
        <button onClick={handleZoomIn} className="bg-gray-700 shadow px-2 py-1 rounded">➕</button>
        <button onClick={handleZoomOut} className="bg-gray-700 shadow px-2 py-1 rounded">➖</button>
      </div>

      {/* Hover Coordinates Display */}
      <div className="absolute top-4 right-4 z-50 bg-blue-900 text-white p-2 rounded shadow-lg">
        <div className="text-xs">
          <p>X: {hoverCoordinates?.x?.toFixed(2) || '--'}</p>
          <p>Y: {hoverCoordinates?.y?.toFixed(2) || '--'}</p>
        </div>
      </div>

      {/* Table Stats Display */}
      {(tableStats.tables > 0 || tableStats.singleChairs > 0) && !isShareView && (
        <div className="absolute top-16 right-4 z-50 bg-gray-800 text-white p-3 rounded shadow-lg">
          <h4 className="text-sm font-semibold mb-2">Seating Arrangement</h4>
          <div className="text-xs space-y-1">
            {tableStats.tables > 0 && (
              <>
                <p>Tables: {tableStats.tables}</p>
                <p>Seats at Tables: {tableStats.chairs}</p>
              </>
            )}
            {tableStats.singleChairs > 0 && (
              <p>Single Chairs: {tableStats.singleChairs}</p>
            )}
            <p className="font-semibold text-green-400 pt-1">Maximum Guests: {tableStats.totalGuests}</p>
            {currentTableConfig && (
              <p className="text-gray-400 mt-2">
                Area: {currentTableConfig.name}
              </p>
            )}
            {selectedTableArea?.seatingMode && (
              <p className="text-blue-300 mt-1">
                Mode: {selectedTableArea.seatingMode}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Table Area Selection */}
      {/* <div className="absolute top-4 left-4 z-50 bg-gray-800 text-white p-3 rounded shadow-lg">
        <h4 className="text-sm font-semibold mb-2">Select Table Area</h4> */}

      {/* Custom Area Selection */}
      {/* <div className="mb-3">
          <button
            onClick={handleStartCustomArea}
            className={`w-full text-left px-2 py-1 rounded text-xs mb-2 ${
              isSelectingCustomArea ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-500'
            }`}
          >
            {isSelectingCustomArea ? `Select Point ${customAreaPoints.length + 1}/4` : 'Custom Area (4 Points)'}
          </button>
          
          {isSelectingCustomArea && (
            <div className="text-xs text-yellow-300 mb-2">
              Click 4 points on canvas to define area
            </div>
          )}
          
          {customAreaPoints.length > 0 && (
            <button
              onClick={handleClearCustomArea}
              className="w-full text-left px-2 py-1 rounded text-xs bg-red-600 hover:bg-red-500"
            >
              Clear Custom Area
            </button>
          )}
        </div> */}

      {/* Predefined Areas */}
      {/* {currentFloorPlan?.tableAreas && (
          <>
            <div className="text-xs text-gray-300 mb-2">
              Predefined Areas: {currentFloorPlan.tableAreas.length}
            </div>
            <div className="space-y-2">
              <button
                onClick={() => handleTableAreaClick(null)}
                className={`w-full text-left px-2 py-1 rounded text-xs ${
                  !selectedTableArea ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'
                }`}
              >
                Default (First Area)
              </button>
              {currentFloorPlan.tableAreas.map((area: any) => (
                <button
                  key={area.id}
                  onClick={() => handleTableAreaClick(area)}
                  className={`w-full text-left px-2 py-1 rounded text-xs ${
                    selectedTableArea?.id === area.id ? 'bg-blue-600' : 'bg-gray-600 hover:bg-gray-500'
                  }`}
                >
                  {area.name}
                </button>
              ))}
            </div>
          </>
        )} */}
      {/* </div> */}

      {/* Canvas */}
      <Canvas
        orthographic
        camera={{ zoom: 5, position: [floorPlanBounds.centerX, floorPlanBounds.centerY, 400] }}
        onPointerMissed={handleCanvasClick}
        onPointerMove={handleMouseMove}
        onPointerLeave={handleMouseLeave}
        onClick={handleCanvasClick}
      >
        <OrthographicCamera makeDefault ref={cameraRef} position={[floorPlanBounds.centerX, floorPlanBounds.centerY, 400]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={0.5} />

        <OrbitControls
          ref={controlsRef}
          enableRotate={false}
          enablePan={true}
          enableZoom={true}
          zoomSpeed={1.2}
          panSpeed={1.2}
          target={[floorPlanBounds.centerX, floorPlanBounds.centerY, 0]}
          mouseButtons={{
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
          }}
          touches={{
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_PAN
          }}
          enableDamping={false}
        />

        {/* <group position={[floorPlanBounds.centerX, floorPlanBounds.centerY, 0]}>
          <primitive
          object={
            new THREE.GridHelper(
              Math.max(
                floorPlanBounds.maxX - floorPlanBounds.minX,
                floorPlanBounds.maxY - floorPlanBounds.minY
              ),
              20,
              'red',
              '#222'
            )
          }
          rotation={[Math.PI / 2, 0, 0]}
        />
        </group> */}

        {/* Background plane for click detection */}
        {/* Invisible plane for mouse interaction - dynamically sized based on floor plan */}
        <mesh
          position={[
            (floorPlanBounds.minX + floorPlanBounds.maxX) / 2,
            (floorPlanBounds.minY + floorPlanBounds.maxY) / 2,
            -0.1
          ]}
          onClick={handleCanvasClick}
          onPointerMove={handleMouseMove}
        >
          <planeGeometry args={[
            floorPlanBounds.maxX - floorPlanBounds.minX,
            floorPlanBounds.maxY - floorPlanBounds.minY
          ]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* Floor Plan */}
        <AdvancedDXFModel
          url={`/${currentFloorPlan?.fileName || 'floor-plan.dxf'}`}
          onProgress={(p) => {
            setProgress(p);
            if (p >= 100) {
              setFloorPlanLoaded(true);
            }
          }}
          onAreaBounds={setAreaBoundsByLayer}
          position={[floorPlanBounds.centerX, floorPlanBounds.centerY, 0]}
          stageConfig={{
            rotation: currentFloorPlan?.rotation ?? 0
          }}
        />

        {/* Render selected stage DXF */}
        {selectedStage && (
          selectedStage.isSimpleStage ? (
            // Render simple rectangle stage (loads instantly, no DXF)
            <group
              key={`stage-${selectedStage.id}`}
              position={[
                selectedStage.x +
                (selectedStage?.backstageDepth ? feetToDXFUnits(selectedStage.backstageDepth!) : 0),
                selectedStage.y, 0.2]}
              rotation={[0, 0, (selectedStage.rotation ?? 0) * (Math.PI / 180)]}
            >
              {/* Stage platform */}
              <mesh>
                <boxGeometry args={[selectedStage.customWidth || 200, selectedStage.customHeight || 100, 2]} />
                <meshStandardMaterial
                  color="#8B4513"
                  roughness={0.6}
                  metalness={0.1}
                />
              </mesh>
              {/* Stage outline */}
              <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(selectedStage.customWidth || 200, selectedStage.customHeight || 100, 2)]} />
                <lineBasicMaterial color="#000000" linewidth={2} />
              </lineSegments>
              {/* Stage grid pattern */}
              {/* <gridHelper 
                  args={[
                    Math.max(selectedStage.customWidth || 200, selectedStage.customHeight || 100), 
                    10, 
                    '#666666', 
                    '#444444'
                  ]} 
                  rotation={[Math.PI / 2, 0, 0]}
                  position={[0, 0, 1.1]}
                /> */}

              {/* Backstage Space Visualization */}
              {selectedStage.backstageDepth && selectedStage.backstageDepth > 0 && (
                (() => {
                  const side = selectedStage.backstageSide || 'left';
                  const depth = feetToDXFUnits(selectedStage.backstageDepth!);
                  const width = selectedStage.customWidth || 200;
                  const height = selectedStage.customHeight || 100;

                  let position: [number, number, number] = [0, 0, 0];
                  let size: [number, number] = [0, 0];

                  switch (side) {
                    case 'left':
                      position = [-width / 2 - depth / 2, 0, -0.1];
                      size = [depth, height];
                      break;
                    case 'right':
                      position = [width / 2 + depth / 2, 0, -0.1];
                      size = [depth, height];
                      break;
                    case 'top':
                      position = [0, height / 2 + depth / 2, -0.1];
                      size = [width, depth];
                      break;
                    case 'bottom':
                      position = [0, -height / 2 - depth / 2, -0.1];
                      size = [width, depth];
                      break;
                  }

                  return (
                    <group position={position}>
                      <mesh>
                        <planeGeometry args={size} />
                        <meshBasicMaterial
                          color={
                            selectedStage.backstageDepth! < 6 ? '#ef4444' : // Red
                              selectedStage.backstageDepth! < 10 ? '#eab308' : // Yellow
                                '#22c55e' // Green
                          }
                          transparent
                          opacity={0.5}
                        />
                      </mesh>
                    </group>
                  );
                })()
              )}
            </group>
          ) : (
            // Render DXF model stage
            // stage.x and stage.y are CENTER positions (not starting points)
            // AdvancedDXFModel expects center position, so use x and y directly
            <>

              <AdvancedDXFModel
                key={`stage-${selectedStage.id}`}
                url={`/${selectedStage.fileName}`}
                onProgress={(p) => {
                  if (p >= 100) {
                    setStageLoaded(true);
                  }
                }}
                position={[
                  // Treat x,y as Top-Center for predefined stages (X=Center, Y=Top)
                  selectedStage.x + feetToDXFUnits(selectedStage.backstageDepth!),

                  !selectedStage.isCustom ? (() => {
                    const rotRad = (selectedStage.rotation || 0) * (Math.PI / 180);
                    const w = selectedStage.width || 0;
                    const h = selectedStage.height || 0;
                    const visualHeight = Math.abs(w * Math.sin(rotRad)) + Math.abs(h * Math.cos(rotRad));

                    return selectedStage.y - visualHeight / 2; // Assuming Y is Top (Max Y)
                  })() : selectedStage.y,

                  0.2
                ]}
                isStage={true}
                stageConfig={selectedStage}
              />
            </>
          )
        )}

        {/* Render selected event objects */}
        {selectedEvent && selectedEvent.objects.map((eventObject) => {
          if (eventObject.showIn2D === false) {
            return null;
          }

          const renderMode = eventObject.twoDRenderMode ?? (eventObject.fileName ? 'dxf' : eventObject.glbFileName ? 'plane' : 'none');

          if (renderMode === 'plane') {
            const positionOrigin = eventObject.positionOrigin ?? 'top-left';
            const useTopLeftOrigin = positionOrigin === 'top-left';
            const planeWidth = eventObject.width ?? 200;
            const planeHeight = eventObject.height ?? 80;
            const offsetX = useTopLeftOrigin ? planeWidth / 2 : 0;
            const offsetY = useTopLeftOrigin ? -planeHeight / 2 : 0;
            const opacity = eventObject.twoDOpacity ?? 0.85;
            const fillColor = eventObject.twoDColor ?? '#ffffff';
            const outlineColor = eventObject.twoDOutlineColor ?? '#000000';
            const rotationRadians = (eventObject.rotation ?? 0) * (Math.PI / 180);

            return (
              <EventBanner2D
                key={`event-${selectedEvent.id}-${eventObject.id}`}
                width={planeWidth}
                height={planeHeight}
                position={[eventObject.x + offsetX, eventObject.y + offsetY, 0.16]}
                rotation={rotationRadians}
                fillColor={fillColor}
                outlineColor={outlineColor}
                opacity={opacity}
              />
            );
          }

          if (renderMode === 'dxf' && eventObject.fileName) {
            const positionOrigin = eventObject.positionOrigin ?? 'top-left';
            const useTopLeftOrigin = positionOrigin === 'top-left';
            const offsetX = useTopLeftOrigin ? (eventObject.width || 0) / 2 : 0;
            const offsetY = useTopLeftOrigin ? -(eventObject.height || 0) / 2 : 0;

            // Use SimpleDxfOverlay for models-photoshoot and camera_man (simpler, more reliable rendering)
            if (eventObject.fileName === 'camera_man.dxf' || eventObject.fileName === 'female_model.dxf') {
              return (
                <SimpleDxfOverlay
                  key={`event-${selectedEvent.id}-${eventObject.id}`}
                  dxfUrl={`/${eventObject.fileName}`}
                  position={[eventObject.x + offsetX, eventObject.y + offsetY, 0.15]}
                  color={'#000'}
                  width={eventObject.width}
                  height={eventObject.height}
                  rotation={eventObject.rotation}
                />
              );
            }

            // Use AdvancedDXFModel for other event objects
            const eventObjectKey = `event-${selectedEvent.id}-${eventObject.id}`;
            return (
              <AdvancedDXFModel
                key={eventObjectKey}
                url={`/${eventObject.fileName}`}
                onProgress={(p) => {
                  if (p >= 100 && !eventObjectsLoadedRef.current.has(eventObjectKey)) {
                    eventObjectsLoadedRef.current.add(eventObjectKey);
                    setEventObjectsLoadedCount(eventObjectsLoadedRef.current.size);
                  }
                }}
                position={[eventObject.x + offsetX, eventObject.y + offsetY, 0.15]}
                isStage={true}
                highlightColor={eventObject.color}
                stageConfig={{
                  id: eventObject.id,
                  name: eventObject.name,
                  fileName: eventObject.fileName,
                  x: eventObject.x + offsetX,
                  y: eventObject.y + offsetY,
                  width: eventObject.width,
                  height: eventObject.height,
                  rotation: eventObject.rotation || 0,
                  description: eventObject.description
                }}
              />
            );
          }

          return null;
        })}

        {/* Render custom area selection points */}
        {customAreaPoints.map((point, index) => (
          <mesh key={`custom-point-${index}`} position={[point.x, point.y, 0.1]}>
            <sphereGeometry args={[0.5, 16, 16]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
        ))}

        {/* Render custom area polygon */}
        {customAreaPoints.length === 4 && (
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[1000, 1000]} />
            <meshBasicMaterial
              color="#00ff00"
              transparent
              opacity={0.1}
            />
          </mesh>
        )}

        {/* Render door areas */}
        {/* {currentFloorPlan?.doorAreas?.map((doorArea: DoorArea) => {
          const bounds = {
            minX: Math.min(doorArea.topLeft.x, doorArea.topRight.x, doorArea.bottomRight.x, doorArea.bottomLeft.x),
            maxX: Math.max(doorArea.topLeft.x, doorArea.topRight.x, doorArea.bottomRight.x, doorArea.bottomLeft.x),
            minY: Math.min(doorArea.topLeft.y, doorArea.topRight.y, doorArea.bottomRight.y, doorArea.bottomLeft.y),
            maxY: Math.max(doorArea.topLeft.y, doorArea.topRight.y, doorArea.bottomRight.y, doorArea.bottomLeft.y)
          };
          
          const width = bounds.maxX - bounds.minX;
          const height = bounds.maxY - bounds.minY;
          const centerX = (bounds.minX + bounds.maxX) / 2;
          const centerY = (bounds.minY + bounds.maxY) / 2;

          // Color based on door type
          const doorColor = doorArea.type === 'emergency' ? '#FF0000' 
            : doorArea.type === 'entrance' ? '#00FF00'
            : doorArea.type === 'exit' ? '#FFA500'
            : '#FFFF00';

          return (
            <group key={`door-${doorArea.id}`}>
              <mesh position={[centerX, centerY, 0.05]}>
                <planeGeometry args={[width, height]} />
                <meshBasicMaterial color={doorColor} transparent opacity={0.15} />
              </mesh>
              <lineSegments position={[centerX, centerY, 0.06]}>
                <edgesGeometry args={[new THREE.PlaneGeometry(width, height)]} />
                <lineBasicMaterial color={doorColor} linewidth={2} />
              </lineSegments>
            </group>
          );
        })} */}

        {/* Render custom area polygon outline */}
        {/* {customAreaPoints.length === 4 && (
          <primitive
            object={new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                ...customAreaPoints.map(p => new THREE.Vector3(p.x, p.y, 0.1)),
                new THREE.Vector3(customAreaPoints[0].x, customAreaPoints[0].y, 0.1) // Close the polygon
              ]),
              new THREE.LineBasicMaterial({ color: '#00ff00', linewidth: 2 })
            )}
          />
        )} */}

        {/* Render venue boundary for stage constraints */}
        {/* {currentFloorPlan?.cornerPoints && (
          <primitive
            object={new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(currentFloorPlan.cornerPoints.topLeft.x, currentFloorPlan.cornerPoints.topLeft.y, 0.02),
                new THREE.Vector3(currentFloorPlan.cornerPoints.topRight.x, currentFloorPlan.cornerPoints.topRight.y, 0.02),
                new THREE.Vector3(currentFloorPlan.cornerPoints.bottomRight.x, currentFloorPlan.cornerPoints.bottomRight.y, 0.02),
                new THREE.Vector3(currentFloorPlan.cornerPoints.bottomLeft.x, currentFloorPlan.cornerPoints.bottomLeft.y, 0.02),
                new THREE.Vector3(currentFloorPlan.cornerPoints.topLeft.x, currentFloorPlan.cornerPoints.topLeft.y, 0.02) // Close the rectangle
              ]),
              new THREE.LineBasicMaterial({ color: '#ff6b35', linewidth: 3, transparent: true, opacity: 0.6 })
            )}
          />
        )} */}

        {/* Render selected table area outline */}
        {/* {currentTableConfig && currentTableConfig.namedPoints && (
          <primitive
            object={new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(currentTableConfig.namedPoints.topLeft.x, currentTableConfig.namedPoints.topLeft.y, 0.15),
                new THREE.Vector3(currentTableConfig.namedPoints.topRight.x, currentTableConfig.namedPoints.topRight.y, 0.15),
                new THREE.Vector3(currentTableConfig.namedPoints.bottomRight.x, currentTableConfig.namedPoints.bottomRight.y, 0.15),
                new THREE.Vector3(currentTableConfig.namedPoints.bottomLeft.x, currentTableConfig.namedPoints.bottomLeft.y, 0.15),
                new THREE.Vector3(currentTableConfig.namedPoints.topLeft.x, currentTableConfig.namedPoints.topLeft.y, 0.15) // Close the polygon
              ]),
              new THREE.LineBasicMaterial({ color: '#ffff00', linewidth: 3 })
            )}
          />
        )} */}

        {/* Render selected table area bounds (for non-polygon areas) */}
        {currentTableConfig && !currentTableConfig.namedPoints && (
          <primitive
            object={new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(currentTableConfig.startX, currentTableConfig.startY, 0.15),
                new THREE.Vector3(currentTableConfig.endX, currentTableConfig.startY, 0.15),
                new THREE.Vector3(currentTableConfig.endX, currentTableConfig.endY, 0.15),
                new THREE.Vector3(currentTableConfig.startX, currentTableConfig.endY, 0.15),
                new THREE.Vector3(currentTableConfig.startX, currentTableConfig.startY, 0.15) // Close the rectangle
              ]),
              new THREE.LineBasicMaterial({ color: '#ffff00', linewidth: 3 })
            )}
          />
        )}

        {/* Render objects - tables and chairs are fixed (non-draggable), others are draggable */}
        {objects.map((object: HallObject) => {
          // Tables and chairs are fixed from calculation - render without drag functionality
          if (object.type === 'table' || object.type === 'chair') {
            return (
              <group
                key={object.id}
                position={[object.x, object.y, 0]}
                rotation={[0, 0, (object.rotation ?? 0) * (Math.PI / 180)]}
              >
                <DXFTableRenderer object={object} />
              </group>
            );
          }

          // Other objects (stages, etc.) - can be made draggable or not
          return (
            <DraggableObject
              key={object.id}
              object={object}
              onDrag={handleObjectDrag}
              isSelected={selectedObjectId === object.id}
              onSelect={selectObject}
              controlsRef={controlsRef}
              isDraggable={true} // Set to true to enable dragging, false to disable
            />
          );
        })}
      </Canvas>
    </div>
  );
}