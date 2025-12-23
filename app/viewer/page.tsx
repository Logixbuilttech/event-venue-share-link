'use client';

import React, { useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import DxfParser from 'dxf-parser';

// Interpolate bulge (arc segment between v1→v2)
function interpolateBulgePoints(v1, v2, bulge, segments = 16) {
  if (!bulge) {
    return [
      new THREE.Vector3(v1.x, v1.y, v1.z || 0),
      new THREE.Vector3(v2.x, v2.y, v2.z || 0),
    ];
  }
  const start = new THREE.Vector2(v1.x, v1.y);
  const end = new THREE.Vector2(v2.x, v2.y);
  const chord = end.clone().sub(start);
  const length = chord.length();
  const sagitta = (bulge * length) / 2;
  const mid = start.clone().add(chord.multiplyScalar(0.5));
  const perp = new THREE.Vector2(-chord.y, chord.x).normalize().multiplyScalar(sagitta);
  const center = mid.clone().add(perp);
  const radius = center.distanceTo(start);

  let startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  let endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const clockwise = bulge < 0;

  if (clockwise && endAngle > startAngle) {
    endAngle -= Math.PI * 2;
  } else if (!clockwise && endAngle < startAngle) {
    endAngle += Math.PI * 2;
  }

  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = startAngle + t * (endAngle - startAngle);
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    pts.push(new THREE.Vector3(x, y, v1.z || 0));
  }
  return pts;
}

function getEntityColor(entity, dxfData) {
  if (typeof entity.color === 'number' && entity.color >= 0) {
    // Simple fallback: map small ACI indices
    const aci = entity.color;
    const aciMap = {
      1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff,
      5: 0x0000ff, 6: 0xff00ff, 7: 0xffffff,
    };
    if (aciMap[aci]) return aciMap[aci];
  }
  if (dxfData.tables && dxfData.tables.layer && entity.layer) {
    const layer = dxfData.tables.layer[entity.layer];
    if (layer && typeof layer.color === 'number') {
      return layer.color;
    }
  }
  return 0x000000;
}

// Expand INSERT entity (block reference) by placing its children
function expandInsert(entity, dxfData, parentTransform = new THREE.Matrix4()) {
  const blockName = entity.name;
  const block = dxfData.blocks && dxfData.blocks[blockName];
  if (!block || !block.entities) return [];

  const transform = new THREE.Matrix4();
  const tx = entity.position.x || 0;
  const ty = entity.position.y || 0;
  const tz = entity.position.z || 0;
  transform.makeTranslation(tx, ty, tz);

  // Apply rotation if present
  if (entity.rotation) {
    const rot = new THREE.Matrix4().makeRotationZ((entity.rotation * Math.PI) / 180);
    transform.premultiply(rot);
  }

  const finalTransform = parentTransform.clone().multiply(transform);

  // For each entity in block, return a "cloned" entity with transform
  const children = [];
  for (const child of block.entities) {
    const clone = { ...child };
    // If child has vertices, transform them
    if (clone.vertices) {
      clone.vertices = clone.vertices.map(v => {
        const p = new THREE.Vector3(v.x, v.y, v.z || 0).applyMatrix4(finalTransform);
        return { x: p.x, y: p.y, z: p.z, bulge: v.bulge };
      });
    }
    // If child has center, transform
    if (clone.center) {
      const p = new THREE.Vector3(clone.center.x, clone.center.y, clone.center.z || 0).applyMatrix4(finalTransform);
      clone.center = { x: p.x, y: p.y, z: p.z };
    }
    children.push(clone);
  }
  return children;
}

function DxfScene({ dxfData }) {
  const groupRef = useRef();

  const { geometries, bounds } = useMemo(() => {
    if (!dxfData) return { geometries: [], bounds: null };

    const geometries = [];
    const box = new THREE.Box3();

    function processEntity(entity) {
      const color = getEntityColor(entity, dxfData);
      const material = new THREE.LineBasicMaterial({ color });

      switch (entity.type) {
        case 'LINE': {
          if (entity.vertices?.length >= 2) {
            const pts = [
              new THREE.Vector3(entity.vertices[0].x, entity.vertices[0].y, entity.vertices[0].z || 0),
              new THREE.Vector3(entity.vertices[1].x, entity.vertices[1].y, entity.vertices[1].z || 0),
            ];
            const geometry = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geometry, material);
            geometries.push(line);
            pts.forEach(p => box.expandByPoint(p));
          }
          break;
        }
        case 'LWPOLYLINE': {
          const verts = entity.vertices || [];
          if (verts.length < 2) break;
          const pts = [];
          for (let i = 0; i < verts.length - 1; i++) {
            const seg = interpolateBulgePoints(verts[i], verts[i + 1], verts[i].bulge || 0, 24);
            if (pts.length) seg.shift();
            pts.push(...seg);
          }
          if (entity.closed) {
            const seg = interpolateBulgePoints(verts[verts.length - 1], verts[0], verts[verts.length - 1].bulge || 0, 24);
            seg.shift();
            pts.push(...seg);
          }
          if (pts.length < 2) break;
          const geometry = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geometry, material);
          geometries.push(line);
          pts.forEach(p => box.expandByPoint(p));
          break;
        }
        case 'POLYLINE': {
          const verts = entity.vertices || [];
          if (verts.length < 2) break;
          const pts = [];
          for (let i = 0; i < verts.length - 1; i++) {
            const seg = interpolateBulgePoints(verts[i], verts[i + 1], verts[i].bulge || 0, 24);
            if (pts.length) seg.shift();
            pts.push(...seg);
          }
          if (entity.closed) {
            const seg = interpolateBulgePoints(verts[verts.length - 1], verts[0], verts[verts.length - 1].bulge || 0, 24);
            seg.shift();
            pts.push(...seg);
          }
          if (pts.length < 2) break;
          const geometry = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geometry, material);
          geometries.push(line);
          pts.forEach(p => box.expandByPoint(p));
          break;
        }
        case 'CIRCLE': {
          const circleGeom = new THREE.CircleGeometry(entity.radius, 64);
          const edges = new THREE.EdgesGeometry(circleGeom);
          const mesh = new THREE.LineSegments(edges, material);
          mesh.position.set(entity.center.x, entity.center.y, entity.center.z || 0);
          geometries.push(mesh);
          const c = entity.center;
          box.expandByPoint(new THREE.Vector3(c.x + entity.radius, c.y + entity.radius, c.z || 0));
          box.expandByPoint(new THREE.Vector3(c.x - entity.radius, c.y - entity.radius, c.z || 0));
          break;
        }
        case 'ARC': {
          const pts = [];
          const segCount = 64;
          for (let i = 0; i <= segCount; i++) {
            const t = i / segCount;
            const angle = entity.startAngle + t * (entity.endAngle - entity.startAngle);
            const x = entity.center.x + entity.radius * Math.cos(angle);
            const y = entity.center.y + entity.radius * Math.sin(angle);
            const z = entity.center.z || 0;
            pts.push(new THREE.Vector3(x, y, z));
          }
          if (pts.length >= 2) {
            const geometry = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geometry, material);
            geometries.push(line);
            pts.forEach(p => box.expandByPoint(p));
          }
          break;
        }
        case 'ELLIPSE': {
          // ellipse: center, majorAxis, minorAxis ratio, startParam, endParam
          const pts = [];
          const segCount = 64;
          for (let i = 0; i <= segCount; i++) {
            const t = entity.startParam + (entity.endParam - entity.startParam) * (i / segCount);
            const x = entity.center.x + entity.majorAxis.x * Math.cos(t) + entity.minorAxis.x * entity.ratio * Math.sin(t);
            const y = entity.center.y + entity.majorAxis.y * Math.cos(t) + entity.minorAxis.y * entity.ratio * Math.sin(t);
            const z = entity.center.z || 0;
            pts.push(new THREE.Vector3(x, y, z));
          }
          if (pts.length >= 2) {
            const geometry = new THREE.BufferGeometry().setFromPoints(pts);
            const line = new THREE.Line(geometry, material);
            geometries.push(line);
            pts.forEach(p => box.expandByPoint(p));
          }
          break;
        }
        case 'SPLINE': {
          // Spline approximation — sample points
          const curve = new THREE.CatmullRomCurve3(
            entity.controlPoints.map(p => new THREE.Vector3(p.x, p.y, p.z || 0))
          );
          const pts = curve.getPoints(100);
          const geometry = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(geometry, material);
          geometries.push(line);
          pts.forEach(p => box.expandByPoint(p));
          break;
        }
        case 'INSERT': {
          const children = expandInsert(entity, dxfData);
          children.forEach(child => processEntity(child));
          break;
        }
        default:
          console.warn('DXF entity type not supported:', entity.type);
      }
    }

    (dxfData.entities || []).forEach(ent => processEntity(ent));

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return { geometries, bounds: { size, center } };
  }, [dxfData]);

  if (!dxfData || !bounds) return null;

  return (
    <group ref={groupRef} position={[-bounds.center.x, -bounds.center.y, 0]}>
      {geometries.map((g, i) => <primitive key={i} object={g} />)}
      <primitive
        object={new THREE.GridHelper(Math.max(bounds.size.x, bounds.size.y) * 1.2, 50, 'gray', '#444')}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

export default function DxfViewerPage() {
  const [dxfData, setDxfData] = useState(null);
  const fileInputRef = useRef();

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parser = new DxfParser();
        const data = parser.parseSync(ev.target.result);
        console.log('Parsed DXF:', data);
        setDxfData(data);
      } catch (err) {
        console.error('DXF parse error:', err);
        alert('Invalid DXF file.');
      }
    };
    reader.readAsText(file);
  };

  const zoom = useMemo(() => {
    if (!dxfData) return 5;
    const box = new THREE.Box3();
    (dxfData.entities || []).forEach(ent => {
      if (ent.vertices) {
        ent.vertices.forEach(v => {
          box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z || 0));
        });
      }
      if (ent.center) {
        box.expandByPoint(new THREE.Vector3(ent.center.x, ent.center.y, ent.center.z || 0));
      }
    });
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y);
    if (maxDim <= 0) return 5;
    return 800 / maxDim;
  }, [dxfData]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'rgba(255,255,255,0.85)', padding: 8, borderRadius: 6 }}>
        <input type="file" accept=".dxf" ref={fileInputRef} onChange={handleFileUpload} />
      </div>
      <Canvas
        orthographic
        camera={{ zoom, position: [0, 0, 400], near: 1, far: 2000 }}
        gl={{ antialias: true }}
      >
        <OrthographicCamera makeDefault position={[0, 0, 400]} zoom={zoom} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[100, 100, 100]} intensity={0.8} />
        <OrbitControls enableRotate={false} />
        {dxfData && <DxfScene dxfData={dxfData} />}
      </Canvas>
    </div>
  );
}
