'use client';

import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';

interface SimpleTextSpriteProps {
  text: string;
  position: [number, number, number];
  fontSize?: number;
  color?: string;
  rotation?: number;
}

/**
 * Simple Text Sprite Component
 * Renders text using canvas textures - more reliable than 3D text
 * Optimized to properly dispose textures and prevent memory leaks
 */
export function SimpleTextSprite({
  text,
  position,
  fontSize = 10,
  color = '#000000',
  rotation = 0
}: SimpleTextSpriteProps) {
  const { texture, scaleX, scaleY } = useMemo(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { 
        willReadFrequently: false,
        alpha: true 
      });
      if (!context) return { texture: null, scaleX: 1, scaleY: 1 };

      // Use higher DPI for crisp text
      const dpr = 2;
      const baseFontSize = Math.max(fontSize, 8);
      
      // Measure text to get natural dimensions
      context.font = `${baseFontSize * dpr}px Arial, sans-serif`;
      const metrics = context.measureText(text);
      const textWidth = metrics.width;
      const textHeight = baseFontSize * dpr * 1.5; // Natural text height
      
      // Set canvas to natural text dimensions (no padding to avoid stretching)
      canvas.width = textWidth + 10 * dpr;
      canvas.height = textHeight;

      // High quality rendering
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      // Configure text - LEFT ALIGNED like in CAD software
      context.font = `${baseFontSize}px Arial, sans-serif`;
      context.fillStyle = color;
      context.textAlign = 'center'; // Changed from 'center' to 'left' to match CAD alignment
      context.textBaseline = 'middle';
      
      // White outline for visibility
      context.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      context.lineWidth = 3;
      context.strokeText(text, canvas.width / 2, canvas.height / 2);
      
      // Draw text
      context.fillText(text, canvas.width / 2, canvas.height / 2);

      // Create texture
      const canvasTexture = new THREE.CanvasTexture(canvas);
      canvasTexture.needsUpdate = true;
      canvasTexture.minFilter = THREE.LinearFilter;
      canvasTexture.magFilter = THREE.LinearFilter;
      
      // Calculate scale to maintain natural aspect ratio
      // Scale is based on fontSize to world units
      const worldScale = baseFontSize * 4; // Multiplier for readability
      
      // Maintain natural aspect ratio by scaling width and height independently
      const aspectRatio = canvas.width / canvas.height;
      const finalScaleX = worldScale * aspectRatio;
      const finalScaleY = worldScale;

      return { texture: canvasTexture, scaleX: finalScaleX, scaleY: finalScaleY };
    } catch (err) {
      console.warn('Failed to create text sprite:', err);
      return { texture: null, scaleX: 1, scaleY: 1 };
    }
  }, [text, fontSize, color]);

  // Cleanup texture on unmount
  useEffect(() => {
    return () => {
      if (texture) {
        texture.dispose();
      }
    };
  }, [texture]);

  if (!texture) return null;

  return (
    <sprite 
      position={position} 
      rotation={[0, 0, rotation]} 
      scale={[scaleX, scaleY, 1]}
      renderOrder={999}
    >
      <spriteMaterial
        attach="material"
        map={texture}
        transparent
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}

export default SimpleTextSprite;

