import type { StageConfig } from '@config/stages';
import type { TableAreaPoints, TableConfig } from '@config/venues';
import { getTableAreaPoints } from '@config/venues';
import { getDXFUnits, convertFeetToDXFUnits } from '@utils/advancedDxfRenderer';

/**
 * Calculate stage-relative table points keeping topRight and bottomRight fixed
 * Only calculates topLeft and bottomLeft based on stage position
 */
export const calculateStageTablePoints = (
  stage: StageConfig,
  baseTableConfig: TableConfig,
  minDistanceFeet: number = 12,
  maxDistanceFeet: number = 15,
  dxfUnits?: string,
  dxf?: any
): TableAreaPoints => {
  // Get the base table area points from venue config
  const basePoints = getTableAreaPoints(baseTableConfig);
  
  // Convert feet to DXF units
  let minDistance, maxDistance;
  if (dxfUnits) {
    minDistance = convertFeetToDXFUnits(minDistanceFeet, dxfUnits);
    maxDistance = convertFeetToDXFUnits(maxDistanceFeet, dxfUnits);
  }
  
  // Get stage dimensions
  const stageWidth = stage.width || 1140;
  const stageHeight = stage.height || 200;
  const stageRotation = stage.rotation || 0;
  
  // Calculate stage boundaries based on rotation
  let stageFront, stageBack, stageLeft, stageRight;
  
  if (stageRotation === 90) {
    // Stage is rotated 90 degrees
    stageFront = stage.y + stageWidth / 2;
    stageBack = stage.y - stageWidth / 2;
    stageLeft = stage.x - stageHeight / 2;
    stageRight = stage.x + stageHeight / 2;
  } else {
    // Stage is not rotated (0 degrees)
    stageFront = stage.y + stageHeight / 2;
    stageBack = stage.y - stageHeight / 2;
    stageLeft = stage.x - stageWidth / 2;
    stageRight = stage.x + stageWidth / 2;
  }
  
  // Get stage's right edge (last X point of stage) dynamically
  const stageRightEdge = getStageRightEdge(stage, dxf);

  // Calculate table area start X based on stage right edge + feet distance
  const tableAreaStartX = stageRightEdge + (maxDistance || 0);
    
  // Return the 4 corner points with named properties
  // topRight and bottomRight stay completely fixed from venue config
  // topLeft and bottomLeft: only X is calculated based on stage, Y stays from venue config
  return {
    topLeft: { x: tableAreaStartX, y: basePoints.topLeft.y },
    topRight: basePoints.topRight,  // Fixed from venue config
    bottomRight: basePoints.bottomRight,  // Fixed from venue config
    bottomLeft: { x: tableAreaStartX, y: basePoints.bottomLeft.y }
  };
};

/**
 * Handle stage selection and return 4 points
 * Keeps topRight and bottomRight fixed from venue config
 * Only calculates topLeft and bottomLeft based on stage position
 */
export const handleStageSelection = (
  stage: StageConfig, 
  baseTableConfig: TableConfig,
  dxfUnits?: string,
  dxf?: any
): TableAreaPoints => {

  // Calculate stage right edge for reference
  const stageWidth = stage.width || 1140;
  const stageHeight = stage.height || 200;
  const stageRotation = stage.rotation || 0;
  
  let stageRightEdge;
  if (stageRotation === 90) {
    stageRightEdge = stage.x + stageHeight / 2;
  } else {
    stageRightEdge = stage.x + stageWidth / 2;
  }

  // Calculate the 4 points for table area
  const tableAreaPoints = calculateStageTablePoints(stage, baseTableConfig, 12, 15, dxfUnits, dxf);

  return tableAreaPoints;
};

/**
 * Function to modify table area points at runtime
 * Useful for adjusting table area after initial calculation
 */
export const modifyTableAreaPoints = (
  basePoints: TableAreaPoints,
  modifications: Partial<TableAreaPoints>
): TableAreaPoints => {
  
  const modifiedPoints: TableAreaPoints = {
    topLeft: modifications.topLeft || basePoints.topLeft,
    topRight: modifications.topRight || basePoints.topRight,
    bottomRight: modifications.bottomRight || basePoints.bottomRight,
    bottomLeft: modifications.bottomLeft || basePoints.bottomLeft
  };
  
  return modifiedPoints;
};

/**
 * Function to convert TableAreaPoints to array format (for compatibility)
 */
export const convertToArrayFormat = (points: TableAreaPoints): Array<{ x: number; y: number }> => {
  return [
    points.topLeft,
    points.topRight,
    points.bottomRight,
    points.bottomLeft
  ];
};

/**
 * Get the right edge (last X point) of the stage dynamically
 * This calculates the rightmost X coordinate of the stage
 */
export const getStageRightEdge = (stage: StageConfig, dxf?: any): number => {
  let stageWidth = stage.width;
  let stageHeight = stage.height;
  
  // If width or height not provided, calculate from DXF
  if (!stageWidth || !stageHeight) {
    if (dxf) {
      stageWidth = dxf?.naturalSize?.width;
      stageHeight = dxf?.naturalSize?.height;
    } else {
      // Fallback to default values if no DXF provided
      stageWidth = stageWidth || 1140;
      stageHeight = stageHeight || 200;
    }
  }
  
  const stageRotation = stage.rotation || 0;
  
  let stageRightEdge;
  if (stageRotation === 90) {
    // Stage is rotated 90 degrees - use height for X direction
    stageRightEdge = stage.x + stageHeight! / 2;
  } else {
    // Stage is not rotated (0 degrees) - use width for X direction
    stageRightEdge = stage.x + stageWidth! / 2;
  }
  return stageRightEdge;
};