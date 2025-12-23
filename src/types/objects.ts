export type HallObjectType = 'stage' | 'table' | 'chair';

export interface HallObject {
  id: string;
  type: HallObjectType;
  x: number; // X position on canvas (original DXF coordinate)
  y: number; // Y position on canvas (original DXF coordinate)
  updateX?: number; // Updated X position after door area spacing adjustments
  updateY?: number; // Updated Y position after door area spacing adjustments
  width: number;
  height: number;
  rotation?: number; // in degrees
  tableIndex?: number; // For table objects - which table in the arrangement
  chairIndex?: number; // For chair objects - which chair around the table
  parentTableId?: string; // For chair objects - reference to parent table
  fileName?: string; // DXF file path for rendering
  isSimpleStage?: boolean; // For stage objects - indicates if it's a simple rectangle stage
  glbWidth?: number;
  glbHeight?: number;
  glbDepth?: number;
}

export interface TableArrangement {
  tableConfigId: string;
  positions: Array<{ x: number; y: number; tableIndex: number }>;
  totalTables: number;
  totalChairs: number;
  totalGuests: number;
}