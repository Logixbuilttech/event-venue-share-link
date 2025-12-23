import { StageWorldCoordinate } from "./stages";

export type SeatingMode = 'auto' | 'tables-only' | 'chairs-only';

export interface SingleChairConfig {
  fileName: string; // DXF file path for single chair (e.g., 'single_chair.dxf')
  glbFileName: string; // GLB file path for single chair (e.g., 'single_chair.glb')
  glbWidth?: number; // Optional GLB width override for scaling
  glbHeight?: number; // Optional GLB height override for scaling
  glbDepth?: number; // Optional GLB depth override for scaling
  width: number; // Chair width in units
  height: number; // Chair height in units
  spacing: number; // Space between chairs (all sides)
  chairsPerRow?: number; // Maximum chairs per row
  rotation?: number; // Rotation angle in degrees (0, 90, 180, 270),
  rowsPerGroup?: number; // Number of rows before adding group spacing (e.g., 4 means VERTICAL space after every 4 rows)
}

// Named table area points interface
export interface TableAreaPoints {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

// Venue corner points for stage positioning
export interface VenueCornerPoints {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

// Door/Exit area definition (exclusion zones for tables/chairs)
export interface DoorArea {
  id: string; // Unique identifier (e.g., 'main-entrance', 'emergency-exit-1')
  name: string; // Display name (e.g., 'Main Entrance', 'Emergency Exit 1')
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  clearance?: number; // Extra clearance space around door in all directions (default: 0)
  type?: 'entrance' | 'exit' | 'emergency' | 'service'; // Optional door type for visualization
  coordinates3D?: { // Optional 3D coordinates - if provided, used in 3D view instead of regular coordinates
    topLeft: { x: number; y: number; z: number };
    topRight: { x: number; y: number; z: number };
    bottomRight: { x: number; y: number; z: number };
    bottomLeft: { x: number; y: number; z: number };
  };
}

export interface TableConfig {
  id: string;
  name: string;
  fileName: string; // DXF file path for table
  glbFileName?: string; // GLB file path for table
  glbRotation?: number; // Rotation of the table in the GLB model
  glbWidth?: number; // Optional GLB width override for scaling
  glbHeight?: number; // Optional GLB height override for scaling
  glbDepth?: number; // Optional GLB depth override for scaling
  width: number; // Table width in units
  height: number; // Table height in units
  chairsPerTable: number; // Number of chairs per table
  chairSpacing: number; // Space between chairs around table
  tableSpacing: number; // Space between tables (left, right, top, bottom)
  columns: number; // Number of table columns
  columnSpacing: number; // Space between columns
  columnsPerGroup?: number; // Number of columns before adding group spacing (e.g., 4 means space after every 4 columns)
  columnGroupSpacing?: number; // Extra horizontal space after each column group (e.g., 10px)
  rowsPerGroup?: number; // Number of rows before adding group spacing (e.g., 4 means VERTICAL space after every 4 rows)
  rowGroupSpacing?: number; // Extra VERTICAL space after each row group (e.g., 100px) - creates horizontal aisles
  startX: number; // Starting X coordinate for table arrangement
  startY: number; // Starting Y coordinate for table arrangement
  endX: number; // Ending X coordinate for table arrangement
  endY: number; // Ending Y coordinate for table arrangement
  namedPoints: TableAreaPoints; // Named 4-point area definition
  points?: Array<{ x: number; y: number }>; // Custom 4-point area definition
  maxTablesPerRow: number; // Maximum tables per row
  maxCapacity: number; // Maximum number of guests this area can accommodate
  chairFileName?: string; // DXF file path for chairs (optional)

  // Single chair configuration for smart seating
  singleChair?: SingleChairConfig;
  seatingMode?: SeatingMode; // 'auto', 'tables-only', 'chairs-only', 'mixed'
}

export interface StageConfig {
  id: string;
  name: string;
  fileName: string;
  glbFileName?: string; // Optional GLB file for 3D view
  glbRotation?: number; // Optional rotation of the stage in the GLB model
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  description?: string;
  worldPosition?: StageWorldCoordinate; // Optional 3D world position (overrides x, y for 3D rendering)
  backstageDepth?: number;
  backstageSide?: 'left' | 'right' | 'top' | 'bottom';
}

export interface WalkCameraPosition {
  x: number; // X coordinate in 3D space
  y: number; // Y coordinate in 3D space (vertical/height)
  z: number; // Z coordinate in 3D space
  rotation?: number; // Camera rotation in degrees (0 = looking north/+Y)
}

export interface FloorPlan {
  id: string;
  name: string;
  fileName: string;
  glbFileName?: string; // Optional GLB file for 3D view
  width: number; // Floor plan width in units
  height: number; // Floor plan height in units
  rotation?: number; // Floor plan rotation in degrees
  stages: StageConfig[];
  tableAreas: TableConfig[];
  cornerPoints?: VenueCornerPoints; // Corner points for stage positioning
  doorAreas?: DoorArea[]; // Door/exit exclusion zones where tables/chairs should not be placed (used for 2D view and table calculation)
  walkStartPosition?: WalkCameraPosition; // Starting position for walk mode camera
  description?: string;
}

export interface VenueConfig {
  id: string;
  name: string;
  description?: string;
  floorPlans: FloorPlan[];
  defaultFloorPlanId: string;
}

// Table calculation settings
export interface TableCalculationSettings {
  guestsPerTable: number; // Default guests per table
  minTables: number; // Minimum number of tables
  maxTables: number; // Maximum number of tables
  preferredTableSize: 'small' | 'medium' | 'large'; // Preferred table size
}

// Default table configurations
export const defaultTableConfigs: TableConfig[] = [
  {
    id: 'round-8',
    name: 'Round Table (8 chairs)',
    fileName: 'table_set.dxf',
    glbFileName: 'table_with_8_chair.glb',
    width: 72,
    height: 72,
    chairsPerTable: 8,
    chairSpacing: 0.2,
    tableSpacing: 2.0,
    columns: 2,
    columnSpacing: 3.0,
    startX: -20,
    startY: -10,
    endX: 20,
    endY: 10,
    namedPoints: {
      topLeft: { x: -20, y: 10 },
      topRight: { x: 20, y: 10 },
      bottomRight: { x: 20, y: -10 },
      bottomLeft: { x: -20, y: -10 }
    },
    maxTablesPerRow: 10,
    maxCapacity: 500,
    chairFileName: 'table_set.dxf'
  },
  {
    id: 'round-10',
    name: 'Round Table (10 chairs)',
    fileName: 'table_set.dxf',
    width: 1.8,
    height: 1.8,
    chairsPerTable: 10,
    chairSpacing: 0.25,
    tableSpacing: 2.2,
    columns: 2,
    columnSpacing: 3.5,
    startX: -20,
    startY: -10,
    endX: 20,
    endY: 10,
    namedPoints: {
      topLeft: { x: -20, y: 10 },
      topRight: { x: 20, y: 10 },
      bottomRight: { x: 20, y: -10 },
      bottomLeft: { x: -20, y: -10 }
    },
    maxTablesPerRow: 8,
    maxCapacity: 500,
    chairFileName: 'table_set.dxf'
  },
  {
    id: 'rectangular-8',
    name: 'Rectangular Table (8 chairs)',
    fileName: 'table_set.dxf',
    width: 2.0,
    height: 1.0,
    chairsPerTable: 8,
    chairSpacing: 0.2,
    tableSpacing: 2.5,
    columns: 2,
    columnSpacing: 4.0,
    startX: -20,
    startY: -10,
    endX: 20,
    endY: 10,
    namedPoints: {
      topLeft: { x: -20, y: 10 },
      topRight: { x: 20, y: 10 },
      bottomRight: { x: 20, y: -10 },
      bottomLeft: { x: -20, y: -10 }
    },
    maxTablesPerRow: 6,
    maxCapacity: 500,
    chairFileName: 'table_set.dxf'
  }
];

// Default stage configurations
export const defaultStageConfigs: StageConfig[] = [
  {
    id: 'toifa-stage',
    name: 'Toifa Stage',
    fileName: 'toifa_stage.dxf',
    x: 1060,
    y: 1525,
    width: 1140,
    rotation: 0,
    description: 'Special Toifa stage design'
  }
];

// Venue-specific stage configurations
const infinityBallroomStages: StageConfig[] = [
  {
    id: 'infinity-toifa-stage',
    name: 'Toifa Stage',
    fileName: 'toifa_stage.dxf',
    glbFileName: 'toifa_stage.glb',
    glbRotation: 0,
    // worldPosition: { x: -3.95, y: 0, z: -0.45 },
    backstageDepth: 10,
    backstageSide: 'top',
    x: 930,
    y: 2090,
    rotation: 90,
    width: 1140,
    description: 'Special Toifa stage design for Infinity Ballroom'
  }
];

// Common table configuration for all venues
const commonTableConfig: TableConfig = {
  id: 'standard-table',
  name: 'Standard Table',
  fileName: 'table_set.dxf',
  glbFileName: 'table_with_8_chair.glb',
  glbWidth: 72,
  glbHeight: 72,
  glbDepth: 72,
  glbRotation: 0, // Rotation of the table in the GLB model
  width: 72,
  height: 72,
  chairsPerTable: 8,
  chairSpacing: 0.2,
  tableSpacing: 55, // Space around each table (all sides)
  columns: 2,
  columnSpacing: 70, // Space between columns (horizontal spacing)
  rowsPerGroup: 4, // Group every 4 rows - adds VERTICAL space after every 4 rows
  rowGroupSpacing: 65, // Extra VERTICAL space after each group of 4 rows (creates horizontal aisles)
  startX: -15,
  startY: -8,
  endX: 15,
  endY: 8,
  namedPoints: {
    topLeft: { x: -15, y: 8 },
    topRight: { x: 15, y: 8 },
    bottomRight: { x: 15, y: -8 },
    bottomLeft: { x: -15, y: -8 }
  },
  maxTablesPerRow: 6,
  maxCapacity: 500, // Default maximum capacity
  chairFileName: 'table_set.dxf',

  // Single chair configuration for overflow seating
  singleChair: {
    fileName: 'single_chair.dxf',
    glbFileName: 'single_chair.glb',
    glbWidth: 18,
    glbHeight: 18,
    glbDepth: 50,
    width: 18, // Single chair width
    height: 18, // Single chair height
    spacing: 10, // Space between chairs (less than table spacing)
    chairsPerRow: 32, // Maximum chairs per row
    rotation: -90, // Rotation angle (0 = facing front, 90 = facing right, 180 = facing back, 270 = facing left)
    rowsPerGroup: 16, // Group every 16 rows - adds VERTICAL space after every 16 rows
  },
  seatingMode: 'auto' // Auto-decide between tables and chairs based on space
};

// Venue configurations
export const venueConfigs: VenueConfig[] = [
  {
    id: 'infinity-ballroom',
    name: 'Infinity Ballroom',
    description: 'Elegant ballroom with flexible table arrangements and multiple stage options',
    defaultFloorPlanId: 'infinity-main',
    floorPlans: [
      {
        id: 'infinity-main',
        name: 'Main Floor Plan',
        fileName: 'floor-plan.dxf',
        glbFileName: 'floor-plan-opt.glb',
        width: 40,
        height: 90,
        stages: infinityBallroomStages,
        cornerPoints: {
          topLeft: { x: 710, y: 2085 },
          topRight: { x: 3000, y: 2085 },
          bottomRight: { x: 3000, y: 1055 },
          bottomLeft: { x: 710, y: 1055 }
        },
        // Walk mode starting position - near entrance looking into dining area
        walkStartPosition: {
          x: -52.73,
          y: 1.7, // Eye level for human
          z: -7,
          rotation: -90  // Looking left (90 degrees from north/forward)
        },
        tableAreas: [
          {
            ...commonTableConfig,
            id: 'infinity-main-dining',
            name: 'Infinity Dining Area',
            columns: 2,
            maxTablesPerRow: 8,
            // maxCapacity: 1000, // Maximum 1000 guests for main dining area
            namedPoints: {
              topLeft: { x: 1670, y: 2085 },
              topRight: { x: 3000, y: 2085 },
              bottomRight: { x: 3000, y: 1055 },
              bottomLeft: { x: 1670, y: 1055 }
            }
          },
        ],
        doorAreas: [
          {
            id: 'main-entrance',
            name: 'Main Entrance',
            topLeft: { x: 1195, y: 2138 },
            topRight: { x: 1300, y: 2138 },
            bottomRight: { x: 1300, y: 950 },
            bottomLeft: { x: 1195, y: 950 },
            // Optional: Add coordinates3D for 3D view using 3D world coordinates (x, y, z)
            coordinates3D: {
              topLeft: { x: 1.30, y: 0, z: -16 },
              topRight: { x: 4.30, y: 0, z: -16 },
              bottomRight: { x: 4.30, y: 0, z: 13.80 },
              bottomLeft: { x: 1.30, y: 0, z: 13.80 }
            }
          },
          {
            id: 'infinity-main-entrance',
            name: 'Infinity Main Entrance',
            topLeft: { x: 1590, y: 2128 },
            topRight: { x: 1695, y: 2128 },
            bottomRight: { x: 1695, y: 950 },
            bottomLeft: { x: 1590, y: 950 },
            coordinates3D: {
              topLeft: { x: 11.35, y: 0, z: -16 },
              topRight: { x: 14.35, y: 0, z: -16 },
              bottomRight: { x: 14.35, y: 0, z: 13.80 },
              bottomLeft: { x: 11.35, y: 0, z: 13.80 }
            }
          },
          {
            id: 'emergency-exit',
            name: 'Emergency Exit',
            topLeft: { x: 1965, y: 2128 },
            topRight: { x: 2065, y: 2128 },
            bottomRight: { x: 2065, y: 950 },
            bottomLeft: { x: 1965, y: 950 },
            coordinates3D: {
              topLeft: { x: 20.90, y: 0, z: -16 },
              topRight: { x: 23.90, y: 0, z: -16 },
              bottomRight: { x: 23.90, y: 0, z: 13.80 },
              bottomLeft: { x: 20.90, y: 0, z: 13.80 }
            }
          }
        ],
        // Custom door areas for 3D view only (optional - if not provided, doorAreas will be used)
        // Use this when 3D view has different coordinate system or layout that requires different door area positions
        // doorAreas3D: [
        //   {
        //     id: 'main-entrance-3d',
        //     name: 'Main Entrance (3D)',
        //     topLeft: { x: 1195, y: 2138 },
        //     topRight: { x: 1300, y: 2138 },
        //     bottomRight: { x: 1300, y: 950 },
        //     bottomLeft: { x: 1195, y: 950 }
        //   }
        // ],
        description: 'Main floor plan with multiple dining areas'
      }
    ]
  },
];

// Table calculation settings
export const defaultTableSettings: TableCalculationSettings = {
  guestsPerTable: 8,
  minTables: 1,
  maxTables: 50,
  preferredTableSize: 'medium'
};

// Helper functions for table area points
export const getTableAreaPoints = (tableConfig: TableConfig): TableAreaPoints => {
  return tableConfig.namedPoints;
};

export const updateTableAreaPoints = (
  tableConfig: TableConfig,
  newPoints: TableAreaPoints
): TableConfig => {
  return {
    ...tableConfig,
    namedPoints: newPoints
  };
};

export const convertTableAreaToArray = (points: TableAreaPoints): Array<{ x: number; y: number }> => {
  return [
    points.topLeft,
    points.topRight,
    points.bottomRight,
    points.bottomLeft
  ];
};

// Helper functions for stage positioning based on corner points
export const getStagePositionFromCorners = (
  cornerPoints: VenueCornerPoints,
  stageWidth: number,
  stageHeight: number,
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' = 'topLeft'
): { x: number; y: number } => {
  switch (position) {
    case 'topLeft':
      return {
        x: cornerPoints.topLeft.x,
        y: cornerPoints.topLeft.y - stageHeight // Adjust for stage height
      };
    case 'topRight':
      return {
        x: cornerPoints.topRight.x - stageWidth, // Adjust for stage width
        y: cornerPoints.topRight.y - stageHeight // Adjust for stage height
      };
    case 'bottomLeft':
      return {
        x: cornerPoints.bottomLeft.x,
        y: cornerPoints.bottomLeft.y
      };
    case 'bottomRight':
      return {
        x: cornerPoints.bottomRight.x - stageWidth, // Adjust for stage width
        y: cornerPoints.bottomRight.y
      };
    default:
      return cornerPoints.topLeft;
  }
};

// Position stage based on corner points with custom dimensions
export const positionStageFromCorners = (
  stageConfig: any,
  cornerPoints: VenueCornerPoints,
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' = 'topLeft'
): any => {
  // Get stage dimensions - use custom dimensions if available, otherwise use default
  const stageWidth = stageConfig.customWidth || stageConfig.width || 200;
  const stageHeight = stageConfig.customHeight || stageConfig.height || 100;

  // Get position based on corner points
  const positionCoords = getStagePositionFromCorners(cornerPoints, stageWidth, stageHeight, position);

  return {
    ...stageConfig,
    x: positionCoords.x,
    y: positionCoords.y,
    width: stageWidth,
    height: stageHeight
  };
};

// Calculate table area position 15 feet after the stage
export const calculateTableAreaAfterStage = (
  stageConfig: any,
  baseTableConfig: TableConfig,
  distanceFeet: number = 15
): TableConfig => {
  // Get stage dimensions
  const stageWidth = stageConfig.customWidth || stageConfig.width || 200;
  const stageHeight = stageConfig.customHeight || stageConfig.height || 100;
  const stageX = stageConfig.x || 0;
  const stageY = stageConfig.y || 0;
  const stageRotation = stageConfig.rotation || 0;

  // Convert feet to DXF units
  const distanceInDXFUnits = feetToDXFUnits(distanceFeet);

  // Calculate stage boundaries
  let stageRightEdge, stageLeftEdge, stageTopEdge, stageBottomEdge;

  if (stageRotation === 90) {
    // Stage is rotated 90 degrees
    stageRightEdge = stageX + stageHeight / 2;
    stageLeftEdge = stageX - stageHeight / 2;
    stageTopEdge = stageY + stageWidth / 2;
    stageBottomEdge = stageY - stageWidth / 2;
  } else {
    // Stage is not rotated (0 degrees)
    stageRightEdge = stageX + stageWidth / 2;
    stageLeftEdge = stageX - stageWidth / 2;
    stageTopEdge = stageY + stageHeight / 2;
    stageBottomEdge = stageY - stageHeight / 2;
  }

  // Calculate table area start position (15 feet after stage)
  const tableAreaStartX = stageRightEdge + distanceInDXFUnits;
  const tableAreaStartY = stageBottomEdge;
  const tableAreaEndX = stageRightEdge + distanceInDXFUnits + 1000; // Extend table area
  const tableAreaEndY = stageTopEdge;

  // Create updated table config with new positioning
  const updatedTableConfig: TableConfig = {
    ...baseTableConfig,
    startX: tableAreaStartX,
    startY: tableAreaStartY,
    endX: tableAreaEndX,
    endY: tableAreaEndY,
    namedPoints: {
      topLeft: { x: tableAreaStartX, y: baseTableConfig.namedPoints.topLeft.y },
      topRight: { x: baseTableConfig.namedPoints.topRight.x, y: baseTableConfig.namedPoints.topRight.y },
      bottomRight: { x: baseTableConfig.namedPoints.bottomRight.x, y: baseTableConfig.namedPoints.bottomRight.y },
      bottomLeft: { x: tableAreaStartX, y: baseTableConfig.namedPoints.bottomLeft.y }
    }
  };

  return updatedTableConfig;
};

export const getCornerPoints = (floorPlan: FloorPlan): VenueCornerPoints | null => {
  return floorPlan.cornerPoints || null;
};

// Helper functions for unit conversion
export const feetToDXFUnits = (feet: number): number => {
  return feet * 12; // 1 foot = 12 inches
};

export const dxfUnitsToFeet = (dxfUnits: number): number => {
  return dxfUnits / 12; // Convert inches to feet
};

// Boundary validation functions
export const isPositionWithinBounds = (
  x: number,
  y: number,
  width: number,
  height: number,
  cornerPoints: VenueCornerPoints
): boolean => {
  const stageLeft = x - width / 2;
  const stageRight = x + width / 2;
  const stageTop = y + height / 2;
  const stageBottom = y - height / 2;

  // Check if stage is within corner points
  return (
    stageLeft >= cornerPoints.topLeft.x &&
    stageRight <= cornerPoints.topRight.x &&
    stageTop <= cornerPoints.topLeft.y &&
    stageBottom >= cornerPoints.bottomLeft.y
  );
};

export const constrainPositionToBounds = (
  x: number,
  y: number,
  width: number,
  height: number,
  cornerPoints: VenueCornerPoints
): { x: number; y: number } => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Constrain X position
  const constrainedX = Math.max(
    cornerPoints.topLeft.x + halfWidth,
    Math.min(cornerPoints.topRight.x - halfWidth, x)
  );

  // Constrain Y position
  const constrainedY = Math.max(
    cornerPoints.bottomLeft.y + halfHeight,
    Math.min(cornerPoints.topLeft.y - halfHeight, y)
  );

  return { x: constrainedX, y: constrainedY };
};

// Helper functions
export const getVenueConfig = (venueId: string): VenueConfig | undefined => {
  return venueConfigs.find(venue => venue.id === venueId);
};

export const getFloorPlan = (venueId: string, floorPlanId: string): FloorPlan | undefined => {
  const venue = getVenueConfig(venueId);
  return venue?.floorPlans.find(plan => plan.id === floorPlanId);
};

export const getTableConfig = (tableId: string): TableConfig | undefined => {
  return defaultTableConfigs.find(config => config.id === tableId);
};

export const calculateTablesNeeded = (
  guestCount: number,
  tableConfig: TableConfig,
  settings: TableCalculationSettings = defaultTableSettings
): { tables: number; chairs: number; totalGuests: number } => {
  const guestsPerTable = tableConfig.chairsPerTable;
  const tables = Math.ceil(guestCount / guestsPerTable);
  const chairs = tables * guestsPerTable;

  return {
    tables: Math.max(settings.minTables, tables),
    chairs,
    totalGuests: chairs
  };
};

// Helper function to check if a point is inside a polygon (4 points)
const isPointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean => {
  if (polygon.length !== 4) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
      (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
      inside = !inside;
    }
  }
  return inside;
};

// Helper function to get polygon bounds
const getPolygonBounds = (polygon: Array<{ x: number; y: number }>): { minX: number; maxX: number; minY: number; maxY: number } => {
  const xs = polygon.map(p => p.x);
  const ys = polygon.map(p => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
};

// Calculate table positions within a 4-point polygon area
const calculateTablePositionsInPolygon = (
  tableConfig: TableConfig,
  tableCount: number
): Array<{ x: number; y: number; tableIndex: number }> => {
  if (!tableConfig.namedPoints) {
    console.error('Invalid polygon points for table positioning');
    return [];
  }

  const positions: Array<{ x: number; y: number; tableIndex: number }> = [];
  const polygon = convertTableAreaToArray(tableConfig.namedPoints);
  const bounds = getPolygonBounds(polygon);

  // Calculate spacing
  const tableWidthWithSpacing = tableConfig.width + tableConfig.tableSpacing;
  const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;

  // Calculate available area dimensions from bounds
  const availableWidth = bounds.maxX - bounds.minX;
  const availableHeight = bounds.maxY - bounds.minY;

  // Calculate maximum tables that can fit vertically (in one column from top to bottom)
  const maxTablesPerColumn = Math.floor(availableHeight / tableHeightWithSpacing);

  // Calculate how many columns we need for all tables
  const columnsNeeded = Math.ceil(tableCount / maxTablesPerColumn);

  // Check if we have enough horizontal space
  const maxColumnsAvailable = Math.floor(availableWidth / (tableConfig.width + tableConfig.columnSpacing));
  const actualColumns = Math.min(columnsNeeded, maxColumnsAvailable);



  // Row group spacing configuration (for VERTICAL spacing between row groups)
  const rowsPerGroup = tableConfig.rowsPerGroup || 999; // Default: no grouping
  const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  // Arrange tables in columns (top to bottom FIRST, then next column)
  // Only place tables if ALL corners are within the polygon
  let tableIndex = 0;
  for (let col = 0; col < actualColumns && tableIndex < tableCount; col++) {
    const columnX = bounds.minX + (col * (tableConfig.width + tableConfig.columnSpacing));

    for (let row = 0; row < maxTablesPerColumn && tableIndex < tableCount; row++) {
      // Calculate extra VERTICAL spacing from row groups (adds vertical space after every N rows)
      const rowGroupNumber = Math.floor(row / rowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;

      const rowY = bounds.minY + (row * tableHeightWithSpacing) + extraRowGroupSpacing;

      // Check if position is within bounds
      if (columnX + tableConfig.width <= bounds.maxX &&
        rowY + tableConfig.height <= bounds.maxY) {

        // Check all four corners of the table are within polygon
        const tableCorners = [
          { x: columnX, y: rowY }, // Top-left
          { x: columnX + tableConfig.width, y: rowY }, // Top-right
          { x: columnX, y: rowY + tableConfig.height }, // Bottom-left
          { x: columnX + tableConfig.width, y: rowY + tableConfig.height } // Bottom-right
        ];

        // Only place table if ALL corners are within the polygon
        const allCornersInside = tableCorners.every(corner => isPointInPolygon(corner, polygon));

        if (allCornersInside) {
          positions.push({
            x: columnX,
            y: rowY,
            tableIndex: tableIndex
          });
          tableIndex++;
        }
      }
    }
  }

  return positions;
};

// Simple smart seating calculation - tables first, then chairs for remaining guests
export const calculateSmartSeating = (
  tableConfig: TableConfig,
  guestCount: number
): {
  tables: Array<{ x: number; y: number; tableIndex: number; type: 'table' }>;
  chairs: Array<{ x: number; y: number; chairIndex: number; type: 'chair' }>;
  summary: {
    totalTables: number;
    totalChairs: number;
    tableSeats: number;
    chairSeats: number;
    totalSeats: number;
    totalGuests: number;
  };
} => {
  const result = {
    tables: [] as Array<{ x: number; y: number; tableIndex: number; type: 'table' }>,
    chairs: [] as Array<{ x: number; y: number; chairIndex: number; type: 'chair' }>,
    summary: {
      totalTables: 0,
      totalChairs: 0,
      tableSeats: 0,
      chairSeats: 0,
      totalSeats: 0,
      totalGuests: 0
    }
  };

  // Get seating mode
  const mode = tableConfig.seatingMode || 'auto';

  // Calculate area bounds
  const bounds = tableConfig.namedPoints
    ? getPolygonBounds(convertTableAreaToArray(tableConfig.namedPoints))
    : { minX: tableConfig.startX, maxX: tableConfig.endX, minY: tableConfig.startY, maxY: tableConfig.endY };

  const availableWidth = bounds.maxX - bounds.minX;
  const availableHeight = bounds.maxY - bounds.minY;

  // STEP 1: Calculate maximum tables that can fit in the area (WITH row group spacing)
  const tableWidthWithSpacing = tableConfig.width + tableConfig.columnSpacing;
  const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;

  // Calculate max tables per column accounting for row group spacing
  // const tableRowsPerGroup = tableConfig.rowsPerGroup || 999;
  // const tableRowGroupSpacing = tableConfig.rowGroupSpacing || 0;
  // const tableGroupBlockHeight = tableRowsPerGroup * tableHeightWithSpacing + tableRowGroupSpacing;
  // const tableFullGroups = Math.floor(availableHeight / tableGroupBlockHeight);
  // const tableRemainingHeight = availableHeight - tableFullGroups * tableGroupBlockHeight;
  // const tableExtraRows = Math.floor(tableRemainingHeight / tableHeightWithSpacing);
  // const maxTablesPerColumn = Math.max(tableFullGroups * tableRowsPerGroup + tableExtraRows, 1);
  const maxTablesPerColumn = Math.max(Math.floor(availableHeight / tableHeightWithSpacing), 1);

  const maxColumnsAvailable = Math.max(Math.floor(availableWidth / tableWidthWithSpacing), 1);
  const maxPossibleTables = maxTablesPerColumn * maxColumnsAvailable;
  const maxTableSeats = maxPossibleTables * tableConfig.chairsPerTable;

  // STEP 2: Calculate maximum chairs that can fit in the area (WITH row group spacing)
  let maxPossibleChairs = 0;
  let maxChairsPerColumn = 1;
  if (tableConfig.singleChair) {
    const chair = tableConfig.singleChair;
    const chairWidthWithSpacing = chair.width + chair.spacing;
    const chairHeightWithSpacing = chair.height + chair.spacing;

    // Calculate max chairs per column accounting for row group spacing
    const chairRowsPerGroup = chair.rowsPerGroup || 999;
    const chairRowGroupSpacing = tableConfig.rowGroupSpacing || 0;
    const chairGroupBlockHeight = chairRowsPerGroup * chairHeightWithSpacing + chairRowGroupSpacing;
    const chairFullGroups = Math.floor(availableHeight / chairGroupBlockHeight);
    const chairRemainingHeight = availableHeight - chairFullGroups * chairGroupBlockHeight;
    const chairExtraRows = Math.floor(chairRemainingHeight / chairHeightWithSpacing);
    maxChairsPerColumn = Math.max(chairFullGroups * chairRowsPerGroup + chairExtraRows, 1);

    const maxChairColumnsAvailable = Math.floor(availableWidth / chairWidthWithSpacing);
    maxPossibleChairs = maxChairsPerColumn * maxChairColumnsAvailable;
  }
  if (tableConfig.rowsPerGroup && maxChairsPerColumn % tableConfig.rowsPerGroup !== 0) {
    maxChairsPerColumn = Math.floor(maxChairsPerColumn / tableConfig.rowsPerGroup) * tableConfig.rowsPerGroup;
  }

  // CHAIRS-ONLY MODE: Fill entire area with chairs only
  if (tableConfig.singleChair && mode === 'chairs-only') {
    const chairsToPlace = Math.min(guestCount, maxPossibleChairs);
    result.chairs = calculateSingleChairPositions(tableConfig, chairsToPlace);
    result.summary.totalChairs = result.chairs.length;
    result.summary.chairSeats = result.chairs.length;
    result.summary.totalSeats = result.chairs.length;
    return result;
  }

  // TABLES-ONLY MODE: Fill with tables only
  if (mode === 'tables-only' || guestCount <= maxTableSeats) {
    const tablesNeeded = Math.ceil(guestCount / tableConfig.chairsPerTable);
    const actualTables = Math.min(tablesNeeded, maxPossibleTables);

    const tablePositions = calculateTablePositions(tableConfig, actualTables);
    result.tables = tablePositions.map(pos => ({ ...pos, type: 'table' as const }));
    result.summary.totalTables = result.tables.length;
    result.summary.tableSeats = result.tables.length * tableConfig.chairsPerTable;
    result.summary.totalSeats = result.summary.tableSeats;

    return result;
  }

  // AUTO MODE: Simple logic
  // STEP 3: Check if tables alone can fit all guests
  // if (guestCount <= maxTableSeats) {
  //   // Use tables only - no chairs needed
  //   const tablesNeeded = Math.ceil(guestCount / tableConfig.chairsPerTable);
  //   const actualTables = Math.min(tablesNeeded, maxPossibleTables);

  //   const tablePositions = calculateTablePositions(tableConfig, actualTables);
  //   result.tables = tablePositions.map(pos => ({ ...pos, type: 'table' as const }));
  //   result.summary.totalTables = result.tables.length;
  //   result.summary.tableSeats = result.tables.length * tableConfig.chairsPerTable;
  //   result.summary.totalSeats = result.summary.tableSeats;

  //   return result;
  // }

  // STEP 4: Tables alone can't fit all guests - smart mix by removing table COLUMNS and adding chair COLUMNS
  if (tableConfig.singleChair) {
    const chair = tableConfig.singleChair;
    const chairWidthWithSpacing = chair.width + chair.spacing;
    const chairHeightWithSpacing = chair.height + chair.spacing;

    // Calculate seats per column (vertical)
    const seatsPerTableColumn = maxTablesPerColumn * tableConfig.chairsPerTable;
    const chairsPerColumn = maxChairsPerColumn; // Same height, fill vertically

    // Calculate minimum table columns needed for tables-only solution
    const minTableColumnsNeeded = Math.ceil(guestCount / seatsPerTableColumn);

    // Strategy: Use ALL tables, then add chairs in REMAINING horizontal space
    let tableColumnsToKeep = maxColumnsAvailable;
    let chairColumnsNeeded = 0;

    // STEP 4A: Calculate how many tables + chairs needed (BEFORE placing them)
    let tablesNeeded = 0;
    let chairsNeeded = 0;

    // Check if tables alone can fit all guests
    if (guestCount <= maxTableSeats) {
      // Tables alone are sufficient - only use what we need
      tableColumnsToKeep = Math.min(minTableColumnsNeeded, maxColumnsAvailable);
      chairColumnsNeeded = 0;

      // Calculate exact table count needed
      tablesNeeded = Math.ceil(guestCount / tableConfig.chairsPerTable);
      chairsNeeded = 0;
    } else {
      // Need MORE than max tables - must remove some table columns and add chair columns
      const tableWidthWithSpacing = tableConfig.width + tableConfig.columnSpacing;
      let found = false;
      let bestSolution = { tableColumns: 0, chairColumns: 0, totalSeats: 0, gap: Infinity };

      // Try removing table columns from the right, see if we can fit enough chair columns
      for (let tableColumns = maxColumnsAvailable; tableColumns >= 0; tableColumns--) {
        const tableSeats = tableColumns * seatsPerTableColumn;
        const remainingGuests = guestCount - tableSeats;

        if (remainingGuests <= 0) {
          // Don't need chairs with this many table columns
          if (!found || Math.abs(tableSeats - guestCount) < bestSolution.gap) {
            tableColumnsToKeep = tableColumns;
            chairColumnsNeeded = 0;
            bestSolution = { tableColumns, chairColumns: 0, totalSeats: tableSeats, gap: Math.abs(tableSeats - guestCount) };
          }
          found = true;
          continue; // Keep looking for better solutions
        }

        // Calculate space available if we remove this many table columns
        const spaceUsedByTables = tableColumns * tableWidthWithSpacing;
        const spaceForChairs = availableWidth - spaceUsedByTables;
        const maxChairColumnsThatFit = Math.floor(spaceForChairs / chairWidthWithSpacing);

        // Calculate how many chair columns we need for remaining guests
        const chairColumnsRequired = Math.ceil(remainingGuests / chairsPerColumn);

        // Check if we can fit enough chair columns
        if (chairColumnsRequired <= maxChairColumnsThatFit) {
          // This combination works!
          const actualChairSeats = Math.min(chairColumnsRequired * chairsPerColumn, remainingGuests);
          const totalSeats = tableSeats + actualChairSeats;
          const gap = Math.abs(totalSeats - guestCount);

          // Track best solution (closest to guest count)
          if (gap < bestSolution.gap) {
            bestSolution = { tableColumns, chairColumns: chairColumnsRequired, totalSeats, gap };
            tableColumnsToKeep = tableColumns;
            chairColumnsNeeded = chairColumnsRequired;
            found = true;
          }

          // If we found exact match or close enough, we can stop
          if (totalSeats >= guestCount && gap <= seatsPerTableColumn) {
            break;
          }
        }
      }

      if (!found) {
        // Fallback: Remove 1-2 table columns, add chairs in that space on the RIGHT

        const tableSeats = maxColumnsAvailable * seatsPerTableColumn;
        const remainingGuests = guestCount - tableSeats;
        const chairColumnsRequired = Math.ceil(remainingGuests / chairsPerColumn);

        // Calculate how many table columns to remove to fit the needed chair columns
        // Each table column freed = space for multiple chair columns
        const spacePerTableColumn = tableWidthWithSpacing;
        const chairColumnsPerTableColumn = Math.floor(spacePerTableColumn / chairWidthWithSpacing);
        const tableColumnsToRemove = Math.ceil(chairColumnsRequired / chairColumnsPerTableColumn);

        tableColumnsToKeep = Math.max(0, maxColumnsAvailable - tableColumnsToRemove);
        chairColumnsNeeded = chairColumnsRequired;
      }

      // Calculate exact counts BEFORE placing
      tablesNeeded = tableColumnsToKeep * maxTablesPerColumn;
      const tableSeatsProvided = tablesNeeded * tableConfig.chairsPerTable;
      chairsNeeded = Math.min(guestCount - tableSeatsProvided, chairColumnsNeeded * chairsPerColumn);

      if (guestCount > (tableSeatsProvided + chairsNeeded)) {
        const chairsToPlace = Math.min(guestCount, maxPossibleChairs);
        result.chairs = calculateSingleChairPositions(tableConfig, chairsToPlace);
        result.summary.totalChairs = result.chairs.length;
        result.summary.chairSeats = result.chairs.length;
        result.summary.totalSeats = result.chairs.length;
        return result;
      }
    }

    // Place tables (only in the first N columns)
    if (tableColumnsToKeep > 0) {
      const tablePositions = calculateTablePositionsWithColumnLimit(tableConfig, tableColumnsToKeep, maxTablesPerColumn);
      result.tables = tablePositions.map(pos => ({ ...pos, type: 'table' as const }));
      result.summary.totalTables = result.tables.length;
      result.summary.tableSeats = result.tables.length * tableConfig.chairsPerTable;
    }

    // Place chairs in the COLUMNS AFTER tables (on the right side)
    if (chairColumnsNeeded > 0) {
      const remainingGuests = guestCount - result.summary.tableSeats;
      const chairsToPlace = Math.min(remainingGuests, chairColumnsNeeded * chairsPerColumn);

      if (chairsToPlace > 0) {
        // Chairs ALWAYS go AFTER the table columns (on the RIGHT side)
        const tableWidthWithSpacing = tableConfig.width + tableConfig.columnSpacing;
        const chairStartX = bounds.minX + (tableColumnsToKeep * tableWidthWithSpacing);

        result.chairs = calculateChairColumnsInSpace(
          tableConfig,
          chairsToPlace,
          chairStartX,
          chairColumnsNeeded,
          maxTablesPerColumn,
          maxChairsPerColumn
        );
        result.summary.totalChairs = result.chairs.length;
        result.summary.chairSeats = result.chairs.length;

      }
    }

    result.summary.totalSeats = result.summary.tableSeats + result.summary.chairSeats;
    return result;
  }

  // Fallback: No single chair config - use tables only
  const tablesNeeded = Math.ceil(guestCount / tableConfig.chairsPerTable);
  const actualTables = Math.min(tablesNeeded, maxPossibleTables);
  const tablePositions = calculateTablePositions(tableConfig, actualTables);
  result.tables = tablePositions.map(pos => ({ ...pos, type: 'table' as const }));
  result.summary.totalTables = result.tables.length;
  result.summary.tableSeats = result.tables.length * tableConfig.chairsPerTable;
  result.summary.totalSeats = result.summary.tableSeats;

  return result;
};

// Calculate single chair positions
const calculateSingleChairPositions = (
  tableConfig: TableConfig,
  chairCount: number
): Array<{ x: number; y: number; chairIndex: number; type: 'chair' }> => {
  const positions: Array<{ x: number; y: number; chairIndex: number; type: 'chair' }> = [];

  if (!tableConfig.singleChair) return positions;

  const chair = tableConfig.singleChair;
  const bounds = tableConfig.namedPoints
    ? getPolygonBounds(convertTableAreaToArray(tableConfig.namedPoints))
    : { minX: tableConfig.startX, maxX: tableConfig.endX, minY: tableConfig.startY, maxY: tableConfig.endY };

  const availableWidth = bounds.maxX - bounds.minX;
  const availableHeight = bounds.maxY - bounds.minY;

  const chairWidthWithSpacing = chair.width + chair.spacing;
  const chairHeightWithSpacing = chair.height + chair.spacing;

  // Calculate row spacing with group spacing (use chair-specific config)
  const rowsPerGroup = chair.rowsPerGroup || 999;
  const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  const maxColumnsAvailable = Math.floor(availableWidth / chairWidthWithSpacing);

  const groupBlockHeight = rowsPerGroup * chairHeightWithSpacing + rowGroupSpacing;
  const fullGroups = Math.floor(availableHeight / groupBlockHeight);
  const remainingHeight = availableHeight - fullGroups * groupBlockHeight;
  const extraRows = Math.floor(remainingHeight / chairHeightWithSpacing);
  let maxChairsPerColumn = fullGroups * rowsPerGroup + extraRows;

  if (maxChairsPerColumn % rowsPerGroup !== 0) {
    maxChairsPerColumn = Math.floor(maxChairsPerColumn / rowsPerGroup) * rowsPerGroup;
  }
  // Calculate how many complete columns we need
  const chairsPerCompleteColumn = maxChairsPerColumn;
  const completeChairColumns = Math.floor(chairCount / chairsPerCompleteColumn);
  const chairsInLastColumn = chairCount % chairsPerCompleteColumn;

  let chairIndex = 0;
  const totalColumnsToFill = completeChairColumns + (chairsInLastColumn > 0 ? 1 : 0);

  for (let col = 0; col < totalColumnsToFill && col < maxColumnsAvailable; col++) {
    const columnX = bounds.minX + (col * chairWidthWithSpacing);

    // Determine how many chairs to place in this column
    const chairsInThisColumn = (col < completeChairColumns)
      ? maxChairsPerColumn
      : chairsInLastColumn;

    for (let row = 0; row < chairsInThisColumn; row++) {
      const rowGroupNumber = Math.floor(row / rowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;

      const rowY = bounds.minY + (row * chairHeightWithSpacing) + extraRowGroupSpacing;

      if (columnX + chair.width <= bounds.maxX && rowY + chair.height <= bounds.maxY) {
        // Check if within polygon for 4-point areas
        if (tableConfig.namedPoints) {
          const chairCorners = [
            { x: columnX, y: rowY },
            { x: columnX + chair.width, y: rowY },
            { x: columnX, y: rowY + chair.height },
            { x: columnX + chair.width, y: rowY + chair.height }
          ];

          const allCornersInside = chairCorners.every(corner =>
            isPointInPolygon(corner, convertTableAreaToArray(tableConfig.namedPoints))
          );

          if (!allCornersInside) continue;
        }

        positions.push({
          x: columnX,
          y: rowY,
          chairIndex: chairIndex,
          type: 'chair'
        });
        chairIndex++;
      }
    }
  }

  return positions;
};

// Helper: Place tables with column limit (for smart mix with chairs)
const calculateTablePositionsWithColumnLimit = (
  tableConfig: TableConfig,
  maxColumns: number,
  rowsToFill: number
): Array<{ x: number; y: number; tableIndex: number }> => {
  const positions: Array<{ x: number; y: number; tableIndex: number }> = [];

  // Check if we have 4-point area definition
  if (tableConfig.namedPoints) {
    const polygon = convertTableAreaToArray(tableConfig.namedPoints);
    const bounds = getPolygonBounds(polygon);
    const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;

    // Row group spacing configuration (for VERTICAL spacing between row groups)
    const rowsPerGroup = tableConfig.rowsPerGroup || 999;
    const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;

    let tableIndex = 0;

    // Place tables in limited columns (left to right, filling vertically first)
    for (let col = 0; col < maxColumns; col++) {
      const columnX = bounds.minX + (col * (tableConfig.width + tableConfig.columnSpacing));

      for (let row = 0; row < rowsToFill; row++) {
        // Calculate extra VERTICAL spacing from row groups (adds vertical space after every N rows)
        const rowGroupNumber = Math.floor(row / rowsPerGroup);
        const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;

        const rowY = bounds.minY + (row * tableHeightWithSpacing) + extraRowGroupSpacing;

        if (columnX + tableConfig.width <= bounds.maxX &&
          rowY + tableConfig.height <= bounds.maxY) {

          // Check all corners are within polygon
          const tableCorners = [
            { x: columnX, y: rowY },
            { x: columnX + tableConfig.width, y: rowY },
            { x: columnX, y: rowY + tableConfig.height },
            { x: columnX + tableConfig.width, y: rowY + tableConfig.height }
          ];

          const allCornersInside = tableCorners.every(corner => isPointInPolygon(corner, polygon));

          if (allCornersInside) {
            positions.push({ x: columnX, y: rowY, tableIndex: tableIndex++ });
          }
        }
      }
    }

    return positions;
  }

  // Regular bounds (not polygon)
  const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;

  // Row group spacing configuration (for VERTICAL spacing between row groups)
  const rowsPerGroup = tableConfig.rowsPerGroup || 999;
  const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  let tableIndex = 0;

  for (let col = 0; col < maxColumns; col++) {
    const columnX = tableConfig.startX + (col * (tableConfig.width + tableConfig.columnSpacing));

    for (let row = 0; row < rowsToFill; row++) {
      // Calculate extra VERTICAL spacing from row groups (adds vertical space after every N rows)
      const rowGroupNumber = Math.floor(row / rowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;

      const rowY = tableConfig.startY + (row * tableHeightWithSpacing) + extraRowGroupSpacing;

      if (columnX + tableConfig.width <= tableConfig.endX &&
        rowY + tableConfig.height <= tableConfig.endY) {
        positions.push({ x: columnX, y: rowY, tableIndex: tableIndex++ });
      }
    }
  }

  return positions;
};

// Helper: Place chairs in specific columns (for smart mix with tables)
const calculateChairColumnsInSpace = (
  tableConfig: TableConfig,
  chairCount: number,
  startX: number,
  maxColumns: number,
  maxRows: number,
  maxChairsPerColumn: number
): Array<{ x: number; y: number; chairIndex: number; type: 'chair' }> => {
  const positions: Array<{ x: number; y: number; chairIndex: number; type: 'chair' }> = [];

  if (!tableConfig.singleChair) return positions;

  const chair = tableConfig.singleChair;
  const chairWidthWithSpacing = chair.width + chair.spacing;
  const chairHeightWithSpacing = chair.height + chair.spacing;

  const bounds = tableConfig.namedPoints
    ? getPolygonBounds(convertTableAreaToArray(tableConfig.namedPoints))
    : { minX: tableConfig.startX, maxX: tableConfig.endX, minY: tableConfig.startY, maxY: tableConfig.endY };

  // Calculate row spacing with group spacing (use chair-specific config)
  const rowsPerGroup = chair.rowsPerGroup || 999;
  const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  let chairIndex = 0;

  // Place chairs column by column (filling vertically first, then next column to the right)
  for (let col = 0; col < maxColumns && chairIndex < chairCount; col++) {
    const columnX = startX + (col * chairWidthWithSpacing);
    const chairsInThisColumn = Math.min(maxChairsPerColumn, chairCount - chairIndex);

    for (let row = 0; row < chairsInThisColumn; row++) {
      // Calculate extra VERTICAL spacing from row groups (adds vertical space after every N rows)
      const rowGroupNumber = Math.floor(row / rowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;

      const rowY = bounds.minY + (row * chairHeightWithSpacing) + extraRowGroupSpacing;

      if (columnX + chair.width <= bounds.maxX && rowY + chair.height <= bounds.maxY) {

        // Check polygon if needed
        if (tableConfig.namedPoints) {
          const chairCorners = [
            { x: columnX, y: rowY },
            { x: columnX + chair.width, y: rowY },
            { x: columnX, y: rowY + chair.height },
            { x: columnX + chair.width, y: rowY + chair.height }
          ];

          const allCornersInside = chairCorners.every(corner =>
            isPointInPolygon(corner, convertTableAreaToArray(tableConfig.namedPoints))
          );

          if (allCornersInside) {
            positions.push({
              x: columnX,
              y: rowY,
              chairIndex: chairIndex++,
              type: 'chair'
            });
          }
        } else {
          positions.push({
            x: columnX,
            y: rowY,
            chairIndex: chairIndex++,
            type: 'chair'
          });
        }
      }
    }
  }

  return positions;
};

export const calculateTablePositions = (
  tableConfig: TableConfig,
  tableCount: number
): Array<{ x: number; y: number; tableIndex: number }> => {
  const positions: Array<{ x: number; y: number; tableIndex: number }> = [];

  // Check if we have 4-point area definition
  if (tableConfig.namedPoints) {
    return calculateTablePositionsInPolygon(tableConfig, tableCount);
  }

  // Calculate available area dimensions
  const availableWidth = Math.abs(tableConfig.endX - tableConfig.startX);
  const availableHeight = Math.abs(tableConfig.endY - tableConfig.startY);

  // Table dimensions with spacing
  const tableWidthWithSpacing = tableConfig.width + tableConfig.tableSpacing;
  const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;

  // Calculate maximum tables that can fit vertically (in one column from top to bottom)
  const maxTablesPerColumn = Math.floor(availableHeight / tableHeightWithSpacing);

  // Calculate how many columns we need for all tables
  const columnsNeeded = Math.ceil(tableCount / maxTablesPerColumn);

  // Check if we have enough horizontal space
  const maxColumnsAvailable = Math.floor(availableWidth / (tableConfig.width + tableConfig.columnSpacing));
  const actualColumns = Math.min(columnsNeeded, maxColumnsAvailable);

  // Row group spacing configuration (for VERTICAL spacing between row groups)
  const rowsPerGroup = tableConfig.rowsPerGroup || 999; // Default: no grouping
  const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  // Arrange tables in columns (top to bottom FIRST, then next column)
  let tableIndex = 0;
  for (let col = 0; col < actualColumns && tableIndex < tableCount; col++) {
    const columnX = tableConfig.startX + (col * (tableConfig.width + tableConfig.columnSpacing));

    for (let row = 0; row < maxTablesPerColumn && tableIndex < tableCount; row++) {
      // Calculate extra VERTICAL spacing from row groups (adds vertical space after every N rows)
      const rowGroupNumber = Math.floor(row / rowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;

      const rowY = tableConfig.startY + (row * tableHeightWithSpacing) + extraRowGroupSpacing;

      // Check if position is within bounds
      if (columnX + tableConfig.width <= tableConfig.endX &&
        rowY + tableConfig.height <= tableConfig.endY) {
        positions.push({
          x: columnX,
          y: rowY,
          tableIndex: tableIndex
        });
        tableIndex++;
      } else {
        break; // Stop this column if we're out of bounds
      }
    }
  }

  return positions;
};
