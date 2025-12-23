'use client';

import { useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import DxfParser from 'dxf-parser';
import type { StageConfig } from '@config/stages';
import { SimpleTextSprite } from '@components/Canvas/SimpleTextSprite';

const ACI_COLORS: Record<number, string> = {
    1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff',
    5: '#0000ff', 6: '#ff00ff', 7: '#ffffff',
    8: '#808080', 9: '#c0c0c0',
};

export interface DXFModelProps {
    url: string;
    onProgress?: (p: number) => void;
    onAreaBounds?: (areas: Record<string, { minX: number; maxX: number; minY: number; maxY: number }>) => void;
    onDimensions?: (dimensions: { width: number; height: number; naturalWidth: number; naturalHeight: number }) => void;
    position?: [number, number, number];
    fitTo?: { width: number; height: number };
    isStage?: boolean;
    stageConfig?: StageConfig;
}

export function useDXFRenderer({
    url,
    onProgress,
    onAreaBounds,
    onDimensions,
    position = [0, 0, 0],
    fitTo,
    isStage = false,
    stageConfig
}: DXFModelProps) {
    const groupRef = useRef<THREE.Group>(null);
    const [elements, setElements] = useState<React.ReactElement[]>([]);
    const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 1, height: 1 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadDXF() {
            try {
                setIsLoading(true);
                const res = await fetch(url);
                const text = await res.text();
                const parser = new DxfParser();
                const dxf = parser.parseSync(text);

                // DXF processing code - improved to handle more entity types
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                if (dxf && dxf.entities) {
                    dxf.entities.forEach((e: any) => {
                        const points: any[] = [];

                        // Handle different entity types
                        if (e.start && e.end) points.push(e.start, e.end);
                        if (e.vertices) points.push(...e.vertices);
                        if (e.position) points.push(e.position);
                        if (e.center) points.push(e.center);
                        if (e.insertionPoint) points.push(e.insertionPoint);

                        // Handle polylines with more complex structures
                        if (e.type === 'LWPOLYLINE' && e.vertices) {
                            e.vertices.forEach((v: any) => {
                                if (v.x != null && v.y != null) {
                                    points.push({ x: v.x, y: v.y });
                                }
                            });
                        }

                        // Handle splines and other complex curves
                        if (e.controlPoints) {
                            e.controlPoints.forEach((cp: any) => {
                                if (cp.x != null && cp.y != null) {
                                    points.push({ x: cp.x, y: cp.y });
                                }
                            });
                        }

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

                 // High precision center and dimensions
                 const centerX = parseFloat(((minX + maxX) / 2).toFixed(6));
                 const centerY = parseFloat(((minY + maxY) / 2).toFixed(6));
                 const width = parseFloat((maxX - minX).toFixed(6));
                 const height = parseFloat((maxY - minY).toFixed(6));
                 setNaturalSize({ width, height });

                const lineBatches: Record<string, number[]> = {};
                const arcs: any[] = [];
                const circles: any[] = [];
                const texts: any[] = [];
                // Track bounds per DXF layer
                const layerBounds: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {};

                if (dxf && dxf.entities) {
                    const entityTypes: Record<string, number> = {};
                    const entityDetails: Record<string, any[]> = {};

                    dxf.entities.forEach((e: any, index: number) => {
                        // Track entity types for debugging
                        entityTypes[e.type] = (entityTypes[e.type] || 0) + 1;
                        
                        // Store detailed entity information
                        if (!entityDetails[e.type]) entityDetails[e.type] = [];
                        entityDetails[e.type].push({
                            index,
                            layer: e.layer,
                            color: e.color,
                            colorNumber: e.colorNumber,
                            ...e
                        });

                        // Fix color handling
                        let color = '#000000'; // Default black
                        if (e.color) {
                            if (typeof e.color === 'string') {
                                color = e.color;
                            } else if (typeof e.color === 'number') {
                                color = `#${e.color.toString(16).padStart(6, '0')}`;
                            }
                        } else if (e.colorNumber && ACI_COLORS[e.colorNumber]) {
                            color = ACI_COLORS[e.colorNumber];
                        }

                        // Helper to update layer bounds
                        const updateLayerBounds = (layerName?: string, pts?: { x: number; y: number }[]) => {
                            if (!layerName || !pts || pts.length === 0) return;
                            const key = String(layerName).toLowerCase();
                            if (!layerBounds[key]) layerBounds[key] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
                            pts.forEach(p => {
                                if (p && p.x != null && p.y != null) {
                                    layerBounds[key].minX = Math.min(layerBounds[key].minX, p.x);
                                    layerBounds[key].maxX = Math.max(layerBounds[key].maxX, p.x);
                                    layerBounds[key].minY = Math.min(layerBounds[key].minY, p.y);
                                    layerBounds[key].maxY = Math.max(layerBounds[key].maxY, p.y);
                                }
                            });
                        };

                         // Lines - with high precision
                         if (e.type === 'LINE' && e.start && e.end) {
                             if (!lineBatches[color]) lineBatches[color] = [];
                            // Use high precision coordinates
                            const startX = parseFloat((e.start.x - centerX).toFixed(6));
                            const startY = parseFloat((-(e.start.y - centerY)).toFixed(6));
                            const endX = parseFloat((e.end.x - centerX).toFixed(6));
                            const endY = parseFloat((-(e.end.y - centerY)).toFixed(6));
                             
                             lineBatches[color].push(
                                 startX, startY, 0,
                                 endX, endY, 0
                             );
                             updateLayerBounds(e.layer, [e.start, e.end]);
                         }

                        // Polylines - improved handling with high precision
                        if (e.type === 'LWPOLYLINE' && e.vertices) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const vertices = e.vertices;

                            // Handle both open and closed polylines
                            const isClosed = e.closed || false;
                            const maxIndex = isClosed ? vertices.length : vertices.length - 1;

                            for (let i = 0; i < maxIndex; i++) {
                                const v1 = vertices[i];
                                const v2 = vertices[(i + 1) % vertices.length];

                                if (v1 && v2 && v1.x != null && v1.y != null && v2.x != null && v2.y != null) {
                                    // Use high precision coordinates for accurate corners
                                    const v1X = parseFloat((v1.x - centerX).toFixed(6));
                                    const v1Y = parseFloat((-(v1.y - centerY)).toFixed(6));
                                    const v2X = parseFloat((v2.x - centerX).toFixed(6));
                                    const v2Y = parseFloat((-(v2.y - centerY)).toFixed(6));
                                    
                                    lineBatches[color].push(
                                        v1X, v1Y, 0,
                                        v2X, v2Y, 0
                                    );
                                }
                            }
                            updateLayerBounds(e.layer, vertices);
                        }

                        // POLYLINE entities (older DXF format) - with high precision
                        if (e.type === 'POLYLINE' && e.vertices) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const vertices = e.vertices;

                            // Handle both open and closed polylines
                            const isClosed = e.closed || false;
                            const maxIndex = isClosed ? vertices.length : vertices.length - 1;

                            for (let i = 0; i < maxIndex; i++) {
                                const v1 = vertices[i];
                                const v2 = vertices[(i + 1) % vertices.length];

                                if (v1 && v2 && v1.x != null && v1.y != null && v2.x != null && v2.y != null) {
                                    // Use high precision coordinates for accurate corners
                                    const v1X = parseFloat((v1.x - centerX).toFixed(6));
                                    const v1Y = parseFloat((-(v1.y - centerY)).toFixed(6));
                                    const v2X = parseFloat((v2.x - centerX).toFixed(6));
                                    const v2Y = parseFloat((-(v2.y - centerY)).toFixed(6));
                                    
                                    lineBatches[color].push(
                                        v1X, v1Y, 0,
                                        v2X, v2Y, 0
                                    );
                                }
                            }
                            updateLayerBounds(e.layer, vertices);
                        }

                        if (e.type === 'CIRCLE' && e.center && e.radius != null) {
                            circles.push({ ...e, color });
                            // Approximate circle as box for bounds
                            updateLayerBounds(e.layer, [
                                { x: e.center.x - e.radius, y: e.center.y - e.radius },
                                { x: e.center.x + e.radius, y: e.center.y + e.radius }
                            ]);
                        }
                        if (e.type === 'ARC' && e.center && e.radius != null) {
                            arcs.push({ ...e, color });
                            updateLayerBounds(e.layer, [
                                { x: e.center.x - e.radius, y: e.center.y - e.radius },
                                { x: e.center.x + e.radius, y: e.center.y + e.radius }
                            ]);
                        }

                        // Handle ELLIPSE entities
                        if (e.type === 'ELLIPSE' && e.center && e.majorAxis && e.ratio) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            // Approximate ellipse as circle for now
                            const radius = Math.sqrt(e.majorAxis.x * e.majorAxis.x + e.majorAxis.y * e.majorAxis.y);
                            circles.push({
                                center: e.center,
                                radius: radius * e.ratio,
                                color
                            });
                            updateLayerBounds(e.layer, [
                                { x: e.center.x - radius, y: e.center.y - radius },
                                { x: e.center.x + radius, y: e.center.y + radius }
                            ]);
                        }

                        // Handle SPLINE entities - with high precision
                        if (e.type === 'SPLINE' && e.controlPoints) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const controlPoints = e.controlPoints;
                            for (let i = 0; i < controlPoints.length - 1; i++) {
                                const p1 = controlPoints[i];
                                const p2 = controlPoints[i + 1];
                                if (p1 && p2 && p1.x != null && p1.y != null && p2.x != null && p2.y != null) {
                                    // High precision spline points
                                    const p1X = parseFloat((p1.x - centerX).toFixed(6));
                                    const p1Y = parseFloat((-(p1.y - centerY)).toFixed(6));
                                    const p2X = parseFloat((p2.x - centerX).toFixed(6));
                                    const p2Y = parseFloat((-(p2.y - centerY)).toFixed(6));
                                    
                                    lineBatches[color].push(
                                        p1X, p1Y, 0,
                                        p2X, p2Y, 0
                                    );
                                }
                            }
                            updateLayerBounds(e.layer, controlPoints);
                        }

                        // Handle HATCH entities (filled areas) - with high precision
                        if (e.type === 'HATCH' && e.boundaryPaths) {
                            e.boundaryPaths.forEach((path: any) => {
                                if (path.edges) {
                                    path.edges.forEach((edge: any) => {
                                        if (edge.type === 'LINE' && edge.start && edge.end) {
                                            if (!lineBatches[color]) lineBatches[color] = [];
                                            // High precision hatch boundary lines
                                            const startX = parseFloat((edge.start.x - centerX).toFixed(6));
                                            const startY = parseFloat((-(edge.start.y - centerY)).toFixed(6));
                                            const endX = parseFloat((edge.end.x - centerX).toFixed(6));
                                            const endY = parseFloat((-(edge.end.y - centerY)).toFixed(6));
                                            
                                            lineBatches[color].push(
                                                startX, startY, 0,
                                                endX, endY, 0
                                            );
                                        }
                                    });
                                }
                            });
                        }

                        if ((e.type === 'MTEXT' || e.type === 'TEXT') && e.text) {
                            texts.push({ ...e, color });
                            if (e.position) updateLayerBounds(e.layer, [e.position]);
                        }

                        // Handle BLOCK entities (complex objects)
                        if (e.type === 'INSERT' && e.position) {

                            // Try to find the block definition
                            if (dxf.blocks && dxf.blocks[e.name]) {
                                const block = dxf.blocks[e.name];
                                
                                if (block.entities) {
                                    // Process block entities with transformation
                                    const scaleX = e.scale?.x || 1;
                                    const scaleY = e.scale?.y || 1;
                                    const rotation = e.rotation || 0;
                                    const cos = Math.cos(rotation * Math.PI / 180);
                                    const sin = Math.sin(rotation * Math.PI / 180);

                                    let processedCount = 0;
                                    let blockLineSegments = 0;
                                    
                                    block.entities.forEach((blockEntity: any, blockIndex: number) => {
                                        
                                        // Transform block entity coordinates
                                        const transformPoint = (p: any) => {
                                            if (!p || p.x == null || p.y == null) return p;
                                            const x = p.x * scaleX;
                                            const y = p.y * scaleY;
                                            const rotatedX = x * cos - y * sin;
                                            const rotatedY = x * sin + y * cos;
                                            return {
                                                x: rotatedX + e.position.x,
                                                y: rotatedY + e.position.y
                                            };
                                        };

                                        // Process different entity types in the block - with high precision
                                        if (blockEntity.type === 'LINE' && blockEntity.start && blockEntity.end) {
                                            const start = transformPoint(blockEntity.start);
                                            const end = transformPoint(blockEntity.end);
                                            if (start && end) {
                                                if (!lineBatches[color]) lineBatches[color] = [];
                                                // High precision block line coordinates
                                                const startX = parseFloat((start.x - centerX).toFixed(6));
                                                const startY = parseFloat((-(start.y - centerY)).toFixed(6));
                                                const endX = parseFloat((end.x - centerX).toFixed(6));
                                                const endY = parseFloat((-(end.y - centerY)).toFixed(6));
                                                
                                                lineBatches[color].push(
                                                    startX, startY, 0,
                                                    endX, endY, 0
                                                );
                                                blockLineSegments++;
                                            }
                                        } else if (blockEntity.type === 'LWPOLYLINE' && blockEntity.vertices) {
                                            const transformedVertices = blockEntity.vertices.map(transformPoint);
                                            
                                            // Handle both open and closed polylines
                                            const isClosed = blockEntity.closed || false;
                                            const maxIndex = isClosed ? transformedVertices.length : transformedVertices.length - 1;
                                            
                                            for (let i = 0; i < maxIndex; i++) {
                                                const v1 = transformedVertices[i];
                                                const v2 = transformedVertices[(i + 1) % transformedVertices.length];
                                                if (v1 && v2 && v1.x != null && v1.y != null && v2.x != null && v2.y != null) {
                                                    if (!lineBatches[color]) lineBatches[color] = [];
                                                    // High precision block polyline coordinates
                                                    const v1X = parseFloat((v1.x - centerX).toFixed(6));
                                                    const v1Y = parseFloat((-(v1.y - centerY)).toFixed(6));
                                                    const v2X = parseFloat((v2.x - centerX).toFixed(6));
                                                    const v2Y = parseFloat((-(v2.y - centerY)).toFixed(6));
                                                    
                                                    lineBatches[color].push(
                                                        v1X, v1Y, 0,
                                                        v2X, v2Y, 0
                                                    );
                                                }
                                            }
                                        } else if (blockEntity.type === 'CIRCLE' && blockEntity.center && blockEntity.radius != null) {
                                            const center = transformPoint(blockEntity.center);
                                            if (center) {
                                                circles.push({
                                                    center,
                                                    radius: blockEntity.radius * Math.max(scaleX, scaleY),
                                                    color
                                                });
                                            }
                                        } else if (blockEntity.type === 'ARC' && blockEntity.center && blockEntity.radius != null) {
                                            const center = transformPoint(blockEntity.center);
                                            if (center) {
                                                arcs.push({
                                                    center,
                                                    radius: blockEntity.radius * Math.max(scaleX, scaleY),
                                                    startAngle: blockEntity.startAngle,
                                                    endAngle: blockEntity.endAngle,
                                                    color
                                                });
                                            }
                                        } else if (blockEntity.type === 'POLYLINE' && blockEntity.vertices) {
                                            const transformedVertices = blockEntity.vertices.map(transformPoint);
                                            
                                            // Handle both open and closed polylines
                                            const isClosed = blockEntity.closed || false;
                                            const maxIndex = isClosed ? transformedVertices.length : transformedVertices.length - 1;
                                            
                                            for (let i = 0; i < maxIndex; i++) {
                                                const v1 = transformedVertices[i];
                                                const v2 = transformedVertices[(i + 1) % transformedVertices.length];
                                                if (v1 && v2 && v1.x != null && v1.y != null && v2.x != null && v2.y != null) {
                                                    if (!lineBatches[color]) lineBatches[color] = [];
                                                    const v1X = parseFloat((v1.x - centerX).toFixed(6));
                                                    const v1Y = parseFloat((-(v1.y - centerY)).toFixed(6));
                                                    const v2X = parseFloat((v2.x - centerX).toFixed(6));
                                                    const v2Y = parseFloat((-(v2.y - centerY)).toFixed(6));
                                                    
                                                    lineBatches[color].push(
                                                        v1X, v1Y, 0,
                                                        v2X, v2Y, 0
                                                    );
                                                }
                                            }
                                        } else if (blockEntity.type === 'SPLINE' && blockEntity.controlPoints) {
                                            const transformedControlPoints = blockEntity.controlPoints.map(transformPoint);
                                            for (let i = 0; i < transformedControlPoints.length - 1; i++) {
                                                const p1 = transformedControlPoints[i];
                                                const p2 = transformedControlPoints[i + 1];
                                                if (p1 && p2 && p1.x != null && p1.y != null && p2.x != null && p2.y != null) {
                                                    if (!lineBatches[color]) lineBatches[color] = [];
                                                    const p1X = parseFloat((p1.x - centerX).toFixed(6));
                                                    const p1Y = parseFloat((-(p1.y - centerY)).toFixed(6));
                                                    const p2X = parseFloat((p2.x - centerX).toFixed(6));
                                                    const p2Y = parseFloat((-(p2.y - centerY)).toFixed(6));
                                                    lineBatches[color].push(p1X, p1Y, 0, p2X, p2Y, 0);
                                                }
                                            }
                                        }
                                        processedCount++;
                                    });
                                    
                                }
                            } else {
                                // Fallback: just mark the insertion point
                                if (!lineBatches[color]) lineBatches[color] = [];
                                lineBatches[color].push(
                                    e.position.x - centerX, -(e.position.y - centerY), 0,
                                    e.position.x - centerX + 1, -(e.position.y - centerY), 0
                                );
                            }
                            updateLayerBounds(e.layer, [e.position]);
                        }

                        // Handle POINT entities
                        if (e.type === 'POINT' && e.position) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            // Draw a small cross for points
                            const size = 0.5;
                            lineBatches[color].push(
                                e.position.x - centerX - size, -(e.position.y - centerY), 0,
                                e.position.x - centerX + size, -(e.position.y - centerY), 0,
                                e.position.x - centerX, -(e.position.y - centerY) - size, 0,
                                e.position.x - centerX, -(e.position.y - centerY) + size, 0
                            );
                            updateLayerBounds(e.layer, [e.position]);
                        }

                        // Handle SOLID entities (filled triangles/rectangles)
                        if (e.type === 'SOLID' && e.vertices) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const vertices = e.vertices;
                            for (let i = 0; i < vertices.length; i++) {
                                const v1 = vertices[i];
                                const v2 = vertices[(i + 1) % vertices.length];
                                if (v1 && v2 && v1.x != null && v1.y != null && v2.x != null && v2.y != null) {
                                    lineBatches[color].push(
                                        v1.x - centerX, -(v1.y - centerY), 0,
                                        v2.x - centerX, -(v2.y - centerY), 0
                                    );
                                }
                            }
                            updateLayerBounds(e.layer, vertices);
                        }

                        // Handle TRACE entities (thick lines)
                        if (e.type === 'TRACE' && e.corners) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const corners = e.corners;
                            for (let i = 0; i < corners.length; i++) {
                                const c1 = corners[i];
                                const c2 = corners[(i + 1) % corners.length];
                                if (c1 && c2 && c1.x != null && c1.y != null && c2.x != null && c2.y != null) {
                                    lineBatches[color].push(
                                        c1.x - centerX, -(c1.y - centerY), 0,
                                        c2.x - centerX, -(c2.y - centerY), 0
                                    );
                                }
                            }
                            updateLayerBounds(e.layer, corners);
                        }

                        // Handle 3DFACE entities
                        if (e.type === '3DFACE' && e.vertices) {
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const vertices = e.vertices;
                            for (let i = 0; i < vertices.length; i++) {
                                const v1 = vertices[i];
                                const v2 = vertices[(i + 1) % vertices.length];
                                if (v1 && v2 && v1.x != null && v1.y != null && v2.x != null && v2.y != null) {
                                    lineBatches[color].push(
                                        v1.x - centerX, -(v1.y - centerY), 0,
                                        v2.x - centerX, -(v2.y - centerY), 0
                                    );
                                }
                            }
                            updateLayerBounds(e.layer, vertices);
                        }

                        // Handle additional entity types that might be missing
                        if (e.type === 'RAY' && e.start && e.direction) {
                            // Ray - extend to reasonable length
                            const length = 1000; // Arbitrary length for ray
                            const end = {
                                x: e.start.x + e.direction.x * length,
                                y: e.start.y + e.direction.y * length
                            };
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const startX = parseFloat((e.start.x - centerX).toFixed(6));
                            const startY = parseFloat((-(e.start.y - centerY)).toFixed(6));
                            const endX = parseFloat((end.x - centerX).toFixed(6));
                            const endY = parseFloat((-(end.y - centerY)).toFixed(6));
                            lineBatches[color].push(startX, startY, 0, endX, endY, 0);
                            updateLayerBounds(e.layer, [e.start, end]);
                        }
                        
                        if (e.type === 'XLINE' && e.start && e.direction) {
                            // Construction line - extend in both directions
                            const length = 1000;
                            const start = {
                                x: e.start.x - e.direction.x * length,
                                y: e.start.y - e.direction.y * length
                            };
                            const end = {
                                x: e.start.x + e.direction.x * length,
                                y: e.start.y + e.direction.y * length
                            };
                            if (!lineBatches[color]) lineBatches[color] = [];
                            const startX = parseFloat((start.x - centerX).toFixed(6));
                            const startY = parseFloat((-(start.y - centerY)).toFixed(6));
                            const endX = parseFloat((end.x - centerX).toFixed(6));
                            const endY = parseFloat((-(end.y - centerY)).toFixed(6));
                            lineBatches[color].push(startX, startY, 0, endX, endY, 0);
                            updateLayerBounds(e.layer, [start, end]);
                        }
                        
                        // Fallback for unhandled entity types
                        if (!['LINE', 'LWPOLYLINE', 'POLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'SPLINE', 'HATCH', 'MTEXT', 'TEXT', 'INSERT', 'POINT', 'SOLID', 'TRACE', '3DFACE', 'RAY', 'XLINE'].includes(e.type)) {
                            console.warn('Unhandled entity type:', e.type, e);

                            // Try to extract any points from unhandled entities
                            const points: any[] = [];
                            if (e.start && e.end) points.push(e.start, e.end);
                            if (e.vertices) points.push(...e.vertices);
                            if (e.position) points.push(e.position);
                            if (e.center) points.push(e.center);
                            if (e.controlPoints) points.push(...e.controlPoints);
                            if (e.points) points.push(...e.points);

                            if (points.length > 0) {
                                if (!lineBatches[color]) lineBatches[color] = [];
                                for (let i = 0; i < points.length - 1; i++) {
                                    const p1 = points[i];
                                    const p2 = points[i + 1];
                                    if (p1 && p2 && p1.x != null && p1.y != null && p2.x != null && p2.y != null) {
                                        const p1X = parseFloat((p1.x - centerX).toFixed(6));
                                        const p1Y = parseFloat((-(p1.y - centerY)).toFixed(6));
                                        const p2X = parseFloat((p2.x - centerX).toFixed(6));
                                        const p2Y = parseFloat((-(p2.y - centerY)).toFixed(6));
                                        lineBatches[color].push(p1X, p1Y, 0, p2X, p2Y, 0);
                                    }
                                }
                                updateLayerBounds(e.layer, points);
                            }
                        }
                    });
                }

                const tempElements: React.ReactElement[] = [];
                let i = 0;

                 // Lines - with high precision rendering
                 Object.entries(lineBatches).forEach(([color, positions]) => {
                     const geometry = new THREE.BufferGeometry();
                     
                     // Ensure high precision for all coordinates
                     const highPrecisionPositions = positions.map(coord => 
                         parseFloat(coord.toFixed(6))
                     );
                     
                     geometry.setAttribute('position', new THREE.Float32BufferAttribute(highPrecisionPositions, 3));

                     // Use highlighted color for stages
                     const finalColor = isStage ? '#ff6b35' : color; // Orange highlight for stages
                     const lineWidth = isStage ? 3 : 1; // Thicker lines for stages

                     tempElements.push(
                         <lineSegments key={`lines-${i++}`} geometry={geometry}>
                             <lineBasicMaterial 
                                 color={finalColor} 
                                 linewidth={lineWidth}
                                 precision="highp"
                             />
                         </lineSegments>
                     );
                 });

                // Circles - with high precision
                circles.forEach((c: any) => {
                    const circleGeo = new THREE.CircleGeometry(c.radius, 128); // More segments for smoother circles
                    const positions = new Float32Array(circleGeo.attributes.position.array);
                    for (let k = 1; k < positions.length; k += 3) positions[k] = -positions[k];
                    const geometry = new THREE.BufferGeometry();
                    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    
                    // High precision translation
                    const centerXPrecise = parseFloat((c.center.x - centerX).toFixed(6));
                    const centerYPrecise = parseFloat((-(c.center.y - centerY)).toFixed(6));
                    geometry.translate(centerXPrecise, centerYPrecise, 0);

                    const finalColor = isStage ? '#ff6b35' : c.color;
                    const lineWidth = isStage ? 3 : 1;

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

                // Arcs - with high precision
                arcs.forEach((a: any) => {
                    // High precision arc center
                    const centerXPrecise = parseFloat((a.center.x - centerX).toFixed(6));
                    const centerYPrecise = parseFloat((-(a.center.y - centerY)).toFixed(6));
                    
                    const curve = new THREE.ArcCurve(
                        centerXPrecise,
                        centerYPrecise,
                        a.radius,
                        a.startAngle,
                        a.endAngle
                    );
                    const points = curve.getPoints(64).map((p: any) => new THREE.Vector3(
                        parseFloat(p.x.toFixed(6)), 
                        parseFloat(p.y.toFixed(6)), 
                        0
                    ));
                    const geometry = new THREE.BufferGeometry().setFromPoints(points);

                    const finalColor = isStage ? '#ff6b35' : a.color;
                    const lineWidth = isStage ? 3 : 1;

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

                // Texts - Render all texts (optimized with proper cleanup)
                const MAX_TEXTS = 500; // Increased limit - optimized sprites can handle more
                const textsToRender = texts.slice(0, MAX_TEXTS);
                
                let textIndex = 0;
                textsToRender.forEach((t: any) => {
                    // Validate text data before rendering
                    if (!t.text || !t.position || t.position.x == null || t.position.y == null) {
                        return;
                    }

                    const textContent = String(t.text).trim();
                    if (!textContent) return; // Skip empty texts

                    const textHeight = Math.max(0.1, Math.min(100, t.textHeight || t.height || 10));
                    const rotation = t.rotation || 0;
                    const finalColor = isStage ? '#ff6b35' : (t.color || '#000000');
                    
                    try {
                        // High precision text position
                        const textX = parseFloat((t.position.x - centerX).toFixed(6));
                        const textY = parseFloat((-(t.position.y - centerY)).toFixed(6));

                        if (!isFinite(textX) || !isFinite(textY)) return; // Skip invalid positions

                        // Add unique Z-offset to prevent stacking/z-fighting
                        const zOffset = 1 + (textIndex * 0.01);
                        textIndex++;

                        tempElements.push(
                            <SimpleTextSprite
                                key={`text-${i++}`}
                                text={textContent}
                                position={[textX, textY, zOffset]}
                                fontSize={textHeight}
                                color={finalColor}
                                rotation={-rotation * Math.PI / 180}
                            />
                        );
                    } catch (err) {
                        console.warn('Failed to render text:', t.text, err);
                    }
                });

                setElements(tempElements);
                // Notify dimensions
                if (onDimensions) {
                    onDimensions({
                        width: width,
                        height: height,
                        naturalWidth: width,
                        naturalHeight: height
                    });
                }

                // Expose area bounds (converted to world coords centered + Y-flip)
                if (onAreaBounds) {
                    const converted: Record<string, { minX: number; maxX: number; minY: number; maxY: number }> = {};
                    Object.entries(layerBounds).forEach(([k, b]) => {
                        converted[k] = {
                            minX: b.minX - centerX,
                            maxX: b.maxX - centerX,
                            minY: -(b.maxY - centerY),
                            maxY: -(b.minY - centerY)
                        };
                    });
                    onAreaBounds(converted);
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

    // compute scale to fit
    let scaleX = 1, scaleY = 1;
    if (fitTo && naturalSize.width > 0 && naturalSize.height > 0) {
        scaleX = fitTo.width / naturalSize.width;
        scaleY = fitTo.height / naturalSize.height;
    } else if (stageConfig?.width && naturalSize.width > 0 && naturalSize.height > 0) {
        // Use stage config width and auto-calculate height to maintain aspect ratio
        scaleX = stageConfig.width / naturalSize.width;
        scaleY = scaleX; // Maintain aspect ratio
    } else if (stageConfig?.height && naturalSize.width > 0 && naturalSize.height > 0) {
        // Use stage config height and auto-calculate width to maintain aspect ratio
        scaleY = stageConfig.height / naturalSize.height;
        scaleX = scaleY; // Maintain aspect ratio
    } else if (stageConfig?.width && stageConfig?.height && naturalSize.width > 0 && naturalSize.height > 0) {
        // Use both width and height if both provided (may stretch)
        scaleX = stageConfig.width / naturalSize.width;
        scaleY = stageConfig.height / naturalSize.height;
    }

    // Apply rotation if stage config has rotation
    const rotation = stageConfig?.rotation || 0;

    // Calculate actual rendered dimensions
    const renderedWidth = naturalSize.width * scaleX;
    const renderedHeight = naturalSize.height * scaleY;

    return {
        groupRef,
        elements,
        naturalSize,
        isLoading,
        scaleX,
        scaleY,
        rotation,
        renderedWidth,
        renderedHeight
    };
}

export function DXFModel({
    url,
    onProgress,
    onAreaBounds,
    onDimensions,
    position = [0, 0, 0],
    fitTo,
    isStage = false,
    stageConfig
}: DXFModelProps) {
    const { groupRef, elements, scaleX, scaleY, rotation, renderedWidth, renderedHeight } = useDXFRenderer({
        url,
        onProgress,
        onAreaBounds,
        onDimensions,
        position,
        fitTo,
        isStage,
        stageConfig
    });

    return (
        <group
            ref={groupRef}
            position={position}
            scale={[scaleX, scaleY, 1]}
            rotation={[0, 0, (rotation * Math.PI) / 180]}
        >
            {elements}
        </group>
    );
}