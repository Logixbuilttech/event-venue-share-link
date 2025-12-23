'use client';

import { create } from 'zustand';
import type { HallObject } from '@models/objects';
import type { TableConfig, DoorArea } from '@config/venues';
import { v4 as uuidv4 } from 'uuid';
import { calculateTableArrangement, clearTableArrangement, getTableArrangementStats } from '@utils/tableCalculator';

export interface FloorPlanBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface CameraPosition {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
}

interface HallState {
  objects: HallObject[];
  selectedObjectId: string | null;
  currentTableConfig: TableConfig | null;
  selectedTableArea: TableConfig | null;
  currentGuestCount: number;
  manualTableCount: number | null;
  manualChairCount: number | null;
  hoverCoordinates: { x: number; y: number } | null;
  customAreaPoints: Array<{ x: number; y: number }>;
  isSelectingCustomArea: boolean;
  floorPlanBounds: FloorPlanBounds | null;
  walkCameraPosition: CameraPosition | null;
  addObject: (obj: Omit<HallObject, 'id'>) => void;
  updateObject: (id: string, updates: Partial<HallObject>) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  duplicateObject: (id: string) => void;
  clearAll: () => void;
  setTableArrangement: (guestCount: number, tableConfig: TableConfig, doorAreas?: DoorArea[], is3D?: boolean) => void;
  clearTableArrangement: () => void;
  getTableStats: (guestCount?: number) => { tables: number; chairs: number; singleChairs: number; totalGuests: number };
  selectTableArea: (tableArea: TableConfig | null) => void;
  setSeatingMode: (mode: 'auto' | 'tables-only' | 'chairs-only') => void;
  setManualTableCount: (count: number | null) => void;
  setManualChairCount: (count: number | null) => void;
  setHoverCoordinates: (coordinates: { x: number; y: number } | null) => void;
  startCustomAreaSelection: () => void;
  addCustomAreaPoint: (point: { x: number; y: number }) => void;
  finishCustomAreaSelection: () => void;
  clearCustomAreaSelection: () => void;
  addStage: (stageConfig: any) => void;
  updateStage: (stageId: string, updates: Partial<HallObject>) => void;
  removeStage: (stageId: string) => void;
  clearStages: () => void;
  setFloorPlanBounds: (bounds: FloorPlanBounds) => void;
  setWalkCameraPosition: (position: CameraPosition | null) => void;
}

export const useHallStore = create<HallState>((set, get) => ({
  objects: [],
  selectedObjectId: null,
  currentTableConfig: null,
  selectedTableArea: null,
  currentGuestCount: 0,
  manualTableCount: null,
  manualChairCount: null,
  hoverCoordinates: null,
  customAreaPoints: [],
  isSelectingCustomArea: false,
  floorPlanBounds: null,
  walkCameraPosition: null,

  addObject: (obj) =>
    set((state) => ({
      objects: [...state.objects, { ...obj, id: uuidv4() }],
    })),

  updateObject: (id, updates) =>
    set((state) => ({
      objects: state.objects.map((obj) =>
        obj.id === id ? { ...obj, ...updates } : obj
      ),
    })),

  removeObject: (id) =>
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId,
    })),

  selectObject: (id) => set({ selectedObjectId: id }),

  duplicateObject: (id) => {
    const { objects } = get();
    const objToDuplicate = objects.find((obj) => obj.id === id);
    if (objToDuplicate) {
      const duplicated: HallObject = {
        ...objToDuplicate,
        id: uuidv4(),
        x: objToDuplicate.x + 5,
        y: objToDuplicate.y + 5,
      };
      set((state) => ({ objects: [...state.objects, duplicated] }));
    }
  },

  clearAll: () => set({ objects: [], selectedObjectId: null, currentTableConfig: null }),

  setTableArrangement: (guestCount, tableConfig, doorAreas = [], is3D = false) => {
    const { objects } = get();
    
    // Clear existing table arrangement
    const objectsWithoutTables = clearTableArrangement(objects);
    
    // Calculate new table arrangement with door area exclusion
    // Pass existing objects so we can preserve x/y coordinates for 3D view
    const result = calculateTableArrangement(guestCount, tableConfig, undefined, doorAreas, is3D, objects);
    console.log('result :>> ', result);
    set({
      objects: [...objectsWithoutTables, ...result.objects],
      currentTableConfig: tableConfig,
      currentGuestCount: guestCount
    });
  },

  clearTableArrangement: () => {
    const { objects } = get();
    const objectsWithoutTables = clearTableArrangement(objects);
    set({
      objects: objectsWithoutTables,
      currentTableConfig: null
    });
  },

  getTableStats: (guestCount?: number) => {
    const { objects, currentTableConfig } = get();
    return getTableArrangementStats(objects, currentTableConfig || undefined, guestCount);
  },

  selectTableArea: (tableArea) => set({ selectedTableArea: tableArea }),

  setSeatingMode: (mode) => {
    const { selectedTableArea, currentGuestCount } = get();    
    // Reset manual counts when changing mode
    set({ manualTableCount: null, manualChairCount: null });
    
    // Update the seating mode on the current selected table area
    if (selectedTableArea && currentGuestCount > 0) {
      const updatedTableArea = {
        ...selectedTableArea,
        seatingMode: mode
      };
            
      // Clear existing table arrangement
      const { objects } = get();
      const objectsWithoutTables = clearTableArrangement(objects);
      
      // Recalculate with new seating mode
      const result = calculateTableArrangement(currentGuestCount, updatedTableArea);
      set({
        objects: [...objectsWithoutTables, ...result.objects],
        selectedTableArea: updatedTableArea,
        currentTableConfig: updatedTableArea
      });
    } else if (selectedTableArea) {
      // Just update the mode without recalculating if no guests yet
      set({
        selectedTableArea: {
          ...selectedTableArea,
          seatingMode: mode
        }
      });
    } else {
      console.warn('No table area selected');
    }
  },

  setManualTableCount: (count) => {
    const { selectedTableArea, currentGuestCount } = get();
    
    if (!selectedTableArea || currentGuestCount <= 0) return;
    
    set({ manualTableCount: count });
    
    // If count is set, recalculate chairs to match total guests
    if (count !== null && selectedTableArea.singleChair) {
      const tableSeats = count * selectedTableArea.chairsPerTable;
      const chairsNeeded = Math.max(0, currentGuestCount - tableSeats);
      set({ manualChairCount: chairsNeeded });

    }
  },

  setManualChairCount: (count) => {
    const { selectedTableArea, currentGuestCount } = get();
    
    if (!selectedTableArea || currentGuestCount <= 0) return;
    
    set({ manualChairCount: count });
    
    // If count is set, recalculate tables to match total guests
    if (count !== null) {
      const chairSeats = count;
      const tablesNeeded = Math.ceil(Math.max(0, currentGuestCount - chairSeats) / selectedTableArea.chairsPerTable);
      set({ manualTableCount: tablesNeeded });
    }
  },

  setHoverCoordinates: (coordinates) => set({ hoverCoordinates: coordinates }),

  startCustomAreaSelection: () => set({ 
    isSelectingCustomArea: true, 
    customAreaPoints: [],
    selectedTableArea: null 
  }),

  addCustomAreaPoint: (point) => set((state) => {
    const newPoints = [...state.customAreaPoints, point];
    
    if (newPoints.length === 4) {
      // Calculate area bounds from 4 points for fallback
      const xs = newPoints.map(p => p.x);
      const ys = newPoints.map(p => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      const customArea: TableConfig = {
        id: 'custom-area',
        name: 'Custom Area',
        fileName: 'table_set.dxf',
        width: 72,
        height: 72,
        chairsPerTable: 8,
        chairSpacing: 0.2,
        tableSpacing: 2.0,
        columns: 2,
        columnSpacing: 3.0,
        startX: minX,
        startY: minY,
        endX: maxX,
        endY: maxY,
        namedPoints: {
          topLeft: newPoints[0],
          topRight: newPoints[1],
          bottomRight: newPoints[2],
          bottomLeft: newPoints[3]
        },
        points: newPoints, // Store the exact 4 points
        maxTablesPerRow: 6,
        maxCapacity: 1000
      };
      
      return {
        customAreaPoints: newPoints,
        isSelectingCustomArea: false,
        selectedTableArea: customArea
      };
    }
    return { customAreaPoints: newPoints };
  }),

  finishCustomAreaSelection: () => set({ isSelectingCustomArea: false }),

  clearCustomAreaSelection: () => set({ 
    customAreaPoints: [], 
    isSelectingCustomArea: false,
    selectedTableArea: null 
  }),

  addStage: (stageConfig) => {
    const { objects } = get();
    
    // Remove existing stages first
    const objectsWithoutStages = objects.filter(obj => obj.type !== 'stage');
    
    // Create stage object
    // For simple stages, use customWidth/customHeight directly
    // For DXF stages, use width/height if specified, otherwise fallback to custom dimensions
    const stageObject: HallObject = {
      id: stageConfig.id,
      type: 'stage',
      x: stageConfig.x,
      y: stageConfig.y,
      width: stageConfig.width || stageConfig.customWidth || 200,
      height: stageConfig.height || stageConfig.customHeight || 100,
      rotation: stageConfig.rotation || 0,
      fileName: stageConfig.fileName,
      ...(stageConfig.isSimpleStage && { isSimpleStage: stageConfig.isSimpleStage }) // Pass through the simple stage flag conditionally
    };
    
    set({ objects: [...objectsWithoutStages, stageObject] });
  },

  updateStage: (stageId, updates) => {
    const { objects } = get();
    const updatedObjects = objects.map(obj => 
      obj.id === stageId && obj.type === 'stage' 
        ? { ...obj, ...updates }
        : obj
    );
    set({ objects: updatedObjects });
  },

  removeStage: (stageId) => {
    const { objects } = get();
    const updatedObjects = objects.filter(obj => !(obj.id === stageId && obj.type === 'stage'));
    set({ objects: updatedObjects });
  },

  clearStages: () => {
    const { objects } = get();
    const objectsWithoutStages = objects.filter(obj => obj.type !== 'stage');
    set({ objects: objectsWithoutStages });
  },

  setFloorPlanBounds: (bounds) => set({ floorPlanBounds: bounds }),
  
  setWalkCameraPosition: (position) => set({ walkCameraPosition: position }),
}));
