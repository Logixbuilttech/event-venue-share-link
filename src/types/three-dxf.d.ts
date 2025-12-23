declare module 'three-dxf' {
  import * as THREE from 'three';

  export class Viewer extends THREE.Group {
    constructor(dxfString: string, position: THREE.Vector3, scale: number);
  }
}