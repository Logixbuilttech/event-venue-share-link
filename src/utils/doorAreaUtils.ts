import type { DoorArea } from '@config/venues';

/**
 * Convert 3D coordinates to 2D coordinates using scale factor and center offset
 * Formula: x2D = x3D * scaleFactor + centerOffset.x, y2D = z3D * scaleFactor + centerOffset.y
 */
export function convert3DTo2D(
  coord3D: { x: number; y: number; z: number },
  scaleFactor: number = 50,
  centerOffset: { x: number; y: number } = { x: 0, y: 0 }
): { x: number; y: number } {
  return {
    x: coord3D.x * scaleFactor + centerOffset.x,
    y: coord3D.z * scaleFactor + centerOffset.y
  };
}

/**
 * Calculate scale factor and center offset from door area's 2D and 3D coordinates
 * Uses default scale factor (50) and calculates center offset from all four corners for accuracy
 */
export function calculateCoordinateTransform(
  doorArea: DoorArea,
  defaultScaleFactor: number = 50
): { scaleFactor: number; centerOffset: { x: number; y: number } } | null {
  if (!doorArea.coordinates3D) {
    return null;
  }

  // Calculate center offset from all four corners and average them for accuracy
  // Formula: x2D = x3D * scaleFactor + centerOffset.x
  // So: centerOffset.x = x2D - x3D * scaleFactor
  const offsets = [
    {
      x: doorArea.topLeft.x - doorArea.coordinates3D.topLeft.x * defaultScaleFactor,
      y: doorArea.topLeft.y - doorArea.coordinates3D.topLeft.z * defaultScaleFactor
    },
    {
      x: doorArea.topRight.x - doorArea.coordinates3D.topRight.x * defaultScaleFactor,
      y: doorArea.topRight.y - doorArea.coordinates3D.topRight.z * defaultScaleFactor
    },
    {
      x: doorArea.bottomRight.x - doorArea.coordinates3D.bottomRight.x * defaultScaleFactor,
      y: doorArea.bottomRight.y - doorArea.coordinates3D.bottomRight.z * defaultScaleFactor
    },
    {
      x: doorArea.bottomLeft.x - doorArea.coordinates3D.bottomLeft.x * defaultScaleFactor,
      y: doorArea.bottomLeft.y - doorArea.coordinates3D.bottomLeft.z * defaultScaleFactor
    }
  ];

  // Average the offsets
  const centerOffset = {
    x: offsets.reduce((sum, o) => sum + o.x, 0) / offsets.length,
    y: offsets.reduce((sum, o) => sum + o.y, 0) / offsets.length
  };

  return { scaleFactor: defaultScaleFactor, centerOffset };
}

/**
 * Get effective 2D coordinates for a door area
 * If coordinates3D exists and doesn't match 2D coordinates, use converted 3D coordinates
 */
export function getEffectiveDoorArea2D(doorArea: DoorArea): DoorArea {
  if (!doorArea.coordinates3D) {
    return doorArea;
  }

  // Calculate transform from door area coordinates
  const transform = calculateCoordinateTransform(doorArea);
  if (!transform) {
    return doorArea;
  }

  // Convert 3D coordinates to 2D
  const topLeft2D = convert3DTo2D(
    doorArea.coordinates3D.topLeft,
    transform.scaleFactor,
    transform.centerOffset
  );
  const topRight2D = convert3DTo2D(
    doorArea.coordinates3D.topRight,
    transform.scaleFactor,
    transform.centerOffset
  );
  const bottomRight2D = convert3DTo2D(
    doorArea.coordinates3D.bottomRight,
    transform.scaleFactor,
    transform.centerOffset
  );
  const bottomLeft2D = convert3DTo2D(
    doorArea.coordinates3D.bottomLeft,
    transform.scaleFactor,
    transform.centerOffset
  );

  // Check if converted coordinates match original 2D coordinates (within tolerance)
  const tolerance = 10; // 10 units tolerance
  const topLeftMatches = Math.abs(topLeft2D.x - doorArea.topLeft.x) < tolerance &&
                         Math.abs(topLeft2D.y - doorArea.topLeft.y) < tolerance;
  const topRightMatches = Math.abs(topRight2D.x - doorArea.topRight.x) < tolerance &&
                          Math.abs(topRight2D.y - doorArea.topRight.y) < tolerance;
  const bottomRightMatches = Math.abs(bottomRight2D.x - doorArea.bottomRight.x) < tolerance &&
                             Math.abs(bottomRight2D.y - doorArea.bottomRight.y) < tolerance;
  const bottomLeftMatches = Math.abs(bottomLeft2D.x - doorArea.bottomLeft.x) < tolerance &&
                            Math.abs(bottomLeft2D.y - doorArea.bottomLeft.y) < tolerance;

  // If all coordinates match, use original 2D coordinates
  if (topLeftMatches && topRightMatches && bottomRightMatches && bottomLeftMatches) {
    return doorArea;
  }

  // Otherwise, use converted 3D coordinates
  return {
    ...doorArea,
    topLeft: topLeft2D,
    topRight: topRight2D,
    bottomRight: bottomRight2D,
    bottomLeft: bottomLeft2D
  };
}

/**
 * Check if a point is inside a rectangular door area (with optional clearance)
 * For 2D view: Uses original 2D coordinates directly
 */
export function isPointInDoorArea(
  point: { x: number; y: number },
  doorArea: DoorArea
): boolean {
  const clearance = doorArea.clearance || 0;

  // Get bounding box of door area with clearance (use original 2D coordinates)
  const minX = Math.min(
    doorArea.topLeft.x,
    doorArea.topRight.x,
    doorArea.bottomRight.x,
    doorArea.bottomLeft.x
  ) - clearance;

  const maxX = Math.max(
    doorArea.topLeft.x,
    doorArea.topRight.x,
    doorArea.bottomRight.x,
    doorArea.bottomLeft.x
  ) + clearance;

  const minY = Math.min(
    doorArea.topLeft.y,
    doorArea.topRight.y,
    doorArea.bottomRight.y,
    doorArea.bottomLeft.y
  ) - clearance;

  const maxY = Math.max(
    doorArea.topLeft.y,
    doorArea.topRight.y,
    doorArea.bottomRight.y,
    doorArea.bottomLeft.y
  ) + clearance;

  // Check if point is within bounding box
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

/**
 * Check if a rectangular object overlaps with any door area
 * For 2D view: Uses original 2D coordinates directly
 */
export function isObjectInDoorArea(
  object: {
    x: number; // Center X
    y: number; // Center Y
    width: number;
    height: number;
    rotation?: number;
  },
  doorArea: DoorArea
): boolean {
  const clearance = doorArea.clearance || 0;

  // Get bounding box of door area with clearance (use original 2D coordinates)
  const doorMinX = Math.min(
    doorArea.topLeft.x,
    doorArea.topRight.x,
    doorArea.bottomRight.x,
    doorArea.bottomLeft.x
  ) - clearance;

  const doorMaxX = Math.max(
    doorArea.topLeft.x,
    doorArea.topRight.x,
    doorArea.bottomRight.x,
    doorArea.bottomLeft.x
  ) + clearance;

  const doorMinY = Math.min(
    doorArea.topLeft.y,
    doorArea.topRight.y,
    doorArea.bottomRight.y,
    doorArea.bottomLeft.y
  ) - clearance;

  const doorMaxY = Math.max(
    doorArea.topLeft.y,
    doorArea.topRight.y,
    doorArea.bottomRight.y,
    doorArea.bottomLeft.y
  ) + clearance;

  // Get object bounding box (simple AABB check)
  const halfWidth = object.width / 2;
  const halfHeight = object.height / 2;

  const objMinX = object.x - halfWidth;
  const objMaxX = object.x + halfWidth;
  const objMinY = object.y - halfHeight;
  const objMaxY = object.y + halfHeight;

  // Check AABB intersection
  const overlaps = !(
    objMaxX < doorMinX || // Object is left of door
    objMinX > doorMaxX || // Object is right of door
    objMaxY < doorMinY || // Object is above door
    objMinY > doorMaxY    // Object is below door
  );

  return overlaps;
}

/**
 * Check if an object overlaps with ANY door area in the list
 */
export function isObjectInAnyDoorArea(
  object: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  },
  doorAreas: DoorArea[] = []
): boolean {
  return doorAreas.some(doorArea => isObjectInDoorArea(object, doorArea));
}

/**
 * Check if a point is in ANY door area in the list
 */
export function isPointInAnyDoorArea(
  point: { x: number; y: number },
  doorAreas: DoorArea[] = []
): boolean {
  return doorAreas.some(doorArea => isPointInDoorArea(point, doorArea));
}

/**
 * Get all door areas that overlap with a given object
 */
export function getDoorAreasOverlappingObject(
  object: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  },
  doorAreas: DoorArea[] = []
): DoorArea[] {
  return doorAreas.filter(doorArea => isObjectInDoorArea(object, doorArea));
}

/**
 * Calculate the expanded bounding box for a door area including clearance
 * For 2D view: Uses original 2D coordinates directly
 */
export function getDoorAreaBounds(doorArea: DoorArea): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const clearance = doorArea.clearance || 0;

  const minX = Math.min(
    doorArea.topLeft.x,
    doorArea.topRight.x,
    doorArea.bottomRight.x,
    doorArea.bottomLeft.x
  ) - clearance;

  const maxX = Math.max(
    doorArea.topLeft.x,
    doorArea.topRight.x,
    doorArea.bottomRight.x,
    doorArea.bottomLeft.x
  ) + clearance;

  const minY = Math.min(
    doorArea.topLeft.y,
    doorArea.topRight.y,
    doorArea.bottomRight.y,
    doorArea.bottomLeft.y
  ) - clearance;

  const maxY = Math.max(
    doorArea.topLeft.y,
    doorArea.topRight.y,
    doorArea.bottomRight.y,
    doorArea.bottomLeft.y
  ) + clearance;

  return { minX, maxX, minY, maxY };
}

/**
 * Find the nearest valid position outside all door areas
 * Useful for relocating an object that's placed in a door area
 */
export function findNearestValidPosition(
  position: { x: number; y: number },
  doorAreas: DoorArea[] = [],
  objectSize: { width: number; height: number }
): { x: number; y: number } | null {
  // If no door areas, position is valid
  if (doorAreas.length === 0) {
    return position;
  }

  // Check if current position is valid
  if (!isObjectInAnyDoorArea({ ...position, ...objectSize }, doorAreas)) {
    return position;
  }

  // Find nearest door area
  const overlappingDoors = getDoorAreasOverlappingObject({ ...position, ...objectSize }, doorAreas);
  
  if (overlappingDoors.length === 0) {
    return position;
  }

  // Get bounds of first overlapping door
  const doorBounds = getDoorAreaBounds(overlappingDoors[0]);

  // Calculate distance to each edge
  const distances = [
    { side: 'left', x: doorBounds.minX - objectSize.width / 2 - 10, y: position.y, dist: Math.abs(position.x - doorBounds.minX) },
    { side: 'right', x: doorBounds.maxX + objectSize.width / 2 + 10, y: position.y, dist: Math.abs(position.x - doorBounds.maxX) },
    { side: 'top', x: position.x, y: doorBounds.minY - objectSize.height / 2 - 10, dist: Math.abs(position.y - doorBounds.minY) },
    { side: 'bottom', x: position.x, y: doorBounds.maxY + objectSize.height / 2 + 10, dist: Math.abs(position.y - doorBounds.maxY) }
  ];

  // Sort by distance and return nearest valid position
  distances.sort((a, b) => a.dist - b.dist);

  for (const pos of distances) {
    const newPos = { x: pos.x, y: pos.y };
    if (!isObjectInAnyDoorArea({ ...newPos, ...objectSize }, doorAreas)) {
      return newPos;
    }
  }

  return null; // No valid position found
}

