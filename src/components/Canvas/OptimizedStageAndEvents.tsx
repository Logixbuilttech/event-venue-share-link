import * as THREE from 'three';
import { useGLTF, Text, Billboard } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { StageConfig } from '@config/stages';
import type { EventConfig } from '@config/events';
import { useEffect, useState, useMemo, memo, useRef } from 'react';
import { useScaleFactor } from './HallCanvas3DWalk';
import type { EventObjectMountPointsWorld } from '@config/events';
import { useCachedGLB } from '@utils/glbModelCache';
import { createSharedModelInstance } from '@utils/sharedModelResources';
import { optimizeMaterialTextures, removeExpensiveMaps } from '@utils/textureOptimizer';
import { feetToDXFUnits } from '@config/venues';

// Scale factor will be provided by context from HallCanvas3DWalk

interface OptimizedStageProps {
  stage: StageConfig;
  centerOffset: { x: number; y: number };
}

/**
 * Backstage 3D Visualization Component
 */
const Backstage3D = memo(function Backstage3D({
  stage,
  scaleFactor,
  position,
  rotation
}: {
  stage: StageConfig,
  scaleFactor: number,
  position: [number, number, number],
  rotation: number
}) {
  if (!stage.backstageDepth || stage.backstageDepth <= 0) return null;

  // Dimensions in 3D units
  const backstageDepth3D = (stage.backstageDepth * 12) / scaleFactor; // visual depth of the backstage area
  const stageWidth3D = (stage.customWidth || stage.width || 200) / scaleFactor;
  const stageDepth3D = (stage.customHeight || stage.height || 100) / scaleFactor;
  console.log('stageDepth3D', stageDepth3D);
  // Determine position and dimensions based on side
  const side = stage.backstageSide || 'left';
  let bPosX = 0;
  let bPosZ = 0;
  let bWidth = 0;
  let bDepth = 0;

  // In local space: X is width, Z is depth.
  switch (side) {
    case 'left':
      bPosX = -stageWidth3D / 2 - backstageDepth3D / 2;
      bPosZ = 0;
      bWidth = backstageDepth3D;
      bDepth = stageDepth3D;
      break;
    case 'right':
      bPosX = stageWidth3D / 2 + backstageDepth3D / 2;
      bPosZ = 0;
      bWidth = backstageDepth3D;
      bDepth = stageDepth3D;
      break;
    case 'top':
      // Top in 2D (Min Y) usually maps to -Z in 3D (North)
      bPosX = 0;
      bPosZ = (-stageDepth3D / 2 - backstageDepth3D / 2) - 3.4;
      bWidth = stageWidth3D;
      bDepth = backstageDepth3D;
      break;
    case 'bottom':
      bPosX = 0;
      bPosZ = stageDepth3D / 2 + backstageDepth3D / 2;
      bWidth = stageWidth3D;
      bDepth = backstageDepth3D;
      break;
  }

  // Color coding
  const color = stage.backstageDepth < 6 ? '#ef4444' : // Red
    stage.backstageDepth < 10 ? '#eab308' : // Yellow
      '#22c55e'; // Green

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Backstage Area Visual */}
      <group position={[bPosX, 0.05, bPosZ]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[bWidth, bDepth]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>

        {/* Text Label */}
        <Billboard
          position={[0, 0.5, 0]}
          follow={true}
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          <Text
            fontSize={0.5}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {`${stage.backstageDepth} ft`}
          </Text>
        </Billboard>
      </group>
    </group>
  );
});

/**
 * Simple Stage Component - Uses pre-optimized GLB or fallback geometry
 */
export const OptimizedStage3D = memo(function OptimizedStage3D({ stage, centerOffset }: OptimizedStageProps) {
  if (!stage) return null;
  console.log('stage', stage);
  // const scaleFactor = useScaleFactor();
  // console.log('scaleFactor', scaleFactor);
  const scaleFactor = 47.5;

  // Get footprint dimensions (DXF units)
  const footprintWidthDxf = stage.customWidth ?? stage.width ?? 200;
  const footprintDepthDxf = stage.depth ?? stage.customHeight ?? stage.height ?? 100;

  // Check if custom world position is provided
  const hasCustomWorldPosition = !!stage.worldPosition;

  let x: number;
  let z: number;
  let y: number = 0; // Default elevation

  if (hasCustomWorldPosition) {
    x = stage.worldPosition!.x;
    y = stage.worldPosition!.y;
    z = stage.worldPosition!.z;
  } else {
    // Determine Center Coords
    // Predefined stages (not custom) use Top-Center logic in 2D (x=Center, y=Top)
    let centerX_DXF = stage.x + (feetToDXFUnits(stage.backstageDepth ?? 0) ?? 0);
    let centerY_DXF = stage.y;

    if (!stage.isCustom) {
      // Calculate visual height to adjust Top -> Center
      const rotRad = (stage.rotation || 0) * (Math.PI / 180);
      const visualHeightDxf = Math.abs(footprintWidthDxf * Math.sin(rotRad)) + Math.abs(footprintDepthDxf * Math.cos(rotRad));

      // Adjust Y (Top) to Center
      // Assuming Y is "Top" (Northern-most / Min Y in visual / Max Y in Cartesian?)
      // In 2D we did: y - visualHeight/2. 
      // This implies y is the "Up" edge (Cartesian Max Y).
      centerY_DXF = stage.y - visualHeightDxf / 2;

      // Match 2D logic: Unconditionally shift X by Backstage Depth to "add space"
      if (stage.backstageDepth) {
        centerX_DXF += stage.backstageDepth;
      }
    }

    // Convert to 3D
    x = (centerX_DXF - centerOffset.x) / scaleFactor;
    z = -(centerY_DXF - centerOffset.y) / scaleFactor;
  }

  // Convert dimensions to world units
  const width = footprintWidthDxf / scaleFactor;
  const depth = footprintDepthDxf / scaleFactor;
  const height = 1; // Fixed height

  // Rotation
  const baseRotation = THREE.MathUtils.degToRad(stage.rotation || 0);
  const glbRotation = THREE.MathUtils.degToRad(stage.glbRotation || 0);
  const totalRotation = baseRotation + glbRotation;

  const hasGlb = !!stage.glbFileName;

  return (
    <>
      {hasGlb ? (
        <SimpleStageGLB
          glbPath={stage.glbFileName!}
          position={[x, 0, z]}
          rotation={totalRotation}
          stageId={stage.id}
          targetWidth={width}
          targetDepth={depth}
        />
      ) : (
        <group position={[x, height / 2, z]} rotation={[0, baseRotation, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width, height, depth]} />
            <meshStandardMaterial color="#ff0000" />
          </mesh>
        </group>
      )}

      {/* Render Backstage Visualization */}
      <Backstage3D
        stage={stage}
        scaleFactor={scaleFactor}
        position={[x, 0, z]}
        rotation={totalRotation}
      />
    </>
  );
});

interface SimpleStageGLBProps {
  glbPath: string;
  position: [number, number, number];
  rotation: number;
  stageId: string;
  targetWidth?: number; // Expected width from DXF (in 3D units)
  targetDepth?: number; // Expected depth from DXF (in 3D units)
}

/**
 * Simple Stage GLB Component - With scaling to match DXF dimensions
 */
const SimpleStageGLB = memo(function SimpleStageGLB({
  glbPath,
  position,
  rotation,
  stageId,
  targetWidth,
  targetDepth
}: SimpleStageGLBProps) {
  // Calculate scale and center offset
  const [stageScale, setStageScale] = useState<number>(1);
  const [centerOffset, setCenterOffset] = useState<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  const [hasError, setHasError] = useState(false);

  // Load the GLB scene - hook MUST be called unconditionally
  const gltf = useGLTF(`/${glbPath}`);

  // Use cached model for better memory management
  // Note: useGLTF already caches, but we track references
  const sceneToUse = useCachedGLB(glbPath, stageId) || gltf.scene;

  // Calculate uniform scale and center offset - Stage x,y is CENTER position
  useEffect(() => {
    if (!sceneToUse || !targetWidth || !targetDepth) return;

    try {
      // Get GLB model's bounding box
      const box = new THREE.Box3().setFromObject(sceneToUse);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Calculate scale for both dimensions separately
      const scaleX = targetWidth / size.x;
      const scaleZ = targetDepth / size.z;

      // Use uniform scale based on the maximum dimension to ensure the stage fits within bounds
      // This prevents the stage from exceeding the target footprint in any direction
      const modelMaxSize = Math.max(size.x, size.z);
      const targetMaxSize = Math.max(targetWidth, targetDepth);
      const calculatedScale = targetMaxSize / modelMaxSize;

      // However, if the aspect ratios are very different, use the smaller scale
      // to ensure we don't exceed either dimension
      const minScale = Math.min(scaleX, scaleZ);
      const finalScale = Math.min(calculatedScale, minScale);

      // Calculate offset to center the model at the position (X and Z)
      // The position is the CENTER of the stage footprint, so we need to center the bounding box
      // Y offset should place the model ON TOP of the floor (min.y at floor level)
      const minY = box.min.y;

      const offset = new THREE.Vector3(
        -center.x * finalScale,  // Center X - centers the bounding box at the position
        -minY * finalScale,       // Bottom at floor level (y=0)
        -center.z * finalScale   // Center Z - centers the bounding box at the position
      );

      setStageScale(calculatedScale);
      setCenterOffset(offset);
    } catch (error) {
      console.error('Error calculating scale:', error);
      setHasError(true);
    }
  }, [sceneToUse, targetWidth, targetDepth]);

  // Create lightweight clone that shares geometries and materials
  const clonedScene = useMemo(() => {
    if (!sceneToUse) return null;

    // Use shared resources to create a lightweight clone
    const modelKey = glbPath; // Use GLB path as the key for sharing
    const lightweightClone = createSharedModelInstance(sceneToUse, modelKey);

    // Configure shadows and optimize materials
    lightweightClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Optimize materials to reduce memory usage
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(mat => {
            optimizeMaterialTextures(mat);
          });
        }
      }
    });

    return lightweightClone;
  }, [sceneToUse, glbPath, stageId]);

  // Show fallback if error or no scene
  if (hasError || !clonedScene) {
    return (
      <group position={position} rotation={[0, rotation, 0]}>
        <mesh castShadow={false} receiveShadow={false} position={[0, 0.5, 0]}>
          <boxGeometry args={[targetWidth || 4, 1, targetDepth || 2]} />
          <meshStandardMaterial color="#ff0000" />
        </mesh>
      </group>
    );
  }

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
        <primitive object={clonedScene} scale={stageScale} />
      </group>
    </group>
  );
});

interface EventObjectProps {
  event: EventConfig;
  centerOffset: { x: number; y: number };
}

/**
 * Simple Event Object Component - Renders event-specific objects (cars, consoles, etc.)
 */
export const OptimizedEventObject3D = memo(function OptimizedEventObject3D({ event, centerOffset }: EventObjectProps) {
  if (!event || !event.objects || event.objects.length === 0) return null;

  const scaleFactor = useScaleFactor();

  return (
    <>
      {event.objects.map((obj, index) => {
        const mountPoints = obj.mountPoints;
        const mountPointsWorld = obj.mountPointsWorld;
        const hasCustomWorldPosition = !!obj.worldPosition;

        let centerX: number = obj.x;
        let centerY: number = obj.y;
        let derivedWidth: number | undefined = obj.width;
        let derivedHeight: number | undefined = obj.height;
        let derivedElevation = 0;

        let baseRotationDeg = obj.rotation || 0;
        let planeNormal: THREE.Vector3 | null = null;
        let worldPosition: THREE.Vector3 | null = null;
        let widthWorld: number | undefined;
        let heightWorld: number | undefined;
        let rotationQuaternion: THREE.Quaternion | null = null;

        if (obj.worldPosition) {
          worldPosition = new THREE.Vector3(
            obj.worldPosition.x,
            obj.worldPosition.y,
            obj.worldPosition.z
          );
          derivedElevation = worldPosition.y;
        }

        if (mountPointsWorld) {
          const topLeft = new THREE.Vector3(
            mountPointsWorld.topLeft.x,
            mountPointsWorld.topLeft.y,
            mountPointsWorld.topLeft.z
          );
          const topRight = new THREE.Vector3(
            mountPointsWorld.topRight.x,
            mountPointsWorld.topRight.y,
            mountPointsWorld.topRight.z
          );
          const bottomLeft = new THREE.Vector3(
            mountPointsWorld.bottomLeft.x,
            mountPointsWorld.bottomLeft.y,
            mountPointsWorld.bottomLeft.z
          );
          const bottomRight = new THREE.Vector3(
            mountPointsWorld.bottomRight.x,
            mountPointsWorld.bottomRight.y,
            mountPointsWorld.bottomRight.z
          );

          const horizontal = topRight.clone().sub(topLeft);
          const vertical = bottomLeft.clone().sub(topLeft);

          widthWorld = horizontal.length();
          heightWorld = vertical.length();

          const computedWorldPosition = topLeft
            .clone()
            .add(topRight)
            .add(bottomRight)
            .add(bottomLeft)
            .multiplyScalar(0.25);

          if (!worldPosition) {
            worldPosition = computedWorldPosition;
          }

          if (worldPosition) {
            derivedElevation = worldPosition.y;
          }

          const basisX = horizontal.clone().normalize();
          const basisY = topLeft.clone().sub(bottomLeft).normalize();
          const normal = new THREE.Vector3().crossVectors(basisX, basisY).normalize();
          planeNormal = normal.lengthSq() > 0.000001 ? normal : new THREE.Vector3(0, 0, 1);

          const orientationMatrix = new THREE.Matrix4().makeBasis(basisX, basisY, planeNormal);
          rotationQuaternion = new THREE.Quaternion().setFromRotationMatrix(orientationMatrix);

          baseRotationDeg = 0;
        } else if (mountPoints) {
          const { topLeft, topRight, bottomRight, bottomLeft } = mountPoints;
          centerX = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
          centerY = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;

          derivedWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
          derivedHeight = Math.hypot(topLeft.x - bottomLeft.x, topLeft.y - bottomLeft.y);

          const mountRotationDeg = THREE.MathUtils.radToDeg(
            Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x)
          );

          const topElevation =
            ((topLeft.z ?? bottomLeft.z ?? 0) + (topRight.z ?? bottomRight.z ?? 0)) / 2;
          const bottomElevation =
            ((bottomLeft.z ?? topLeft.z ?? 0) + (bottomRight.z ?? topRight.z ?? 0)) / 2;
          derivedElevation = (topElevation + bottomElevation) / 2;

          const convertPointToWorld = (point: { x: number; y: number; z?: number }) => {
            const deltaX = point.x - centerOffset.x;
            const deltaY = point.y - centerOffset.y;
            const worldX = deltaX / scaleFactor;
            const worldY = (point.z ?? 0) / scaleFactor;
            const worldZ = -deltaY / scaleFactor;
            return new THREE.Vector3(worldX, worldY, worldZ);
          };

          const topLeftWorld = convertPointToWorld(topLeft);
          const topRightWorld = convertPointToWorld(topRight);
          const bottomLeftWorld = convertPointToWorld(bottomLeft);

          const horizontal = topRightWorld.clone().sub(topLeftWorld);
          const vertical = bottomLeftWorld.clone().sub(topLeftWorld);
          const normal = new THREE.Vector3().crossVectors(horizontal, vertical);
          if (normal.lengthSq() > 0.000001) {
            planeNormal = normal.normalize();
          }

          const computedWorldPosition = topLeftWorld
            .clone()
            .add(topRightWorld)
            .add(bottomLeftWorld)
            .add(convertPointToWorld(bottomRight))
            .multiplyScalar(0.25);

          if (!worldPosition) {
            worldPosition = computedWorldPosition;
          }

          baseRotationDeg += mountRotationDeg;
        } else {
          const positionOrigin = obj.positionOrigin ?? 'top-left';
          const useTopLeftOrigin = positionOrigin === 'top-left';
          const widthOffset = useTopLeftOrigin && obj.width ? obj.width / 2 : 0;
          const heightOffset = useTopLeftOrigin && obj.height ? obj.height / 2 : 0;
          centerX = obj.x + widthOffset;
          centerY = obj.y - heightOffset;
        }

        if (!worldPosition) {
          const deltaX = centerX - centerOffset.x;
          const deltaY = centerY - centerOffset.y;
          worldPosition = new THREE.Vector3(
            deltaX / scaleFactor,
            derivedElevation / scaleFactor,
            -(deltaY / scaleFactor)
          );
        }

        let targetWidth = (() => {
          if (obj.glbWidth) {
            return obj.glbWidth / scaleFactor;
          }
          if (mountPointsWorld && widthWorld !== undefined) {
            return widthWorld;
          }
          if (derivedWidth !== undefined) {
            return derivedWidth / scaleFactor;
          }
          return undefined;
        })();

        let targetHeight = (() => {
          if (obj.glbHeight) {
            return obj.glbHeight / scaleFactor;
          }
          if (mountPointsWorld && heightWorld !== undefined) {
            return heightWorld;
          }
          if (derivedHeight !== undefined) {
            return derivedHeight / scaleFactor;
          }
          return undefined;
        })();

        let targetDepth = obj.glbDepth
          ? obj.glbDepth / scaleFactor
          : obj.depth
            ? obj.depth / scaleFactor
            : undefined;

        const totalRotation = mountPointsWorld
          ? 0
          : THREE.MathUtils.degToRad(baseRotationDeg + (obj.glbRotation || 0));

        if (!hasCustomWorldPosition && !mountPointsWorld && planeNormal && targetDepth !== undefined && targetDepth > 0) {
          const wallOffset = planeNormal.clone().multiplyScalar(targetDepth / 2);
          worldPosition = worldPosition.sub(wallOffset);
        }
        if (rotationQuaternion) {
          const rotationAxis = planeNormal ?? new THREE.Vector3(0, 1, 0);
          const combinedRotation = (obj.rotation || 0) + (obj.glbRotation || 0);
          if (Math.abs(combinedRotation) > 0.0001) {
            const axisQuat = new THREE.Quaternion().setFromAxisAngle(
              rotationAxis,
              THREE.MathUtils.degToRad(combinedRotation)
            );
            rotationQuaternion.multiply(axisQuat);
          }

          if (widthWorld !== undefined) {
            targetWidth = widthWorld;
          }
          if (heightWorld !== undefined) {
            targetHeight = heightWorld;
          }
        }
        // Check if object has GLB file
        const hasGlb = !!obj.glbFileName;

        if (hasGlb) {
          return (
            <SimpleEventObjectGLB
              key={`${event.id}-${obj.id}-${index}`}
              glbPath={obj.glbFileName!}
              position={[worldPosition.x, worldPosition.y, worldPosition.z]}
              rotation={totalRotation}
              rotationQuaternion={rotationQuaternion ?? undefined}
              objectId={`${event.id}-${obj.id}-${index}`}
              targetWidth={targetWidth}
              targetDepth={targetDepth}
              targetHeight={targetHeight}
              scaleMultiplier={obj.scale}
              mountPointsWorld={mountPointsWorld}
              colorOverride={obj.color}
            />
          );
        }

        // Fallback: Simple box geometry with color (if no GLB provided)
        // Use defaults only for fallback geometry when no GLB is available
        // const color = obj.color || '#00ff00';
        // const DEFAULT_FALLBACK_WIDTH = 108 / scaleFactor;
        // const DEFAULT_FALLBACK_HEIGHT = 108 / scaleFactor;
        // const DEFAULT_FALLBACK_DEPTH = 50 / scaleFactor;
        // const fallbackWidth = targetWidth ?? DEFAULT_FALLBACK_WIDTH;
        // const fallbackHeight = targetHeight ?? DEFAULT_FALLBACK_HEIGHT;
        // const fallbackDepth = targetDepth ?? DEFAULT_FALLBACK_DEPTH;
        // const fallbackRotationProps = rotationQuaternion
        //   ? { quaternion: rotationQuaternion }
        //   : { rotation: [0, totalRotation, 0] as [number, number, number] };

        // return (
        //   <group 
        //     key={`${event.id}-${obj.id}-${index}`}
        //     position={[worldPosition.x, worldPosition.y + fallbackHeight / 2, worldPosition.z]} 
        //     {...fallbackRotationProps}
        //   >
        //     <mesh castShadow receiveShadow>
        //       <boxGeometry args={[fallbackWidth, fallbackHeight, fallbackDepth]} />
        //       <meshStandardMaterial color={color} />
        //     </mesh>
        //   </group>
        // );
      })}
    </>
  );
});

interface SimpleEventObjectGLBProps {
  glbPath: string;
  position: [number, number, number];
  rotation: number;
  rotationQuaternion?: THREE.Quaternion;
  objectId: string;
  targetWidth?: number;
  targetDepth?: number;
  targetHeight?: number;
  scaleMultiplier?: number; // Optional scale multiplier (e.g., 2 = double size)
  mountPointsWorld?: EventObjectMountPointsWorld;
  colorOverride?: string; // Optional color override (e.g., '#FFD700')
}

/**
 * Simple Event Object GLB Component - Dynamic sizing with scale multiplier support
 */
const SimpleEventObjectGLB = memo(function SimpleEventObjectGLB({
  glbPath,
  position,
  rotation,
  rotationQuaternion,
  objectId,
  targetWidth,
  targetDepth,
  targetHeight,
  scaleMultiplier = 1,
  mountPointsWorld,
  colorOverride
}: SimpleEventObjectGLBProps) {
  // Calculate scale and center offset
  const [eventScale, setEventScale] = useState<THREE.Vector3>(() => new THREE.Vector3(1, 1, 1));
  const [centerOffset, setCenterOffset] = useState<THREE.Vector3>(() => new THREE.Vector3(0, 0, 0));
  const [hasError, setHasError] = useState(false);

  // Load the GLB scene - hook MUST be called unconditionally
  const gltf = useGLTF(`/${glbPath}`);

  // Use cached model for better memory management
  // Note: useGLTF already caches, but we track references
  const sceneToUse = useCachedGLB(glbPath, objectId) || gltf.scene;

  // Frustum culling - only render if visible (optimized, check less frequently)
  const { camera } = useThree();
  const [isVisible, setIsVisible] = useState(true);
  const positionVec = useMemo(() => new THREE.Vector3(...position), [position]);
  const boundingRadiusRef = useRef<number>(10); // Default radius

  useEffect(() => {
    if (!camera || !sceneToUse) return;

    // Calculate bounding radius once
    if (sceneToUse) {
      const box = new THREE.Box3().setFromObject(sceneToUse);
      const size = box.getSize(new THREE.Vector3());
      boundingRadiusRef.current = Math.max(size.x, size.y, size.z) * 0.6; // Use 60% of max dimension
    }
  }, [sceneToUse]);

  useEffect(() => {
    if (!camera || !sceneToUse) return;

    const checkVisibility = () => {
      try {
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(matrix);

        // Use cached bounding radius
        const sphere = new THREE.Sphere(positionVec, boundingRadiusRef.current);
        setIsVisible(frustum.intersectsSphere(sphere));
      } catch (error) {
        // If frustum check fails, show object (fail-safe)
        setIsVisible(true);
      }
    };

    checkVisibility();
    // Check less frequently to reduce CPU usage (every 2 seconds)
    const interval = setInterval(checkVisibility, 2000);

    return () => clearInterval(interval);
  }, [camera, sceneToUse, positionVec]);

  // Calculate uniform scale and center offset - Use model's actual size if dimensions not provided
  useEffect(() => {
    if (!sceneToUse) return;

    try {
      const box = new THREE.Box3().setFromObject(sceneToUse);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      const newScale = new THREE.Vector3(1, 1, 1);

      if (mountPointsWorld) {
        if (targetWidth && size.x !== 0) newScale.x = targetWidth / size.x;
        if (targetHeight && size.y !== 0) newScale.y = targetHeight / size.y;
        if (targetDepth && targetDepth > 0 && size.z !== 0) {
          newScale.z = targetDepth / size.z;
        } else {
          const average = (newScale.x + newScale.y) / 2;
          newScale.z = average;
        }
      } else {
        let calculatedScale = 1;

        if (targetWidth && targetDepth) {
          const modelMaxSize = Math.max(size.x, size.z);
          const targetMaxSize = Math.max(targetWidth, targetDepth);
          calculatedScale = targetMaxSize / modelMaxSize;
        } else if (targetWidth) {
          calculatedScale = targetWidth / size.x;
        } else if (targetDepth) {
          calculatedScale = targetDepth / size.z;
        } else if (targetHeight) {
          calculatedScale = targetHeight / size.y;
        }

        newScale.setScalar(calculatedScale);
      }

      newScale.multiplyScalar(scaleMultiplier);

      const newOffset = mountPointsWorld
        ? new THREE.Vector3(
          -center.x * newScale.x,
          -center.y * newScale.y,
          -center.z * newScale.z
        )
        : new THREE.Vector3(
          -center.x * newScale.x,
          -box.min.y * newScale.y,
          -center.z * newScale.z
        );

      if (!eventScale.equals(newScale)) {
        setEventScale(newScale.clone());
      }
      if (!centerOffset.equals(newOffset)) {
        setCenterOffset(newOffset.clone());
      }
    } catch (error) {
      console.error('Error calculating event scale:', error);
      setHasError(true);
    }
  }, [
    sceneToUse,
    targetWidth,
    targetDepth,
    targetHeight,
    scaleMultiplier,
    mountPointsWorld,
    eventScale,
    centerOffset
  ]);

  // Create lightweight clone that shares geometries and materials
  // This dramatically reduces memory usage for repeated models (booths, cameraman, etc.)
  const clonedScene = useMemo(() => {
    if (!sceneToUse) return null;

    // Parse color override if provided
    const overrideColor = colorOverride ? new THREE.Color(colorOverride) : null;

    // If no color override, use direct clone to preserve original GLB colors exactly
    // If color override is specified, use shared resources for memory efficiency
    let lightweightClone: THREE.Group;

    if (!overrideColor) {
      // No color override - clone directly to preserve original materials and colors
      lightweightClone = sceneToUse.clone(true);
    } else {
      // Color override specified - use shared resources for memory efficiency
      const modelKey = `${glbPath}_color_${colorOverride}`;
      lightweightClone = createSharedModelInstance(sceneToUse, modelKey);
    }

    // Configure shadows and optimize materials
    lightweightClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (overrideColor && mesh.material) {
          // Apply color override - clone materials to avoid affecting shared instances
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const newMaterials = materials.map(mat => {
            // Clone material to avoid affecting shared instances
            const materialToModify = mat.clone();

            // Optimize textures (doesn't affect color)
            optimizeMaterialTextures(materialToModify);
            // Remove expensive maps when applying color override
            removeExpensiveMaps(materialToModify);

            // Apply color override (support multiple material types)
            if (materialToModify instanceof THREE.MeshStandardMaterial ||
              materialToModify instanceof THREE.MeshPhysicalMaterial ||
              materialToModify instanceof THREE.MeshBasicMaterial ||
              materialToModify instanceof THREE.MeshLambertMaterial ||
              materialToModify instanceof THREE.MeshPhongMaterial) {
              materialToModify.color.copy(overrideColor);
              materialToModify.needsUpdate = true;
            }

            return materialToModify;
          });

          // Update mesh material with cloned materials
          mesh.material = Array.isArray(mesh.material) ? newMaterials : newMaterials[0];
        } else if (!overrideColor && mesh.material) {
          // No color override - preserve original materials completely
          // Only optimize textures (doesn't affect color appearance)
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(mat => {
            optimizeMaterialTextures(mat);
            // Don't remove maps - preserve original appearance and colors
          });
        }
      }
    });

    return lightweightClone;
  }, [sceneToUse, glbPath, objectId, colorOverride]);

  // Show fallback if error or no scene - use dynamic default size
  const groupRotationProps = rotationQuaternion
    ? { quaternion: rotationQuaternion }
    : { rotation: [0, rotation, 0] as [number, number, number] };

  if (hasError || !clonedScene) {
    return (
      <group position={position} {...groupRotationProps}>
        <mesh castShadow={false} receiveShadow={false} position={[0, 0.5, 0]}>
          <boxGeometry args={[targetWidth || 2, targetHeight || 1, targetDepth || 2]} />
          <meshStandardMaterial color="#00ff00" />
        </mesh>
      </group>
    );
  }

  // Don't render if outside frustum (frustum culling)
  if (!isVisible) {
    return null;
  }

  return (
    <group position={position} {...groupRotationProps}>
      <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
        <primitive object={clonedScene} scale={[eventScale.x, eventScale.y, eventScale.z]} />
      </group>
    </group>
  );
});

/**
 * Progressive Event Objects Component
 * Loads event objects in batches to prevent context loss
 */
interface ProgressiveEventObjectsProps {
  event: EventConfig;
  centerOffset: { x: number; y: number };
  batchSize?: number;
  delayBetweenBatches?: number;
}

export function ProgressiveEventObjects({
  event,
  centerOffset,
  batchSize = 3,
  delayBetweenBatches = 100
}: ProgressiveEventObjectsProps) {
  // Start with first batch immediately
  const [loadedCount, setLoadedCount] = useState(batchSize);
  const objectsToRender = useMemo(() => {
    return event.objects.slice(0, loadedCount);
  }, [event.objects, loadedCount]);

  useEffect(() => {
    if (loadedCount >= event.objects.length) return;

    const timer = setTimeout(() => {
      setLoadedCount(prev => Math.min(prev + batchSize, event.objects.length));
    }, delayBetweenBatches);

    return () => clearTimeout(timer);
  }, [loadedCount, event.objects.length, batchSize, delayBetweenBatches]);

  // Create a modified event config with only loaded objects
  const partialEvent = useMemo(() => ({
    ...event,
    objects: objectsToRender
  }), [event, objectsToRender]);

  return (
    <>
      <OptimizedEventObject3D event={partialEvent} centerOffset={centerOffset} />
    </>
  );
}

/**
 * Combined Stage and Event Objects Component
 */
interface StageAndEventsProps {
  selectedStage: StageConfig | null;
  selectedEvent: EventConfig | null;
  centerOffset: { x: number; y: number };
}

export function OptimizedStageAndEvents({
  selectedStage,
  selectedEvent,
  centerOffset
}: StageAndEventsProps) {
  return (
    <>
      {/* Render Stage */}
      {selectedStage && (
        <OptimizedStage3D stage={selectedStage} centerOffset={centerOffset} />
      )}

      {/* Render Event Objects */}
      {selectedEvent && (
        <OptimizedEventObject3D event={selectedEvent} centerOffset={centerOffset} />
      )}
    </>
  );
}

