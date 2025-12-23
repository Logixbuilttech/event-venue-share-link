'use client';

import { useRef, useEffect, useState } from 'react';
import { AdvancedDXFModel } from '@utils/advancedDxfRenderer';
import type { HallObject } from '@models/objects';

interface DXFTableRendererProps {
  object: HallObject;
  onProgress?: (progress: number) => void;
}

export default function DXFTableRenderer({ object, onProgress }: DXFTableRendererProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (object.fileName) {
      setIsLoaded(true);
    }
  }, [object.fileName]);

  if (!object.fileName || !isLoaded) {
    // Fallback to basic geometry if no DXF file
    return (
      <mesh position={[0, 0, 0.1]}>
        <boxGeometry args={[object.width, object.height, 0.2]} />
        <meshBasicMaterial
          color={object.type === 'table' ? '#8B4513' : '#654321'}
          transparent
          opacity={0.8}
        />
      </mesh>
    );
  }

  return (
    <AdvancedDXFModel
      url={`/${object.fileName}`}
      onProgress={onProgress || (() => {})}
      position={[0, 0, 0.1]}
      scale={[object.width, object.height, 1]}
      rotation={[0, 0, (object.rotation || 0) * (Math.PI / 180)]}
    />
  );
}
