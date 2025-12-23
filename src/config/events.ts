export interface EventCoordinate {
    x: number;
    y: number;
    z?: number;
}

export interface EventObjectMountPoints {
    topLeft: EventCoordinate;
    topRight: EventCoordinate;
    bottomRight: EventCoordinate;
    bottomLeft: EventCoordinate;
}

export interface EventObjectMountPointsWorld {
    topLeft: { x: number; y: number; z: number };
    topRight: { x: number; y: number; z: number };
    bottomRight: { x: number; y: number; z: number };
    bottomLeft: { x: number; y: number; z: number };
}

export interface EventWorldCoordinate {
    x: number;
    y: number;
    z: number;
}

export interface EventObjectConfig {
    id: string;
    name: string;
    fileName?: string;
    glbFileName?: string;
    glbRotation?: number;
    glbWidth?: number;
    glbHeight?: number;
    glbDepth?: number;
    x: number;
    y: number;
    width?: number; // Auto-calculated from DXF if not provided
    height?: number; // Auto-calculated from DXF if not provided
    depth?: number; // Depth/height of the object for 3D rendering
    rotation?: number; // Rotation in degrees
    scale?: number; // Scale multiplier for 3D model (e.g., 2 = double size, 0.5 = half size)
    color?: string; // OPTIONAL: Override ALL colors in DXF with single color (e.g., '#FFD700')
    // WARNING: Leave undefined to preserve original DXF colors and designs
    // Only use if you want a single-color highlight effect
    positionOrigin?: 'center' | 'top-left'; // How x/y coordinates are interpreted (defaults to 'top-left')
    description?: string;
    showIn2D?: boolean;
    twoDRenderMode?: 'dxf' | 'plane';
    twoDColor?: string;
    twoDOutlineColor?: string;
    twoDOpacity?: number;
    mountPoints?: EventObjectMountPoints;
    mountPointsWorld?: EventObjectMountPointsWorld;
    worldPosition?: EventWorldCoordinate;
}

export interface EventConfig {
    id: string;
    name: string;
    description?: string;
    objects: EventObjectConfig[]; // Multiple objects can be part of an event
}

export const predefinedEvents: EventConfig[] = [
    {
        id: 'toifa',
        name: 'Toifa',
        description: 'Toifa event with custom decorative elements',
        objects: [
            {
                id: 'toifa-main',
                name: 'Toifa Brand Logo',
                fileName: 'toifa.dxf',
                glbFileName: 'logo.glb',
                glbRotation: 0,
                worldPosition: { x: -2.04, y: 0, z: 15.70 },
                x: 1070,
                y: 850,
                rotation: 0,
                color: '#0074a4', // Gold color for Toifa branding
                description: 'Toifa Brand Logo'
            },
            {
                id: 'toifa-banner-wall',
                name: 'Toifa Feature Banner',
                glbFileName: 'toifa_banner_1.glb',
                glbRotation: 90,
                x: -729,
                y: 1843,
                width: 600,
                height: 220,
                rotation: -90,
                // positionOrigin: 'center',
                showIn2D: false,
                mountPoints: {
                    topLeft: { x: -730, y: 2028, z: 195 },
                    topRight: { x: -730, y: 1645, z: 195 },
                    bottomRight: { x: -730, y: 1645, z: 0 },
                    bottomLeft: { x: -730, y: 2028, z: 0 }
                },
                mountPointsWorld: {
                    topLeft: { x: -42.12, y: 4.26, z: -11.34 },
                    topRight: { x: -42.12, y: 4.26, z: -3.09 },
                    bottomRight: { x: -42.12, y: 0, z: -3.09 },
                    bottomLeft: { x: -42.12, y: 0, z: -11.34 }
                },
                description: 'Wall-mounted Toifa banner'
            },
            {
                id: 'toifa-banner-wall-2',
                name: 'Toifa Feature Banner 2',
                glbFileName: 'toifa_banner_2.glb',
                glbRotation: 0,
                // glbDepth: 50,
                showIn2D: false,
                x: 1070,
                y: 850,
                rotation: 0,
                mountPointsWorld: {
                    topLeft: { x: -48.45, y: 4.26, z: -11.54 },
                    topRight: { x: -48.45, y: 4.26, z: -29 },
                    bottomRight: { x: -48.45, y: 0, z: -29 },
                    bottomLeft: { x: -48.45, y: 0, z: -11.54 }
                },
                description: 'Wall-mounted Toifa banner'
            },
            {
                id: 'toifa-banner-wall-3',
                name: 'Toifa Feature Banner 3',
                glbFileName: 'toifa_banner_3.glb',
                glbRotation: 0,
                showIn2D: false,
                x: -729,
                y: 1843,
                rotation: 0,
                mountPointsWorld: {
                    topLeft: { x: -49, y: 4.26, z: -29 },
                    topRight: { x: -23, y: 4.26, z: -29 },
                    bottomRight: { x: -23, y: 0, z: -29 },
                    bottomLeft: { x: -49, y: 0, z: -29 }
                },
                description: 'Wall-mounted Toifa banner'
            },
            {
                id: 'toifa-banner-wall-4',
                name: 'Toifa Feature Banner 4',
                glbFileName: 'toifa_banner_1.glb',
                glbRotation: 0,
                showIn2D: false,
                x: 1070,
                y: 850,
                rotation: 0,
                mountPointsWorld: {
                    topLeft: { x: 24.69, y: 3, z: 17.55 },
                    topRight: { x: 24.69, y: 3, z: 22.58 },
                    bottomRight: { x: 24.69, y: 0, z: 22.58 },
                    bottomLeft: { x: 24.69, y: 0, z: 17.55 }
                },
                description: 'Wall-mounted Toifa banner'
            },
            {
                id: 'toifa-car',
                name: 'Toifa Car',
                fileName: 'toifa_car.dxf',
                glbFileName: 'car.glb',
                // glbWidth: 500,
                // glbHeight: 500,
                glbDepth: 200,
                glbRotation: 90,
                scale: 1.5,
                worldPosition: { x: -14.70, y: 0, z: 20.31 },
                x: 700,
                y: 760,
                rotation: 0,
                width: 15,
                height: 15,
                description: 'Toifa Car'
            },
            {
                id: 'console',
                name: 'Console',
                fileName: 'console.dxf',
                glbFileName: 'console-opt.glb',
                glbRotation: 0,
                depth: 100,
                scale: 1.5,
                worldPosition: { x: 50, y: 0, z: -1.1 },
                x: 3150,
                y: 1500,
                rotation: -90,
                description: 'Console'
            },
            {
                id: 'stall-1',
                name: 'Stall 1',
                fileName: 'stall_2.dxf',
                glbFileName: 'booth_1.glb',
                glbWidth: 128,
                glbHeight: 70,
                glbDepth: 70,
                glbRotation: 0,
                worldPosition: { x: -12.20, y: 0, z: -13.10 },
                x: 606,
                y: 2084,
                rotation: -90,
                // color: 'yellow',
                width: 108,
                height: 108,
                description: 'Stall 1'
            },
            {
                id: 'stall-2',
                name: 'Stall 2',
                fileName: 'stall_2.dxf',
                glbFileName: 'booth_1.glb',
                worldPosition: { x: -12.20, y: 0, z: -9.32 },
                x: 606,
                glbWidth: 108,
                glbHeight: 50,
                glbDepth: 50,
                glbRotation: 0,
                y: 1908,
                rotation: -90,
                width: 108,
                height: 108,
                description: 'Stall 2'
            },
            {
                id: 'stall-3',
                name: 'Stall 3',
                fileName: 'stall_2.dxf',
                glbFileName: 'booth_1.glb',
                worldPosition: { x: -12.20, y: 0, z: -4.90 },
                x: 606,
                glbWidth: 108,
                glbHeight: 50,
                glbDepth: 50,
                glbRotation: 0,
                y: 1740,
                rotation: -90,
                width: 108,
                height: 108,
                description: 'Stall 3'
            },
            {
                id: 'stall-4',
                name: 'Stall 4',
                fileName: 'stall_2.dxf',
                glbFileName: 'booth_1.glb',
                worldPosition: { x: -12.20, y: 0, z: -1.40 },
                x: 606,
                glbWidth: 108,
                glbHeight: 50,
                glbDepth: 50,
                glbRotation: 0,
                y: 1586,
                rotation: -90,
                width: 108,
                height: 108,
                description: 'Stall 4'
            },
            {
                id: 'stall-5',
                name: 'Stall 5',
                fileName: 'stall_1.dxf',
                glbFileName: 'booth_1.glb',
                worldPosition: { x: -17.50, y: 0, z: -9.32 },
                x: 402,
                glbWidth: 108,
                glbHeight: 50,
                glbDepth: 50,
                glbRotation: 0,
                y: 1908,
                rotation: 90,
                width: 108,
                height: 108,
                description: 'Stall 5'
            },
            {
                id: 'stall-6',
                name: 'Stall 6',
                fileName: 'stall_2.dxf',
                glbFileName: 'booth_1.glb',
                worldPosition: { x: -17.50, y: 0, z: -4.90 },
                x: 402,
                glbWidth: 108,
                glbHeight: 50,
                glbDepth: 50,
                glbRotation: 0,
                y: 1740,
                rotation: 0,
                width: 108,
                height: 108,
                description: 'Stall 6'
            },
            {
                id: 'back-stall-1',
                name: 'Back Stall 1',
                fileName: 'bar_stool.dxf',
                glbFileName: 'bar_stool.glb',
                glbRotation: 180,
                worldPosition: { x: -35.5, y: 0, z: -11 },
                x: -305,
                y: 1940,
                rotation: 0,
                description: 'Back Stall 1'
            },
            {
                id: 'back-stall-2',
                name: 'Back Stall 2',
                fileName: 'bar_stool.dxf',
                glbFileName: 'bar_stool.glb',
                glbRotation: 180,
                worldPosition: { x: -32.5, y: 0, z: -11 },
                x: -177,
                y: 1940,
                rotation: 0,
                description: 'Back Stall 2'
            },
            {
                id: 'back-stall-3',
                name: 'Back Stall 3',
                fileName: 'bar_stool.dxf',
                glbFileName: 'bar_stool.glb',
                glbRotation: 180,
                worldPosition: { x: -37, y: 0, z: -9 },
                x: -355,
                y: 1870,
                rotation: 0,
                description: 'Back Stall 3'
            },
            {
                id: 'back-stall-4',
                name: 'Back Stall 4',
                fileName: 'bar_stool.dxf',
                glbFileName: 'bar_stool.glb',
                glbRotation: 180,
                worldPosition: { x: -34, y: 0, z: -9 },
                x: -245,
                y: 1870,
                rotation: 0,
                description: 'Back Stall 4'
            },
            {
                id: 'back-stall-5',
                name: 'Back Stall 5',
                fileName: 'bar_stool.dxf',
                glbFileName: 'bar_stool.glb',
                glbRotation: 180,
                worldPosition: { x: -31, y: 0, z: -9 },
                x: -135,
                y: 1870,
                rotation: 0,
                description: 'Back Stall 5'
            },
            {
                id: 'back-stall-6',
                name: 'Back Stall 6',
                fileName: 'bar_stool.dxf',
                glbFileName: 'bar_stool.glb',
                glbRotation: 180,
                worldPosition: { x: -35.5, y: 0, z: -7.3 },
                x: -305,
                y: 1790,
                rotation: 0,
                description: 'Back Stall 6'
            },
            {
                id: 'back-stall-7',
                name: 'Back Stall 7',
                fileName: 'bar_stool.dxf',
                glbFileName: 'bar_stool.glb',
                glbRotation: 180,
                worldPosition: { x: -32.5, y: 0, z: -7.3 },
                x: -177,
                y: 1790,
                rotation: 0,
                description: 'Back Stall 7'
            },
            {
                id: 'cameraman-1',
                name: 'Cameraman 1',
                fileName: 'camera_man.dxf',
                glbFileName: 'cameraman-opt.glb',
                // glbHeight: 140,
                // glbWidth: 40,
                glbDepth: 80,
                worldPosition: { x: -30.46, y: 0, z: -20 },
                x: -350,
                y: 2300,
                rotation: 180,
                width: 70,
                height: 140,
                positionOrigin: 'center',
                description: 'Cameraman 1'
            },
            {
                id: 'cameraman-2',
                name: 'Cameraman 2',
                fileName: 'camera_man.dxf',
                glbFileName: 'cameraman-opt.glb',
                worldPosition: { x: -37.83, y: 0, z: -20 },
                glbDepth: 80,
                x: -115,
                y: 2300,
                rotation: 180,
                width: 70,
                height: 140,
                positionOrigin: 'center',
                description: 'Cameraman 2'
            },
            {
                id: 'female-model',
                name: 'Female Model',
                fileName: 'female_model.dxf',
                glbFileName: 'female_model.glb',
                worldPosition: { x: -34, y: 0, z: -27.24 },
                glbWidth: 40,
                glbHeight: 40,
                glbDepth: 50,
                glbRotation: -90,
                x: -248,
                y: 2600,
                rotation: 0,
                width: 40,
                height: 80,
                positionOrigin: 'center',
                description: 'Female Model'
            },
            {
                id: 'console-camera-man-1',
                name: 'Console Camera Man 1',
                fileName: 'camera_man.dxf',
                x: 3130,
                y: 1584,
                rotation: -90,
                width: 40,
                height: 80,
                description: 'Console Camera Man 1'
            },
            {
                id: 'console-camera-man-2',
                name: 'Console Camera Man 2',
                fileName: 'camera_man.dxf',
                x: 3130,
                y: 1550,
                rotation: -90,
                width: 40,
                height: 80,
                description: 'Console Camera Man 2'
            },
            {
                id: 'console-camera-man-3',
                name: 'Console Camera Man 3',
                fileName: 'camera_man.dxf',
                x: 3130,
                y: 1515,
                rotation: -90,
                width: 40,
                height: 80,
                description: 'Console Camera Man 3'
            }
        ]
    }
];

export const getEventConfig = (eventId: string): EventConfig | undefined => {
    return predefinedEvents.find(event => event.id === eventId);
};

