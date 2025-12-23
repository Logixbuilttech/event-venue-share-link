/**
 * Measurement Verification Utility
 * Compares 2D DXF measurements with 3D GLB measurements to ensure they match
 */

export interface MeasurementComparison {
  dimension: 'width' | 'height' | 'both';
  dxfMeasurement: number; // In DXF units (typically inches)
  glbMeasurement: number; // In 3D units
  scaleFactor: number;
  calculatedScaleFactor: number;
  difference: number; // Difference in DXF units
  differencePercent: number; // Percentage difference
  isMatch: boolean; // True if difference is within tolerance
}

export interface FloorPlanMeasurements {
  dxfBounds: {
    width: number; // In DXF units (inches)
    height: number; // In DXF units (inches)
    centerX: number;
    centerY: number;
  };
  glbSize: {
    width: number; // In 3D units
    depth: number; // In 3D units
  };
  scaleFactor: number;
  centerOffset: {
    x: number;
    y: number;
  };
}

/**
 * Verify that 2D and 3D measurements match
 * @param measurements Floor plan measurements
 * @param tolerancePercent Allowed difference percentage (default 2%)
 * @returns Comparison results
 */
export function verifyMeasurements(
  measurements: FloorPlanMeasurements,
  tolerancePercent: number = 2
): MeasurementComparison[] {
  const { dxfBounds, glbSize, scaleFactor } = measurements;
  
  const results: MeasurementComparison[] = [];
  
  // Verify width
  const dxfWidthIn3D = dxfBounds.width / scaleFactor;
  const widthDifference = Math.abs(dxfWidthIn3D - glbSize.width);
  const widthDifferencePercent = (widthDifference / glbSize.width) * 100;
  const calculatedScaleFactorX = dxfBounds.width / glbSize.width;
  
  results.push({
    dimension: 'width',
    dxfMeasurement: dxfBounds.width,
    glbMeasurement: glbSize.width,
    scaleFactor,
    calculatedScaleFactor: calculatedScaleFactorX,
    difference: widthDifference * scaleFactor, // Convert back to DXF units
    differencePercent: widthDifferencePercent,
    isMatch: widthDifferencePercent <= tolerancePercent
  });
  
  // Verify height (depth in 3D)
  const dxfHeightIn3D = dxfBounds.height / scaleFactor;
  const heightDifference = Math.abs(dxfHeightIn3D - glbSize.depth);
  const heightDifferencePercent = (heightDifference / glbSize.depth) * 100;
  const calculatedScaleFactorZ = dxfBounds.height / glbSize.depth;
  
  results.push({
    dimension: 'height',
    dxfMeasurement: dxfBounds.height,
    glbMeasurement: glbSize.depth,
    scaleFactor,
    calculatedScaleFactor: calculatedScaleFactorZ,
    difference: heightDifference * scaleFactor, // Convert back to DXF units
    differencePercent: heightDifferencePercent,
    isMatch: heightDifferencePercent <= tolerancePercent
  });
  
  // Overall comparison
  const avgDifferencePercent = (widthDifferencePercent + heightDifferencePercent) / 2;
  const avgCalculatedScaleFactor = (calculatedScaleFactorX + calculatedScaleFactorZ) / 2;
  
  results.push({
    dimension: 'both',
    dxfMeasurement: Math.sqrt(dxfBounds.width * dxfBounds.height),
    glbMeasurement: Math.sqrt(glbSize.width * glbSize.depth),
    scaleFactor,
    calculatedScaleFactor: avgCalculatedScaleFactor,
    difference: (widthDifference + heightDifference) / 2 * scaleFactor,
    differencePercent: avgDifferencePercent,
    isMatch: avgDifferencePercent <= tolerancePercent
  });
  
  return results;
}

/**
 * Convert DXF coordinates to 3D coordinates
 */
export function dxfTo3D(
  dxfCoord: { x: number; y: number },
  scaleFactor: number,
  centerOffset: { x: number; y: number }
): { x: number; z: number } {
  return {
    x: (dxfCoord.x - centerOffset.x) / scaleFactor,
    z: -(dxfCoord.y - centerOffset.y) / scaleFactor
  };
}

/**
 * Convert 3D coordinates to DXF coordinates
 */
export function threeDToDXF(
  coord3D: { x: number; z: number },
  scaleFactor: number,
  centerOffset: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: coord3D.x * scaleFactor + centerOffset.x,
    y: centerOffset.y - coord3D.z * scaleFactor
  };
}

/**
 * Calculate optimal scale factor from measurements
 */
export function calculateOptimalScaleFactor(
  dxfBounds: { width: number; height: number },
  glbSize: { width: number; depth: number }
): number {
  const scaleFactorX = dxfBounds.width / glbSize.width;
  const scaleFactorZ = dxfBounds.height / glbSize.depth;
  return (scaleFactorX + scaleFactorZ) / 2;
}

/**
 * Format measurement for display
 */
export function formatMeasurement(value: number, unit: 'inches' | 'feet' | 'meters' = 'inches'): string {
  switch (unit) {
    case 'feet':
      return `${(value / 12).toFixed(2)} ft`;
    case 'meters':
      return `${(value * 0.0254).toFixed(2)} m`;
    default:
      return `${value.toFixed(2)} in`;
  }
}

/**
 * Log measurement verification results to console
 */
export function logMeasurementVerification(results: MeasurementComparison[]): void {
  console.group('📏 Measurement Verification');
  
  results.forEach(result => {
    const status = result.isMatch ? '✅' : '❌';
    const dimension = result.dimension === 'both' ? 'Overall' : result.dimension.toUpperCase();
    
    console.log(`${status} ${dimension}:`);
    console.log(`  DXF: ${formatMeasurement(result.dxfMeasurement)}`);
    console.log(`  3D: ${result.glbMeasurement.toFixed(2)} units`);
    console.log(`  Scale Factor: ${result.scaleFactor.toFixed(2)} (calculated: ${result.calculatedScaleFactor.toFixed(2)})`);
    console.log(`  Difference: ${formatMeasurement(result.difference)} (${result.differencePercent.toFixed(2)}%)`);
    
    if (!result.isMatch) {
      console.warn(`  ⚠️ Mismatch detected! Consider adjusting scale factor.`);
    }
  });
  
  console.groupEnd();
}

