import React, { useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { DxfParser } from 'dxf-parser';
import type { StageConfig } from '@config/stages';
import { SimpleTextSprite } from '@components/Canvas/SimpleTextSprite';

// Advanced DXF Renderer - Production Ready
// Handles all DXF entity types with high accuracy and performance

// DXF Units Detection and Conversion
export function getDXFUnits(dxf: any): string {
  const unitsCode = dxf?.header?.$INSUNITS || 0;

  const unitMap = {
    0: 'unitless',
    1: 'inches',
    2: 'feet',
    3: 'miles',
    4: 'millimeters',
    5: 'centimeters',
    6: 'meters',
    7: 'kilometers',
    10: 'yards',
  };

  return unitMap[unitsCode as keyof typeof unitMap] || 'unknown';
}

export function convertFeetToDXFUnits(feet: number, dxfUnits: string): number {
  const feetInMeters = feet * 0.3048;

  switch (dxfUnits) {
    case 'meters': return feetInMeters;
    case 'millimeters': return feetInMeters * 1000;
    case 'centimeters': return feetInMeters * 100;
    case 'kilometers': return feetInMeters / 1000;
    case 'inches': return feet * 12;
    case 'feet': return feet;
    default: return feetInMeters; // safest, assume meters
  }
}

// Global DXF cache and loading queue
// This prevents 1000 simultaneous requests when rendering 1000 chairs
interface CachedDXF {
  elements: React.ReactElement[];
  naturalSize: { width: number; height: number };
  layerBounds: Record<string, { minX: number; maxX: number; minY: number; maxY: number }>;
  dxfUnits: string;
  center: { x: number; y: number }; // Add center info for proper positioning
}

const dxfCache = new Map<string, CachedDXF>();
const loadingPromises = new Map<string, Promise<CachedDXF>>();

// Deduplicated DXF loader - ensures only ONE network request per file
export async function loadDXFWithDeduplication(url: string): Promise<CachedDXF> {
  // 1. Check cache first
  const cached = dxfCache.get(url);
  if (cached) {
    return cached;
  }

  // 2. Check if already loading
  const existingPromise = loadingPromises.get(url);
  if (existingPromise) {
    return existingPromise;
  }

  // 3. Start new load
  const loadPromise = (async () => {
    try {
      const res = await fetch(url);
      const text = await res.text();
      const parser = new DxfParser();
      const dxf = parser.parseSync(text);

      // Calculate bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      if (dxf && dxf.entities) {
        dxf.entities.forEach((e: any) => {
          const points: any[] = [];
          if (e.start && e.end) points.push(e.start, e.end);
          if (e.vertices) points.push(...e.vertices);
          if (e.position) points.push(e.position);
          if (e.center) points.push(e.center);
          if (e.controlPoints) points.push(...e.controlPoints);
          if (e.points) points.push(...e.points);

          points.forEach((p: any) => {
            if (p && p.x != null && p.y != null) {
              minX = Math.min(minX, p.x);
              maxX = Math.max(maxX, p.x);
              minY = Math.min(minY, p.y);
              maxY = Math.max(maxY, p.y);
            }
          });
        });
      }

      // For models-photoshoot, DON'T center - use absolute coordinates from DXF
      // This allows positioning at specific coordinates like x: -245.31, y: 2391.18
      const shouldCenter = !url.includes('models-photoshoot');
      const centerX = shouldCenter ? toPrecise((minX + maxX) / 2) : 0;
      const centerY = shouldCenter ? toPrecise((minY + maxY) / 2) : 0;
      const width = toPrecise(maxX - minX);
      const height = toPrecise(maxY - minY);

      // Process entities
      const processor = new EntityProcessor(centerX, centerY);

      if (dxf && dxf.entities) {
        dxf.entities.forEach((entity: any) => {
          processor.processEntity(entity, dxf);
        });
      }

      const { lineBatches, circles, arcs, texts, layerBounds } = processor.getResults();

      // Create render elements
      const tempElements: React.ReactElement[] = [];
      let i = 0;

      // Lines
      Object.entries(lineBatches).forEach(([color, positions]) => {
        if (positions.length > 0) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

          // Use thicker lines for models-photoshoot for better visibility
          const lineWidth = url.includes('models-photoshoot') ? 3 : 1;

          // Keep original colors, or use bright color for models-photoshoot if needed
          const finalColor = url.includes('models-photoshoot') ? '#FF0000' : color; // Red for high visibility

          tempElements.push(
            <lineSegments key={`lines-${i++}`} geometry={geometry}>
              <lineBasicMaterial
                color={finalColor}
                linewidth={lineWidth}
                precision="highp"
              />
            </lineSegments>
          );
        }
      });

      // Circles
      circles.forEach((c: any) => {
        const circleGeo = new THREE.CircleGeometry(c.radius, 128);
        const positions = new Float32Array(circleGeo.attributes.position.array);
        for (let k = 1; k < positions.length; k += 3) positions[k] = -positions[k];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.translate(c.center.x, c.center.y, 0);

        const lineWidth = url.includes('models-photoshoot') ? 3 : 1;
        const finalColor = url.includes('models-photoshoot') ? '#FF0000' : c.color; // Red for visibility

        tempElements.push(
          <lineLoop key={`circle-${i++}`} geometry={geometry}>
            <lineBasicMaterial
              color={finalColor}
              linewidth={lineWidth}
              precision="highp"
            />
          </lineLoop>
        );
      });

      // Arcs
      arcs.forEach((a: any) => {
        const curve = new THREE.ArcCurve(
          a.center.x,
          a.center.y,
          a.radius,
          a.startAngle,
          a.endAngle
        );
        const points = curve.getPoints(64).map((p: any) => new THREE.Vector3(
          toPrecise(p.x),
          toPrecise(p.y),
          0
        ));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        const lineWidth = url.includes('models-photoshoot') ? 3 : 1;
        const finalColor = url.includes('models-photoshoot') ? '#FF0000' : a.color; // Red for visibility

        tempElements.push(
          <lineSegments key={`arc-${i++}`}>
            <primitive attach="geometry" object={geometry} />
            <lineBasicMaterial
              color={finalColor}
              linewidth={lineWidth}
              precision="highp"
            />
          </lineSegments>
        );
      });

      // Texts (limit for performance)
      const MAX_TEXTS = 100; // Reduced for chairs/tables
      texts.slice(0, MAX_TEXTS).forEach((t: any) => {
        if (!t.text || !t.position || t.position.x == null || t.position.y == null) return;

        const textContent = String(t.text).trim();
        if (!textContent) return;

        const textHeight = Math.max(0.1, Math.min(100, t.textHeight || t.height || 10));
        const rotation = t.rotation || 0;

        try {
          if (!isFinite(t.position.x) || !isFinite(t.position.y)) return;

          tempElements.push(
            <SimpleTextSprite
              key={`text-${i++}`}
              text={textContent}
              position={[t.position.x + 50, t.position.y, 1]}
              fontSize={textHeight}
              color={t.color || '#000000'}
              rotation={-rotation * Math.PI / 180}
            />
          );
        } catch (err) {
          console.warn('Failed to render text:', err);
        }
      });

      const cachedData: CachedDXF = {
        elements: tempElements,
        naturalSize: { width, height },
        layerBounds: layerBounds,
        dxfUnits: getDXFUnits(dxf),
        center: { x: centerX, y: centerY }
      };

      // Store in cache
      dxfCache.set(url, cachedData);

      return cachedData;
    } finally {
      // Remove from loading queue
      loadingPromises.delete(url);
    }
  })();

  // Store loading promise
  loadingPromises.set(url, loadPromise);
  return loadPromise;
}

// Helper function to clear cache (useful for debugging or memory management)
export function clearDXFCache() {
  const cacheSize = dxfCache.size;
  const loadingSize = loadingPromises.size;
  dxfCache.clear();
  loadingPromises.clear();
}

// Helper to get cache statistics
export function getDXFCacheStats() {
  return {
    cachedFiles: Array.from(dxfCache.keys()),
    cacheSize: dxfCache.size,
    loadingFiles: Array.from(loadingPromises.keys()),
    loadingSize: loadingPromises.size
  };
}

interface AdvancedDXFProps {
  url: string;
  onProgress?: (progress: number) => void;
  onAreaBounds?: (areas: Record<string, { minX: number; maxX: number; minY: number; maxY: number }>) => void;
  onDimensions?: (dimensions: { width: number; height: number; naturalWidth: number; naturalHeight: number }) => void;
  onCenterCalculated?: (center: { x: number; y: number }) => void; // Callback for center position
  position?: [number, number, number];
  fitTo?: { width: number; height: number };
  isStage?: boolean;
  stageConfig?: Partial<StageConfig>;
  highlightColor?: string; // Override color for all elements (e.g., '#FFD700')
}

// Enhanced ACI color mapping
const ACI_COLORS: Record<number, string> = {
  0: '#000000', 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
  5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0',
  10: '#ff8080', 11: '#ffff80', 12: '#80ff80', 13: '#80ffff', 14: '#8080ff',
  15: '#ff80ff', 16: '#404040', 17: '#606060', 18: '#a0a0a0', 19: '#c0c0c0',
  20: '#e0e0e0', 21: '#ff4040', 22: '#ff8040', 23: '#ffc040', 24: '#ffff40',
  25: '#c0ff40', 26: '#80ff40', 27: '#40ff40', 28: '#40ff80', 29: '#40ffc0',
  30: '#40ffff', 31: '#40c0ff', 32: '#4080ff', 33: '#4040ff', 34: '#8040ff',
  35: '#c040ff', 36: '#ff40ff', 37: '#ff40c0', 38: '#ff4080', 39: '#ff4040'
};

// Utility functions
const getColor = (entity: any): string => {
  if (entity.color && typeof entity.color === 'string') {
    return entity.color;
  }
  if (entity.color && typeof entity.color === 'number') {
    return `#${entity.color.toString(16).padStart(6, '0')}`;
  }
  if (entity.colorNumber !== undefined && ACI_COLORS[entity.colorNumber]) {
    return ACI_COLORS[entity.colorNumber];
  }
  return '#000000';
};

const toPrecise = (value: number): number => {
  return parseFloat(value.toFixed(8));
};

const transformPoint = (point: any, centerX: number, centerY: number): { x: number; y: number } => {
  return {
    x: toPrecise(point.x - centerX),
    y: toPrecise(point.y - centerY) // Removed Y-axis inversion to preserve original DXF orientation
  };
};

// Entity processors
class EntityProcessor {
  private lineBatches: Record<string, number[]> = {};
  private circles: any[] = [];
  private arcs: any[] = [];
  private texts: any[] = [];
  private layerBounds: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {};
  private centerX: number = 0;
  private centerY: number = 0;
  private modelLineLogged: boolean = false;

  constructor(centerX: number, centerY: number) {
    this.centerX = centerX;
    this.centerY = centerY;
  }

  private addLine(color: string, x1: number, y1: number, x2: number, y2: number) {
    if (!this.lineBatches[color]) this.lineBatches[color] = [];
    this.lineBatches[color].push(x1, y1, 0, x2, y2, 0);
  }

  private updateLayerBounds(layer: string, points: { x: number; y: number }[]) {
    if (!layer || !points.length) return;
    const key = String(layer).toLowerCase();
    if (!this.layerBounds[key]) {
      this.layerBounds[key] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    }
    points.forEach(p => {
      if (p && p.x != null && p.y != null) {
        this.layerBounds[key].minX = Math.min(this.layerBounds[key].minX, p.x);
        this.layerBounds[key].maxX = Math.max(this.layerBounds[key].maxX, p.x);
        this.layerBounds[key].minY = Math.min(this.layerBounds[key].minY, p.y);
        this.layerBounds[key].maxY = Math.max(this.layerBounds[key].maxY, p.y);
      }
    });
  }

  processEntity(entity: any, dxf: any): void {
    const color = getColor(entity);
    const layer = entity.layer || '0';

    switch (entity.type) {
      case 'LINE':
        this.processLine(entity, color, layer);
        break;
      case 'LWPOLYLINE':
        this.processLWPolyline(entity, color, layer);
        break;
      case 'POLYLINE':
        this.processPolyline(entity, color, layer);
        break;
      case 'CIRCLE':
        this.processCircle(entity, color, layer);
        break;
      case 'ARC':
        this.processArc(entity, color, layer);
        break;
      case 'ELLIPSE':
        this.processEllipse(entity, color, layer);
        break;
      case 'SPLINE':
        this.processSpline(entity, color, layer);
        break;
      case 'HATCH':
        this.processHatch(entity, color, layer);
        break;
      case 'MTEXT':
      case 'TEXT':
        this.processText(entity, color, layer);
        break;
      case 'INSERT':
        this.processInsert(entity, dxf, color, layer);
        break;
      case 'POINT':
        this.processPoint(entity, color, layer);
        break;
      case 'SOLID':
        this.processSolid(entity, color, layer);
        break;
      case 'TRACE':
        this.processTrace(entity, color, layer);
        break;
      case '3DFACE':
        this.process3DFace(entity, color, layer);
        break;
      case 'RAY':
        this.processRay(entity, color, layer);
        break;
      case 'XLINE':
        this.processXLine(entity, color, layer);
        break;
      case 'DIMENSION':
        this.processDimension(entity, color, layer);
        break;
      case 'LEADER':
        this.processLeader(entity, color, layer);
        break;
      case 'MLINE':
        this.processMLine(entity, color, layer);
        break;
      default:
        this.processUnknown(entity, color, layer);
    }
  }

  private processLine(entity: any, color: string, layer: string) {
    if (entity.start && entity.end) {
      const start = transformPoint(entity.start, this.centerX, this.centerY);
      const end = transformPoint(entity.end, this.centerX, this.centerY);
      this.addLine(color, start.x, start.y, end.x, end.y);
      this.updateLayerBounds(layer, [entity.start, entity.end]);
    }
  }

  private processLWPolyline(entity: any, color: string, layer: string) {
    if (!entity.vertices || entity.vertices.length < 2) return;

    const vertices = entity.vertices.map((v: any) => transformPoint(v, this.centerX, this.centerY));
    const isClosed = entity.closed || false;
    const maxIndex = isClosed ? vertices.length : vertices.length - 1;

    for (let i = 0; i < maxIndex; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      this.addLine(color, v1.x, v1.y, v2.x, v2.y);
    }
    this.updateLayerBounds(layer, entity.vertices);
  }

  private processPolyline(entity: any, color: string, layer: string) {
    if (!entity.vertices || entity.vertices.length < 2) return;

    const vertices = entity.vertices.map((v: any) => transformPoint(v, this.centerX, this.centerY));
    const isClosed = entity.closed || false;
    const maxIndex = isClosed ? vertices.length : vertices.length - 1;

    for (let i = 0; i < maxIndex; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      this.addLine(color, v1.x, v1.y, v2.x, v2.y);
    }
    this.updateLayerBounds(layer, entity.vertices);
  }

  private processCircle(entity: any, color: string, layer: string) {
    if (entity.center && entity.radius != null) {
      this.circles.push({
        center: transformPoint(entity.center, this.centerX, this.centerY),
        radius: entity.radius,
        color
      });
      this.updateLayerBounds(layer, [
        { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
        { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius }
      ]);
    }
  }

  private processArc(entity: any, color: string, layer: string) {
    if (entity.center && entity.radius != null) {
      this.arcs.push({
        center: transformPoint(entity.center, this.centerX, this.centerY),
        radius: entity.radius,
        startAngle: entity.startAngle || 0,
        endAngle: entity.endAngle || Math.PI * 2,
        color
      });
      this.updateLayerBounds(layer, [
        { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
        { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius }
      ]);
    }
  }

  private processEllipse(entity: any, color: string, layer: string) {
    if (entity.center && entity.majorAxis && entity.ratio) {
      const radius = Math.sqrt(entity.majorAxis.x * entity.majorAxis.x + entity.majorAxis.y * entity.majorAxis.y);
      this.circles.push({
        center: transformPoint(entity.center, this.centerX, this.centerY),
        radius: radius * entity.ratio,
        color
      });
    }
  }

  private processSpline(entity: any, color: string, layer: string) {
    if (entity.controlPoints && entity.controlPoints.length > 1) {
      const points = entity.controlPoints.map((p: any) => transformPoint(p, this.centerX, this.centerY));
      for (let i = 0; i < points.length - 1; i++) {
        this.addLine(color, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      }
      this.updateLayerBounds(layer, entity.controlPoints);
    }
  }

  private processHatch(entity: any, color: string, layer: string) {
    if (entity.boundaryPaths) {
      entity.boundaryPaths.forEach((path: any) => {
        if (path.edges) {
          path.edges.forEach((edge: any) => {
            if (edge.type === 'LINE' && edge.start && edge.end) {
              const start = transformPoint(edge.start, this.centerX, this.centerY);
              const end = transformPoint(edge.end, this.centerX, this.centerY);
              this.addLine(color, start.x, start.y, end.x, end.y);
            }
          });
        }
      });
    }
  }

  private processText(entity: any, color: string, layer: string) {
    if (entity.text) {
      this.texts.push({
        ...entity,
        position: transformPoint(entity.position || { x: 0, y: 0 }, this.centerX, this.centerY),
        color
      });
      if (entity.position) {
        this.updateLayerBounds(layer, [entity.position]);
      }
    }
  }

  private processInsert(entity: any, dxf: any, color: string, layer: string) {
    if (!entity.position) return;

    // Update layer bounds for INSERT position
    this.updateLayerBounds(layer, [entity.position]);

    if (dxf.blocks && dxf.blocks[entity.name]) {
      const block = dxf.blocks[entity.name];
      if (block.entities && block.entities.length > 0) {
        // Apply moderate scale (50x) for models-photoshoot to make it visible but not huge
        const extraScale = (entity.name && (entity.name.includes('TV_CAMERAMAN_PL') || entity.name.includes('camera_man') || entity.name.includes('female_model'))) ? 50 : 1;
        const scaleX = (entity.scale?.x || 1) * extraScale;
        const scaleY = (entity.scale?.y || 1) * extraScale;
        const rotation = entity.rotation || 0;
        const cos = Math.cos(rotation * Math.PI / 180);
        const sin = Math.sin(rotation * Math.PI / 180);

        // Log for cameraman blocks
        if (entity.name && entity.name.includes('TV_CAMERAMAN_PL') || entity.name.includes('camera_man')) {
          const entityTypes: Record<string, number> = {};
          const insertBlocks: string[] = [];
          const polylineCount = { POLYLINE: 0, LWPOLYLINE: 0 };

          block.entities.forEach((e: any) => {
            entityTypes[e.type] = (entityTypes[e.type] || 0) + 1;

            if (e.type === 'INSERT') {
              insertBlocks.push(e.name);
            }

            if (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE') {
              if (e.type === 'POLYLINE') polylineCount.POLYLINE++;
              if (e.type === 'LWPOLYLINE') polylineCount.LWPOLYLINE++;
            }
          });

        }

        let processedCount = 0;
        const transformedPoints: any[] = []; // Track transformed points for debugging
        const renderedTypes: Record<string, number> = {}; // Track what actually rendered

        block.entities.forEach((blockEntity: any) => {
          processedCount++;

          // Track entity type for debugging
          if (entity.name && entity.name.includes('TV_CAMERAMAN_PL') || entity.name.includes('camera_man')) {
            renderedTypes[blockEntity.type] = (renderedTypes[blockEntity.type] || 0) + 1;
          }
          const transformBlockPoint = (p: any) => {
            if (!p || p.x == null || p.y == null) return p;

            // Step 1: Scale
            const x = p.x * scaleX;
            const y = p.y * scaleY;

            // Step 2: Rotate
            const rotatedX = x * cos - y * sin;
            const rotatedY = x * sin + y * cos;

            // Step 3: Translate to insertion point
            const finalX = rotatedX + entity.position.x;
            const finalY = rotatedY + entity.position.y;

            // Debug logging for first few points
            if (transformedPoints.length < 3 && entity.name?.includes('TV_CAMERAMAN_PL')) {
              transformedPoints.push({
                original: { x: p.x, y: p.y },
                scaled: { x, y },
                rotated: { x: rotatedX, y: rotatedY },
                final: { x: finalX, y: finalY }
              });
            }

            return { x: finalX, y: finalY };
          };

          // Process block entities recursively
          const transformedEntity = { ...blockEntity };
          if (transformedEntity.start) transformedEntity.start = transformBlockPoint(transformedEntity.start);
          if (transformedEntity.end) transformedEntity.end = transformBlockPoint(transformedEntity.end);
          if (transformedEntity.center) transformedEntity.center = transformBlockPoint(transformedEntity.center);
          if (transformedEntity.position) transformedEntity.position = transformBlockPoint(transformedEntity.position);
          if (transformedEntity.vertices) {
            transformedEntity.vertices = transformedEntity.vertices.map(transformBlockPoint);
          }
          if (transformedEntity.controlPoints) {
            transformedEntity.controlPoints = transformedEntity.controlPoints.map(transformBlockPoint);
          }

          // ✅ Handle nested INSERT blocks inside cameraman block
          if (transformedEntity.type === "INSERT") {
            this.processInsert(transformedEntity, dxf, color, layer);
            return;
          }

          // ✅ POLYLINE fix - very important for body outlines!
          // Polylines need special handling to render correctly
          if (transformedEntity.type === "POLYLINE" || transformedEntity.type === "LWPOLYLINE") {
            const vertices = transformedEntity.vertices || [];
            if (vertices.length > 1) {
              if (transformedEntity.type === "POLYLINE") {
                this.processPolyline(transformedEntity, color, layer);
              } else {
                this.processLWPolyline(transformedEntity, color, layer);
              }
              return;
            }
          }

          // ✅ SPLINE handling for smooth curves
          if (transformedEntity.type === "SPLINE") {
            if (transformedEntity.controlPoints && transformedEntity.controlPoints.length > 1) {
              this.processSpline(transformedEntity, color, layer);
              return;
            }
          }

          this.processEntity(transformedEntity, dxf);
        });
      } else {
        // Block exists but has no entities - create placeholder
        this.createPlaceholder(entity.position, color);
      }
    } else {
      // Block not found - create placeholder
      this.createPlaceholder(entity.position, color);
    }
  }

  private createPlaceholder(position: any, color: string) {
    // Create a simple cross marker at the position
    const size = 50;
    const pos = transformPoint(position, this.centerX, this.centerY);
    this.addLine(color, pos.x - size, pos.y, pos.x + size, pos.y);
    this.addLine(color, pos.x, pos.y - size, pos.x, pos.y + size);
  }

  private processPoint(entity: any, color: string, layer: string) {
    if (entity.position) {
      const pos = transformPoint(entity.position, this.centerX, this.centerY);
      const size = 0.5;
      this.addLine(color, pos.x - size, pos.y, pos.x + size, pos.y);
      this.addLine(color, pos.x, pos.y - size, pos.x, pos.y + size);
      this.updateLayerBounds(layer, [entity.position]);
    }
  }

  private processSolid(entity: any, color: string, layer: string) {
    if (entity.vertices && entity.vertices.length > 1) {
      const vertices = entity.vertices.map((v: any) => transformPoint(v, this.centerX, this.centerY));
      for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        this.addLine(color, v1.x, v1.y, v2.x, v2.y);
      }
      this.updateLayerBounds(layer, entity.vertices);
    }
  }

  private processTrace(entity: any, color: string, layer: string) {
    if (entity.corners && entity.corners.length > 1) {
      const corners = entity.corners.map((c: any) => transformPoint(c, this.centerX, this.centerY));
      for (let i = 0; i < corners.length; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % corners.length];
        this.addLine(color, c1.x, c1.y, c2.x, c2.y);
      }
      this.updateLayerBounds(layer, entity.corners);
    }
  }

  private process3DFace(entity: any, color: string, layer: string) {
    if (entity.vertices && entity.vertices.length > 1) {
      const vertices = entity.vertices.map((v: any) => transformPoint(v, this.centerX, this.centerY));
      for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        this.addLine(color, v1.x, v1.y, v2.x, v2.y);
      }
      this.updateLayerBounds(layer, entity.vertices);
    }
  }

  private processRay(entity: any, color: string, layer: string) {
    if (entity.start && entity.direction) {
      const start = transformPoint(entity.start, this.centerX, this.centerY);
      const length = 1000;
      const end = {
        x: start.x + entity.direction.x * length,
        y: start.y + entity.direction.y * length
      };
      this.addLine(color, start.x, start.y, end.x, end.y);
    }
  }

  private processXLine(entity: any, color: string, layer: string) {
    if (entity.start && entity.direction) {
      const start = transformPoint(entity.start, this.centerX, this.centerY);
      const length = 1000;
      const end1 = {
        x: start.x - entity.direction.x * length,
        y: start.y - entity.direction.y * length
      };
      const end2 = {
        x: start.x + entity.direction.x * length,
        y: start.y + entity.direction.y * length
      };
      this.addLine(color, end1.x, end1.y, end2.x, end2.y);
    }
  }

  private processDimension(entity: any, color: string, layer: string) {
    // Process dimension lines and text
    if (entity.defPoint && entity.midPoint) {
      const def = transformPoint(entity.defPoint, this.centerX, this.centerY);
      const mid = transformPoint(entity.midPoint, this.centerX, this.centerY);
      this.addLine(color, def.x, def.y, mid.x, mid.y);
    }
  }

  private processLeader(entity: any, color: string, layer: string) {
    if (entity.vertices && entity.vertices.length > 1) {
      const vertices = entity.vertices.map((v: any) => transformPoint(v, this.centerX, this.centerY));
      for (let i = 0; i < vertices.length - 1; i++) {
        this.addLine(color, vertices[i].x, vertices[i].y, vertices[i + 1].x, vertices[i + 1].y);
      }
    }
  }

  private processMLine(entity: any, color: string, layer: string) {
    if (entity.vertices && entity.vertices.length > 1) {
      const vertices = entity.vertices.map((v: any) => transformPoint(v, this.centerX, this.centerY));
      for (let i = 0; i < vertices.length - 1; i++) {
        this.addLine(color, vertices[i].x, vertices[i].y, vertices[i + 1].x, vertices[i + 1].y);
      }
    }
  }

  private processUnknown(entity: any, color: string, layer: string) {
    // Try to extract any points from unknown entities
    const points: any[] = [];
    if (entity.start && entity.end) points.push(entity.start, entity.end);
    if (entity.vertices) points.push(...entity.vertices);
    if (entity.position) points.push(entity.position);
    if (entity.center) points.push(entity.center);
    if (entity.controlPoints) points.push(...entity.controlPoints);
    if (entity.points) points.push(...entity.points);

    if (points.length > 1) {
      const transformedPoints = points.map(p => transformPoint(p, this.centerX, this.centerY));
      for (let i = 0; i < transformedPoints.length - 1; i++) {
        const p1 = transformedPoints[i];
        const p2 = transformedPoints[i + 1];
        this.addLine(color, p1.x, p1.y, p2.x, p2.y);
      }
      this.updateLayerBounds(layer, points);
    }
  }

  getResults() {
    return {
      lineBatches: this.lineBatches,
      circles: this.circles,
      arcs: this.arcs,
      texts: this.texts,
      layerBounds: this.layerBounds
    };
  }
}

export function useAdvancedDXFRenderer({
  url,
  onProgress,
  onAreaBounds,
  onDimensions,
  onCenterCalculated,
  position = [0, 0, 0],
  fitTo,
  isStage = false,
  stageConfig,
  highlightColor
}: AdvancedDXFProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [elements, setElements] = useState<React.ReactElement[]>([]);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 1, height: 1 });
  const [dxfUnits, setDxfUnits] = useState<string>('inches');
  const [isLoading, setIsLoading] = useState(true);

  const processedData = useMemo(() => {
    return { elements, naturalSize, isLoading };
  }, [elements, naturalSize, isLoading]);

  useEffect(() => {
    async function loadDXF() {
      try {
        setIsLoading(true);
        if (onProgress) onProgress(0);

        // Use deduplicated loader - this ensures only ONE request per file
        const cachedData = await loadDXFWithDeduplication(url);

        setElements(cachedData.elements);
        setNaturalSize(cachedData.naturalSize);
        setDxfUnits(cachedData.dxfUnits);

        // Call callbacks with loaded data
        if (onAreaBounds && cachedData.layerBounds) {
          onAreaBounds(cachedData.layerBounds);
        }

        if (onCenterCalculated && cachedData.center) {
          onCenterCalculated(cachedData.center);
        }

        if (onProgress) onProgress(100);
        setIsLoading(false);
      } catch (err) {
        console.error('DXF load error:', err);
        setIsLoading(false);
      }
    }
    loadDXF();
  }, [url]);

  // Calculate scale
  const scaleX = useMemo(() => {
    if (fitTo && naturalSize.width > 0 && naturalSize.height > 0) {
      return fitTo.width / naturalSize.width;
    } else if (stageConfig?.width && naturalSize.width > 0) {
      return stageConfig.width / naturalSize.width;
    } else if (stageConfig?.height && naturalSize.height > 0) {
      return stageConfig.height / naturalSize.height;
    }
    return 1;
  }, [fitTo, naturalSize, stageConfig]);

  const scaleY = useMemo(() => {
    if (fitTo && naturalSize.width > 0 && naturalSize.height > 0) {
      return fitTo.height / naturalSize.height;
    } else if (stageConfig?.width && naturalSize.width > 0) {
      return scaleX; // Maintain aspect ratio
    } else if (stageConfig?.height && naturalSize.height > 0) {
      return stageConfig.height / naturalSize.height;
    }
    return 1;
  }, [fitTo, naturalSize, stageConfig, scaleX]);
  const rotation = stageConfig?.rotation ?? 0;

  return {
    groupRef,
    elements,
    naturalSize,
    isLoading,
    scaleX,
    scaleY,
    rotation,
    dxfUnits
  };
}

export function AdvancedDXFModel({
  url,
  onProgress,
  onAreaBounds,
  onDimensions,
  onCenterCalculated,
  position = [0, 0, 0],
  fitTo,
  isStage = false,
  stageConfig,
  highlightColor
}: AdvancedDXFProps) {

  const { groupRef, elements, scaleX, scaleY, rotation, naturalSize, dxfUnits } = useAdvancedDXFRenderer({
    url,
    onProgress,
    onAreaBounds,
    onDimensions,
    onCenterCalculated,
    position,
    fitTo,
    isStage,
    stageConfig
  });

  // Apply highlight color if provided
  const coloredElements = useMemo(() => {
    if (!highlightColor || elements.length === 0) {
      return elements;
    }

    // Clone elements and override their material color
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overrideColor = (child: any): any => {
      if (!React.isValidElement(child)) return child;

      const newProps: Record<string, any> = {};
      const childProps = child.props as any;

      // If it has children, recursively process them
      if (childProps?.children) {
        newProps.children = React.Children.map(childProps.children, overrideColor);
      }

      // Override material color if it's a material component
      if (child.type === 'lineBasicMaterial' || child.type === 'meshBasicMaterial' || (typeof child.type === 'function' && child.type.name === 'SimpleTextSprite')) {
        newProps.color = highlightColor;
        // Increase line width for better visibility
        if (child.type === 'lineBasicMaterial') {
          newProps.linewidth = 5;
        }
      }

      return React.cloneElement(child, newProps);
    };

    return React.Children.map(elements, overrideColor);
  }, [elements, highlightColor]);

  return (
    <group ref={groupRef} position={position}>
      {/* Stage Content - Scaled and Rotated */}
      <group
        scale={[scaleX, scaleY, 1]}
        rotation={[0, 0, (rotation * Math.PI) / 180]}
      >
        {coloredElements}
      </group>

      {/* Dynamic Backstage Visualization - Rendered relative to stage center but outside scale group */}
      {isStage && stageConfig?.backstageDepth && stageConfig.backstageDepth > 0 && (
        <group rotation={[0, 0, (rotation * Math.PI) / 180]}>
          {(() => {
            const side = stageConfig.backstageSide || 'left';

            const visualWidth = naturalSize.width * scaleX;
            console.log('visualWidth', visualWidth);
            const visualHeight = naturalSize.height * scaleY;
            const depth = convertFeetToDXFUnits(stageConfig.backstageDepth, dxfUnits || 'inches');

            let bx = 0, by = 0;
            let bWidth = 0, bHeight = 0;

            if (side === 'left') {
              bx = -visualWidth / 2 - depth / 2;
              bWidth = depth;
              bHeight = visualHeight;
            } else if (side === 'right') {
              bx = visualWidth / 2 + depth / 2;
              bWidth = depth;
              bHeight = visualHeight;
            } else if (side === 'top') {
              by = visualHeight / 2 + depth / 2;
              bWidth = visualWidth;
              bHeight = depth;
            } else if (side === 'bottom') {
              by = -visualHeight / 2 - depth / 2;
              bWidth = visualWidth;
              bHeight = depth;
            }

            return (
              <mesh position={[bx, by, -0.05]}>
                <planeGeometry args={[bWidth, bHeight]} />
                <meshBasicMaterial
                  color={
                    (stageConfig.backstageDepth || 0) < 6 ? '#ef4444' :
                      (stageConfig.backstageDepth || 0) < 10 ? '#eab308' :
                        '#22c55e'
                  }
                  transparent
                  opacity={0.5}
                />
              </mesh>
            );
          })()}
        </group>
      )}
    </group>
  );
}
