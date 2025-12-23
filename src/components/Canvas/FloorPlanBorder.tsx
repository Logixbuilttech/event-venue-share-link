'use client';

import * as THREE from 'three';
import { useMemo } from 'react';

interface FloorPlanBorderProps {
  floorPlanBounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  } | null;
  scaleFactor: number;
  wallHeight?: number;
}

/**
 * FloorPlanBorder - Creates a visual border/wall around the floor plan
 * Prevents users from moving beyond the floor plan boundaries
 */
export function FloorPlanBorder({ floorPlanBounds, scaleFactor, wallHeight = 3 }: FloorPlanBorderProps) {
  const borderGeometry = useMemo(() => {
    if (!floorPlanBounds || !scaleFactor) return null;

    // Add 30 feet padding around the floor plan (30 feet = 360 inches in DXF units)
    // Assuming DXF units are in inches: 1 foot = 12 inches
    const paddingFeet = 50;
    const paddingDXFUnits = paddingFeet * 12; // 360 inches

    // Calculate padded bounds in DXF coordinates
    const paddedMinX = floorPlanBounds.minX - paddingDXFUnits;
    const paddedMaxX = floorPlanBounds.maxX + paddingDXFUnits;
    const paddedMinY = floorPlanBounds.minY - paddingDXFUnits;
    const paddedMaxY = floorPlanBounds.maxY + paddingDXFUnits;

    // Convert padded DXF bounds to 3D coordinates
    // DXF uses: X (left-right), Y (top-bottom, flipped)
    // 3D uses: X (left-right), Z (forward-backward)
    // Conversion: x_3d = (dxf_x - centerX) / scaleFactor
    //             z_3d = -(dxf_y - centerY) / scaleFactor (Y is flipped and becomes Z)

    const minX_3D = (paddedMinX - floorPlanBounds.centerX) / scaleFactor;
    const maxX_3D = (paddedMaxX - floorPlanBounds.centerX) / scaleFactor;
    const minZ_3D = -(paddedMaxY - floorPlanBounds.centerY) / scaleFactor; // maxY becomes minZ (Y is flipped)
    const maxZ_3D = -(paddedMinY - floorPlanBounds.centerY) / scaleFactor; // minY becomes maxZ

    const width = maxX_3D - minX_3D;
    const depth = maxZ_3D - minZ_3D;

    // Create 4 walls around the perimeter
    const walls: Array<{
      position: [number, number, number];
      size: [number, number, number];
      rotation: [number, number, number];
    }> = [];

    // North wall (top, maxZ)
    walls.push({
      position: [0, wallHeight / 2, maxZ_3D] as [number, number, number],
      size: [width, wallHeight, 0.1] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number]
    });

    // South wall (bottom, minZ)
    walls.push({
      position: [0, wallHeight / 2, minZ_3D] as [number, number, number],
      size: [width, wallHeight, 0.1] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number]
    });

    // East wall (right, maxX)
    walls.push({
      position: [maxX_3D, wallHeight / 2, 0] as [number, number, number],
      size: [0.1, wallHeight, depth] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number]
    });

    // West wall (left, minX)
    walls.push({
      position: [minX_3D, wallHeight / 2, 0] as [number, number, number],
      size: [0.1, wallHeight, depth] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number]
    });

    return walls;
  }, [floorPlanBounds, scaleFactor, wallHeight]);

  if (!borderGeometry) return null;

  return (
    <group name="floor-plan-border">
      {borderGeometry.map((wall, index) => (
        <mesh
          key={`wall-${index}`}
          position={wall.position}
          rotation={wall.rotation}
          receiveShadow
          castShadow
        >
          <boxGeometry args={wall.size} />
          <meshStandardMaterial
            color="#8B7355"
            roughness={0.8}
            metalness={0.1}
            transparent
            opacity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

