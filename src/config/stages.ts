export interface StageWorldCoordinate {
  x: number;
  y: number;
  z: number;
}

export interface StageConfig {
  id: string;
  name: string;
  fileName: string;
  glbFileName?: string; // Optional GLB file for 3D rendering
  glbRotation?: number; // Rotation of the GLB model in degrees
  x: number;
  y: number;
  width?: number; // Auto-calculated from DXF if not provided
  height?: number; // Auto-calculated from DXF if not provided
  depth?: number; // Depth/thickness of the stage for 3D rendering
  rotation?: number; // Rotation in degrees
  description?: string;
  isCustom?: boolean; // Flag to indicate if this is a custom stage
  isSimpleStage?: boolean; // Flag to indicate if this is a simple rectangle stage (no DXF file)
  customWidth?: number; // Custom width for custom stages
  customHeight?: number; // Custom height for custom stages
  customFile?: File; // Custom DXF file uploaded by the user
  customFilePath?: string; // Path to the custom DXF file
  worldPosition?: StageWorldCoordinate; // Optional 3D world position (overrides x, y for 3D rendering)
  backstageDepth?: number; // Depth of backstage area in feet
  backstageSide?: 'left' | 'right' | 'top' | 'bottom'; // Side where backstage is located
}

export const predefinedStages: StageConfig[] = [
  {
    id: 'infinity-toifa-stage',
    name: 'Toifa Stage',
    fileName: 'toifa_stage.dxf',
    glbFileName: 'toifa_stage-opt.glb', // 3D model file
    glbRotation: 0, // Additional rotation for the GLB model if needed
    depth: 100, // Depth for 3D rendering
    x: 950,
    y: 1520,
    rotation: 90,
    width: 1140,
    description: 'Special Toifa stage design for Infinity Ballroom'
  },
  {
    id: 'custom-stage',
    name: 'Custom Stage',
    fileName: 'stage.dxf',
    x: 832,
    y: 1520,
    rotation: 0,
    isCustom: true,
    customWidth: 200,
    customHeight: 100,
    description: 'Custom stage with user-defined dimensions'
  }
];

export const getStageConfig = (stageId: string): StageConfig | undefined => {
  return predefinedStages.find(stage => stage.id === stageId);
};
