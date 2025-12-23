'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useHallStore, type FloorPlanBounds, type CameraPosition } from '@store/hallStore';
import type { FloorPlan } from '@config/venues';
import { extractSimpleEntities, type SimpleDxfEntity } from '@utils/simpleDxfExtractor';
import type { EventConfig } from '@config/events';
import type { HallObject } from '@models/objects';

interface Minimap2DProps {
  floorPlanBounds: FloorPlanBounds | null;
  floorPlan: FloorPlan | null;
  scaleFactor: number;
  cameraPosition: CameraPosition | null;
  selectedEvent?: EventConfig | null;
}

export default function Minimap2D({ floorPlanBounds, floorPlan, scaleFactor, cameraPosition, selectedEvent }: Minimap2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal, 2 = zoomed in
  const [debugMode, setDebugMode] = useState(false); // Debug mode toggle

  const animationFrameRef = useRef<number | undefined>(undefined);
  const [dxfEntities, setDxfEntities] = useState<SimpleDxfEntity[]>([]);
  const [isLoadingDxf, setIsLoadingDxf] = useState(true);
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 1000);

  // Drag/pan state
  const [panOffsetX, setPanOffsetX] = useState(0); // Pan offset in DXF coordinates
  const [panOffsetY, setPanOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lastCameraPositionRef = useRef<{ x: number; z: number } | null>(null);

  // Get objects (chairs, tables) from store
  const { objects } = useHallStore();

  // Cache for table/chair DXF entities
  const [objectDxfCache, setObjectDxfCache] = useState<Map<string, SimpleDxfEntity[]>>(new Map());

  // Responsive sizing based on viewport height
  const getResponsiveSize = () => {
    // For small screens (height < 800px), use smaller sizes
    if (viewportHeight < 800) {
      return { base: 280, expanded: 400 };
    }
    // For medium screens (height < 1000px)
    if (viewportHeight < 1000) {
      return { base: 320, expanded: 480 };
    }
    // Default sizes for larger screens
    return { base: 400, expanded: 600 };
  };

  const { base: baseMapSize, expanded: expandedMapSize } = getResponsiveSize();
  const mapSize = isExpanded ? expandedMapSize : baseMapSize;

  // Update viewport height on resize for responsive sizing
  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load DXF entities for the floor plan
  useEffect(() => {
    if (!floorPlan?.fileName) {
      setIsLoadingDxf(false);
      return;
    }

    let mounted = true;
    setIsLoadingDxf(true);

    const loadDxf = async () => {
      try {
        // Don't ignore position - we want entities at their actual DXF coordinates
        const entities = await extractSimpleEntities(`/${floorPlan.fileName}`, { ignorePosition: false });
        if (mounted) {
          setDxfEntities(entities);
          setIsLoadingDxf(false);
        }
      } catch (error) {
        console.error('Error loading DXF for minimap:', error);
        if (mounted) {
          setDxfEntities([]);
          setIsLoadingDxf(false);
        }
      }
    };

    loadDxf();

    return () => {
      mounted = false;
    };
  }, [floorPlan?.fileName]);

  // Calculate the viewport bounds for the minimap
  // Use floor plan bounds directly to match 2D view exactly
  // Apply zoom level to scale the viewport (zoom in = smaller bounds, zoom out = larger bounds)
  // Zoom is centered around the camera position (pointer) instead of floor plan center
  const viewportBounds = useMemo(() => {
    if (!floorPlanBounds) return null;

    // Use floor plan bounds directly - match 2D view camera frustum exactly
    // 2D view uses: halfWidth = floorPlanBounds.width / 2, halfHeight = floorPlanBounds.height / 2
    // So the 2D view shows exactly the floor plan bounds
    // For minimap, use the same bounds to maintain exact aspect ratio
    const actualWidth = floorPlanBounds.maxX - floorPlanBounds.minX;
    const actualHeight = floorPlanBounds.maxY - floorPlanBounds.minY;

    // Calculate base viewport bounds (full floor plan)
    let viewportMinX = floorPlanBounds.minX;
    let viewportMaxX = floorPlanBounds.maxX;
    let viewportMinY = floorPlanBounds.minY;
    let viewportMaxY = floorPlanBounds.maxY;

    // Calculate camera DXF coordinates for zoom center
    // Always use camera position if available, otherwise fall back to floor plan center
    let zoomCenterX = floorPlanBounds.centerX;
    let zoomCenterY = floorPlanBounds.centerY;

    if (cameraPosition) {
      // Convert 3D camera coordinates to DXF coordinates
      const effectiveScaleFactor = (!Number.isFinite(scaleFactor) || scaleFactor === 0) ? 50 : scaleFactor;
      const centerOffsetX = floorPlanBounds.centerX;
      const centerOffsetY = floorPlanBounds.centerY;

      const dxfX = Math.round(cameraPosition.x * effectiveScaleFactor + centerOffsetX);
      const dxfY = Math.round(centerOffsetY - cameraPosition.z * effectiveScaleFactor);

      // Use camera position as zoom center
      // Don't clamp to floor plan bounds - allow camera to be outside if needed
      zoomCenterX = dxfX;
      zoomCenterY = dxfY;
    }

    // Apply zoom level to viewport bounds
    // zoomLevel > 1 = zoom in (smaller area shown)
    // zoomLevel < 1 = zoom out (larger area shown)
    // Zoom is centered around the camera position (pointer)
    const baseWidth = viewportMaxX - viewportMinX;
    const baseHeight = viewportMaxY - viewportMinY;

    // Scale width and height by zoom level (inverse relationship)
    const zoomedWidth = baseWidth / zoomLevel;
    const zoomedHeight = baseHeight / zoomLevel;

    // Center around camera position (pointer) while maintaining aspect ratio
    let newMinX = zoomCenterX - zoomedWidth / 2;
    let newMaxX = zoomCenterX + zoomedWidth / 2;
    let newMinY = zoomCenterY - zoomedHeight / 2;
    let newMaxY = zoomCenterY + zoomedHeight / 2;

    // Clamp to floor plan bounds to prevent showing area outside the plan
    // For zoom in (zoomLevel > 1): clamp to floor plan bounds
    // For zoom out (zoomLevel < 1): ensure camera stays visible, but clamp if viewport exceeds floor plan too much
    if (zoomLevel > 1) {
      // If zoomed viewport exceeds floor plan bounds, clamp it
      if (newMinX < floorPlanBounds.minX) {
        const diff = floorPlanBounds.minX - newMinX;
        newMinX = floorPlanBounds.minX;
        newMaxX += diff;
      }
      if (newMaxX > floorPlanBounds.maxX) {
        const diff = newMaxX - floorPlanBounds.maxX;
        newMaxX = floorPlanBounds.maxX;
        newMinX -= diff;
      }
      if (newMinY < floorPlanBounds.minY) {
        const diff = floorPlanBounds.minY - newMinY;
        newMinY = floorPlanBounds.minY;
        newMaxY += diff;
      }
      if (newMaxY > floorPlanBounds.maxY) {
        const diff = newMaxY - floorPlanBounds.maxY;
        newMaxY = floorPlanBounds.maxY;
        newMinY -= diff;
      }
    } else if (zoomLevel < 1) {
      // When zooming out, ensure camera position is always visible
      // If camera is outside viewport, adjust viewport to include it
      const cameraDxfX = zoomCenterX;
      const cameraDxfY = zoomCenterY;
      
      if (cameraDxfX < newMinX) {
        const diff = newMinX - cameraDxfX;
        newMinX = cameraDxfX;
        newMaxX -= diff;
      } else if (cameraDxfX > newMaxX) {
        const diff = cameraDxfX - newMaxX;
        newMaxX = cameraDxfX;
        newMinX += diff;
      }
      
      if (cameraDxfY < newMinY) {
        const diff = newMinY - cameraDxfY;
        newMinY = cameraDxfY;
        newMaxY -= diff;
      } else if (cameraDxfY > newMaxY) {
        const diff = cameraDxfY - newMaxY;
        newMaxY = cameraDxfY;
        newMinY += diff;
      }
      
      // Also ensure viewport doesn't extend too far beyond floor plan bounds
      // Allow some extension, but keep it reasonable (max 2x the floor plan size)
      const maxExtensionX = baseWidth * 1.5;
      const maxExtensionY = baseHeight * 1.5;
      
      if (newMinX < floorPlanBounds.minX - maxExtensionX) {
        newMinX = floorPlanBounds.minX - maxExtensionX;
      }
      if (newMaxX > floorPlanBounds.maxX + maxExtensionX) {
        newMaxX = floorPlanBounds.maxX + maxExtensionX;
      }
      if (newMinY < floorPlanBounds.minY - maxExtensionY) {
        newMinY = floorPlanBounds.minY - maxExtensionY;
      }
      if (newMaxY > floorPlanBounds.maxY + maxExtensionY) {
        newMaxY = floorPlanBounds.maxY + maxExtensionY;
      }
    }

    viewportMinX = newMinX;
    viewportMaxX = newMaxX;
    viewportMinY = newMinY;
    viewportMaxY = newMaxY;

    // Apply manual pan offset if user is dragging or has panned
    // Only apply pan offset if we're not currently following camera (i.e., user has manually panned)
    if (panOffsetX !== 0 || panOffsetY !== 0) {
      viewportMinX += panOffsetX;
      viewportMaxX += panOffsetX;
      viewportMinY += panOffsetY;
      viewportMaxY += panOffsetY;
    }

    // Calculate dimensions - keep rectangular to match floor plan aspect ratio
    const finalWidth = viewportMaxX - viewportMinX;
    const finalHeight = viewportMaxY - viewportMinY;

    return {
      minX: viewportMinX,
      maxX: viewportMaxX,
      minY: viewportMinY,
      maxY: viewportMaxY,
      width: finalWidth,
      height: finalHeight,
      centerX: floorPlanBounds.centerX,
      centerY: floorPlanBounds.centerY
    };
  }, [floorPlanBounds, zoomLevel, cameraPosition, scaleFactor, panOffsetX, panOffsetY]);

  // Convert 3D camera position to 2D minimap coordinates
  const cameraMapPosition = useMemo(() => {
    if (!cameraPosition || !viewportBounds || !floorPlanBounds) return null;

    // Convert 3D position to DXF coordinates
    // The conversion formula MUST match exactly what's used in the 3D scene:
    // 
    // In 3D scene (HallCanvas3DWalk):
    // - WorldCoordinateHelper converts: dxfX = worldX * scaleFactor + centerOffset.x
    //                                   dxfY = centerOffset.y - worldZ * scaleFactor
    //
    // Reverse conversion (3D to DXF) - camera position is in 3D world coordinates:
    // dxfX = cameraPosition.x * scaleFactor + centerX
    // dxfY = centerY - cameraPosition.z * scaleFactor
    //
    // Note: cameraPosition.y (height) is ignored for 2D minimap - we only use x and z
    // The center offset should match floorPlanBounds.centerX/centerY
    // Match WorldCoordinateHelper exactly: dxfX = worldX * scaleFactor + centerOffset.x
    //                                     dxfY = centerOffset.y - worldZ * scaleFactor
    // Use Math.round to match WorldCoordinateHelper's rounding behavior

    // Ensure scaleFactor is valid and matches what's used in 3D scene
    // IMPORTANT: This must match currentScaleFactor from HallCanvas3DWalk exactly
    const effectiveScaleFactor = (!Number.isFinite(scaleFactor) || scaleFactor === 0) ? 50 : scaleFactor;

    // Convert 3D camera coordinates to DXF coordinates
    // This matches the exact formula used in WorldCoordinateHelper:
    // WorldCoordinateHelper: dxfX = worldX * scaleFactor + centerOffset.x
    //                        dxfY = centerOffset.y - worldZ * scaleFactor
    // Here we use floorPlanBounds.centerX/Y which should match centerOffset.x/y from 3D scene
    // IMPORTANT: Use the exact same formula and rounding as WorldCoordinateHelper
    // Note: floorPlanBounds.centerX/Y should match floorPlanCenter.x/y from 3D scene
    const centerOffsetX = floorPlanBounds.centerX;
    const centerOffsetY = floorPlanBounds.centerY;

    const dxfX = Math.round(cameraPosition.x * effectiveScaleFactor + centerOffsetX);
    const dxfY = Math.round(centerOffsetY - cameraPosition.z * effectiveScaleFactor);

    // Debug: Log conversion details to console (throttled) - uncomment to debug
    // if (typeof window !== 'undefined') {
    //   const now = Date.now();
    //   const lastLog = (window as any).__minimapConversionLog || 0;
    //   if (now - lastLog > 2000) { // Log every 2 seconds
    //     console.log('📍 Minimap Conversion:', {
    //       camera3D: { x: cameraPosition.x.toFixed(3), z: cameraPosition.z.toFixed(3) },
    //       scaleFactor: effectiveScaleFactor.toFixed(4),
    //       center: { x: floorPlanBounds.centerX.toFixed(2), y: floorPlanBounds.centerY.toFixed(2) },
    //       dxf: { x: dxfX, y: dxfY },
    //       formulaX: `${cameraPosition.x.toFixed(3)} * ${effectiveScaleFactor.toFixed(4)} + ${floorPlanBounds.centerX.toFixed(2)} = ${dxfX}`,
    //       formulaY: `${floorPlanBounds.centerY.toFixed(2)} - ${cameraPosition.z.toFixed(3)} * ${effectiveScaleFactor.toFixed(4)} = ${dxfY}`
    //     });
    //     (window as any).__minimapConversionLog = now;
    //   }
    // }

    // DEBUG: Comprehensive logging to identify coordinate conversion issues
    const debugInfo = {
      timestamp: new Date().toISOString(),
      camera3D: {
        x: cameraPosition.x.toFixed(3),
        y: cameraPosition.y.toFixed(3),
        z: cameraPosition.z.toFixed(3),
        rotationY: cameraPosition.rotationY.toFixed(3)
      },
      scaleFactor: scaleFactor.toFixed(6),
      floorPlanCenter: {
        centerX: floorPlanBounds.centerX.toFixed(2),
        centerY: floorPlanBounds.centerY.toFixed(2)
      },
      dxfCoords: {
        dxfX: dxfX.toFixed(2),
        dxfY: dxfY.toFixed(2)
      },
      floorPlanBounds: {
        minX: floorPlanBounds.minX.toFixed(2),
        maxX: floorPlanBounds.maxX.toFixed(2),
        minY: floorPlanBounds.minY.toFixed(2),
        maxY: floorPlanBounds.maxY.toFixed(2),
        width: (floorPlanBounds.maxX - floorPlanBounds.minX).toFixed(2),
        height: (floorPlanBounds.maxY - floorPlanBounds.minY).toFixed(2)
      },
      viewportBounds: {
        minX: viewportBounds.minX.toFixed(2),
        maxX: viewportBounds.maxX.toFixed(2),
        minY: viewportBounds.minY.toFixed(2),
        maxY: viewportBounds.maxY.toFixed(2),
        width: viewportBounds.width.toFixed(2),
        height: viewportBounds.height.toFixed(2)
      },
      inFloorPlanBounds: {
        xInBounds: dxfX >= floorPlanBounds.minX && dxfX <= floorPlanBounds.maxX,
        yInBounds: dxfY >= floorPlanBounds.minY && dxfY <= floorPlanBounds.maxY,
        bothInBounds: (dxfX >= floorPlanBounds.minX && dxfX <= floorPlanBounds.maxX) &&
          (dxfY >= floorPlanBounds.minY && dxfY <= floorPlanBounds.maxY)
      },
      inViewportBounds: {
        xInBounds: dxfX >= viewportBounds.minX && dxfX <= viewportBounds.maxX,
        yInBounds: dxfY >= viewportBounds.minY && dxfY <= viewportBounds.maxY,
        bothInBounds: (dxfX >= viewportBounds.minX && dxfX <= viewportBounds.maxX) &&
          (dxfY >= viewportBounds.minY && dxfY <= viewportBounds.maxY)
      },
      distanceFromCenter: {
        x: (dxfX - floorPlanBounds.centerX).toFixed(2),
        y: (dxfY - floorPlanBounds.centerY).toFixed(2)
      }
    };

    // Log debug info (throttled to avoid console spam - once per second)
    // Enable this temporarily to debug coordinate conversion issues
    if (typeof window !== 'undefined' && debugMode) {
      const now = Date.now();
      const lastLogTime = (window as any).__minimapDebugLastLog || 0;
      if (now - lastLogTime > 1000) { // Log once per second
        console.group('🔍 Minimap Camera Position Debug');
        console.log('📹 Camera 3D Position:', debugInfo.camera3D);
        console.log('📐 Scale Factor:', debugInfo.scaleFactor);
        console.log('🎯 Floor Plan Center:', debugInfo.floorPlanCenter);
        console.log('📍 DXF Coordinates:', debugInfo.dxfCoords);
        console.log('📦 Floor Plan Bounds:', debugInfo.floorPlanBounds);
        console.log('👁️ Viewport Bounds:', debugInfo.viewportBounds);
        console.log('✅ In Floor Plan Bounds?', debugInfo.inFloorPlanBounds);
        console.log('✅ In Viewport Bounds?', debugInfo.inViewportBounds);
        console.log('📏 Distance from Center:', debugInfo.distanceFromCenter);
        console.log('🔄 Conversion Formula:', {
          dxfX: `${debugInfo.camera3D.x} * ${debugInfo.scaleFactor} + ${debugInfo.floorPlanCenter.centerX} = ${debugInfo.dxfCoords.dxfX}`,
          dxfY: `${debugInfo.floorPlanCenter.centerY} - ${debugInfo.camera3D.z} * ${debugInfo.scaleFactor} = ${debugInfo.dxfCoords.dxfY}`
        });

        if (!debugInfo.inFloorPlanBounds.bothInBounds) {
          console.warn('⚠️ Camera DXF coordinates are OUTSIDE floor plan bounds!');
          console.warn('   X out of bounds:', !debugInfo.inFloorPlanBounds.xInBounds,
            `(DXF X: ${debugInfo.dxfCoords.dxfX}, Range: ${debugInfo.floorPlanBounds.minX} to ${debugInfo.floorPlanBounds.maxX})`);
          console.warn('   Y out of bounds:', !debugInfo.inFloorPlanBounds.yInBounds,
            `(DXF Y: ${debugInfo.dxfCoords.dxfY}, Range: ${debugInfo.floorPlanBounds.minY} to ${debugInfo.floorPlanBounds.maxY})`);
        }

        if (!debugInfo.inViewportBounds.bothInBounds) {
          console.warn('⚠️ Camera DXF coordinates are OUTSIDE viewport bounds!');
          console.warn('   X out of bounds:', !debugInfo.inViewportBounds.xInBounds,
            `(DXF X: ${debugInfo.dxfCoords.dxfX}, Range: ${debugInfo.viewportBounds.minX} to ${debugInfo.viewportBounds.maxX})`);
          console.warn('   Y out of bounds:', !debugInfo.inViewportBounds.yInBounds,
            `(DXF Y: ${debugInfo.dxfCoords.dxfY}, Range: ${debugInfo.viewportBounds.minY} to ${debugInfo.viewportBounds.maxY})`);
        }

        console.groupEnd();
        (window as any).__minimapDebugLastLog = now;
      }
    }

    // Calculate normalized coordinates within viewport bounds
    // Note: We use DXF coordinates directly for drawing, but normalized coords are kept for compatibility
    const normalizedX = (dxfX - viewportBounds.minX) / viewportBounds.width;
    const normalizedY = (dxfY - viewportBounds.minY) / viewportBounds.height;

    // Debug: Log coordinate conversion details (throttled)
    if (typeof window !== 'undefined') {
      const now = Date.now();
      const lastDebugLog = (window as any).__minimapDebugLog || 0;
      if (now - lastDebugLog > 2000) { // Log every 2 seconds
        const prev3D = (window as any).__minimapPrev3D || { x: 0, z: 0 };
        const prevDXF = (window as any).__minimapPrevDXF || { x: 0, y: 0 };

        const delta3DX = cameraPosition.x - prev3D.x;
        const delta3DZ = cameraPosition.z - prev3D.z;
        const deltaDXFX = dxfX - prevDXF.x;
        const deltaDXFY = dxfY - prevDXF.y;

        console.log('🔍 Minimap Coordinate Debug:', {
          '3D Position': { x: cameraPosition.x.toFixed(3), z: cameraPosition.z.toFixed(3) },
          '3D Delta': { x: delta3DX.toFixed(3), z: delta3DZ.toFixed(3) },
          'DXF Coords': { x: dxfX, y: dxfY },
          'DXF Delta': { x: deltaDXFX, y: deltaDXFY },
          'Scale Factor': effectiveScaleFactor.toFixed(4),
          'Center Offset': { x: centerOffsetX, y: centerOffsetY },
          'Formula X': `${cameraPosition.x.toFixed(3)} * ${effectiveScaleFactor.toFixed(4)} + ${centerOffsetX} = ${dxfX}`,
          'Formula Y': `${centerOffsetY} - ${cameraPosition.z.toFixed(3)} * ${effectiveScaleFactor.toFixed(4)} = ${dxfY}`,
          'Viewport': {
            minX: viewportBounds.minX.toFixed(0),
            maxX: viewportBounds.maxX.toFixed(0),
            minY: viewportBounds.minY.toFixed(0),
            maxY: viewportBounds.maxY.toFixed(0),
            width: viewportBounds.width.toFixed(0),
            height: viewportBounds.height.toFixed(0)
          },
          'Normalized': { x: normalizedX.toFixed(3), y: normalizedY.toFixed(3) }
        });

        (window as any).__minimapPrev3D = { x: cameraPosition.x, z: cameraPosition.z };
        (window as any).__minimapPrevDXF = { x: dxfX, y: dxfY };
        (window as any).__minimapDebugLog = now;
      }
    }

    // Calculate rotation angle from camera rotationY (yaw)
    // The camera uses Euler angles with 'YXZ' order:
    // - rotationY is the yaw (horizontal rotation around Y-axis)
    // - rotationY = 0 means looking along +Z axis in 3D space
    // 
    // Coordinate system mapping:
    // - 3D: X=right, Y=up, Z=forward (right-handed)
    // - DXF to 3D: x_3d = (dxf_x - centerX) / scaleFactor, z_3d = -(dxf_y - centerY) / scaleFactor
    // - So DXF Y maps to -Z in 3D
    // - Canvas 2D: 0 = pointing right, π/2 = pointing down, -π/2 = pointing up
    //
    // When camera looks forward (+Z in 3D):
    // - rotationY = 0
    // - +Z in 3D maps to -Y in DXF (because z = -y/scaleFactor)
    // - -Y in DXF should point "up" in minimap
    // - "up" in canvas = -π/2 radians
    // - So: rotationAngle = rotationY - π/2 when rotationY=0 gives -π/2 ✓
    //
    // However, we need to account for the direction of rotation:
    // - In Three.js, positive rotationY rotates counterclockwise when viewed from above
    // - In canvas, positive rotation rotates clockwise
    // - So we need to negate: rotationAngle = -(rotationY - π/2) = -rotationY + π/2
    // But the pointer is currently pointing backward, so we need to flip it 180 degrees
    // Add π to point forward instead of backward
    let rotationAngle = -cameraPosition.rotationY + Math.PI / 2 + Math.PI;

    return {
      dxfX,
      dxfY,
      normalizedX,
      normalizedY,
      rotation: rotationAngle
    };
  }, [cameraPosition, viewportBounds, floorPlanBounds, scaleFactor]);

  // Update radius when map size changes
  useEffect(() => {
    // This will trigger a redraw
  }, [mapSize]);

  // Detect camera movement and reset pan when camera moves (if not currently dragging)
  useEffect(() => {
    if (!cameraPosition || isDragging) return;

    const currentPos = { x: cameraPosition.x, z: cameraPosition.z };
    const lastPos = lastCameraPositionRef.current;

    // Check if camera has moved significantly
    if (lastPos) {
      const dx = currentPos.x - lastPos.x;
      const dz = currentPos.z - lastPos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      // If camera moved more than a small threshold, reset pan to follow camera
      if (distance > 0.1) {
        setPanOffsetX(0);
        setPanOffsetY(0);
      }
    }

    // Update last position
    lastCameraPositionRef.current = currentPos;
  }, [cameraPosition, isDragging]);

  // Helper function to convert DXF coordinates to minimap coordinates
  // Fit rectangular viewport into circular minimap while maintaining aspect ratio
  // IMPORTANT: Canvas Y-axis increases downward, DXF Y-axis increases upward
  // CRITICAL: The scaling must match exactly with how 2D view displays coordinates
  const createDxfToMapConverter = (
    bounds: typeof viewportBounds,
    cx: number,
    cy: number,
    r: number
  ) => {
    if (!bounds) return null;

    // Calculate aspect ratio of viewport
    const viewportAspect = bounds.width / bounds.height;

    // Fit the rectangular viewport into the circular minimap
    // Use the smaller scale to ensure everything fits within the circle
    let scaleX: number;
    let scaleY: number;
    let offsetX = 0;
    let offsetY = 0;

    if (viewportAspect > 1) {
      // Viewport is wider than tall - fit to width
      // Scale to fit width into circle diameter
      scaleX = (r * 2) / bounds.width;
      scaleY = scaleX; // Maintain aspect ratio - CRITICAL for correct positioning
      // Center vertically (there will be empty space at top/bottom)
      const scaledHeight = bounds.height * scaleY;
      offsetY = (r * 2 - scaledHeight) / 2;
    } else {
      // Viewport is taller than wide - fit to height
      // Scale to fit height into circle diameter
      scaleY = (r * 2) / bounds.height;
      scaleX = scaleY; // Maintain aspect ratio - CRITICAL for correct positioning
      // Center horizontally (there will be empty space at left/right)
      const scaledWidth = bounds.width * scaleX;
      offsetX = (r * 2 - scaledWidth) / 2;
    }

    return (dxfX: number, dxfY: number) => {
      // Normalize to viewport bounds (0 to 1)
      // This gives us the position within the viewport as a fraction
      const normalizedX = (dxfX - bounds.minX) / bounds.width;
      const normalizedY = (dxfY - bounds.minY) / bounds.height;

      // Map to minimap coordinates with aspect ratio maintained
      // CRITICAL: Use the same scale for both X and Y to maintain aspect ratio
      // Start from top-left of the circle's bounding square (cx - r, cy - r)
      // Then add offset and scaled position
      // The scaled position = normalized position * viewport dimension * scale
      const mapX = cx - r + offsetX + normalizedX * bounds.width * scaleX;

      // Flip Y-axis: In DXF, Y increases upward, in Canvas Y increases downward
      // So we need to invert: mapY = top + (1 - normalizedY) * scaledHeight
      // scaledHeight = bounds.height * scaleY
      const mapY = cy - r + offsetY + (1 - normalizedY) * bounds.height * scaleY;

      return { x: mapX, y: mapY };
    };
  };

  // Draw the minimap with smooth updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewportBounds || !floorPlanBounds) return;

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d', {
        willReadFrequently: false,
        alpha: true
      });
    } catch (error) {
      console.error('Failed to get canvas context:', error);
      return;
    }

    if (!ctx) {
      console.warn('Canvas context is null');
      return;
    }

    // Update canvas size
    canvas.width = mapSize;
    canvas.height = mapSize;
    const currentCenterX = mapSize / 2;
    const currentCenterY = mapSize / 2;
    const currentRadius = mapSize / 2 - 10;

    // Create coordinate converter with aspect ratio support
    const dxfToMap = createDxfToMapConverter(viewportBounds, currentCenterX, currentCenterY, currentRadius);
    if (!dxfToMap) return;

    const draw = () => {
      // Validate context is still valid
      if (!ctx) return;

      try {
        // Clear canvas
        ctx.clearRect(0, 0, mapSize, mapSize);

        // Create coordinate converter with aspect ratio support (recreate each frame in case bounds changed)
        const dxfToMapConverter = createDxfToMapConverter(viewportBounds, currentCenterX, currentCenterY, currentRadius);
        if (!dxfToMapConverter) return;

        // Create circular clipping path
        ctx.save();
        ctx.beginPath();
        ctx.arc(currentCenterX, currentCenterY, currentRadius, 0, Math.PI * 2);
        ctx.clip();

        // Draw background pattern (similar to the image - triangular pattern)
        drawPatternBackground(ctx, currentCenterX, currentCenterY, currentRadius);

        // Draw floor plan DXF layout
        drawFloorPlanDXF(ctx, viewportBounds, currentCenterX, currentCenterY, currentRadius, zoomLevel, dxfToMapConverter);

        // Draw chairs, tables, and stages
        // Temporarily disabled
        // drawChairsTablesAndStages(ctx, viewportBounds, currentCenterX, currentCenterY, currentRadius, zoomLevel, dxfToMapConverter);

        // Draw event objects
        // Temporarily disabled
        // if (selectedEvent) {
        //   drawEventObjects(ctx, viewportBounds, currentCenterX, currentCenterY, currentRadius, zoomLevel, dxfToMapConverter);
        // }

        // Draw camera position and direction
        if (cameraMapPosition && dxfToMapConverter) {
          // Convert DXF coordinates directly to minimap coordinates using the converter
          const mapped = dxfToMapConverter(cameraMapPosition.dxfX, cameraMapPosition.dxfY);

          // Adjust x position to move pointer slightly left (arrow head extends right, so offset left)
          // For zoomed-out (<= 1x), keep the base offset which already looks correct.
          // For zoomed-in (> 1x), add extra offset so the head doesn't appear too far right.
          const baseOffset = mapSize * 0.02; // Works well for normal / zoom-out view
          const zoomExtraOffset = zoomLevel > 1 ? mapSize * 0.01 * (zoomLevel - 1) : 0;
          const leftOffset = baseOffset + zoomExtraOffset;
          const adjustedX = mapped.x - leftOffset;

          // Draw pointer at adjusted position (moved left to account for arrow head)
          drawCameraPointer(ctx, adjustedX, mapped.y, cameraMapPosition.rotation, currentCenterX, currentCenterY, currentRadius);

          // Draw debug overlay if enabled
          if (debugMode && viewportBounds) {
            drawDebugOverlay(ctx, currentCenterX, currentCenterY, currentRadius, cameraMapPosition, viewportBounds, floorPlanBounds, dxfToMapConverter);
          }
        }

        ctx.restore();

        // Draw circular border
        drawBorder(ctx, currentCenterX, currentCenterY, currentRadius);
      } catch (error) {
        console.error('Error drawing minimap:', error);
        // Try to recover context
        try {
          ctx = canvas.getContext('2d', {
            willReadFrequently: false,
            alpha: true
          });
        } catch (recoveryError) {
          console.error('Failed to recover canvas context:', recoveryError);
        }
      }
    };

    // Initial draw
    draw();

    // Set up animation loop for smooth updates - throttle to prevent context loss
    let lastFrameTime = 0;
    const targetFPS = 30; // Limit to 30 FPS to reduce load
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      if (currentTime - lastFrameTime >= frameInterval) {
        draw();
        lastFrameTime = currentTime;
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      ctx = null; // Clear context reference
    };
  }, [viewportBounds, floorPlanBounds, cameraMapPosition, mapSize, zoomLevel, dxfEntities, debugMode, objects, selectedEvent, objectDxfCache]);

  // Draw simple background (no pattern, just solid color)
  const drawPatternBackground = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    // Simple solid background - dark grey
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Load DXF entities for objects (tables/chairs) that have DXF files
  useEffect(() => {
    const loadObjectDxfFiles = async () => {
      const newCache = new Map<string, SimpleDxfEntity[]>();
      const uniqueFiles = new Set<string>();

      // Collect unique DXF files from tables and chairs
      objects.forEach(obj => {
        if ((obj.type === 'table' || obj.type === 'chair') && obj.fileName) {
          uniqueFiles.add(obj.fileName);
        }
      });

      // Load each unique file
      for (const fileName of uniqueFiles) {
        try {
          const entities = await extractSimpleEntities(`/${fileName}`, { ignorePosition: true });
          newCache.set(fileName, entities);
        } catch (error) {
          console.warn(`Failed to load DXF for ${fileName}:`, error);
          newCache.set(fileName, []); // Cache empty to prevent retries
        }
      }

      setObjectDxfCache(newCache);
    };

    if (objects.length > 0) {
      loadObjectDxfFiles();
    }
  }, [objects.map(obj => obj.fileName).join(',')]); // Only reload when file names change

  // Draw chairs, tables, and stages
  const drawChairsTablesAndStages = (
    ctx: CanvasRenderingContext2D,
    bounds: typeof viewportBounds,
    cx: number,
    cy: number,
    r: number,
    zoom: number,
    dxfToMap: ((dxfX: number, dxfY: number) => { x: number; y: number }) | null
  ) => {
    if (!bounds || !floorPlanBounds || !dxfToMap) {
      return;
    }

    // Check if point is within circular bounds
    const isInBounds = (x: number, y: number) => {
      const dx = x - cx;
      const dy = y - cy;
      return Math.sqrt(dx * dx + dy * dy) <= r + 10;
    };

    // Helper to draw DXF entities
    const drawDxfEntities = (
      entities: SimpleDxfEntity[],
      centerX: number,
      centerY: number,
      scaleX: number,
      scaleY: number,
      rotation: number,
      color: string
    ) => {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      ctx.scale(scaleX, scaleY);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(0.5, 1 / zoom);

      entities.forEach(entity => {
        if (!entity.vertices || entity.vertices.length === 0) return;

        ctx.beginPath();
        if (entity.type === 'LINE' && entity.vertices.length >= 2) {
          const start = entity.vertices[0];
          const end = entity.vertices[1];
          ctx.moveTo(start.x, -start.y); // Flip Y for canvas
          ctx.lineTo(end.x, -end.y);
          ctx.stroke();
        } else if (entity.vertices.length >= 2) {
          const first = entity.vertices[0];
          ctx.moveTo(first.x, -first.y);
          for (let i = 1; i < entity.vertices.length; i++) {
            const v = entity.vertices[i];
            ctx.lineTo(v.x, -v.y);
          }
          if (entity.type === 'CIRCLE' || entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
            ctx.closePath();
          }
          ctx.stroke();
        }
      });

      ctx.restore();
    };

    // Filter chairs, tables, and stages - get ALL objects exactly as 2D view does
    // The 2D view renders ALL objects with type === 'chair' or type === 'table'
    const chairs = objects.filter(obj => obj.type === 'chair');
    const tables = objects.filter(obj => obj.type === 'table');
    const stages = objects.filter(obj => obj.type === 'stage');

    // Debug: Log chair count to verify all chairs are included
    if (chairs.length > 0 && typeof window !== 'undefined') {
      const chairCount = chairs.length;
      const singleChairs = chairs.filter(c => !c.parentTableId).length;
      const tableChairs = chairs.filter(c => c.parentTableId).length;
      // Log once per render cycle
      const lastLog = (window as any).__minimapChairLog || 0;
      if (Date.now() - lastLog > 2000) {
        console.log(`[Minimap] Rendering ${chairCount} chairs (${singleChairs} single, ${tableChairs} table chairs)`);
        (window as any).__minimapChairLog = Date.now();
      }
    }

    // Draw stages (red rectangles) - draw first so they appear behind tables/chairs
    ctx.fillStyle = '#ff0000'; // Red color for stages
    ctx.strokeStyle = '#cc0000';
    ctx.lineWidth = Math.max(1.5, 2 / zoom);

    stages.forEach(stage => {
      const mapped = dxfToMap(stage.x, stage.y);

      if (!isInBounds(mapped.x, mapped.y)) return;

      const width = (stage.width / bounds.width) * r * 2;
      const height = (stage.height / bounds.height) * r * 2;
      const rotation = (stage.rotation ?? 0) * (Math.PI / 180);

      ctx.save();
      ctx.translate(mapped.x, mapped.y);
      ctx.rotate(rotation);
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    });

    // Draw tables - use DXF if available, otherwise fallback to rectangle
    // Use exact same coordinates as 2D view (object.x, object.y)
    tables.forEach(table => {
      // 2D view uses object.x and object.y directly for positioning
      const useX = table.x; // Use original x, not updateX
      const useY = table.y; // Use original y, not updateY
      const mapped = dxfToMap(useX, useY);

      if (!isInBounds(mapped.x, mapped.y)) return;

      const width = (table.width / bounds.width) * r * 2;
      const height = (table.height / bounds.height) * r * 2;
      const rotation = (table.rotation ?? 0) * (Math.PI / 180);

      // Try to use DXF entities if available
      if (table.fileName && objectDxfCache.has(table.fileName)) {
        const entities = objectDxfCache.get(table.fileName) || [];
        if (entities.length > 0) {
          // Calculate scale to fit the object size
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          entities.forEach(e => {
            e.vertices?.forEach(v => {
              minX = Math.min(minX, v.x);
              maxX = Math.max(maxX, v.x);
              minY = Math.min(minY, v.y);
              maxY = Math.max(maxY, v.y);
            });
          });
          const dxfWidth = maxX - minX || table.width;
          const dxfHeight = maxY - minY || table.height;
          const scaleX = width / dxfWidth;
          const scaleY = height / dxfHeight;

          drawDxfEntities(entities, mapped.x, mapped.y, scaleX, scaleY, rotation, '#8B4513');
          return;
        }
      }

      // Fallback to rectangle
      ctx.fillStyle = '#8B4513';
      ctx.strokeStyle = '#654321';
      ctx.lineWidth = Math.max(1, 1.5 / zoom);
      ctx.save();
      ctx.translate(mapped.x, mapped.y);
      ctx.rotate(rotation);
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    });

    // Draw chairs - use DXF if available, otherwise fallback to rectangle
    // Include ALL chairs (both table chairs and single chairs) - exactly as 2D view does
    // 2D view renders ALL objects with type === 'chair' using object.x and object.y
    chairs.forEach(chair => {
      // Use exact same coordinates as 2D view (object.x, object.y) - not updateX/updateY
      const useX = chair.x; // 2D view uses object.x directly
      const useY = chair.y; // 2D view uses object.y directly
      const mapped = dxfToMap(useX, useY);

      if (!isInBounds(mapped.x, mapped.y)) return;

      // Calculate size based on actual chair dimensions - ensure visibility
      // Match 2D view exactly - use object.width and object.height
      const width = (chair.width / bounds.width) * r * 2;
      const height = (chair.height / bounds.height) * r * 2;
      const rotation = (chair.rotation ?? 0) * (Math.PI / 180);

      // Try to use DXF entities if available (same as 2D view uses DXFTableRenderer)
      if (chair.fileName && objectDxfCache.has(chair.fileName)) {
        const entities = objectDxfCache.get(chair.fileName) || [];
        if (entities.length > 0) {
          // Calculate scale to fit the object size (matching DXFTableRenderer scale)
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          entities.forEach(e => {
            e.vertices?.forEach(v => {
              minX = Math.min(minX, v.x);
              maxX = Math.max(maxX, v.x);
              minY = Math.min(minY, v.y);
              maxY = Math.max(maxY, v.y);
            });
          });
          const dxfWidth = maxX - minX || chair.width;
          const dxfHeight = maxY - minY || chair.height;
          // Scale to match object.width and object.height (same as DXFTableRenderer)
          const scaleX = width / dxfWidth;
          const scaleY = height / dxfHeight;

          // Use chair color from 2D view: '#654321' for chairs
          drawDxfEntities(entities, mapped.x, mapped.y, scaleX, scaleY, rotation, '#654321');
          return;
        }
      }

      // Fallback to rectangle - match 2D view exactly
      // 2D view fallback uses: color='#654321' for chairs (from DXFTableRenderer)
      ctx.fillStyle = '#654321'; // Exact match to 2D view fallback color
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = Math.max(0.5, 1 / zoom);
      ctx.save();
      ctx.translate(mapped.x, mapped.y);
      ctx.rotate(rotation);
      // Use width and height separately to match 2D view aspect ratio
      // Ensure minimum visibility size (at least 1.5px for single chairs)
      const drawWidth = Math.max(1.5, width);
      const drawHeight = Math.max(1.5, height);
      ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.strokeRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      ctx.restore();
    });
  };

  // Draw event objects
  const drawEventObjects = (
    ctx: CanvasRenderingContext2D,
    bounds: typeof viewportBounds,
    cx: number,
    cy: number,
    r: number,
    zoom: number,
    dxfToMap: ((dxfX: number, dxfY: number) => { x: number; y: number }) | null
  ) => {
    if (!bounds || !floorPlanBounds || !selectedEvent || !dxfToMap) {
      return;
    }

    // Check if point is within circular bounds
    const isInBounds = (x: number, y: number) => {
      const dx = x - cx;
      const dy = y - cy;
      return Math.sqrt(dx * dx + dy * dy) <= r + 10;
    };

    selectedEvent.objects.forEach(eventObject => {
      if (eventObject.showIn2D === false) {
        return;
      }

      const positionOrigin = eventObject.positionOrigin ?? 'top-left';
      const useTopLeftOrigin = positionOrigin === 'top-left';
      const offsetX = useTopLeftOrigin ? (eventObject.width || 0) / 2 : 0;
      const offsetY = useTopLeftOrigin ? -(eventObject.height || 0) / 2 : 0;

      const dxfX = eventObject.x + offsetX;
      const dxfY = eventObject.y + offsetY;
      const mapped = dxfToMap(dxfX, dxfY);

      if (!isInBounds(mapped.x, mapped.y)) return;

      const width = eventObject.width || 200;
      const height = eventObject.height || 80;
      const mapWidth = (width / bounds.width) * r * 2;
      const mapHeight = (height / bounds.height) * r * 2;
      const rotation = (eventObject.rotation ?? 0) * (Math.PI / 180);

      // Determine render mode
      const renderMode = eventObject.twoDRenderMode ?? (eventObject.fileName ? 'dxf' : eventObject.glbFileName ? 'plane' : 'none');

      if (renderMode === 'plane' || renderMode === 'none') {
        // Draw as rectangle (plane mode)
        const fillColor = eventObject.twoDColor ?? '#ffffff';
        const outlineColor = eventObject.twoDOutlineColor ?? '#000000';
        const opacity = eventObject.twoDOpacity ?? 0.85;

        ctx.save();
        ctx.translate(mapped.x, mapped.y);
        ctx.rotate(rotation);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = Math.max(1, 1.5 / zoom);
        ctx.fillRect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight);
        ctx.strokeRect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight);
        ctx.globalAlpha = 1;
        ctx.restore();
      } else if (renderMode === 'dxf' && eventObject.fileName) {
        // Draw as simple rectangle for DXF objects (can be enhanced to load DXF if needed)
        ctx.save();
        ctx.translate(mapped.x, mapped.y);
        ctx.rotate(rotation);
        ctx.fillStyle = eventObject.color || '#FFD700'; // Gold color for event objects
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(1, 1.5 / zoom);
        ctx.fillRect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight);
        ctx.strokeRect(-mapWidth / 2, -mapHeight / 2, mapWidth, mapHeight);
        ctx.restore();
      }
    });
  };

  // Draw floor plan DXF entities
  const drawFloorPlanDXF = (
    ctx: CanvasRenderingContext2D,
    bounds: typeof viewportBounds,
    cx: number,
    cy: number,
    r: number,
    zoom: number,
    dxfToMap: ((dxfX: number, dxfY: number) => { x: number; y: number }) | null
  ) => {
    if (!bounds || !floorPlanBounds || !dxfToMap) {
      return;
    }

    // Fallback to simple rectangle if no DXF loaded
    if (dxfEntities.length === 0) {
      const minMapped = dxfToMap(floorPlanBounds.minX, floorPlanBounds.minY);
      const maxMapped = dxfToMap(floorPlanBounds.maxX, floorPlanBounds.maxY);

      ctx.strokeStyle = '#9ca3af'; // Lighter grey for better visibility
      ctx.lineWidth = 2;
      ctx.strokeRect(minMapped.x, minMapped.y, maxMapped.x - minMapped.x, maxMapped.y - minMapped.y);
      return;
    }

    // Check if point is within circular bounds (with padding)
    const isInBounds = (x: number, y: number) => {
      const dx = x - cx;
      const dy = y - cy;
      return Math.sqrt(dx * dx + dy * dy) <= r + 10; // Padding for entities near edge
    };

    // Use brighter, more visible colors for floor plan
    ctx.strokeStyle = '#9ca3af'; // Lighter grey for better visibility
    ctx.lineWidth = Math.max(1.5, 2 / zoom); // Thicker lines for better visibility
    ctx.fillStyle = '#6b7280'; // Medium grey for fills

    // Render each DXF entity
    dxfEntities.forEach((entity) => {
      if (!entity.vertices || entity.vertices.length === 0) return;

      // Skip if entity is completely outside bounds (optimization)
      let hasPointInBounds = false;
      for (const v of entity.vertices) {
        const mapped = dxfToMap(v.x, v.y);
        if (isInBounds(mapped.x, mapped.y)) {
          hasPointInBounds = true;
          break;
        }
      }
      if (!hasPointInBounds) return;

      ctx.beginPath();

      // All entity types are converted to vertices by the extractor
      // Handle LINE, POLYLINE, LWPOLYLINE, CIRCLE (as polygon), ARC (as polyline), SPLINE
      if (entity.type === 'LINE' && entity.vertices.length >= 2) {
        const start = dxfToMap(entity.vertices[0].x, entity.vertices[0].y);
        const end = dxfToMap(entity.vertices[1].x, entity.vertices[1].y);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else if (entity.vertices.length >= 2) {
        // POLYLINE, LWPOLYLINE, CIRCLE (converted to polygon), ARC (converted to polyline), SPLINE
        const first = dxfToMap(entity.vertices[0].x, entity.vertices[0].y);
        ctx.moveTo(first.x, first.y);

        for (let i = 1; i < entity.vertices.length; i++) {
          const point = dxfToMap(entity.vertices[i].x, entity.vertices[i].y);
          ctx.lineTo(point.x, point.y);
        }

        // For closed shapes (circles, closed polylines), close the path
        if (entity.type === 'CIRCLE' || entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') {
          // Check if first and last vertices are close (closed shape)
          const firstVertex = entity.vertices[0];
          const lastVertex = entity.vertices[entity.vertices.length - 1];
          const dist = Math.sqrt(
            Math.pow(firstVertex.x - lastVertex.x, 2) +
            Math.pow(firstVertex.y - lastVertex.y, 2)
          );
          if (dist < 1) { // Very close, consider it closed
            ctx.closePath();
          }
        }

        ctx.stroke();
      }
    });
  };

  // Draw camera pointer (cyan arrow - matching the image style)
  const drawCameraPointer = (ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number, cx: number, cy: number, r: number) => {
    // Check if pointer center is within the circular bounds (with padding for arrow)
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const arrowPadding = 30; // Extra padding to allow arrow to be visible near edge
    if (dist > r + arrowPadding) return; // Don't draw if too far outside bounds

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Scale arrow size based on map size - make it more prominent
    const arrowScale = mapSize / 400; // Base scale on 400px
    const arrowLength = 20 * arrowScale; // Larger arrow
    const arrowWidth = 12 * arrowScale;

    // Bright cyan with glow effect
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#00ffff'; // Bright cyan/turquoise
    ctx.strokeStyle = '#00d4ff'; // Slightly brighter for outline
    ctx.lineWidth = Math.max(2, 2 * arrowScale);

    // Draw arrow shape - more prominent
    ctx.beginPath();
    // Arrow point (triangle) - larger and more visible
    ctx.moveTo(arrowLength, 0);
    ctx.lineTo(arrowLength - arrowWidth / 2, -arrowWidth / 2);
    ctx.lineTo(arrowLength - arrowWidth / 2, arrowWidth / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Arrow body (rectangle) - more prominent
    ctx.fillRect(arrowLength - arrowWidth, -arrowWidth / 3, arrowWidth / 2, (arrowWidth * 2) / 3);
    ctx.strokeRect(arrowLength - arrowWidth, -arrowWidth / 3, arrowWidth / 2, (arrowWidth * 2) / 3);

    // Draw center dot for position
    ctx.beginPath();
    ctx.arc(0, 0, 3 * arrowScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  };

  // Draw circular border (cleaner, more visible)
  const drawBorder = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
    // Outer dark border (thick)
    ctx.strokeStyle = '#0f0f1a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Main border - bright and visible
    ctx.strokeStyle = '#4a5568'; // Medium grey, more visible
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner accent border
    ctx.strokeStyle = '#6b7280'; // Lighter grey
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.stroke();
  };

  // Draw debug overlay showing bounds and coordinates
  const drawDebugOverlay = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    cameraPos: { dxfX: number; dxfY: number; normalizedX: number; normalizedY: number },
    vpBounds: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number },
    floorPlanBounds: FloorPlanBounds,
    dxfToMap: ((dxfX: number, dxfY: number) => { x: number; y: number }) | null
  ) => {
    if (!dxfToMap) return;

    ctx.save();

    // Draw floor plan bounds rectangle (green)
    const floorMin = dxfToMap(floorPlanBounds.minX, floorPlanBounds.minY);
    const floorMax = dxfToMap(floorPlanBounds.maxX, floorPlanBounds.maxY);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(
      floorMin.x,
      floorMin.y,
      floorMax.x - floorMin.x,
      floorMax.y - floorMin.y
    );

    // Draw viewport bounds rectangle (yellow)
    const viewMin = dxfToMap(vpBounds.minX, vpBounds.minY);
    const viewMax = dxfToMap(vpBounds.maxX, vpBounds.maxY);
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(
      viewMin.x,
      viewMin.y,
      viewMax.x - viewMin.x,
      viewMax.y - viewMin.y
    );

    // Draw center point (red)
    const center = dxfToMap(floorPlanBounds.centerX, floorPlanBounds.centerY);
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw camera DXF position (cyan)
    const cameraDxf = dxfToMap(cameraPos.dxfX, cameraPos.dxfY);
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(cameraDxf.x, cameraDxf.y, 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw debug text
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const debugText = [
      `DXF: (${cameraPos.dxfX.toFixed(0)}, ${cameraPos.dxfY.toFixed(0)})`,
      `Norm: (${cameraPos.normalizedX.toFixed(3)}, ${cameraPos.normalizedY.toFixed(3)})`,
      `Floor: [${floorPlanBounds.minX.toFixed(0)}, ${floorPlanBounds.maxX.toFixed(0)}] x [${floorPlanBounds.minY.toFixed(0)}, ${floorPlanBounds.maxY.toFixed(0)}]`,
      `View: [${vpBounds.minX.toFixed(0)}, ${vpBounds.maxX.toFixed(0)}] x [${vpBounds.minY.toFixed(0)}, ${vpBounds.maxY.toFixed(0)}]`,
      `In Floor: ${(cameraPos.dxfX >= floorPlanBounds.minX && cameraPos.dxfX <= floorPlanBounds.maxX && cameraPos.dxfY >= floorPlanBounds.minY && cameraPos.dxfY <= floorPlanBounds.maxY) ? 'YES' : 'NO'}`,
      `In View: ${(cameraPos.dxfX >= vpBounds.minX && cameraPos.dxfX <= vpBounds.maxX && cameraPos.dxfY >= vpBounds.minY && cameraPos.dxfY <= vpBounds.maxY) ? 'YES' : 'NO'}`
    ];

    // Draw text with background
    debugText.forEach((text, i) => {
      const y = 10 + i * 14;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, y - 2, text.length * 6 + 4, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, 12, y);
    });

    ctx.restore();
  };

  if (!floorPlanBounds) return null;

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.5, 4)); // Max 4x zoom
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.5, 0.5)); // Min 0.5x zoom
  };

  const handleToggleExpand = () => {
    setIsExpanded(prev => !prev);
  };

  const handleToggleDebug = () => {
    setDebugMode(prev => !prev);
  };

  // Handle drag start
  const handleDragStart = (clientX: number, clientY: number) => {
    if (!viewportBounds) return;

    setIsDragging(true);
    setDragStart({
      x: clientX,
      y: clientY,
      panX: panOffsetX,
      panY: panOffsetY
    });
  };

  // Handle drag move - convert screen pixel movement to DXF coordinate movement
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!isDragging || !dragStart || !viewportBounds || !floorPlanBounds) return;

    const minimapElement = canvasRef.current?.parentElement;
    if (!minimapElement) return;

    // Calculate pixel delta
    const deltaX = clientX - dragStart.x;
    const deltaY = clientY - dragStart.y;

    // Convert pixel delta to DXF coordinate delta
    // The minimap shows viewportBounds.width x viewportBounds.height in DXF units
    // within a circle of diameter (mapSize - 20)
    const rect = minimapElement.getBoundingClientRect();
    const radius = rect.width / 2 - 10;
    const diameter = radius * 2;

    // Calculate scale factor: how many DXF units per pixel
    const viewportAspect = viewportBounds.width / viewportBounds.height;
    let dxfPerPixelX: number;
    let dxfPerPixelY: number;

    if (viewportAspect > 1) {
      // Viewport is wider than tall - fit to width
      dxfPerPixelX = viewportBounds.width / diameter;
      dxfPerPixelY = viewportBounds.height / diameter; // Same scale to maintain aspect
    } else {
      // Viewport is taller than wide - fit to height
      dxfPerPixelX = viewportBounds.width / diameter; // Same scale to maintain aspect
      dxfPerPixelY = viewportBounds.height / diameter;
    }

    // Calculate DXF delta
    // When user drags right (deltaX > 0), they want to see more left content,
    // so viewport should move left (negative panOffsetX)
    // When user drags down (deltaY > 0), they want to see more bottom content,
    // so viewport should move up in DXF (positive panOffsetY, since DXF Y increases upward)
    const dxfDeltaX = -deltaX * dxfPerPixelX; // Negate X: drag right = move viewport left
    const dxfDeltaY = deltaY * dxfPerPixelY; // Positive Y: drag down = move viewport up in DXF (shows bottom content)

    // Update pan offset
    setPanOffsetX(dragStart.panX + dxfDeltaX);
    setPanOffsetY(dragStart.panY + dxfDeltaY);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      handleDragMove(e.clientX, e.clientY);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      handleDragEnd();
    }
  };

  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleDragStart(touch.clientX, touch.clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1) {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.touches[0];
      handleDragMove(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
      handleDragEnd();
    }
  };

  // Global mouse/touch handlers for drag continuation outside minimap
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    const handleGlobalMouseUp = () => {
      handleDragEnd();
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleDragMove(touch.clientX, touch.clientY);
      }
    };

    const handleGlobalTouchEnd = () => {
      handleDragEnd();
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    window.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDragging, dragStart, panOffsetX, panOffsetY, viewportBounds, floorPlanBounds]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        top: '80px', // Add more top space to avoid header/controls
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'flex-end', // Align to bottom
        gap: '8px',
        maxHeight: 'calc(100vh - 100px)', // Ensure it doesn't exceed viewport with padding
        overflow: 'visible',
        pointerEvents: 'none' // Allow clicks to pass through container
      }}
    >
      {/* Controls - Better UI */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          pointerEvents: 'auto',
          background: 'rgba(15, 15, 26, 0.9)',
          padding: '6px',
          borderRadius: '8px',
          border: '1px solid #4a5568',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
          flexShrink: 0 // Prevent controls from shrinking
        }}
      >
        <button
          onClick={handleZoomIn}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)'}
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #6b7280',
            color: '#fff',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease'
          }}
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)'}
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #6b7280',
            color: '#fff',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease'
          }}
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={handleToggleExpand}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)'}
          style={{
            background: 'rgba(0, 0, 0, 0.8)',
            border: '1px solid #6b7280',
            color: '#fff',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            transition: 'all 0.2s ease'
          }}
          title={isExpanded ? "Minimize" : "Expand"}
        >
          ⛶
        </button>
        {/* <button
          onClick={handleToggleDebug}
          onMouseEnter={(e) => e.currentTarget.style.background = debugMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.background = debugMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(0, 0, 0, 0.8)'}
          style={{
            background: debugMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(0, 0, 0, 0.8)',
            border: debugMode ? '1px solid #ef4444' : '1px solid #6b7280',
            color: '#fff',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            transition: 'all 0.2s ease'
          }}
          title={isExpanded ? "Minimize" : "Expand"}
        >
          {isExpanded ? '⊟' : '⊞'}
        </button>
        <button
          onClick={handleToggleDebug}
          onMouseEnter={(e) => e.currentTarget.style.background = debugMode ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)'}
          onMouseLeave={(e) => e.currentTarget.style.background = debugMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(0, 0, 0, 0.8)'}
          style={{
            background: debugMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(0, 0, 0, 0.8)',
            border: debugMode ? '1px solid #ef4444' : '1px solid #6b7280',
            color: '#fff',
            width: '36px',
            height: '36px',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'all 0.2s ease'
          }}
          title={debugMode ? "Disable Debug" : "Enable Debug"}
        >
          🐛
        </button> */}
      </div>

      {/* Minimap */}
      <div
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: `${mapSize}px`,
          height: `${mapSize}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(107, 114, 128, 0.3)',
          pointerEvents: 'auto',
          background: '#0f0f1a',
          position: 'relative',
          transition: 'width 0.3s ease, height 0.3s ease',
          border: '2px solid #4a5568',
          flexShrink: 0, // Prevent minimap from shrinking
          minWidth: `${mapSize}px`,
          minHeight: `${mapSize}px`,
          maxWidth: `${mapSize}px`,
          maxHeight: `${mapSize}px`,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
        title="Drag to pan the map"
      >
        <canvas
          ref={canvasRef}
          width={mapSize}
          height={mapSize}
          style={{
            display: 'block',
            width: '100%',
            height: '100%'
          }}
        />
        {/* Zoom level indicator - Better UI */}
        {zoomLevel !== 1 && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              background: 'rgba(15, 15, 26, 0.95)',
              color: '#00ffff',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 'bold',
              pointerEvents: 'none',
              border: '1px solid #00ffff',
              boxShadow: '0 2px 8px rgba(0, 255, 255, 0.3)'
            }}
          >
            {zoomLevel.toFixed(1)}x
          </div>
        )}
      </div>
    </div>
  );
}

