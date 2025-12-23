import { v4 as uuidv4 } from 'uuid';
import type { HallObject } from '@models/objects';
import type { TableConfig, TableCalculationSettings, DoorArea } from '@config/venues';
import { defaultTableSettings } from '@config/venues';
import { isObjectInAnyDoorArea, getDoorAreaBounds } from './doorAreaUtils';

export interface TableCalculationResult {
  objects: HallObject[];
  arrangement: {
    tableConfigId: string;
    totalTables: number;
    totalChairs: number;
    totalSingleChairs: number;
    totalGuests: number;
    tableFileName: string;
    chairFileName?: string;
    singleChairFileName?: string;
  };
}

// Helper to get polygon bounds
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

const convertTableAreaToArray = (points: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomRight: { x: number; y: number }; bottomLeft: { x: number; y: number } }): Array<{ x: number; y: number }> => {
  return [
    points.topLeft,
    points.topRight,
    points.bottomRight,
    points.bottomLeft
  ];
};

// Place tables only (mode: tables-only) with smart door handling
function placeTablesOnly(
  targetGuestCount: number,
  tableConfig: TableConfig,
  doorAreas: DoorArea[]
): {
  tables: Array<{ x: number; y: number; tableIndex: number }>;
  chairs: Array<{ x: number; y: number; chairIndex: number }>;
  actualGuests: number;
} {
  const result = {
    tables: [] as Array<{ x: number; y: number; tableIndex: number }>,
    chairs: [] as Array<{ x: number; y: number; chairIndex: number }>,
    actualGuests: 0
  };

  const bounds = tableConfig.namedPoints
    ? getPolygonBounds(convertTableAreaToArray(tableConfig.namedPoints))
    : { minX: tableConfig.startX, maxX: tableConfig.endX, minY: tableConfig.startY, maxY: tableConfig.endY };

  const tableWidthWithSpacing = tableConfig.width + tableConfig.columnSpacing;
  const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;

  const rowsPerGroup = tableConfig.rowsPerGroup || 999;
  const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;
  const maxTablesPerColumn = Math.floor((bounds.maxY - bounds.minY) / tableHeightWithSpacing);

  let currentGuests = 0;
  let tableIndex = 0;
  let currentX = bounds.minX;

  // Place tables until we match guest count (or run out of space)
  while (currentGuests < targetGuestCount && currentX + tableConfig.width <= bounds.maxX) {
    // Check if this column would overlap with any door area (use original 2D coordinates)
    const columnOverlapsDoor = doorAreas.some(door => {
      const doorBounds = getDoorAreaBounds(door);
      return currentX < doorBounds.maxX && (currentX + tableConfig.width) > doorBounds.minX;
    });

    if (columnOverlapsDoor) {
      // Find the rightmost edge of overlapping doors and jump past it
      // Add spacing to maintain layout structure
      let maxDoorEndX = currentX;
      doorAreas.forEach(door => {
        const doorBounds = getDoorAreaBounds(door);
        if (currentX < doorBounds.maxX && (currentX + tableConfig.width) > doorBounds.minX) {
          maxDoorEndX = Math.max(maxDoorEndX, doorBounds.maxX);
        }
      });
      currentX = maxDoorEndX + tableConfig.tableSpacing;
      continue;
    }

    // Place tables in this column
    for (let row = 0; row < maxTablesPerColumn && currentGuests < targetGuestCount; row++) {
      const rowGroupNumber = Math.floor(row / rowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;
      const rowY = bounds.minY + (row * tableHeightWithSpacing) + extraRowGroupSpacing;

      if (rowY + tableConfig.height <= bounds.maxY) {
        const tableObject = {
          x: currentX,
          y: rowY,
          width: tableConfig.width,
          height: tableConfig.height,
          rotation: 0
        };

        if (!isObjectInAnyDoorArea(tableObject, doorAreas)) {
          result.tables.push({ x: currentX, y: rowY, tableIndex: tableIndex++ });
          currentGuests += tableConfig.chairsPerTable;
        }
      }
    }

    currentX += tableWidthWithSpacing;
  }

  result.actualGuests = currentGuests;
  return result;
}

// Place chairs only (mode: chairs-only) with smart door handling
function placeChairsOnly(
  targetGuestCount: number,
  tableConfig: TableConfig,
  doorAreas: DoorArea[]
): {
  tables: Array<{ x: number; y: number; tableIndex: number }>;
  chairs: Array<{ x: number; y: number; chairIndex: number }>;
  actualGuests: number;
} {
  const result = {
    tables: [] as Array<{ x: number; y: number; tableIndex: number }>,
    chairs: [] as Array<{ x: number; y: number; chairIndex: number }>,
    actualGuests: 0
  };

  if (!tableConfig.singleChair) {
    console.warn('⚠️ No single chair config available for chairs-only mode');
    return result;
  }

  const chair = tableConfig.singleChair;
  const bounds = tableConfig.namedPoints
    ? getPolygonBounds(convertTableAreaToArray(tableConfig.namedPoints))
    : { minX: tableConfig.startX, maxX: tableConfig.endX, minY: tableConfig.startY, maxY: tableConfig.endY };

  const chairWidthWithSpacing = chair.width + chair.spacing;
  const chairHeightWithSpacing = chair.height + chair.spacing;
  const availableHeight = bounds.maxY - bounds.minY;

  const chairRowsPerGroup = chair.rowsPerGroup || 999;
  const chairRowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  const chairGroupBlockHeight = chairRowsPerGroup * chairHeightWithSpacing + chairRowGroupSpacing;
  const chairFullGroups = Math.floor(availableHeight / chairGroupBlockHeight);
  const chairRemainingHeight = availableHeight - chairFullGroups * chairGroupBlockHeight;
  const chairExtraRows = Math.floor(chairRemainingHeight / chairHeightWithSpacing);
  let maxChairsPerColumn = chairFullGroups * chairRowsPerGroup + chairExtraRows;

  if (maxChairsPerColumn % chairRowsPerGroup !== 0) {
    maxChairsPerColumn = Math.floor(maxChairsPerColumn / chairRowsPerGroup) * chairRowsPerGroup;
  }

  let currentGuests = 0;
  let chairIndex = 0;
  let currentX = bounds.minX;

  // Place chairs until we match guest count (or run out of space)
  while (currentGuests < targetGuestCount && currentX + chair.width <= bounds.maxX) {
    // Check if this column would overlap with any door area (use original 2D coordinates)
    const columnOverlapsDoor = doorAreas.some(door => {
      const doorBounds = getDoorAreaBounds(door);
      return currentX < doorBounds.maxX && (currentX + chair.width) > doorBounds.minX;
    });

    if (columnOverlapsDoor) {
      // Find the rightmost edge of overlapping doors and jump past it
      // Add spacing to maintain layout structure
      let maxDoorEndX = currentX;
      doorAreas.forEach(door => {
        const doorBounds = getDoorAreaBounds(door);
        if (currentX < doorBounds.maxX && (currentX + chair.width) > doorBounds.minX) {
          maxDoorEndX = Math.max(maxDoorEndX, doorBounds.maxX);
        }
      });
      // Use chair spacing from config when jumping past doors
      currentX = maxDoorEndX + chair.spacing;
      continue;
    }

    // Place chairs in this column
    for (let row = 0; row < maxChairsPerColumn && currentGuests < targetGuestCount; row++) {
      const rowGroupNumber = Math.floor(row / chairRowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * chairRowGroupSpacing;
      const rowY = bounds.minY + (row * chairHeightWithSpacing) + extraRowGroupSpacing;

      if (rowY + chair.height <= bounds.maxY) {
        const chairObject = {
          x: currentX,
          y: rowY,
          width: chair.width,
          height: chair.height,
          rotation: chair.rotation || 0
        };

        if (!isObjectInAnyDoorArea(chairObject, doorAreas)) {
          result.chairs.push({ x: currentX, y: rowY, chairIndex: chairIndex++ });
          currentGuests++;
        }
      }
    }

    // Use chair spacing from config for regular column advancement
    currentX += chairWidthWithSpacing;
  }

  result.actualGuests = currentGuests;
  return result;
}

// Smart mix: optimize arrangement to match guest count (mode: auto/smart-mix)
function placeSmartMix(
  targetGuestCount: number,
  tableConfig: TableConfig,
  doorAreas: DoorArea[]
): {
  tables: Array<{ x: number; y: number; tableIndex: number }>;
  chairs: Array<{ x: number; y: number; chairIndex: number }>;
  actualGuests: number;
} {
  const bounds = tableConfig.namedPoints
    ? getPolygonBounds(convertTableAreaToArray(tableConfig.namedPoints))
    : { minX: tableConfig.startX, maxX: tableConfig.endX, minY: tableConfig.startY, maxY: tableConfig.endY };

  const tableWidthWithSpacing = tableConfig.width + tableConfig.columnSpacing;
  const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;
  const availableWidth = bounds.maxX - bounds.minX;
  const availableHeight = bounds.maxY - bounds.minY;

  const rowsPerGroup = tableConfig.rowsPerGroup || 999;
  const rowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  const maxTablesPerColumn = Math.floor(availableHeight / tableHeightWithSpacing);
  const maxColumnsAvailable = Math.floor(availableWidth / tableWidthWithSpacing);

  // Calculate chair metrics
  let maxChairsPerColumn = 0;
  let chairWidthWithSpacing = 0;
  if (tableConfig.singleChair) {
    const chair = tableConfig.singleChair;
    chairWidthWithSpacing = chair.width + chair.spacing;
    const chairHeightWithSpacing = chair.height + chair.spacing;
    const chairRowsPerGroup = chair.rowsPerGroup || 999;
    const chairRowGroupSpacing = tableConfig.rowGroupSpacing || 0;
    const chairGroupBlockHeight = chairRowsPerGroup * chairHeightWithSpacing + chairRowGroupSpacing;
    const chairFullGroups = Math.floor(availableHeight / chairGroupBlockHeight);
    const chairRemainingHeight = availableHeight - chairFullGroups * chairGroupBlockHeight;
    const chairExtraRows = Math.floor(chairRemainingHeight / chairHeightWithSpacing);
    maxChairsPerColumn = chairFullGroups * chairRowsPerGroup + chairExtraRows;
    if (maxChairsPerColumn % chairRowsPerGroup !== 0) {
      maxChairsPerColumn = Math.floor(maxChairsPerColumn / chairRowsPerGroup) * chairRowsPerGroup;
    }
  }

  const seatsPerTableColumn = maxTablesPerColumn * tableConfig.chairsPerTable;
  const seatsPerChairColumn = maxChairsPerColumn;

  let bestSolution = {
    tables: [] as Array<{ x: number; y: number; tableIndex: number }>,
    chairs: [] as Array<{ x: number; y: number; chairIndex: number }>,
    actualGuests: 0,
    gap: Infinity
  };

  // Try different combinations of table columns and chair columns
  for (let tableColumns = maxColumnsAvailable; tableColumns >= 0; tableColumns--) {
    // Calculate guests from tables
    const tableGuests = placeTablesInColumns(tableColumns, tableConfig, doorAreas, bounds, maxTablesPerColumn, rowsPerGroup, rowGroupSpacing);
    const remainingGuests = targetGuestCount - tableGuests.actualGuests;

    if (remainingGuests <= 0) {
      // Tables alone are sufficient
      const gap = Math.abs(tableGuests.actualGuests - targetGuestCount);
      if (gap < bestSolution.gap) {
        bestSolution = { 
          tables: tableGuests.tables,
          chairs: [],
          actualGuests: tableGuests.actualGuests,
          gap 
        };
      }
      continue;
    }

    // Need chairs for remaining guests
    if (tableConfig.singleChair) {
      // Calculate chair start position based on actual rightmost table position
      let chairStartX = bounds.minX;
      if (tableGuests.tables.length > 0) {
        // Find the rightmost table
        const rightmostTableX = Math.max(...tableGuests.tables.map(t => t.x));
        // Chairs start after the table width + proper spacing between tables and chairs
        chairStartX = rightmostTableX + tableConfig.width + Math.max(tableConfig.columnSpacing, tableConfig.singleChair.spacing * 2);
      }
      
      const spaceForChairs = bounds.maxX - chairStartX;
      const maxChairColumnsThatFit = Math.floor(spaceForChairs / chairWidthWithSpacing);
      const chairColumnsNeeded = Math.ceil(remainingGuests / seatsPerChairColumn);

      // Place as many chairs as possible, even if it's less than needed
      const chairColumnsToPlace = Math.min(chairColumnsNeeded, maxChairColumnsThatFit);
      
      if (chairColumnsToPlace > 0) {
        const chairGuests = placeChairsInColumns(chairColumnsToPlace, remainingGuests, tableConfig, doorAreas, bounds, maxChairsPerColumn, chairStartX);
        
        const totalGuests = tableGuests.actualGuests + chairGuests.actualGuests;
        const gap = Math.abs(totalGuests - targetGuestCount);

        if (gap < bestSolution.gap || bestSolution.actualGuests < totalGuests) {
          bestSolution = {
            tables: tableGuests.tables,
            chairs: chairGuests.chairs,
            actualGuests: totalGuests,
            gap
          };
        }

        // If we matched exactly or got very close, stop
        if (totalGuests >= targetGuestCount && gap <= tableConfig.chairsPerTable) {
          break;
        }
      } else {
        // Can't fit any more chairs, but track this solution if it's better
        if (tableGuests.actualGuests > bestSolution.actualGuests) {
          bestSolution = {
            tables: tableGuests.tables,
            chairs: [],
            actualGuests: tableGuests.actualGuests,
            gap: Math.abs(tableGuests.actualGuests - targetGuestCount)
          };
        }
      }
    }
  }

  // If no solution found (shouldn't happen), try all tables as fallback
  if (bestSolution.actualGuests === 0 && maxColumnsAvailable > 0) {
    const fallbackTableGuests = placeTablesInColumns(maxColumnsAvailable, tableConfig, doorAreas, bounds, maxTablesPerColumn, rowsPerGroup, rowGroupSpacing);
    bestSolution = {
      tables: fallbackTableGuests.tables,
      chairs: [],
      actualGuests: fallbackTableGuests.actualGuests,
      gap: Math.abs(fallbackTableGuests.actualGuests - targetGuestCount)
    };
  }

  return bestSolution;
}

// Helper: Place tables in specified number of columns with smart door area handling
function placeTablesInColumns(
  numColumns: number,
  tableConfig: TableConfig,
  doorAreas: DoorArea[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  maxTablesPerColumn: number,
  rowsPerGroup: number,
  rowGroupSpacing: number
): {
  tables: Array<{ x: number; y: number; tableIndex: number }>;
  actualGuests: number;
} {
  const tables: Array<{ x: number; y: number; tableIndex: number }> = [];
  const tableWidthWithSpacing = tableConfig.width + tableConfig.columnSpacing;
  const tableHeightWithSpacing = tableConfig.height + tableConfig.tableSpacing;
  let tableIndex = 0;

  let currentX = bounds.minX;
  let columnsPlaced = 0;

  while (columnsPlaced < numColumns && currentX + tableConfig.width <= bounds.maxX) {
    // Check if this column would overlap with any door area (use original 2D coordinates)
    const columnOverlapsDoor = doorAreas.some(door => {
      const doorBounds = getDoorAreaBounds(door);
      
      // Check if column overlaps door horizontally
      return currentX < doorBounds.maxX && (currentX + tableConfig.width) > doorBounds.minX;
    });

    if (columnOverlapsDoor) {
      // Find the rightmost edge of overlapping doors
      let maxDoorEndX = currentX;
      doorAreas.forEach(door => {
        const doorBounds = getDoorAreaBounds(door);
        
        if (currentX < doorBounds.maxX && (currentX + tableConfig.width) > doorBounds.minX) {
          maxDoorEndX = Math.max(maxDoorEndX, doorBounds.maxX);
        }
      });
      
      // Move to right after the door area (add spacing to maintain layout structure)
      currentX = maxDoorEndX + tableConfig.tableSpacing;
      continue;
    }

    // Place tables in this column
    for (let row = 0; row < maxTablesPerColumn; row++) {
      const rowGroupNumber = Math.floor(row / rowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * rowGroupSpacing;
      const rowY = bounds.minY + (row * tableHeightWithSpacing) + extraRowGroupSpacing;

      if (currentX + tableConfig.width <= bounds.maxX &&
          rowY + tableConfig.height <= bounds.maxY) {
        
        const tableObject = {
          x: currentX,
          y: rowY,
          width: tableConfig.width,
          height: tableConfig.height,
          rotation: 0
        };

        if (!isObjectInAnyDoorArea(tableObject, doorAreas)) {
          tables.push({ x: currentX, y: rowY, tableIndex: tableIndex++ });
        }
      }
    }

    columnsPlaced++;
    currentX += tableWidthWithSpacing;
  }

  return {
    tables,
    actualGuests: tables.length * tableConfig.chairsPerTable
  };
}

// Helper: Place chairs in specified number of columns with smart door area handling
function placeChairsInColumns(
  numColumns: number,
  maxGuests: number,
  tableConfig: TableConfig,
  doorAreas: DoorArea[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  maxChairsPerColumn: number,
  startX: number
): {
  chairs: Array<{ x: number; y: number; chairIndex: number }>;
  actualGuests: number;
} {
  const chairs: Array<{ x: number; y: number; chairIndex: number }> = [];
  
  if (!tableConfig.singleChair) return { chairs, actualGuests: 0 };

  const chair = tableConfig.singleChair;
  const chairWidthWithSpacing = chair.width + chair.spacing;
  const chairHeightWithSpacing = chair.height + chair.spacing;
  const chairRowsPerGroup = chair.rowsPerGroup || 999;
  const chairRowGroupSpacing = tableConfig.rowGroupSpacing || 0;

  let chairIndex = 0;
  let currentGuests = 0;
  let currentX = startX;
  let columnsPlaced = 0;

  while (columnsPlaced < numColumns && currentGuests < maxGuests && currentX + chair.width <= bounds.maxX) {
    // Check if this column would overlap with any door area (use original 2D coordinates)
    const columnOverlapsDoor = doorAreas.some(door => {
      const doorBounds = getDoorAreaBounds(door);
      
      return currentX < doorBounds.maxX && (currentX + chair.width) > doorBounds.minX;
    });

    if (columnOverlapsDoor) {
      // Find the rightmost edge of overlapping doors
      let maxDoorEndX = currentX;
      doorAreas.forEach(door => {
        const doorBounds = getDoorAreaBounds(door);
        
        if (currentX < doorBounds.maxX && (currentX + chair.width) > doorBounds.minX) {
          maxDoorEndX = Math.max(maxDoorEndX, doorBounds.maxX);
        }
      });
      
      // Move to right after the door area (add spacing to maintain layout structure)
      currentX = maxDoorEndX + chair.spacing;
      continue;
    }

    // Place chairs in this column
    for (let row = 0; row < maxChairsPerColumn && currentGuests < maxGuests; row++) {
      const rowGroupNumber = Math.floor(row / chairRowsPerGroup);
      const extraRowGroupSpacing = rowGroupNumber * chairRowGroupSpacing;
      const rowY = bounds.minY + (row * chairHeightWithSpacing) + extraRowGroupSpacing;

      if (currentX + chair.width <= bounds.maxX &&
          rowY + chair.height <= bounds.maxY) {
        
        const chairObject = {
          x: currentX,
          y: rowY,
          width: chair.width,
          height: chair.height,
          rotation: chair.rotation || 0
        };

        if (!isObjectInAnyDoorArea(chairObject, doorAreas)) {
          chairs.push({ x: currentX, y: rowY, chairIndex: chairIndex++ });
          currentGuests++;
        }
      }
    }

    columnsPlaced++;
    currentX += chairWidthWithSpacing;
  }

  return { chairs, actualGuests: currentGuests };
}

export const calculateTableArrangement = (
  guestCount: number,
  tableConfig: TableConfig,
  settings: TableCalculationSettings = defaultTableSettings,
  doorAreas: DoorArea[] = [],
  is3D = false,
  existingObjects: HallObject[] = []
): TableCalculationResult => {
  // If no guests, return empty arrangement
  if (guestCount <= 0) {
    return {
      objects: [],
      arrangement: {
        tableConfigId: tableConfig.id,
        totalTables: 0,
        totalChairs: 0,
        totalSingleChairs: 0,
        totalGuests: 0,
        tableFileName: tableConfig.fileName,
        chairFileName: tableConfig.chairFileName,
        singleChairFileName: tableConfig.singleChair?.fileName
      }
    };
  }

  const seatingMode = tableConfig.seatingMode || 'auto';
  const allObjects = existingObjects;
  
  let seatingResult: {
    tables: Array<{ x: number; y: number; tableIndex: number }>;
    chairs: Array<{ x: number; y: number; chairIndex: number }>;
    actualGuests: number;
  };

  // Choose calculation method based on seating mode
  if (seatingMode === 'tables-only') {
    seatingResult = placeTablesOnly(guestCount, tableConfig, doorAreas);
  } else if (seatingMode === 'chairs-only') {
    seatingResult = placeChairsOnly(guestCount, tableConfig, doorAreas);
    } else {
    // Smart Mix mode (auto)
    seatingResult = placeSmartMix(guestCount, tableConfig, doorAreas);
  }

  // Generate HallObject objects
  const objects: HallObject[] = [];

  // Add tables
  seatingResult.tables.forEach((table) => {
      objects.push({
        id: uuidv4(),
        type: 'table',
        x: is3D ? allObjects.find(obj => obj.type === 'table' && obj.tableIndex === table.tableIndex)?.x || table.x : table.x,
        y: is3D ? allObjects.find(obj => obj.type === 'table' && obj.tableIndex === table.tableIndex)?.y || table.y : table.y,
        updateX: table.x,
        updateY: table.y,
        width: tableConfig.width,
        height: tableConfig.height,
      tableIndex: table.tableIndex,
        rotation: 0,
        fileName: tableConfig.fileName,
        ...(tableConfig.glbWidth !== undefined && { glbWidth: tableConfig.glbWidth }),
        ...(tableConfig.glbHeight !== undefined && { glbHeight: tableConfig.glbHeight }),
        ...(tableConfig.glbDepth !== undefined && { glbDepth: tableConfig.glbDepth })
      });
    });

  // Add chairs
  seatingResult.chairs.forEach((chair) => {
      if (tableConfig.singleChair) {
        objects.push({
          id: uuidv4(),
          type: 'chair',
          x: is3D ? allObjects.find(obj => obj.type === 'chair' && obj.tableIndex === chair.chairIndex)?.x || chair.x : chair.x,
          y: is3D ? allObjects.find(obj => obj.type === 'chair' && obj.tableIndex === chair.chairIndex)?.y || chair.y : chair.y,
          updateX: chair.x,
          updateY: chair.y,
          width: tableConfig.singleChair.width,
          height: tableConfig.singleChair.height,
        tableIndex: chair.chairIndex,
          rotation: tableConfig.singleChair.rotation || 0,
          fileName: tableConfig.singleChair.fileName,
          ...(tableConfig.singleChair.glbWidth !== undefined && { glbWidth: tableConfig.singleChair.glbWidth }),
          ...(tableConfig.singleChair.glbHeight !== undefined && { glbHeight: tableConfig.singleChair.glbHeight }),
          ...(tableConfig.singleChair.glbDepth !== undefined && { glbDepth: tableConfig.singleChair.glbDepth })
        });
      }
    });

  const totalTables = seatingResult.tables.length;
  const totalChairs = seatingResult.chairs.length;
  const tableSeats = totalTables * tableConfig.chairsPerTable;

  return {
    objects,
    arrangement: {
      tableConfigId: tableConfig.id,
      totalTables,
      totalChairs: tableSeats,
      totalSingleChairs: totalChairs,
      totalGuests: seatingResult.actualGuests,
      tableFileName: tableConfig.fileName,
      chairFileName: tableConfig.chairFileName,
      singleChairFileName: tableConfig.singleChair?.fileName
    }
  };
};

export const clearTableArrangement = (objects: HallObject[]): HallObject[] => {
  return objects.filter(obj => obj.type !== 'table' && obj.type !== 'chair');
};

export const getTableArrangementStats = (objects: HallObject[], tableConfig?: TableConfig, guestCount?: number): {
  tables: number;
  chairs: number;
  singleChairs: number;
  totalGuests: number;
} => {
  // Count actual placed objects
  const tables = objects.filter(obj => obj.type === 'table').length;
  const singleChairs = objects.filter(obj => obj.type === 'chair').length;

  // Since table_set.dxf includes chairs, calculate chairs based on actual table count
  const chairsPerTable = tableConfig?.chairsPerTable || 8;
  const chairsAtTables = tables * chairsPerTable;
  const totalGuests = chairsAtTables + singleChairs;

  return {
    tables,
    chairs: chairsAtTables,
    singleChairs,
    totalGuests
  };
};
