'use client';

import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { extractSimpleEntities, SimpleDxfEntity } from '@utils/simpleDxfExtractor';

interface SimpleDxfOverlayProps {
  dxfUrl: string;
  position?: [number, number, number];
  color?: string;
  width?: number;  // Target width to scale to
  height?: number; // Target height to scale to
  rotation?: number; // Rotation in degrees
}

/**
 * Simple DXF overlay component - renders entities directly without complex transformations
 * Perfect for overlaying models on top of floor plans
 */
export function SimpleDxfOverlay({ dxfUrl, position = [0, 0, 0], color, width, height, rotation = 0 }: SimpleDxfOverlayProps) {
  const groupRef = React.useRef<THREE.Group>(null);
  const [entities, setEntities] = useState<SimpleDxfEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });

  // Load entities only when URL changes (not on position/rotation/color changes)
  useEffect(() => {
    let mounted = true;

    async function loadEntities() {
      setIsLoading(true);
      // Extract entities centered at origin, then position with React group
      // This allows us to use the predefined coordinates from config
      const extractedEntities = await extractSimpleEntities(dxfUrl, { ignorePosition: true });
      
      if (mounted && extractedEntities.length > 0) {
        // Calculate natural bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        extractedEntities.forEach(entity => {
          entity.vertices?.forEach(v => {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
          });
        });
        
        const natWidth = maxX - minX;
        const natHeight = maxY - minY;
        
        setNaturalSize({ 
          width: natWidth > 0 ? natWidth : 1, 
          height: natHeight > 0 ? natHeight : 1 
        });
        setEntities(extractedEntities);
        setIsLoading(false);
      }
    }

    loadEntities();

    return () => {
      mounted = false;
    };
  }, [dxfUrl]); // Only reload when URL changes, NOT on position/rotation changes

  // Build geometry only when entities or color changes (not on position/rotation)
  useEffect(() => {
    if (!groupRef.current || entities.length === 0) return;

    // Clear previous objects
    groupRef.current.clear();

    entities.forEach((entity) => {
      let obj: THREE.Object3D | null = null;
      
      // Use custom color or entity color
      const entityColor = color || (entity.color ? new THREE.Color(entity.color as any) : new THREE.Color(0xff0000));

      switch (entity.type) {
        case "LINE": {
          if (!entity.vertices || entity.vertices.length < 2) break;
          const points = entity.vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z || 0));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({ 
            color: entityColor,
            linewidth: 2 
          });
          obj = new THREE.Line(geometry, material);
          break;
        }

        case "LWPOLYLINE":
        case "POLYLINE": {
          if (!entity.vertices || entity.vertices.length < 2) break;
          const points = entity.vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z || 0));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({ 
            color: entityColor,
            linewidth: 2 
          });
          obj = new THREE.LineLoop(geometry, material);
          break;
        }

        case "CIRCLE":
        case "ARC": {
          if (!entity.vertices || entity.vertices.length < 2) break;
          const points = entity.vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z || 0));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({ 
            color: entityColor,
            linewidth: 2 
          });
          obj = new THREE.LineLoop(geometry, material);
          break;
        }

        case "SPLINE": {
          if (!entity.vertices || entity.vertices.length < 2) break;
          const points = entity.vertices.map((v) => new THREE.Vector3(v.x, v.y, v.z || 0));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const material = new THREE.LineBasicMaterial({ 
            color: entityColor,
            linewidth: 2 
          });
          obj = new THREE.Line(geometry, material);
          break;
        }
      }

      if (obj && groupRef.current) {
        groupRef.current.add(obj);
      }
    });
  }, [entities, color]); // Only rebuild geometry when entities or color changes

  // Calculate scale based on width/height config - memoized to prevent recalculation
  const uniformScale = React.useMemo(() => {
    const scaleX = width && naturalSize.width > 0 ? width / naturalSize.width : 1;
    const scaleY = height && naturalSize.height > 0 ? height / naturalSize.height : 1;
    
    // Use uniform scale (smallest of the two to maintain aspect ratio)
    return width && height 
      ? Math.min(scaleX, scaleY)  // Both specified: maintain aspect ratio
      : (width ? scaleX : (height ? scaleY : 1));  // One specified: use that dimension
  }, [width, height, naturalSize]);

  if (isLoading) {
    return null; // or a loading indicator
  }

  return (
    <group 
      ref={groupRef} 
      position={position} 
      scale={[uniformScale, uniformScale, 1]}
      rotation={[0, 0, (rotation * Math.PI) / 180]}
    />
  );
}

