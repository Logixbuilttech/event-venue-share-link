import { DxfParser } from 'dxf-parser';

export interface SimpleDxfEntity {
  type: string;
  vertices?: { x: number; y: number; z?: number }[];
  layer?: string;
  color?: number | string;
}

// Global cache for extracted entities
const entityCache = new Map<string, SimpleDxfEntity[]>();
const loadingPromises = new Map<string, Promise<SimpleDxfEntity[]>>();

/**
 * Clear the entity cache (useful for debugging or memory management)
 */
export function clearEntityCache() {
  entityCache.clear();
  loadingPromises.clear();
}

/**
 * Simple DXF entity extractor that flattens all blocks and INSERT references
 * Returns a flat array of entities with coordinates relative to origin
 * Position the group at your desired coordinates when rendering
 * 
 * Uses caching to prevent multiple loads of the same file
 */
export async function extractSimpleEntities(dxfUrl: string, options?: { ignorePosition?: boolean }): Promise<SimpleDxfEntity[]> {
  // 1. Check cache first
  const cached = entityCache.get(dxfUrl);
  if (cached) {
    return cached;
  }

  // 2. Check if already loading
  const existingPromise = loadingPromises.get(dxfUrl);
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Start new load
  const loadPromise = (async () => {
  try {
    const res = await fetch(dxfUrl);
    const text = await res.text();
    const parser = new DxfParser();
    const dxf = parser.parseSync(text);

    const entities: SimpleDxfEntity[] = [];

    // Process all entities
    if (dxf && dxf.entities) {
      dxf.entities.forEach((entity: any) => {
        processEntity(entity, dxf, entities, undefined, options?.ignorePosition);
      });
    }

    // Store in cache
    entityCache.set(dxfUrl, entities);

    return entities;
  } catch (err) {
    console.error('❌ Failed to extract entities:', err);
    return [];
  } finally {
    // Remove from loading queue
    loadingPromises.delete(dxfUrl);
  }
  })();

  // Store loading promise
  loadingPromises.set(dxfUrl, loadPromise);
  return loadPromise;
}

function getEntityTypeCounts(entities: SimpleDxfEntity[]): Record<string, number> {
  const counts: Record<string, number> = {};
  entities.forEach(e => {
    counts[e.type] = (counts[e.type] || 0) + 1;
  });
  return counts;
}

function processEntity(entity: any, dxf: any, result: SimpleDxfEntity[], transform?: EntityTransform, ignorePosition?: boolean) {
  const entityType = entity.type;

  switch (entityType) {
    case 'LINE':
      processLine(entity, result, transform);
      break;
    
    case 'POLYLINE':
    case 'LWPOLYLINE':
      processPolyline(entity, result, transform);
      break;
    
    case 'INSERT':
      processInsert(entity, dxf, result, transform, ignorePosition);
      break;
    
    case 'CIRCLE':
      processCircle(entity, result, transform);
      break;
    
    case 'ARC':
      processArc(entity, result, transform);
      break;
    
    case 'SPLINE':
      processSpline(entity, result, transform);
      break;
    
    // Add more entity types as needed
    default:
  }
}

interface EntityTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

function applyTransform(point: { x: number; y: number; z?: number }, transform?: EntityTransform) {
  if (!transform) return point;

  const { x, y, scaleX, scaleY, rotation } = transform;
  
  // Scale
  let px = point.x * scaleX;
  let py = point.y * scaleY;
  
  // Rotate
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rotatedX = px * cos - py * sin;
  const rotatedY = px * sin + py * cos;
  
  // Translate
  return {
    x: rotatedX + x,
    y: rotatedY + y,
    z: point.z || 0
  };
}

function processLine(entity: any, result: SimpleDxfEntity[], transform?: EntityTransform) {
  if (!entity.vertices || entity.vertices.length < 2) {
    // Old format with start/end
    if (entity.start && entity.end) {
      result.push({
        type: 'LINE',
        vertices: [
          applyTransform(entity.start, transform),
          applyTransform(entity.end, transform)
        ],
        layer: entity.layer,
        color: entity.color
      });
    }
    return;
  }

  result.push({
    type: 'LINE',
    vertices: entity.vertices.map((v: any) => applyTransform(v, transform)),
    layer: entity.layer,
    color: entity.color
  });
}

function processPolyline(entity: any, result: SimpleDxfEntity[], transform?: EntityTransform) {
  if (!entity.vertices || entity.vertices.length < 2) return;

  result.push({
    type: entity.type,
    vertices: entity.vertices.map((v: any) => applyTransform(v, transform)),
    layer: entity.layer,
    color: entity.color
  });
}

function processCircle(entity: any, result: SimpleDxfEntity[], transform?: EntityTransform) {
  if (!entity.center || !entity.radius) return;

  // Convert circle to polygon with 32 segments
  const segments = 32;
  const vertices = [];
  
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = entity.center.x + entity.radius * Math.cos(angle);
    const y = entity.center.y + entity.radius * Math.sin(angle);
    vertices.push(applyTransform({ x, y, z: entity.center.z || 0 }, transform));
  }

  result.push({
    type: 'CIRCLE',
    vertices,
    layer: entity.layer,
    color: entity.color
  });
}

function processArc(entity: any, result: SimpleDxfEntity[], transform?: EntityTransform) {
  if (!entity.center || !entity.radius) return;

  // Convert arc to polyline with 32 segments
  const segments = 32;
  const vertices = [];
  const startAngle = entity.startAngle || 0;
  const endAngle = entity.endAngle || Math.PI * 2;
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + t * (endAngle - startAngle);
    const x = entity.center.x + entity.radius * Math.cos(angle);
    const y = entity.center.y + entity.radius * Math.sin(angle);
    vertices.push(applyTransform({ x, y, z: entity.center.z || 0 }, transform));
  }

  result.push({
    type: 'ARC',
    vertices,
    layer: entity.layer,
    color: entity.color
  });
}

function processSpline(entity: any, result: SimpleDxfEntity[], transform?: EntityTransform) {
  if (!entity.controlPoints || entity.controlPoints.length < 2) return;

  // Simple approximation: connect control points
  result.push({
    type: 'SPLINE',
    vertices: entity.controlPoints.map((p: any) => applyTransform(p, transform)),
    layer: entity.layer,
    color: entity.color
  });
}

function processInsert(entity: any, dxf: any, result: SimpleDxfEntity[], parentTransform?: EntityTransform, ignorePosition?: boolean) {
  if (!entity.name) return;

  const block = dxf.blocks?.[entity.name];
  if (!block || !block.entities) {
    return;
  }

  // Apply 50x scale for cameraman and female_model blocks
  const extraScale = (entity.name.includes('TV_CAMERAMAN_PL') || entity.name.includes('camera_man') || entity.name.includes('female_model')) ? 50 : 1;

  // Create transform for this INSERT
  // If ignorePosition is true, center at origin (0,0) instead of using DXF position
  const transform: EntityTransform = {
    x: ignorePosition ? 0 : (entity.position?.x || 0),
    y: ignorePosition ? 0 : (entity.position?.y || 0),
    scaleX: (entity.scale?.x || 1) * extraScale,
    scaleY: (entity.scale?.y || 1) * extraScale,
    rotation: (entity.rotation || 0) * Math.PI / 180
  };

  // Combine with parent transform if exists
  const finalTransform = parentTransform 
    ? combineTransforms(parentTransform, transform)
    : transform;

  const posInfo = ignorePosition 
    ? 'at origin (0, 0) - will use config position'
    : `at (${entity.position?.x?.toFixed(1)}, ${entity.position?.y?.toFixed(1)})`;
  
  // Process all entities in the block
  block.entities.forEach((blockEntity: any) => {
    processEntity(blockEntity, dxf, result, finalTransform, ignorePosition);
  });
}

function combineTransforms(parent: EntityTransform, child: EntityTransform): EntityTransform {
  // Apply parent transform to child's position
  const cos = Math.cos(parent.rotation);
  const sin = Math.sin(parent.rotation);
  
  const scaledX = child.x * parent.scaleX;
  const scaledY = child.y * parent.scaleY;
  
  const rotatedX = scaledX * cos - scaledY * sin;
  const rotatedY = scaledX * sin + scaledY * cos;

  return {
    x: parent.x + rotatedX,
    y: parent.y + rotatedY,
    scaleX: parent.scaleX * child.scaleX,
    scaleY: parent.scaleY * child.scaleY,
    rotation: parent.rotation + child.rotation
  };
}

