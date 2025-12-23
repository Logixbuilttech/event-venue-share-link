import { loadDXFWithDeduplication } from '@utils/advancedDxfRenderer';
import type { StageConfig } from '@config/stages';

/**
 * Helper function to get DXF data for stage calculations
 * This makes it easy to get DXF data for stage table positioning
 */
export const getStageDXFData = async (stage: StageConfig, floorPlanFileName: string) => {
  try {
    const [floorPlanDxf, stageDxf] = await Promise.all([
      loadDXFWithDeduplication(`/${floorPlanFileName}`),
      loadDXFWithDeduplication(`/${stage.fileName}`)
    ]);
    
    return {
      floorPlanDxf,
      stageDxf,
      dxfUnits: floorPlanDxf.dxfUnits
    };
  } catch (error) {
    console.error('Error loading DXF data:', error);
    return null;
  }
};
