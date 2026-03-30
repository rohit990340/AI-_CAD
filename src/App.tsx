/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Grid, 
  Stage, 
  Environment, 
  ContactShadows, 
  TransformControls,
  Html,
  useGLTF,
  Center,
  Float,
  Text,
  Edges,
  Line,
  GizmoHelper,
  GizmoViewport,
  Billboard,
  Wireframe
} from '@react-three/drei';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { Physics, useBox, useSphere, useCylinder, usePlane } from '@react-three/cannon';
import { SUBTRACTION, INTERSECTION, ADDITION, Brush, Evaluator } from 'three-bvh-csg';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import gerberToSvg from 'gerber-to-svg';
import JSZip from 'jszip';
import { parseKicadPcb } from 'kicadts';
import { 
  Box, 
  Cpu, 
  FileText, 
  Layers, 
  Play, 
  Settings, 
  Download, 
  MessageSquare, 
  ChevronRight,
  ChevronDown,
  Activity,
  Maximize2,
  Minimize2,
  RefreshCw,
  Terminal as TerminalIcon,
  Upload,
  Pencil,
  CircuitBoard,
  Grid as GridIcon,
  MousePointer2,
  Move,
  RotateCw,
  Scale,
  Ruler,
  Trash2,
  Eye,
  EyeOff,
  Palette,
  Plus,
  Minus,
  Maximize,
  Search,
  Command,
  Undo2,
  Redo2,
  Grid3X3,
  Video,
  BoxSelect,
  Share2,
  Zap,
  Tag,
  Target,
  Image as ImageIcon,
  Dna,
  Menu,
  X,
  ChevronLeft,
  CircleDot
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import Markdown from 'react-markdown';
import * as THREE from 'three';
import { STLLoader } from 'three-stdlib';
import { OBJLoader } from 'three-stdlib';
import { GLTFLoader } from 'three-stdlib';
import { cn } from './lib/utils';
import { getComponentModel } from './ComponentLibrary';

// --- Types ---
type TransformMode = 'translate' | 'rotate' | 'scale' | null;

interface Modifier {
  type: 'array' | 'mirror' | 'subdivision' | 'uv-unwrap' | 'wireframe';
  count?: number;
  offset?: [number, number, number];
  enabled: boolean;
  levels?: number;
  thickness?: number;
}

interface SceneObject {
  id: string;
  name: string;
  type: 'box' | 'sphere' | 'cylinder' | 'torus' | 'mesh' | 'stroke' | 'pcb';
  params: any;
  color: string;
  metalness: number;
  roughness: number;
  emission?: string;
  emissionIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  visible: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  mesh?: THREE.Group | THREE.Mesh;
  textureUrl?: string;
  isPhysicsEnabled?: boolean;
  stats?: {
    vertices: number;
    faces: number;
  };
  points?: [number, number, number][]; // For strokes
  pcbData?: {
    layers: { id: string; name: string; color: string; visible: boolean; type: 'copper' | 'silk' | 'mask'; group?: string }[];
    visibilityRules?: { [key: string]: boolean };
    components: { id: string; name: string; position: [number, number]; type: string; rotation?: number }[];
    nets?: Map<string, string>;
    pads?: { x: number; y: number; netId: string | null; netName: string | null }[];
  };
  modifiers?: Modifier[];
}

interface Annotation {
  id: string;
  objectId: string;
  text: string;
  position: [number, number, number];
}

interface AnalysisResult {
  volume: number;
  surfaceArea: number;
  materialEfficiency: number;
  structuralIntegrity: string;
  advantages: string[];
  disadvantages: string[];
  modifications: string[];
  summary: string;
  blenderStats?: {
    vertices: number;
    faces: number;
  };
}

// --- Constants ---
const THEMES = [
  { id: 'cyberpunk', name: 'Cyberpunk', bg: '#050505', card: 'rgba(10, 10, 15, 0.7)', cyan: '#00f3ff', magenta: '#ff00ff', lime: '#00ff00', border: 'rgba(0, 243, 255, 0.2)' },
  { id: 'blender-dark', name: 'Blender Dark', bg: '#393939', card: '#2d2d2d', cyan: '#e87d0d', magenta: '#444444', lime: '#5680c1', border: '#1d1d1d' },
  { id: 'blender-light', name: 'Blender Light', bg: '#b3b3b3', card: '#cfcfcf', cyan: '#e87d0d', magenta: '#808080', lime: '#5680c1', border: '#999999' },
  { id: 'autocad', name: 'AutoCAD Classic', bg: '#000000', card: '#1e1e1e', cyan: '#ffffff', magenta: '#ff0000', lime: '#00ff00', border: '#333333' },
  { id: 'minimalist', name: 'Minimalist', bg: '#ffffff', card: '#f5f5f5', cyan: '#000000', magenta: '#666666', lime: '#999999', border: '#e0e0e0' },
  { id: 'matrix', name: 'Matrix', bg: '#000000', card: '#001100', cyan: '#00ff00', magenta: '#004400', lime: '#008800', border: '#003300' },
  { id: 'solarized-dark', name: 'Solarized Dark', bg: '#002b36', card: '#073642', cyan: '#268bd2', magenta: '#d33682', lime: '#859900', border: '#586e75' },
  { id: 'solarized-light', name: 'Solarized Light', bg: '#fdf6e3', card: '#eee8d5', cyan: '#268bd2', magenta: '#d33682', lime: '#859900', border: '#93a1a1' },
  { id: 'nord', name: 'Nord', bg: '#2e3440', card: '#3b4252', cyan: '#88c0d0', magenta: '#b48ead', lime: '#a3be8c', border: '#4c566a' },
  { id: 'dracula', name: 'Dracula', bg: '#282a36', card: '#44475a', cyan: '#8be9fd', magenta: '#ff79c6', lime: '#50fa7b', border: '#6272a4' },
  { id: 'monokai', name: 'Monokai', bg: '#272822', card: '#3e3d32', cyan: '#66d9ef', magenta: '#f92672', lime: '#a6e22e', border: '#49483e' },
  { id: 'gruvbox', name: 'Gruvbox', bg: '#282828', card: '#3c3836', cyan: '#83a598', magenta: '#d3869b', lime: '#b8bb26', border: '#504945' },
  { id: 'oceanic', name: 'Oceanic', bg: '#1b2b34', card: '#343d46', cyan: '#6699cc', magenta: '#c594c5', lime: '#99c794', border: '#4f5b66' },
  { id: 'forest', name: 'Forest', bg: '#1a2421', card: '#2d3b36', cyan: '#7fb3d5', magenta: '#d98880', lime: '#52be80', border: '#455a64' },
  { id: 'midnight', name: 'Midnight', bg: '#00040d', card: '#000c1f', cyan: '#007bff', magenta: '#6610f2', lime: '#28a745', border: '#001a33' },
  { id: 'sunset', name: 'Sunset', bg: '#2c1e1e', card: '#4a2c2c', cyan: '#ffcc33', magenta: '#ff6633', lime: '#ff9933', border: '#5c3d3d' },
  { id: 'lavender', name: 'Lavender', bg: '#2c2c3e', card: '#3e3e5e', cyan: '#a29bfe', magenta: '#fd79a8', lime: '#55efc4', border: '#4b4b7b' },
  { id: 'industrial', name: 'Industrial', bg: '#222222', card: '#333333', cyan: '#ffcc00', magenta: '#ff6600', lime: '#999999', border: '#444444' },
  { id: 'retro', name: 'Retro Terminal', bg: '#000000', card: '#000000', cyan: '#33ff33', magenta: '#33ff33', lime: '#33ff33', border: '#33ff33' },
  { id: 'paper', name: 'Paper', bg: '#f0f0f0', card: '#ffffff', cyan: '#0000ff', magenta: '#ff0000', lime: '#008000', border: '#cccccc' },
];

// --- 3D Components ---
const MeasurementLabels = ({ obj }: { obj: SceneObject }) => {
  const { width: baseW, height: baseH, depth: baseD } = obj.params.dimensions || { width: 0, height: 0, depth: 0 };
  if (baseW === 0 && baseH === 0 && baseD === 0) return null;

  // The labels are inside a group that already has obj.scale applied.
  // However, we want the displayed values to reflect the actual world scale.
  const worldW = baseW * obj.scale[0];
  const worldH = baseH * obj.scale[1];
  const worldD = baseD * obj.scale[2];

  const labelStyle = "bg-black/90 text-[8px] px-1.5 py-0.5 rounded border border-white/20 whitespace-nowrap font-mono flex items-center gap-1 shadow-[0_0_10px_rgba(0,0,0,0.5)]";
  
  return (
    <group>
      {/* Width Label (X) */}
      <Html position={[baseW / 2, 0, 0]} center distanceFactor={10}>
        <div className={cn(labelStyle, "text-cyber-cyan border-cyber-cyan/40")}>
          <Move className="w-2 h-2" /> W: {worldW.toFixed(3)}
        </div>
      </Html>
      {/* Height Label (Y) */}
      <Html position={[0, baseH / 2, 0]} center distanceFactor={10}>
        <div className={cn(labelStyle, "text-cyber-magenta border-cyber-magenta/40")}>
          <RotateCw className="w-2 h-2" /> H: {worldH.toFixed(3)}
        </div>
      </Html>
      {/* Depth Label (Z) */}
      <Html position={[0, 0, baseD / 2]} center distanceFactor={10}>
        <div className={cn(labelStyle, "text-cyber-lime border-cyber-lime/40")}>
          <Scale className="w-2 h-2" /> D: {worldD.toFixed(3)}
        </div>
      </Html>

      {/* Bounding Box Edges */}
      <mesh scale={[baseW, baseH, baseD]}>
        <boxGeometry />
        <meshBasicMaterial transparent opacity={0} />
        <Edges color="#ffffff" opacity={0.3} transparent />
      </mesh>
    </group>
  );
};

const PreviewModel = ({ obj }: { obj: SceneObject }) => {
  const material = (
    <meshStandardMaterial 
      color={obj.color} 
      metalness={obj.metalness} 
      roughness={obj.roughness} 
    />
  );

  const geometry = (() => {
    switch (obj.type) {
      case 'box': return <boxGeometry args={[obj.params.width || 1, obj.params.height || 1, obj.params.depth || 1]} />;
      case 'sphere': return <sphereGeometry args={[obj.params.radius || 0.7, 32, 32]} />;
      case 'cylinder': return <cylinderGeometry args={[obj.params.radius || 0.5, obj.params.radius || 0.5, obj.params.height || 1.5, 32]} />;
      case 'torus': return <torusGeometry args={[obj.params.radius || 0.7, obj.params.tube || 0.2, 16, 100]} />;
      default: return null;
    }
  })();

  if (obj.type === 'mesh' && obj.mesh) {
    return (
      <group scale={obj.scale}>
        <primitive object={obj.mesh.clone()} />
        <MeasurementLabels obj={obj} />
      </group>
    );
  }

  return (
    <group scale={obj.scale}>
      <mesh castShadow receiveShadow>
        {geometry}
        {material}
      </mesh>
      <MeasurementLabels obj={obj} />
    </group>
  );
};

const ModelPreview = ({ obj }: { obj: SceneObject | null }) => {
  if (!obj) return (
    <div className="h-48 flex flex-col items-center justify-center text-[10px] text-white/20 italic bg-black/40 rounded border border-white/5 uppercase tracking-[0.2em] gap-3">
      <Box className="w-8 h-8 opacity-10" />
      <span>No Object Selected</span>
    </div>
  );

  return (
    <div className="relative w-full h-64 lg:h-auto lg:aspect-video bg-black/60 rounded border border-white/10 overflow-hidden group/preview shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="px-1.5 py-0.5 bg-cyber-cyan/20 rounded text-[7px] font-bold text-cyber-cyan uppercase tracking-widest border border-cyber-cyan/30 backdrop-blur-md">
          Model Preview
        </div>
        <div className="px-1.5 py-0.5 bg-black/60 rounded text-[7px] font-mono text-white/40 border border-white/10 backdrop-blur-md">
          {obj.name}
        </div>
      </div>
      
          <Canvas shadows camera={{ position: [4, 4, 4], fov: 35 }}>
            <Suspense fallback={null}>
              <color attach="background" args={['#080808']} />
              <Environment preset="city" />
              <ambientLight intensity={0.4} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
              <Center top>
                <PreviewModel obj={obj} />
              </Center>
              <OrbitControls makeDefault autoRotate autoRotateSpeed={0.5} />
              <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={10} blur={2} far={4.5} />
              
              <GizmoHelper alignment="bottom-right" margin={[40, 40]}>
                <GizmoViewport axisColors={['#ff4444', '#44ff44', '#4444ff']} labelColor="white" />
              </GizmoHelper>
            </Suspense>
          </Canvas>

          <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1">
            {obj.stats && (
              <div className="px-2 py-1 bg-black/60 rounded border border-white/10 backdrop-blur-md flex flex-col gap-0.5">
                <div className="flex justify-between gap-4 text-[7px] font-mono">
                  <span className="text-white/30 uppercase">Vertices</span>
                  <span className="text-cyber-cyan">{obj.stats.vertices.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 text-[7px] font-mono">
                  <span className="text-white/30 uppercase">Faces</span>
                  <span className="text-cyber-cyan">{obj.stats.faces.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

      <div className="absolute bottom-3 right-3 z-10 flex gap-1">
        <div className="p-1 bg-black/60 rounded border border-white/10 text-white/40 hover:text-cyber-cyan transition-colors cursor-help" title="Auto-rotating preview">
          <RefreshCw className="w-3 h-3 animate-spin-slow" />
        </div>
      </div>
    </div>
  );
};

// --- Drawing System ---
const DrawingSystem = ({ 
  isDrawingMode, 
  currentStroke, 
  setCurrentStroke, 
  onFinishStroke,
  brushColor,
  brushSize,
  drawOnSurface
}: { 
  isDrawingMode: boolean; 
  currentStroke: [number, number, number][]; 
  setCurrentStroke: React.Dispatch<React.SetStateAction<[number, number, number][]>>; 
  onFinishStroke: (points: [number, number, number][]) => void;
  brushColor: string;
  brushSize: number;
  drawOnSurface: boolean;
}) => {
  const { viewport, mouse, camera, raycaster, scene } = useThree();
  const isDrawing = useRef(false);

  const getPoint = () => {
    if (drawOnSurface) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      const validIntersect = intersects.find(i => i.object.type === 'Mesh' && i.object.name !== 'drawing-plane');
      if (validIntersect) {
        const p = validIntersect.point;
        return [p.x, p.y, p.z] as [number, number, number];
      }
    }
    
    const vector = new THREE.Vector3(mouse.x, mouse.y, 0.5);
    vector.unproject(camera);
    const dir = vector.sub(camera.position).normalize();
    const distance = 10;
    const pos = camera.position.clone().add(dir.multiplyScalar(distance));
    return [pos.x, pos.y, pos.z] as [number, number, number];
  };

  const handlePointerDown = (e: any) => {
    if (!isDrawingMode) return;
    e.stopPropagation();
    isDrawing.current = true;
    const point = getPoint();
    setCurrentStroke([point]);
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawingMode || !isDrawing.current) return;
    e.stopPropagation();
    const point = getPoint();
    setCurrentStroke(prev => [...prev, point]);
  };

  const handlePointerUp = (e: any) => {
    if (!isDrawingMode || !isDrawing.current) return;
    e.stopPropagation();
    isDrawing.current = false;
    if (currentStroke.length > 1) {
      onFinishStroke(currentStroke);
    }
    setCurrentStroke([]);
  };

  return (
    <>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <mesh 
          name="drawing-plane"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          visible={true}
        >
          <planeGeometry args={[viewport.width * 10, viewport.height * 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Billboard>
      
      {isDrawingMode && (
        <mesh position={[getPoint()[0], getPoint()[1], getPoint()[2]]}>
          <ringGeometry args={[brushSize * 0.01, brushSize * 0.01 + 0.01, 32]} />
          <meshBasicMaterial color={brushColor} transparent opacity={0.5} depthTest={false} />
        </mesh>
      )}
    </>
  );
};

// --- PCB Viewer ---
const PCBViewer = ({ obj }: { obj: SceneObject }) => {
  if (!obj.pcbData) return null;

  return (
    <group>
      {/* Base Board or Parsed Mesh */}
      {obj.mesh ? (
        <primitive object={obj.mesh} />
      ) : (
        <mesh receiveShadow castShadow>
          <boxGeometry args={[
            obj.params?.dimensions?.width || 1, 
            obj.params?.dimensions?.height || 0.1, 
            obj.params?.dimensions?.depth || 1
          ]} />
          <meshStandardMaterial color={obj.color} roughness={0.8} metalness={0.2} />
        </mesh>
      )}

      {/* Layers */}
      {!obj.mesh && obj.pcbData.layers.map((layer, idx) => (
        layer.visible && (
          <mesh key={layer.id} position={[0, (obj.params?.dimensions?.height || 0.1) / 2 + 0.01 + (idx * 0.001), 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[
              (obj.params?.dimensions?.width || 1) - 0.2, 
              (obj.params?.dimensions?.depth || 1) - 0.2
            ]} />
            <meshStandardMaterial 
              color={layer.color} 
              transparent 
              opacity={layer.type === 'silk' ? 0.8 : 0.4} 
              roughness={0.5}
            />
          </mesh>
        )
      ))}

      {/* Components */}
      <group position={obj.mesh ? [obj.mesh.position.x, obj.mesh.position.y, obj.mesh.position.z] : [0, 0, 0]}>
        {obj.pcbData.components.map(comp => (
          <group 
            key={comp.id} 
            position={[comp.position[0], 0.1, comp.position[1]]}
            rotation={[0, THREE.MathUtils.degToRad(comp.rotation || 0), 0]}
          >
            {getComponentModel(comp.type)}
            <Html distanceFactor={5} position={[0, 0.3, 0]}>
              <div className="px-1 bg-black/60 text-white text-[6px] rounded border border-white/20 whitespace-nowrap">
                {comp.name}
              </div>
            </Html>
          </group>
        ))}
      </group>
    </group>
  );
};

const Shape = ({ 
  obj, 
  isSelected, 
  isXray,
  shadingMode,
  faceOrientation,
  onSelect,
  onMount,
  isDraggingTransform
}: { 
  obj: SceneObject; 
  isSelected: boolean; 
  isXray: boolean;
  shadingMode: 'wireframe' | 'solid' | 'material';
  faceOrientation: boolean;
  onSelect: (id: string, e: any) => void;
  onMount: (id: string, mesh: any) => void;
  isDraggingTransform: boolean;
}) => {
  const meshRef = useRef<any>(null);
  
  // Physics Hook
  const getPhysicsArgs = () => {
    switch (obj.type) {
      case 'box': return [obj.params.width || 1, obj.params.height || 1, obj.params.depth || 1];
      case 'sphere': return [obj.params.radius * 2 || 1.4, obj.params.radius * 2 || 1.4, obj.params.radius * 2 || 1.4];
      case 'cylinder': return [obj.params.radius * 2 || 1, obj.params.height || 1.5, obj.params.radius * 2 || 1];
      case 'torus': return [obj.params.radius * 2 || 1.4, obj.params.radius * 2 || 1.4, obj.params.tube * 2 || 0.4];
      default: return [1, 1, 1];
    }
  };

  const [physicsRef, api] = useBox(() => ({
    mass: obj.isPhysicsEnabled ? 1 : 0,
    position: obj.position,
    rotation: obj.rotation,
    args: getPhysicsArgs() as [number, number, number],
    type: obj.isPhysicsEnabled ? 'Dynamic' : 'Static'
  }), meshRef);

  useEffect(() => {
    if (api) {
      api.position.set(obj.position[0], obj.position[1], obj.position[2]);
      api.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
      api.mass.set(obj.isPhysicsEnabled && !(isSelected && isDraggingTransform) ? 1 : 0);
    }
  }, [obj.position, obj.rotation, obj.isPhysicsEnabled, isSelected, isDraggingTransform, api]);

  useEffect(() => {
    if (meshRef.current) {
      onMount(obj.id, meshRef.current);
    }
    if (obj.type === 'mesh' && obj.mesh) {
      obj.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            // If it's an array of materials, update all
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                mat.color.set(shadingMode === 'solid' ? '#888888' : obj.color);
                mat.metalness = shadingMode === 'material' ? obj.metalness : 0;
                mat.roughness = shadingMode === 'material' ? obj.roughness : 1;
                mat.emissive.set(obj.emission || (isSelected ? obj.color : '#000000'));
                mat.emissiveIntensity = obj.emissionIntensity !== undefined ? obj.emissionIntensity : (isSelected ? 0.2 : 0);
                mat.transparent = obj.transparent || isXray;
                mat.opacity = obj.transparent ? (obj.opacity ?? 1) : (isXray ? 0.3 : 1);
                mat.wireframe = shadingMode === 'wireframe' || (isSelected ? false : (obj.params.wireframe || false));
                if (mat instanceof THREE.MeshPhysicalMaterial) {
                  mat.clearcoat = obj.clearcoat || 0;
                  mat.clearcoatRoughness = obj.clearcoatRoughness || 0;
                }
              }
            });
          }
        }
      });
    }
  }, [obj.id, onMount, isXray, isSelected, obj.params.wireframe]);

  const handleClick = (e: any) => {
    e.stopPropagation();
    onSelect(obj.id, e);
  };

  const texture = obj.textureUrl ? new THREE.TextureLoader().load(obj.textureUrl) : null;

  const material = faceOrientation ? (
    <meshNormalMaterial side={THREE.DoubleSide} />
  ) : (
    <meshPhysicalMaterial 
      color={shadingMode === 'solid' ? '#888888' : obj.color} 
      metalness={shadingMode === 'material' ? obj.metalness : 0} 
      roughness={shadingMode === 'material' ? obj.roughness : 1} 
      emissive={obj.emission || (isSelected ? obj.color : '#000000')}
      emissiveIntensity={obj.emissionIntensity !== undefined ? obj.emissionIntensity : (isSelected ? 0.2 : 0)}
      transparent={obj.transparent || isXray}
      opacity={obj.transparent ? (obj.opacity ?? 1) : (isXray ? 0.3 : 1)}
      clearcoat={obj.clearcoat || 0}
      clearcoatRoughness={obj.clearcoatRoughness || 0}
      wireframe={shadingMode === 'wireframe' || (isSelected ? false : (obj.params.wireframe || false))}
      map={shadingMode === 'material' ? texture : null}
    />
  );

  const arrayMod = obj.modifiers?.find(m => m.type === 'array' && m.enabled);
  const mirrorMod = obj.modifiers?.find(m => m.type === 'mirror' && m.enabled);
  const subMod = obj.modifiers?.find(m => m.type === 'subdivision' && m.enabled);
  const uvMod = obj.modifiers?.find(m => m.type === 'uv-unwrap' && m.enabled);
  const wireframeMod = obj.modifiers?.find(m => m.type === 'wireframe' && m.enabled);
  
  const instances = [];
  
  const renderGeometry = () => {
    const segments = subMod ? (subMod.count || 1) * 32 : 32;
    const boxSegs = subMod ? (subMod.count || 1) * 4 : 1;
    switch (obj.type) {
      case 'box': return <boxGeometry args={[obj.params.width || 1, obj.params.height || 1, obj.params.depth || 1, boxSegs, boxSegs, boxSegs]} />;
      case 'sphere': return <sphereGeometry args={[obj.params.radius || 0.7, segments, segments]} />;
      case 'cylinder': return <cylinderGeometry args={[obj.params.radius || 0.5, obj.params.radius || 0.5, obj.params.height || 1.5, segments]} />;
      case 'torus': return <torusGeometry args={[obj.params.radius || 0.7, obj.params.tube || 0.2, segments / 2, segments]} />;
      default: return null;
    }
  };

  const renderContent = (keyPrefix = '') => {
    if (obj.type === 'pcb' && obj.mesh) {
        // Toggle visibility of children based on layers
        if (obj.pcbData) {
            obj.mesh.children.forEach((child, index) => {
                if (obj.pcbData!.layers[index]) {
                    child.visible = obj.pcbData!.layers[index].visible;
                }
            });
        }
        return <primitive object={obj.mesh} />;
    }
    if (obj.type === 'mesh' && obj.mesh) {
      return <primitive object={obj.mesh.clone()} />;
    }
    return (
      <mesh castShadow receiveShadow>
        {renderGeometry()}
        {material}
        {wireframeMod && <Wireframe thickness={wireframeMod.thickness || 0.05} stroke={"#00f3ff"} />}
      </mesh>
    );
  };

  if (arrayMod && arrayMod.count) {
    for (let i = 0; i < arrayMod.count; i++) {
      const offset = arrayMod.offset || [0, 0, 0];
      instances.push(
        <group key={`array-${i}`} position={[offset[0] * i, offset[1] * i, offset[2] * i]}>
          {renderContent(`array-${i}`)}
        </group>
      );
    }
  } else {
    instances.push(<group key="base">{renderContent('base')}</group>);
  }

  const finalInstances = [...instances];
  if (mirrorMod) {
    instances.forEach((inst, idx) => {
      finalInstances.push(
        <group key={`mirror-${idx}`} scale={[-1, 1, 1]}>
          {inst}
        </group>
      );
    });
  }

  const activePhysicsRef = physicsRef;

  if (!obj.visible) return null;

  if (obj.type === 'stroke' && obj.points && obj.points.length > 1) {
    return (
      <group name={obj.id} ref={activePhysicsRef} scale={obj.scale}>
        <Line 
          points={obj.points} 
          color={obj.color} 
          lineWidth={obj.params.lineWidth || 2} 
          onClick={handleClick}
        />
      </group>
    );
  }

  if (obj.type === 'pcb') {
    return (
      <group name={obj.id} ref={activePhysicsRef} scale={obj.scale} onClick={handleClick}>
        <PCBViewer obj={obj} />
        {isSelected && <Edges scale={1.01} threshold={15} color="#00f3ff" />}
        {isSelected && <MeasurementLabels obj={obj} />}
      </group>
    );
  }

  if ((arrayMod && arrayMod.enabled) || (mirrorMod && mirrorMod.enabled)) {
    return (
      <group name={obj.id} ref={activePhysicsRef} scale={obj.scale} onClick={handleClick}>
        {finalInstances}
        {isSelected && <Edges scale={1.01} threshold={15} color="#00f3ff" />}
        {isSelected && <MeasurementLabels obj={obj} />}
      </group>
    );
  }

  if (obj.type === 'mesh' && obj.mesh) {
    return (
      <group name={obj.id} ref={activePhysicsRef} scale={obj.scale}>
        <primitive 
          object={obj.mesh} 
          onClick={handleClick}
        />
        {isSelected && (
          <>
            <Edges scale={1.01} threshold={15} color="#00f3ff" />
            <MeasurementLabels obj={obj} />
          </>
        )}
      </group>
    );
  }

  const geometry = renderGeometry();

  return (
    <group name={obj.id} ref={activePhysicsRef} scale={obj.scale}>
      <mesh onClick={handleClick}>
        {geometry}
        {material}
        {wireframeMod && <Wireframe thickness={wireframeMod.thickness || 0.05} stroke={"#00f3ff"} />}
        {isSelected && <Edges scale={1.01} threshold={15} color="#00f3ff" />}
      </mesh>
      {isSelected && <MeasurementLabels obj={obj} />}
    </group>
  );
};

const MATERIAL_PRESETS = [
  { name: 'Plastic', color: '#3B82F6', metalness: 0, roughness: 0.2, transparent: false, opacity: 1, clearcoat: 0, clearcoatRoughness: 0, emission: '#000000', emissionIntensity: 0 },
  { name: 'Metal', color: '#A0A0A0', metalness: 0.8, roughness: 0.2, transparent: false, opacity: 1, clearcoat: 0, clearcoatRoughness: 0, emission: '#000000', emissionIntensity: 0 },
  { name: 'Wood', color: '#8B4513', metalness: 0, roughness: 0.8, transparent: false, opacity: 1, clearcoat: 0, clearcoatRoughness: 0, emission: '#000000', emissionIntensity: 0 },
  { name: 'Glass', color: '#ffffff', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.2, clearcoat: 1, clearcoatRoughness: 0, emission: '#000000', emissionIntensity: 0 },
  { name: 'Gold', color: '#FFD700', metalness: 1.0, roughness: 0.1, transparent: false, opacity: 1, clearcoat: 0, clearcoatRoughness: 0, emission: '#000000', emissionIntensity: 0 },
  { name: 'Neon', color: '#00ff00', metalness: 0, roughness: 0.5, transparent: false, opacity: 1, clearcoat: 0, clearcoatRoughness: 0, emission: '#00ff00', emissionIntensity: 2 },
];

// --- Main App ---
function PhysicsGround() {
  const [ref] = usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], position: [0, 0, 0] }));
  return (
    <mesh ref={ref as any} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <shadowMaterial opacity={0.4} />
    </mesh>
  );
}

function TransformControlsWrapper({ selectedId, transformMode, snapToGrid, updateObject, setIsDraggingTransform }: any) {
  const { scene } = useThree();
  const object = selectedId ? scene.getObjectByName(selectedId) : undefined;

  if (!object || !object.parent || !transformMode) return null;

  return (
    <TransformControls 
      object={object} 
      mode={transformMode} 
      translationSnap={snapToGrid ? 0.5 : null}
      rotationSnap={snapToGrid ? Math.PI / 12 : null}
      scaleSnap={snapToGrid ? 0.1 : null}
      onMouseDown={() => setIsDraggingTransform(true)}
      onMouseUp={() => setIsDraggingTransform(false)}
      onChange={(e: any) => {
        if (e?.target?.object) {
          const obj = e.target.object;
          updateObject(selectedId, {
            position: [obj.position.x, obj.position.y, obj.position.z],
            rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            scale: [obj.scale.x, obj.scale.y, obj.scale.z]
          });
        }
      }}
    />
  );
}

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPhysicsActive, setIsPhysicsActive] = useState(true);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isPCBMode, setIsPCBMode] = useState(false);
  const [isSnappingEnabled, setIsSnappingEnabled] = useState(true);
  const [isProportionalEditing, setIsProportionalEditing] = useState(false);
  const [faceOrientation, setFaceOrientation] = useState(false);
  const [brushColor, setBrushColor] = useState('#00f3ff');
  const [brushSize, setBrushSize] = useState(2);
  const [drawOnSurface, setDrawOnSurface] = useState(false);
  const [shadingMode, setShadingMode] = useState<'wireframe' | 'solid' | 'material'>('material');
  const [currentTheme, setCurrentTheme] = useState(THEMES[0]);
  const [currentStroke, setCurrentStroke] = useState<[number, number, number][]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState('default-room');
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number, y: number, name: string }>>({});
  const [isDraggingTransform, setIsDraggingTransform] = useState(false);
  const isRemoteUpdate = useRef(false);
  
  // Responsive State
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--cyber-bg', currentTheme.bg);
    root.style.setProperty('--cyber-card', currentTheme.card);
    root.style.setProperty('--cyber-cyan', currentTheme.cyan);
    root.style.setProperty('--cyber-magenta', currentTheme.magenta);
    root.style.setProperty('--cyber-lime', currentTheme.lime);
    root.style.setProperty('--cyber-border', currentTheme.border);
  }, [currentTheme]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Undo/Redo State
  const [objects, setObjectsState] = useState<SceneObject[]>([
    {
      id: 'initial-box',
      name: 'Base Block',
      type: 'box',
      params: { width: 1, height: 1, depth: 1 },
      color: '#00f3ff',
      metalness: 0.6,
      roughness: 0.2,
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }
  ]);
  const [history, setHistory] = useState<SceneObject[][]>([[...objects]]);
  const [historyPointer, setHistoryPointer] = useState(0);

  const onMount = useCallback((id: string, mesh: any) => {
    isRemoteUpdate.current = true;
    setObjectsState(prev => {
      const obj = prev.find(o => o.id === id);
      if (obj && obj.mesh !== mesh) {
        return prev.map(o => o.id === id ? { ...o, mesh } : o);
      }
      return prev;
    });
  }, []);

  const setObjects = useCallback((newObjects: SceneObject[] | ((prev: SceneObject[]) => SceneObject[])) => {
    setObjectsState(prev => {
      const next = typeof newObjects === 'function' ? newObjects(prev) : newObjects;
      
      // Strip non-serializable fields for comparison
      const strip = (objs: SceneObject[]) => objs.map(({ mesh, ...rest }) => rest);
      
      // Only add to history if it's actually different
      if (JSON.stringify(strip(next)) !== JSON.stringify(strip(prev))) {
        setHistory(prevHistory => {
          const newHistory = prevHistory.slice(0, historyPointer + 1);
          newHistory.push(next);
          // Limit history size
          if (newHistory.length > 50) newHistory.shift();
          setHistoryPointer(newHistory.length - 1);
          return newHistory;
        });
      }
      return next;
    });
  }, [historyPointer]);

  const undo = () => {
    if (historyPointer > 0) {
      const prevPointer = historyPointer - 1;
      setHistoryPointer(prevPointer);
      setObjectsState(history[prevPointer]);
      addLog("Undo performed.");
    }
  };

  const redo = () => {
    if (historyPointer < history.length - 1) {
      const nextPointer = historyPointer + 1;
      setHistoryPointer(nextPointer);
      setObjectsState(history[nextPointer]);
      addLog("Redo performed.");
    }
  };

  // Collaboration Setup
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      addLog("Collaboration: Connected to server.");
    });

    newSocket.on('room-state', (remoteObjects: SceneObject[]) => {
      isRemoteUpdate.current = true;
      setObjectsState(remoteObjects);
      addLog("Collaboration: Synced room state.");
    });

    newSocket.on('objects-updated', (remoteObjects: SceneObject[]) => {
      isRemoteUpdate.current = true;
      setObjectsState(remoteObjects);
    });

    newSocket.on('annotations-updated', (remoteAnnotations: Annotation[]) => {
      isRemoteUpdate.current = true;
      setAnnotations(remoteAnnotations);
    });

    newSocket.on('cursor-moved', ({ id, x, y, name }) => {
      setRemoteCursors(prev => ({ ...prev, [id]: { x, y, name } }));
    });

    newSocket.on('user-left', (id) => {
      setRemoteCursors(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const joinRoom = (id: string) => {
    if (socket) {
      socket.emit('join-room', id);
      setRoomId(id);
      setIsCollaborating(true);
      addLog(`Collaboration: Joined room ${id}`);
    }
  };

  useEffect(() => {
    if (socket && isCollaborating) {
      if (isRemoteUpdate.current) {
        addLog("Collaboration: Remote update detected, skipping emission.");
        isRemoteUpdate.current = false;
        return;
      }
      addLog("Collaboration: Local update detected, emitting.");
      socket.emit('update-objects', { roomId, objects });
      socket.emit('update-annotations', { roomId, annotations });
    }
  }, [objects, annotations, isCollaborating, roomId, socket]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (socket && isCollaborating) {
      socket.emit('move-cursor', {
        roomId,
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
        name: "User_" + socket.id?.substr(0, 4)
      });
    }
  };

  const [selectedIds, setSelectedIds] = useState<string[]>(['initial-box']);
  const selectedId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>(['System initialized...', 'CAD Engine ready.', 'Blender Kernel v4.2 Loaded.']);
  const [aiResponse, setAiResponse] = useState('');
  const [cmdInput, setCmdInput] = useState('');
  
  // Ruler & Scene Settings
  const [isRulerMode, setIsRulerMode] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<THREE.Vector3[]>([]);
  const [rulerDistance, setRulerDistance] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [xray, setXray] = useState(false);
  const [bgColor, setBgColor] = useState('#050505');
  const [cameraView, setCameraView] = useState<'perspective' | 'top' | 'front' | 'side'>('perspective');

  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useEffect(() => {
    if (!cameraRef.current) return;
    const cam = cameraRef.current;
    switch (cameraView) {
      case 'top':
        cam.position.set(0, 10, 0);
        cam.lookAt(0, 0, 0);
        break;
      case 'front':
        cam.position.set(0, 0, 10);
        cam.lookAt(0, 0, 0);
        break;
      case 'side':
        cam.position.set(10, 0, 0);
        cam.lookAt(0, 0, 0);
        break;
      case 'perspective':
        cam.position.set(5, 5, 5);
        cam.lookAt(0, 0, 0);
        break;
    }
  }, [cameraView]);

  const selectedObj = objects.find(o => o.id === selectedId);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-14), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const addObject = (type: SceneObject['type'], params: any = {}, color = '#00f3ff') => {
    // Default dimensions for primitive shapes
    let dimensions = { width: 1, height: 1, depth: 1 };
    if (type === 'sphere') dimensions = { width: 1.4, height: 1.4, depth: 1.4 };
    if (type === 'cylinder') dimensions = { width: 1, height: 1.5, depth: 1 };
    if (type === 'torus') dimensions = { width: 1.8, height: 1.8, depth: 0.4 };
    if (type === 'pcb') dimensions = { width: 4, height: 0.1, depth: 6 };

    const newObj: SceneObject = {
      id: Math.random().toString(36).substr(2, 9),
      name: `${type.toUpperCase()}_${objects.length + 1}`,
      type,
      params: { ...params, dimensions },
      color: type === 'pcb' ? '#1a4d1a' : color,
      metalness: 0.5,
      roughness: 0.5,
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      points: type === 'stroke' ? [] : undefined,
      pcbData: type === 'pcb' ? {
        layers: [
          { id: 'top-copper', name: 'Top Copper', color: '#ffcc00', visible: true, type: 'copper' },
          { id: 'top-silk', name: 'Top Silkscreen', color: '#ffffff', visible: true, type: 'silk' },
          { id: 'top-mask', name: 'Top Solder Mask', color: '#1a4d1a', visible: true, type: 'mask' },
        ],
        components: [
          { id: 'u1', name: 'MCU', position: [0, 0], type: 'ic' },
          { id: 'r1', name: 'R1', position: [1, 1], type: 'resistor' },
        ]
      } : undefined,
      isPhysicsEnabled: type === 'pcb' ? false : true
    };
    setObjects(prev => [...prev, newObj]);
    setSelectedIds([newObj.id]);
    addLog(`Added ${type} to scene.`);
  };

  const updateObject = (id: string, updates: Partial<SceneObject>) => {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const deleteObject = (id: string) => {
    setObjects(prev => prev.filter(o => o.id !== id));
    if (selectedIds.includes(id)) setSelectedIds(prev => prev.filter(i => i !== id));
    addLog(`Deleted object ${id}.`);
  };

  const duplicateObject = (id: string) => {
    const obj = objects.find(o => o.id === id);
    if (!obj) return;
    const newObj: SceneObject = {
      ...obj,
      id: Math.random().toString(36).substr(2, 9),
      name: `${obj.name}_COPY`,
      position: [obj.position[0] + 0.5, obj.position[1], obj.position[2] + 0.5],
      isPhysicsEnabled: true,
      mesh: undefined // Don't copy mesh ref
    };
    setObjects(prev => [...prev, newObj]);
    setSelectedIds([newObj.id]);
    addLog(`Duplicated object ${obj.name}.`);
  };

  const resetScene = () => {
    setObjects([]);
    setSelectedIds([]);
    setHistory([[]]);
    setHistoryPointer(0);
    addLog("Scene reset.");
  };

  const zoomIn = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(0.8);
      addLog("Viewport: Zoom in.");
    }
  };

  const zoomOut = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(1.2);
      addLog("Viewport: Zoom out.");
    }
  };

  const zoomToFit = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(5, 5, 5);
      cameraRef.current.lookAt(0, 0, 0);
      addLog("Viewport: View reset to default.");
    }
  };

  const renderHighRes = () => {
    addLog("Render: Generating high-quality image...");
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `render-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      addLog("Render: Image saved to downloads.");
    }
  };

  const addObjectToScene = (mesh: THREE.Group | THREE.Mesh, name: string, type: 'mesh' | 'pcb' = 'mesh', pcbData?: any) => {
    // Center geometry
    try {
      if (mesh instanceof THREE.Mesh) {
        mesh.geometry.computeBoundingBox();
        mesh.geometry.center();
      } else if (mesh instanceof THREE.Group) {
        const box = new THREE.Box3().setFromObject(mesh);
        addLog(`PCB Group Bounding Box: ${box.min.x},${box.min.y},${box.min.z} to ${box.max.x},${box.max.y},${box.max.z}`);
        if (!box.isEmpty()) {
          const center = new THREE.Vector3();
          box.getCenter(center);
          addLog(`PCB Group Center: ${center.x},${center.y},${center.z}`);
          mesh.position.sub(center);
        }
      }
    } catch (err) {
      console.error("Error centering mesh:", err);
    }

    // Calculate dimensions
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) {
      box.getSize(size);
    } else {
      size.set(1, 1, 1);
    }

    // Ensure size is valid and finite
    if (!isFinite(size.x) || !isFinite(size.y) || !isFinite(size.z) || (size.x === 0 && size.y === 0 && size.z === 0)) {
      size.set(1, 1, 1);
    }

    // Calculate stats
    let vertices = 0;
    let faces = 0;
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geometry = child.geometry;
        if (geometry.index) {
          faces += geometry.index.count / 3;
        } else if (geometry.attributes.position) {
          faces += geometry.attributes.position.count / 3;
        }
        if (geometry.attributes.position) {
          vertices += geometry.attributes.position.count;
        }
      }
    });

    const newObj: SceneObject = {
      id: Math.random().toString(36).substr(2, 9),
      name: name,
      type: type,
      pcbData: pcbData || (type === 'pcb' ? {
        layers: [{ id: 'layer1', name: 'Layer 1', color: '#ff0000', visible: true, type: 'copper' }],
        components: []
      } : undefined),
      params: {
        dimensions: {
          width: size.x,
          height: size.y,
          depth: size.z
        }
      },
      stats: {
        vertices,
        faces
      },
      color: '#ffffff',
      metalness: 0.5,
      roughness: 0.5,
      visible: true,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      isPhysicsEnabled: true,
      mesh
    };
    setObjects(prev => [...prev, newObj]);
    setSelectedIds([newObj.id]);
    console.log(`Added object ${name} with size ${size.x}x${size.y}x${size.z}`);
    addLog(`Successfully imported ${name}. Dimensions: ${size.x.toFixed(2)}x${size.y.toFixed(2)}x${size.z.toFixed(2)}`);
    
    // Auto-focus on the new object
    setTimeout(() => {
      if (!cameraRef.current) return;
      
      const pos = new THREE.Vector3(0, 0, 0);
      
      // Calculate a safe offset based on object size
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      // Limit offset to stay within reasonable bounds and camera far plane
      const offsetVal = Math.min(maxDim * 2.5 + 2, 2000); 
      const offset = new THREE.Vector3(offsetVal, offsetVal, offsetVal);
      
      if (isFinite(offset.x) && isFinite(offset.y) && isFinite(offset.z)) {
        cameraRef.current.position.copy(pos).add(offset);
        cameraRef.current.lookAt(pos);
      }
    }, 100);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const extension = file.name.split('.').pop()?.toLowerCase();
    addLog(`Loading file: ${file.name} (${extension})...`);

    const parseSExpr = (input: string): any[] => {
      const tokens: string[] = [];
      let currentToken = '';
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (inString) {
          if (escapeNext) {
            currentToken += char;
            escapeNext = false;
          } else if (char === '\\') {
            escapeNext = true;
          } else if (char === '"') {
            inString = false;
            currentToken += char;
            tokens.push(currentToken);
            currentToken = '';
          } else {
            currentToken += char;
          }
        } else {
          if (char === '"') {
            if (currentToken.length > 0) {
              tokens.push(currentToken);
              currentToken = '';
            }
            inString = true;
            currentToken += char;
          } else if (char === '(' || char === ')') {
            if (currentToken.length > 0) {
              tokens.push(currentToken);
              currentToken = '';
            }
            tokens.push(char);
          } else if (/\s/.test(char)) {
            if (currentToken.length > 0) {
              tokens.push(currentToken);
              currentToken = '';
            }
          } else {
            currentToken += char;
          }
        }
      }
      if (currentToken.length > 0) {
        tokens.push(currentToken);
      }

      const stack: any[] = [[]];
      for (const token of tokens) {
        if (token === '(') {
          const newNode: any[] = [];
          stack[stack.length - 1].push(newNode);
          stack.push(newNode);
        } else if (token === ')') {
          if (stack.length > 1) {
            stack.pop();
          }
        } else {
          let val = token;
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1);
          }
          stack[stack.length - 1].push(val);
        }
      }
      return stack[0];
    };

    if (extension === 'zip') {
      addLog(`Loading zip file: ${file.name}...`);
      try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);
        const group = new THREE.Group();
        
        for (const filename in zipContent.files) {
          const fileEntry = zipContent.files[filename];
          if (fileEntry.dir) continue;
          const ext = filename.split('.').pop()?.toLowerCase();
          
          // Gerber and Drill file extensions
          const isGerber = ['gbr', 'gerber', 'pho', 'art'].includes(ext || '');
          const isDrill = ['drl', 'drd', 'xln', 'txt'].includes(ext || '');
          
          if (isGerber || isDrill) {
            try {
              const content = await fileEntry.async('string');
              const converter = gerberToSvg(content);
              const svgString = converter.toString();
              const loader = new SVGLoader();
              const svgData = loader.parse(svgString);
              
              const layerGroup = new THREE.Group();
              layerGroup.name = filename; // Use filename as layer name
              
              svgData.paths.forEach((path) => {
                const shapes = path.toShapes(true);
                shapes.forEach((shape) => {
                  const geometry = new THREE.ShapeGeometry(shape);
                  const material = new THREE.MeshStandardMaterial({ color: path.color, side: THREE.DoubleSide });
                  const mesh = new THREE.Mesh(geometry, material);
                  layerGroup.add(mesh);
                });
              });
              group.add(layerGroup);
            } catch (err) {
              addLog(`Error processing ${filename}: ${err}`);
            }
          }
        }
        const pcbData = {
          layers: group.children.map((child: any) => ({
            id: child.name,
            type: child.name.includes('copper') ? 'copper' : 'silk',
            visible: true,
            color: child.name.includes('copper') ? '#ff0000' : '#ffffff'
          })),
          components: [],
          nets: new Map(),
          pads: []
        };
        addObjectToScene(group, file.name, 'pcb', pcbData);
      } catch (err) {
        addLog(`Error loading zip file: ${err}`);
      }
      return;
    } else if (extension === 'kicad_pcb') {
      addLog(`Loading KiCad PCB file: ${file.name}...`);
      try {
        const content = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file);
        });
        
        const pcb = parseKicadPcb(content);
        const group = new THREE.Group();
        group.rotation.x = Math.PI / 2;
        
        const nets = new Map<string, string>();
        const pads: any[] = [];
        const components: any[] = [];
        
        if (pcb.nets) {
          pcb.nets.forEach(net => {
            nets.set(net.id.toString(), net.name);
          });
        }

        // Board outline
        let hasBoardOutline = false;
        if (pcb.graphicPolys) {
          pcb.graphicPolys.forEach(poly => {
            if (poly.layer?.names.includes('Edge.Cuts') && poly.points && poly.points.points) {
              const points = poly.points.points.map(p => {
                if ('x' in p && 'y' in p) return new THREE.Vector2(p.x, p.y);
                return new THREE.Vector2(0, 0); // fallback for arcs
              });
              if (points.length > 2) {
                const shape = new THREE.Shape(points);
                const extrudeSettings = { depth: 1.6, bevelEnabled: false };
                const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                // Do not center the geometry here, otherwise it will misalign with pads and components
                const material = new THREE.MeshStandardMaterial({ color: 0x005500, roughness: 0.8, metalness: 0.2 });
                const mesh = new THREE.Mesh(geometry, material);
                group.add(mesh);
                hasBoardOutline = true;
              }
            }
          });
        }
        
        if (!hasBoardOutline) {
          // Fallback: calculate bounding box from lines and arcs
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          
          const updateBounds = (x: number, y: number) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          };

          if (pcb.graphicLines) {
            pcb.graphicLines.forEach(line => {
              if (line.layer?.names.includes('Edge.Cuts')) {
                if (line.startPoint) updateBounds(line.startPoint.x, line.startPoint.y);
                if (line.endPoint) updateBounds(line.endPoint.x, line.endPoint.y);
              }
            });
          }
          
          if (pcb.otherChildren) {
            pcb.otherChildren.forEach(child => {
              if (child.token === 'gr_arc') {
                const arc = child as any;
                if (arc.layer?.names?.includes('Edge.Cuts')) {
                  if (arc.startPoint) updateBounds(arc.startPoint.x, arc.startPoint.y);
                  if (arc.endPoint) updateBounds(arc.endPoint.x, arc.endPoint.y);
                }
              }
            });
          }
          
          // Also check generic lines if graphicLines isn't populated (kicadts might map gr_line to something else)
          // Wait, kicadts maps gr_line to graphicLines.
          
          // If we found bounds, create a rectangular board
          if (minX !== Infinity && maxX !== -Infinity) {
            const width = maxX - minX;
            const height = maxY - minY;
            const shape = new THREE.Shape();
            shape.moveTo(minX, minY);
            shape.lineTo(maxX, minY);
            shape.lineTo(maxX, maxY);
            shape.lineTo(minX, maxY);
            shape.closePath();
            
            const extrudeSettings = { depth: 1.6, bevelEnabled: false };
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            // Do not center the geometry here, otherwise it will misalign with pads and components
            const material = new THREE.MeshStandardMaterial({ color: 0x005500, roughness: 0.8, metalness: 0.2 });
            const mesh = new THREE.Mesh(geometry, material);
            group.add(mesh);
            hasBoardOutline = true;
          }
        }
        
        // Footprints
        if (pcb.footprints) {
          pcb.footprints.forEach(fp => {
            const x = fp.position?.x || 0;
            const y = fp.position?.y || 0;
            const rotation = 'angle' in (fp.position || {}) ? (fp.position as any).angle : 0;
            
            let name = 'Unknown';
            if (fp.fpTexts) {
              const refText = fp.fpTexts.find(t => t.type === 'reference');
              if (refText) name = refText.text || 'Unknown';
            }
            
            let type = 'resistor';
            if (name.toLowerCase().includes('ic') || name.toLowerCase().includes('dip') || name.toLowerCase().includes('soic') || name.toLowerCase().startsWith('u')) {
              type = 'ic';
            } else if (name.toLowerCase().startsWith('c')) {
              type = 'capacitor';
            } else if (name.toLowerCase().startsWith('j') || name.toLowerCase().startsWith('conn')) {
              type = 'connector';
            }
            
            if (fp.fpPads) {
              fp.fpPads.forEach(pad => {
                const padX = pad.at?.x || 0;
                const padY = pad.at?.y || 0;
                const rotRad = rotation * Math.PI / 180;
                const rotPadX = padX * Math.cos(rotRad) - padY * Math.sin(rotRad);
                const rotPadY = padX * Math.sin(rotRad) + padY * Math.cos(rotRad);
                const netId = pad.net?.id?.toString() || null;
                pads.push({ 
                  x: x + rotPadX, 
                  y: y + rotPadY, 
                  netId, 
                  netName: netId ? nets.get(netId) : null,
                  shape: pad.shape,
                  width: pad.size?.width || 1,
                  height: pad.size?.height || 1,
                  angle: (pad.at?.angle || 0) + rotation
                });
              });
            }
            
            components.push({
              id: Math.random().toString(36).substr(2, 9),
              name,
              position: [x, y],
              rotation,
              type
            });
          });
        }

        // Render pads
        pads.forEach(pad => {
          let geometry;
          if (pad.shape === 'circle') {
            geometry = new THREE.CircleGeometry(pad.width / 2, 16);
          } else if (pad.shape === 'oval') {
            // Approximation for oval
            const radius = Math.min(pad.width, pad.height) / 2;
            const length = Math.abs(pad.width - pad.height);
            geometry = new THREE.CapsuleGeometry(radius, length, 4, 16);
            // Capsule is along Y axis by default, we might need to rotate it if width > height
            if (pad.width > pad.height) {
              geometry.rotateZ(Math.PI / 2);
            }
          } else {
            // rect, roundrect, or default
            geometry = new THREE.PlaneGeometry(pad.width, pad.height);
          }
          
          const material = new THREE.MeshStandardMaterial({ color: pad.netName === 'GND' ? 0x00ff00 : 0x0000ff, side: THREE.DoubleSide });
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(pad.x, pad.y, -0.1);
          if (pad.angle) {
            mesh.rotation.z = -pad.angle * Math.PI / 180;
          }
          group.add(mesh);
        });
        
        const pcbData = {
          layers: [{ id: 'layer1', name: 'Layer 1', color: '#ff0000', visible: true, type: 'copper' as const }],
          components,
          nets,
          pads
        };
        
        addObjectToScene(group, file.name, 'pcb', pcbData);
      } catch (err) {
        addLog(`Error loading KiCad PCB file: ${err}`);
      }
      return;
    }

    reader.onload = async (event) => {
      const contents = event.target?.result;
      if (!contents) return;

      try {
        let mesh: THREE.Group | THREE.Mesh | null = null;
        if (extension === 'stl') {
          const loader = new STLLoader();
          const geometry = loader.parse(contents as ArrayBuffer);
          mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ 
            color: '#ffffff',
            side: THREE.DoubleSide,
            metalness: 0.5,
            roughness: 0.5
          }));
        } else if (extension === 'obj') {
          const loader = new OBJLoader();
          mesh = loader.parse(contents as string);
        } else if (extension === 'gbr' || extension === 'gerber') {
          const gerberContents = contents as string;
          // Simplified Gerber parsing for now
          const converter = gerberToSvg(gerberContents);
          const svgString = converter.toString();
          const loader = new SVGLoader();
          const svgData = loader.parse(svgString);
          const group = new THREE.Group();
          svgData.paths.forEach((path) => {
            const shapes = path.toShapes(true);
            shapes.forEach((shape) => {
              const geometry = new THREE.ShapeGeometry(shape);
              const material = new THREE.MeshBasicMaterial({ color: path.color });
              const mesh = new THREE.Mesh(geometry, material);
              group.add(mesh);
            });
          });
          mesh = group;
        }

        if (mesh) {
          addObjectToScene(mesh, file.name, extension === 'gbr' || extension === 'gerber' ? 'pcb' : 'mesh');
        }
      } catch (err) {
        addLog(`Error loading file: ${err}`);
      }
    };

    if (extension === 'obj') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  };

  const handleGenerativeDesign = async () => {
    if (!selectedId) {
      addLog("Generative Design: Select an object to optimize.");
      return;
    }
    const obj = objects.find(o => o.id === selectedId);
    if (!obj) return;

    setIsGenerating(true);
    addLog("Generative Design: Starting topology optimization...");

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const promptText = `You are a generative design engineer. 
      Optimize the following 3D object for structural integrity and material efficiency:
      Object Name: ${obj.name}
      Current Type: ${obj.type}
      Color: ${obj.color}
      
      Return a JSON array of new objects that represent an optimized version (e.g., using lattice structures, hollowed parts, or reinforced sections).
      Each object should have: name, type (box, sphere, cylinder, torus), color, scale, position, rotation.
      Only return the JSON array.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: promptText,
        config: { responseMimeType: "application/json" }
      });

      const optimizedObjects = JSON.parse(response.text);
      if (Array.isArray(optimizedObjects)) {
        const newObjects = optimizedObjects.map((o: any) => ({
          ...o,
          id: Math.random().toString(36).substr(2, 9),
          visible: true,
          metalness: 0.8,
          roughness: 0.2,
          position: o.position || [0, 0, 0],
          rotation: o.rotation || [0, 0, 0],
          scale: o.scale || [1, 1, 1]
        }));
        setObjects(prev => [...prev.filter(o => o.id !== selectedId), ...newObjects]);
        addLog("Generative Design: Optimization complete.");
      }
    } catch (err) {
      addLog(`Generative Design Error: ${err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    addLog(`AI Module: Interpreting request "${prompt}"...`);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a CAD/Blender expert. Based on: "${prompt}", generate a JSON object for a 3D primitive or a scene modification. 
        If the user asks to "optimize" or "generative design", suggest a lattice-like structure or a more efficient shape.
        Supported types: "box", "sphere", "cylinder", "torus".
        Parameters: 
        - for box: width, height, depth
        - for sphere: radius
        - for cylinder: radius, height
        - for torus: radius, tube
        Also provide a hex color, metalness (0-1), roughness (0-1), position [x,y,z], and a brief explanation.
        Return ONLY valid JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              params: { type: Type.OBJECT },
              color: { type: Type.STRING },
              metalness: { type: Type.NUMBER },
              roughness: { type: Type.NUMBER },
              position: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              explanation: { type: Type.STRING }
            },
            required: ["type", "params", "color", "metalness", "roughness", "position", "explanation"]
          }
        }
      });

      const data = JSON.parse(response.text);
      const newObj: SceneObject = {
        id: Math.random().toString(36).substr(2, 9),
        name: `AI_${data.type.toUpperCase()}`,
        type: data.type as any,
        params: data.params,
        color: data.color,
        metalness: data.metalness,
        roughness: data.roughness,
        visible: true,
        position: data.position || [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        isPhysicsEnabled: true
      };
      setObjects(prev => [...prev, newObj]);
      setSelectedIds([newObj.id]);
      setAiResponse(data.explanation);
      addLog(`AI Module: ${data.explanation}`);
    } catch (error) {
      addLog("AI Module: Error generating geometry.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateTexture = async () => {
    if (!selectedObj) return;
    setIsGenerating(true);
    addLog(`AI Texture: Generating texture for ${selectedObj.name}...`);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: `Generate a high-quality, seamless PBR texture for a 3D model. 
        Theme: ${prompt || "futuristic metal"}
        Style: Realistic, detailed.`,
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64 = part.inlineData.data;
          const url = `data:image/png;base64,${base64}`;
          updateObject(selectedObj.id, { textureUrl: url });
          addLog("AI Texture: Texture applied successfully.");
          break;
        }
      }
    } catch (error) {
      addLog("AI Texture: Error generating texture.");
    } finally {
      setIsGenerating(false);
    }
  };

  const performBoolean = (type: 'union' | 'subtract' | 'intersect') => {
    if (selectedIds.length < 2) {
      addLog("Boolean: Select at least 2 objects (Shift+Click).");
      return;
    }
    
    const objA = objects.find(o => o.id === selectedIds[0]);
    const objB = objects.find(o => o.id === selectedIds[1]);
    
    if (!objA || !objB) return;

    addLog(`Boolean: Calculating ${type.toUpperCase()} between ${objA.name} and ${objB.name}...`);
    
    try {
      const evaluator = new Evaluator();
      
      // Helper to get geometry from mesh or group
      const getGeometry = (obj: SceneObject) => {
        let geo: THREE.BufferGeometry | null = null;
        if (obj.mesh) {
          if (obj.mesh instanceof THREE.Mesh) {
            geo = obj.mesh.geometry.clone();
          } else {
            obj.mesh.traverse((child: any) => {
              if (child instanceof THREE.Mesh && !geo) {
                geo = child.geometry.clone();
              }
            });
          }
        } else {
          // It's a primitive
          switch (obj.type) {
            case 'box': geo = new THREE.BoxGeometry(obj.params.width || 1, obj.params.height || 1, obj.params.depth || 1); break;
            case 'sphere': geo = new THREE.SphereGeometry(obj.params.radius || 0.7, 32, 32); break;
            case 'cylinder': geo = new THREE.CylinderGeometry(obj.params.radius || 0.5, obj.params.radius || 0.5, obj.params.height || 1.5, 32); break;
            case 'torus': geo = new THREE.TorusGeometry(obj.params.radius || 0.7, obj.params.tube || 0.2, 16, 32); break;
          }
        }
        
        if (geo && !geo.attributes.uv) {
          const count = geo.attributes.position.count;
          geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        }
        return geo;
      };

      const geoA = getGeometry(objA);
      const geoB = getGeometry(objB);

      if (!geoA || !geoB) {
        addLog("Boolean Error: Could not extract geometry.");
        return;
      }

      const brushA = new Brush(geoA, new THREE.MeshStandardMaterial({ color: objA.color }));
      brushA.position.set(...objA.position);
      brushA.rotation.set(...objA.rotation);
      brushA.scale.set(...objA.scale);
      brushA.updateMatrixWorld();

      const brushB = new Brush(geoB, new THREE.MeshStandardMaterial({ color: objB.color }));
      brushB.position.set(...objB.position);
      brushB.rotation.set(...objB.rotation);
      brushB.scale.set(...objB.scale);
      brushB.updateMatrixWorld();

      let op = ADDITION;
      if (type === 'subtract') op = SUBTRACTION;
      if (type === 'intersect') op = INTERSECTION;

      const result = evaluator.evaluate(brushA, brushB, op);
      
      const newObj: SceneObject = {
        id: Math.random().toString(36).substr(2, 9),
        name: `CSG_${type.toUpperCase()}`,
        type: 'mesh',
        params: {},
        color: objA.color,
        metalness: objA.metalness,
        roughness: objA.roughness,
        visible: true,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        isPhysicsEnabled: true,
        mesh: result
      };

      setObjects(prev => [...prev.filter(o => o.id !== objA.id && o.id !== objB.id), newObj]);
      setSelectedIds([newObj.id]);
      addLog(`Boolean: ${type} successful.`);
    } catch (err) {
      addLog(`Boolean Error: ${err}`);
      console.error(err);
    }
  };

  const exportScene = (format: 'glb' | 'stl') => {
    addLog(`Export: Preparing ${format.toUpperCase()} file...`);
    const scene = new THREE.Scene();
    objects.forEach(obj => {
      if (obj.mesh) scene.add(obj.mesh.clone());
    });

    if (format === 'glb') {
      const exporter = new GLTFExporter();
      exporter.parse(scene, (result) => {
        const blob = new Blob([JSON.stringify(result)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'scene.glb';
        link.click();
      }, (err) => addLog(`Export Error: ${err}`), { binary: true });
    } else {
      const exporter = new STLExporter();
      const result = exporter.parse(scene);
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'scene.stl';
      link.click();
    }
  };

  const exportPCB = async () => {
    if (!selectedId) return;
    const obj = objects.find(o => o.id === selectedId);
    if (!obj || obj.type !== 'pcb' || !obj.pcbData) {
      addLog("Export: Please select a PCB object.");
      return;
    }

    const { pcbData } = obj;
    const zip = new JSZip();

    // 1. Generate Gerber for each layer
    pcbData.layers.forEach((layer, i) => {
      let gerberContent = `G04 Layer: ${layer.name}*\n%FSLAX26Y26*%\n%MOIN*%\n%ADD10C,0.1*%\n`;
      // Filter pads for this layer (assuming all pads are on all layers for now, or need layer mapping)
      pcbData.pads.forEach((pad: any, j: number) => {
        gerberContent += `D10*\n`;
        gerberContent += `X${(pad.x * 10000).toFixed(0)}Y${(pad.y * 10000).toFixed(0)}D03*\n`;
      });
      gerberContent += "M02*";
      zip.file(`${obj.name}_${layer.name}.gbr`, gerberContent);
    });

    // 2. Generate Excellon Drill file
    let excellonContent = "M48\nMETRIC,TZ\n";
    pcbData.pads.forEach((pad: any) => {
      excellonContent += `X${(pad.x * 1000).toFixed(3)}Y${(pad.y * 1000).toFixed(3)}\n`;
    });
    excellonContent += "M30";
    zip.file(`${obj.name}.drl`, excellonContent);

    // 3. Generate Pick and Place file
    let pnpContent = "Designator,Mid X,Mid Y,Rotation,Layer\n";
    pcbData.components.forEach((comp: any) => {
      pnpContent += `${comp.name},${comp.position[0].toFixed(3)},${comp.position[1].toFixed(3)},${comp.rotation.toFixed(2)},Top\n`;
    });
    zip.file(`${obj.name}_pnp.csv`, pnpContent);

    // 4. Generate Netlist file
    let netlistContent = "Net Name,Pads\n";
    pcbData.nets.forEach((name: string, id: string) => {
      const pads = pcbData.pads.filter((p: any) => p.netId === id);
      netlistContent += `${name},${pads.length}\n`;
    });
    zip.file(`${obj.name}_netlist.csv`, netlistContent);

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${obj.name}_export.zip`;
    a.click();
    addLog("Export: PCB exported as zip with Gerber, Drill, PNP, and Netlist.");
  };

  const addAnnotation = () => {
    if (!selectedObj) return;
    const newAnnotation: Annotation = {
      id: Math.random().toString(36).substr(2, 9),
      objectId: selectedObj.id,
      text: "New Annotation",
      position: [selectedObj.position[0], selectedObj.position[1] + 1, selectedObj.position[2]]
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    addLog("Annotation: Added to object.");
  };

  const handleProcessCAD = async () => {
    if (!selectedObj) return;
    setIsProcessing(true);
    addLog(`AI Auditor: Deep scanning ${selectedObj.name}...`);
    
    try {
      // 1. Capture Screenshot for Visual Analysis
      const canvas = document.querySelector('canvas');
      let screenshotBase64 = "";
      if (canvas) {
        screenshotBase64 = canvas.toDataURL('image/png').split(',')[1];
      }

      // 2. Extract Mesh Stats if available
      let meshStats = { vertices: 0, faces: 0 };
      if (selectedObj.mesh) {
        selectedObj.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            meshStats.vertices += child.geometry.attributes.position.count;
            if (child.geometry.index) {
              meshStats.faces += child.geometry.index.count / 3;
            } else {
              meshStats.faces += child.geometry.attributes.position.count / 3;
            }
          }
        });
      }

      // 3. Basic Geometric Analysis (Simulated or from backend)
      const res = await fetch('/api/process-cad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometryData: selectedObj })
      });
      const baseData = await res.json();

      // 4. AI-Powered Thorough Audit with Visual Context
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const contents: any[] = [
        {
          text: `You are a professional CAD, AutoCAD, and Blender expert. 
          Analyze this 3D model thoroughly. 
          
          Metadata:
          Name: ${selectedObj.name}
          Type: ${selectedObj.type}
          Color: ${selectedObj.color}
          Metalness: ${selectedObj.metalness}
          Roughness: ${selectedObj.roughness}
          Scale: ${selectedObj.scale.join(', ')}
          Dimensions: ${selectedObj.params.dimensions ? `${(selectedObj.params.dimensions.width * selectedObj.scale[0]).toFixed(3)}x${(selectedObj.params.dimensions.height * selectedObj.scale[1]).toFixed(3)}x${(selectedObj.params.dimensions.depth * selectedObj.scale[2]).toFixed(3)}` : 'N/A'}
          Vertices: ${meshStats.vertices}
          Faces: ${meshStats.faces}
          
          Provide a thorough audit including:
          1. A concise summary of the model's purpose and design intent.
          2. Detailed Advantages (structural, aesthetic, manufacturing, topology).
          3. Detailed Disadvantages (potential failure points, non-manifold edges, poor topology, aesthetic flaws).
          4. Recommended Modifications (specific steps to improve efficiency, strength, or style, referencing AutoCAD/Blender techniques).
          
          Return the result in JSON format.`
        }
      ];

      if (screenshotBase64) {
        contents.push({
          inlineData: {
            mimeType: "image/png",
            data: screenshotBase64
          }
        });
      }

      const auditResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: contents },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              advantages: { type: Type.ARRAY, items: { type: Type.STRING } },
              disadvantages: { type: Type.ARRAY, items: { type: Type.STRING } },
              modifications: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["summary", "advantages", "disadvantages", "modifications"]
          }
        }
      });

      const aiAudit = JSON.parse(auditResponse.text);

      setAnalysis({
        ...baseData.analysis,
        summary: aiAudit.summary,
        advantages: aiAudit.advantages,
        disadvantages: aiAudit.disadvantages,
        modifications: aiAudit.modifications,
        blenderStats: meshStats
      });
      
      addLog("AI Auditor: Thorough check complete. Visual analysis integrated.");
    } catch (error) {
      addLog("AI Auditor: Deep scan failed.");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateReport = () => {
    addLog("Report Gen: Compiling data...");
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text("AI CAD FLOW - Scene Report", 20, 20);
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleString()}`, 20, 30);
    
    let y = 45;
    objects.forEach((obj, i) => {
      doc.text(`${i+1}. ${obj.name} (${obj.type})`, 20, y);
      doc.text(`   Pos: ${obj.position.join(', ')}`, 20, y + 5);
      doc.text(`   Color: ${obj.color}`, 20, y + 10);
      y += 20;
    });

    if (analysis) {
      doc.addPage();
      doc.text("AI Audit Results", 20, 20);
      doc.setFontSize(12);
      
      doc.text("Summary:", 20, 35);
      doc.setFontSize(10);
      const splitSummary = doc.splitTextToSize(analysis.summary, 170);
      doc.text(splitSummary, 25, 42);
      
      let yOffset = 42 + (splitSummary.length * 5) + 10;
      
      doc.setFontSize(12);
      doc.text("Advantages:", 20, yOffset);
      doc.setFontSize(10);
      analysis.advantages.forEach((adv, i) => {
        const split = doc.splitTextToSize(`- ${adv}`, 170);
        doc.text(split, 25, yOffset + 10 + (i * 7));
      });
      
      yOffset += 10 + (analysis.advantages.length * 7) + 10;
      doc.setFontSize(12);
      doc.text("Disadvantages:", 20, yOffset);
      doc.setFontSize(10);
      analysis.disadvantages.forEach((dis, i) => {
        const split = doc.splitTextToSize(`- ${dis}`, 170);
        doc.text(split, 25, yOffset + 10 + (i * 7));
      });
      
      yOffset += 10 + (analysis.disadvantages.length * 7) + 10;
      doc.setFontSize(12);
      doc.text("Recommended Modifications:", 20, yOffset);
      doc.setFontSize(10);
      analysis.modifications.forEach((mod, i) => {
        const split = doc.splitTextToSize(`- ${mod}`, 170);
        doc.text(split, 25, yOffset + 10 + (i * 7));
      });
    }

    doc.save("scene-report.pdf");
    addLog("Report Gen: PDF exported.");
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = cmdInput.toLowerCase().trim();
    if (!cmd) return;

    addLog(`User: ${cmd}`);
    if (cmd === 'clear') setLogs([]);
    else if (cmd === 'add box') addObject('box');
    else if (cmd === 'add sphere') addObject('sphere');
    else if (cmd === 'add cylinder') addObject('cylinder');
    else if (cmd === 'add torus') addObject('torus');
    else if (cmd === 'duplicate') selectedId && duplicateObject(selectedId);
    else if (cmd === 'delete') selectedId && deleteObject(selectedId);
    else if (cmd.startsWith('color ')) {
      const color = cmd.split(' ')[1];
      selectedId && updateObject(selectedId, { color });
    } else {
      addLog(`Unknown command: ${cmd}`);
    }
    setCmdInput('');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.toLowerCase() === 'f' && selectedId) {
        const obj = objects.find(o => o.id === selectedId);
        if (obj && cameraRef.current) {
          const pos = new THREE.Vector3(...obj.position);
          cameraRef.current.position.set(pos.x + 5, pos.y + 5, pos.z + 5);
          cameraRef.current.lookAt(pos);
          addLog(`Focused on ${obj.name}`);
        }
      }
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) deleteObject(selectedId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, objects, undo, redo, deleteObject]);

  return (
    <div 
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-bg-base text-text-primary font-sans selection:bg-accent/30 relative overflow-hidden"
    >
      
      {/* Remote Cursors */}
      {remoteCursors && typeof remoteCursors === 'object' && Object.entries(remoteCursors).map(([id, cursor]) => (
        <div 
          key={id}
          className="absolute pointer-events-none z-[100] flex flex-col items-center transition-all duration-75"
          style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
        >
          <MousePointer2 className="w-4 h-4 text-accent fill-accent" />
          <span className="text-[8px] font-bold bg-accent px-1 rounded text-white">{cursor.name}</span>
        </div>
      ))}
      
      {/* Header */}
      <header className="h-14 border-b border-border-color flex items-center justify-between px-4 lg:px-6 bg-bg-panel/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-2 lg:gap-3">
          {isMobile && (
            <button 
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className="p-2 bg-bg-hover border border-border-color rounded text-accent"
            >
              {leftSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
          <div className="w-8 h-8 bg-bg-hover border border-border-color rounded flex items-center justify-center">
            <Layers className="w-5 h-5 text-accent" />
          </div>
          <h1 className="text-sm lg:text-lg font-black tracking-[0.15em] text-accent">
            AI CAD FLOW 
            {!isMobile && <span className="text-[9px] font-mono text-text-secondary tracking-normal ml-2">v4.2-PRO</span>}
          </h1>
        </div>
        
        <div className="flex items-center gap-2 lg:gap-4">
          {!isMobile && (
            <div className="flex items-center gap-2 px-2 py-1 bg-black/40 border border-border-color rounded-lg">
              <span className="text-[8px] font-mono text-text-secondary uppercase">Room:</span>
              <input 
                type="text" 
                value={roomId} 
                onChange={(e) => setRoomId(e.target.value)}
                className="bg-transparent border-none text-[10px] font-mono text-accent focus:outline-none w-20"
              />
              <button onClick={() => joinRoom(roomId)} className={cn("p-1 rounded transition-all", isCollaborating ? "text-accent" : "text-text-secondary hover:text-text-primary")} title="Join Room"><Share2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
          
          <div className="flex gap-1 p-1 bg-black/40 border border-border-color rounded-lg">
            {!isMobile && (
              <>
                <button onClick={() => setIsCollaborating(!isCollaborating)} className={cn("p-1.5 rounded transition-all", isCollaborating ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")} title="Collaborate"><Share2 className="w-4 h-4" /></button>
                <div className="w-[1px] bg-border-color mx-1" />
                <button onClick={undo} disabled={historyPointer === 0} className="p-1.5 rounded text-text-secondary hover:text-accent disabled:opacity-20"><Undo2 className="w-4 h-4" /></button>
                <button onClick={redo} disabled={historyPointer === history.length - 1} className="p-1.5 rounded text-text-secondary hover:text-accent disabled:opacity-20"><Redo2 className="w-4 h-4" /></button>
                <div className="w-[1px] bg-border-color mx-1" />
                <button onClick={renderHighRes} className="p-1.5 rounded text-text-secondary hover:text-accent" title="Render Image"><Video className="w-4 h-4" /></button>
                <div className="w-[1px] bg-border-color mx-1" />
              </>
            )}
            <button onClick={() => setTransformMode('translate')} className={cn("p-1.5 rounded transition-all", transformMode === 'translate' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}><Move className="w-4 h-4" /></button>
            <button onClick={() => setTransformMode('rotate')} className={cn("p-1.5 rounded transition-all", transformMode === 'rotate' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}><RotateCw className="w-4 h-4" /></button>
            <button onClick={() => setTransformMode('scale')} className={cn("p-1.5 rounded transition-all", transformMode === 'scale' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}><Scale className="w-4 h-4" /></button>
            <div className="w-[1px] bg-border-color mx-1" />
            <button 
              onClick={() => setIsProportionalEditing(!isProportionalEditing)} 
              className={cn("p-1.5 rounded transition-all", isProportionalEditing ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
              title="Proportional Editing (O)"
            >
              <CircleDot className="w-4 h-4" />
            </button>
            <div className="w-[1px] bg-border-color mx-1" />
            <div className="flex gap-1 p-0.5 bg-black/20 rounded">
              <button onClick={() => setShadingMode('wireframe')} className={cn("p-1 rounded text-[8px] uppercase font-bold", shadingMode === 'wireframe' ? "bg-bg-hover text-accent" : "text-text-tertiary")}>Wire</button>
              <button onClick={() => setShadingMode('solid')} className={cn("p-1 rounded text-[8px] uppercase font-bold", shadingMode === 'solid' ? "bg-bg-hover text-accent" : "text-text-tertiary")}>Solid</button>
              <button onClick={() => setShadingMode('material')} className={cn("p-1 rounded text-[8px] uppercase font-bold", shadingMode === 'material' ? "bg-bg-hover text-accent" : "text-text-tertiary")}>Mat</button>
              <div className="w-[1px] bg-border-color mx-0.5" />
              <button onClick={() => setXray(!xray)} className={cn("p-1 rounded transition-all", xray ? "text-accent" : "text-text-tertiary")} title="X-Ray (Alt+Z)">
                <Eye className="w-3 h-3" />
              </button>
              <button onClick={() => setFaceOrientation(!faceOrientation)} className={cn("p-1 rounded transition-all", faceOrientation ? "text-accent" : "text-text-tertiary")} title="Face Orientation">
                <Target className="w-3 h-3" />
              </button>
            </div>
            {!isMobile && (
              <>
                <div className="w-[1px] bg-border-color mx-1" />
                <button 
                  onClick={() => setIsDrawingMode(!isDrawingMode)} 
                  className={cn("p-1.5 rounded transition-all", isDrawingMode ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
                  title="Freehand Draw (Grease Pencil)"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => { setIsPCBMode(!isPCBMode); if (!isPCBMode) addObject('pcb'); }} 
                  className={cn("p-1.5 rounded transition-all", isPCBMode ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
                  title="PCB Viewer Mode"
                >
                  <CircuitBoard className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setSnapToGrid(!snapToGrid)} 
                  className={cn("p-1.5 rounded transition-all", snapToGrid ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
                  title="Snap to Grid"
                >
                  <GridIcon className="w-4 h-4" />
                </button>
                <div className="w-[1px] bg-border-color mx-1" />
                <button onClick={() => setIsPhysicsActive(!isPhysicsActive)} className={cn("p-1.5 rounded transition-all", isPhysicsActive ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")} title="Physics"><Zap className="w-4 h-4" /></button>
                <button 
                  onClick={() => {
                    setIsRulerMode(!isRulerMode);
                    setRulerPoints([]);
                    setRulerDistance(null);
                  }} 
                  className={cn("p-1.5 rounded transition-all", isRulerMode ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
                >
                  <Ruler className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {!isMobile && (
            <label className="flex items-center gap-2 px-3 py-1.5 bg-bg-hover border border-border-color rounded-lg cursor-pointer hover:bg-border-color transition-all">
              <Upload className="w-4 h-4 text-accent" />
              <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Import Model</span>
              <input type="file" className="hidden" accept=".stl,.obj,.glb,.gltf,.gbr,.gerber,.drl,.drd,.zip,.kicad_pcb" onChange={handleFileUpload} />
            </label>
          )}

          {isMobile && (
            <button 
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className="p-2 bg-bg-hover border border-border-color rounded text-accent"
            >
              <Activity className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      <main className="p-2 lg:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 h-auto lg:h-[calc(100vh-3.5rem)] overflow-hidden relative">
        <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />

        {/* Backdrop for mobile sidebars */}
        {isMobile && (leftSidebarOpen || rightSidebarOpen) && (
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => { setLeftSidebarOpen(false); setRightSidebarOpen(false); }}
          />
        )}

        {/* Left Panel: Outliner & Material */}
        <div className={cn(
          "flex flex-col gap-4 overflow-y-auto pr-1 custom-scrollbar z-50 transition-all duration-300",
          isMobile 
            ? "absolute left-0 top-0 bottom-0 w-[85vw] max-w-xs bg-bg-base/95 border-r border-border-color p-4" 
            : "col-span-3",
          isMobile && !leftSidebarOpen && "-translate-x-full"
        )}>
          {/* Scene Outliner */}
          <section className="panel p-4 flex flex-col gap-3 max-h-[40%]">
            <div className="flex items-center justify-between border-b border-border-color pb-2">
              <div className="flex items-center gap-2 text-accent">
                <Layers className="w-3.5 h-3.5" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Scene Outliner</h2>
              </div>
              <div className="flex gap-1">
                <button onClick={() => addObject('box')} title="Add Box" className="p-1 hover:bg-bg-hover rounded text-text-secondary hover:text-accent"><Box className="w-3.5 h-3.5" /></button>
                <button onClick={() => addObject('sphere')} title="Add Sphere" className="p-1 hover:bg-bg-hover rounded text-text-secondary hover:text-accent"><RefreshCw className="w-3.5 h-3.5" /></button>
                <button onClick={() => addObject('cylinder')} title="Add Cylinder" className="p-1 hover:bg-bg-hover rounded text-text-secondary hover:text-accent"><Maximize2 className="w-3.5 h-3.5" /></button>
                <button onClick={resetScene} title="Reset Scene" className="p-1 hover:bg-bg-hover rounded text-text-secondary hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              {objects.map(obj => (
                <div 
                  key={obj.id}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      setSelectedIds(prev => prev.includes(obj.id) ? prev.filter(i => i !== obj.id) : [...prev, obj.id]);
                    } else {
                      setSelectedIds([obj.id]);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-between p-2 rounded text-[10px] font-mono cursor-pointer transition-all border",
                    selectedId === obj.id ? "bg-accent/10 border-accent/40 text-accent" : "bg-bg-hover border-transparent text-text-secondary hover:bg-bg-hover/80"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Box className="w-3 h-3" />
                    {obj.name}
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const pos = new THREE.Vector3(...obj.position);
                        if (cameraRef.current) {
                          cameraRef.current.position.set(pos.x + 5, pos.y + 5, pos.z + 5);
                          cameraRef.current.lookAt(pos);
                        }
                      }}
                      title="Focus Camera"
                      className="p-1 hover:bg-bg-hover rounded text-text-tertiary hover:text-accent"
                    >
                      <Target className="w-3 h-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}>
                      {obj.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteObject(obj.id); }} className="hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Object Properties Panel */}
          <section className="panel p-4 flex flex-col gap-4">
            <button onClick={() => setIsPropertiesOpen(!isPropertiesOpen)} className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-cyber-magenta border-b border-border-color pb-2 w-full">
                <Settings className="w-3.5 h-3.5" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Object Properties</h2>
              </div>
              {isPropertiesOpen ? <ChevronDown className="w-3 h-3 text-text-tertiary" /> : <ChevronRight className="w-3 h-3 text-text-tertiary" />}
            </button>
            {isPropertiesOpen && selectedObj ? (
              <div className="space-y-4">
                {/* Position */}
                <div className="space-y-2">
                  <div className="text-[9px] text-text-secondary uppercase">Position</div>
                  <div className="flex gap-2">
                    {['x', 'y', 'z'].map((axis, i) => (
                      <input key={axis} type="number" value={selectedObj.position[i]} onChange={(e) => {
                        const pos = [...selectedObj.position] as [number, number, number];
                        pos[i] = parseFloat(e.target.value);
                        updateObject(selectedObj.id, { position: pos });
                      }} className="w-full bg-bg-hover p-1 text-[9px] text-text-primary rounded border border-border-color focus:border-accent focus:outline-none" />
                    ))}
                  </div>
                </div>
                {/* Rotation */}
                <div className="space-y-2">
                  <div className="text-[9px] text-text-secondary uppercase">Rotation</div>
                  <div className="flex gap-2">
                    {['x', 'y', 'z'].map((axis, i) => (
                      <input key={axis} type="number" value={selectedObj.rotation[i]} onChange={(e) => {
                        const rot = [...selectedObj.rotation] as [number, number, number];
                        rot[i] = parseFloat(e.target.value);
                        updateObject(selectedObj.id, { rotation: rot });
                      }} className="w-full bg-bg-hover p-1 text-[9px] text-text-primary rounded border border-border-color focus:border-accent focus:outline-none" />
                    ))}
                  </div>
                </div>
                {/* Scale */}
                <div className="space-y-2">
                  <div className="text-[9px] text-text-secondary uppercase">Scale</div>
                  <div className="flex gap-2">
                    {['x', 'y', 'z'].map((axis, i) => (
                      <input key={axis} type="number" value={selectedObj.scale[i]} onChange={(e) => {
                        const scale = [...selectedObj.scale] as [number, number, number];
                        scale[i] = parseFloat(e.target.value);
                        updateObject(selectedObj.id, { scale: scale });
                      }} className="w-full bg-bg-hover p-1 text-[9px] text-text-primary rounded border border-border-color focus:border-accent focus:outline-none" />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Color</span><span className="text-accent">{selectedObj.color}</span></div>
                  <input type="color" value={selectedObj.color} onChange={(e) => updateObject(selectedObj.id, { color: e.target.value })} className="w-full h-8 bg-transparent border-none cursor-pointer" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Metalness</span><span className="text-accent">{selectedObj.metalness.toFixed(2)}</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={selectedObj.metalness} onChange={(e) => updateObject(selectedObj.id, { metalness: parseFloat(e.target.value) })} className="w-full accent-accent" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Roughness</span><span className="text-accent">{selectedObj.roughness.toFixed(2)}</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={selectedObj.roughness} onChange={(e) => updateObject(selectedObj.id, { roughness: parseFloat(e.target.value) })} className="w-full accent-accent" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Emission</span><span className="text-accent">{selectedObj.emission || '#000000'}</span></div>
                  <input type="color" value={selectedObj.emission || '#000000'} onChange={(e) => updateObject(selectedObj.id, { emission: e.target.value })} className="w-full h-8 bg-transparent border-none cursor-pointer" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Emission Intensity</span><span className="text-accent">{selectedObj.emissionIntensity?.toFixed(2) || '0.00'}</span></div>
                  <input type="range" min="0" max="10" step="0.1" value={selectedObj.emissionIntensity || 0} onChange={(e) => updateObject(selectedObj.id, { emissionIntensity: parseFloat(e.target.value) })} className="w-full accent-accent" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-text-secondary uppercase">Transparent</span>
                    <button onClick={() => updateObject(selectedObj.id, { transparent: !selectedObj.transparent })} className={cn("w-8 h-4 rounded-full relative transition-all", selectedObj.transparent ? "bg-accent" : "bg-bg-hover border border-border-color")}>
                      <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", selectedObj.transparent ? "left-4.5" : "left-0.5")} />
                    </button>
                  </div>
                </div>
                {selectedObj.transparent && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Opacity</span><span className="text-accent">{selectedObj.opacity?.toFixed(2) ?? '1.00'}</span></div>
                    <input type="range" min="0" max="1" step="0.01" value={selectedObj.opacity ?? 1} onChange={(e) => updateObject(selectedObj.id, { opacity: parseFloat(e.target.value) })} className="w-full accent-accent" />
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Clearcoat</span><span className="text-accent">{selectedObj.clearcoat?.toFixed(2) || '0.00'}</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={selectedObj.clearcoat || 0} onChange={(e) => updateObject(selectedObj.id, { clearcoat: parseFloat(e.target.value) })} className="w-full accent-accent" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase"><span>Clearcoat Roughness</span><span className="text-accent">{selectedObj.clearcoatRoughness?.toFixed(2) || '0.00'}</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={selectedObj.clearcoatRoughness || 0} onChange={(e) => updateObject(selectedObj.id, { clearcoatRoughness: parseFloat(e.target.value) })} className="w-full accent-accent" />
                </div>
                <div className="space-y-2">
                  <div className="text-[9px] text-text-secondary uppercase">Material Presets</div>
                  <div className="grid grid-cols-3 gap-2">
                    {MATERIAL_PRESETS.map(preset => (
                      <button 
                        key={preset.name} 
                        onClick={() => updateObject(selectedObj.id, { 
                          color: preset.color, 
                          metalness: preset.metalness, 
                          roughness: preset.roughness,
                          transparent: preset.transparent,
                          opacity: preset.opacity,
                          clearcoat: preset.clearcoat,
                          clearcoatRoughness: preset.clearcoatRoughness,
                          emission: preset.emission,
                          emissionIntensity: preset.emissionIntensity
                        })} 
                        className="bg-bg-hover hover:bg-border-color p-2 rounded text-[9px] text-text-primary uppercase transition-all border border-border-color"
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedObj.type === 'pcb' && selectedObj.pcbData?.layers && (
                  <div className="pt-2 border-t border-border-color space-y-2">
                    <div className="text-[9px] text-text-secondary uppercase">Layers</div>
                    {/* Visibility Rules */}
                    <div className="flex gap-1">
                      <button onClick={() => {
                        const newLayers = selectedObj.pcbData!.layers.map(l => ({ ...l, visible: l.type === 'copper' }));
                        updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData, layers: newLayers } });
                      }} className="text-[8px] bg-bg-hover px-1 rounded">Copper Only</button>
                      <button onClick={() => {
                        const newLayers = selectedObj.pcbData!.layers.map(l => ({ ...l, visible: true }));
                        updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData, layers: newLayers } });
                      }} className="text-[8px] bg-bg-hover px-1 rounded">Show All</button>
                    </div>
                    {selectedObj.pcbData.layers.map((layer, i) => (
                      <div key={layer.id} className="flex items-center gap-1 bg-bg-hover p-1 rounded">
                        <button onClick={() => {
                          const newLayers = [...selectedObj.pcbData!.layers];
                          newLayers[i].visible = !newLayers[i].visible;
                          updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData, layers: newLayers } });
                        }} className={cn("w-3 h-3 rounded border border-border-color", layer.visible ? "bg-accent" : "bg-bg-primary")} />
                        
                        <input type="color" value={layer.color} onChange={(e) => {
                          const newLayers = [...selectedObj.pcbData!.layers];
                          newLayers[i].color = e.target.value;
                          updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData, layers: newLayers } });
                        }} className="w-4 h-4 bg-transparent border-none cursor-pointer" />
                        
                        <input type="text" value={layer.group || ''} placeholder="Group" onChange={(e) => {
                          const newLayers = [...selectedObj.pcbData!.layers];
                          newLayers[i].group = e.target.value;
                          updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData, layers: newLayers } });
                        }} className="w-12 text-[8px] bg-bg-primary border border-border-color rounded px-0.5" />

                        <span className="text-[8px] text-text-primary flex-grow truncate">{layer.name}</span>
                        
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => {
                            if (i > 0) {
                              const newLayers = [...selectedObj.pcbData!.layers];
                              [newLayers[i], newLayers[i - 1]] = [newLayers[i - 1], newLayers[i]];
                              updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData, layers: newLayers } });
                            }
                          }} className="text-text-secondary hover:text-accent text-[6px]">▲</button>
                          <button onClick={() => {
                            if (i < selectedObj.pcbData!.layers.length - 1) {
                              const newLayers = [...selectedObj.pcbData!.layers];
                              [newLayers[i], newLayers[i + 1]] = [newLayers[i + 1], newLayers[i]];
                              updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData, layers: newLayers } });
                            }
                          }} className="text-text-secondary hover:text-accent text-[6px]">▼</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2 border-t border-border-color space-y-2">
                   <div className="flex items-center justify-between">
                      <span className="text-[9px] text-text-secondary uppercase">Visible</span>
                      <button onClick={() => updateObject(selectedObj.id, { visible: !selectedObj.visible })} className={cn("w-8 h-4 rounded-full relative transition-all", selectedObj.visible ? "bg-accent" : "bg-bg-hover border border-border-color")}>
                        <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", selectedObj.visible ? "left-4.5" : "left-0.5")} />
                      </button>
                   </div>
                </div>

                {selectedObj.params.dimensions && (
                  <div className="pt-3 border-t border-border-color space-y-2">
                    <div className="flex items-center gap-2 text-cyber-lime">
                      <Maximize2 className="w-3 h-3" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">Physical Dimensions</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-bg-hover border border-border-color p-2 rounded flex flex-col items-center">
                        <span className="text-[7px] text-text-tertiary uppercase">Width</span>
                        <span className="text-[10px] text-accent font-mono tracking-tighter">{(selectedObj.params.dimensions.width * selectedObj.scale[0]).toFixed(3)}</span>
                      </div>
                      <div className="bg-bg-hover border border-border-color p-2 rounded flex flex-col items-center">
                        <span className="text-[7px] text-text-tertiary uppercase">Height</span>
                        <span className="text-[10px] text-cyber-magenta font-mono tracking-tighter">{(selectedObj.params.dimensions.height * selectedObj.scale[1]).toFixed(3)}</span>
                      </div>
                      <div className="bg-bg-hover border border-border-color p-2 rounded flex flex-col items-center">
                        <span className="text-[7px] text-text-tertiary uppercase">Depth</span>
                        <span className="text-[10px] text-cyber-lime font-mono tracking-tighter">{(selectedObj.params.dimensions.depth * selectedObj.scale[2]).toFixed(3)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center text-[10px] text-text-tertiary italic">Select an object to edit</div>
            )}
          </section>

          {/* Scene Settings */}
          <section className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-text-secondary border-b border-border-color pb-2">
              <Settings className="w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Scene Settings</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-text-secondary uppercase"><Grid3X3 className="w-3 h-3" /> Show Grid</div>
                <button onClick={() => setShowGrid(!showGrid)} className={cn("w-8 h-4 rounded-full relative transition-all", showGrid ? "bg-accent" : "bg-bg-hover border border-border-color")}>
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", showGrid ? "left-4.5" : "left-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-text-secondary uppercase"><BoxSelect className="w-3 h-3" /> Grid Snapping</div>
                <button onClick={() => setSnapToGrid(!snapToGrid)} className={cn("w-8 h-4 rounded-full relative transition-all", snapToGrid ? "bg-accent" : "bg-bg-hover border border-border-color")}>
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", snapToGrid ? "left-4.5" : "left-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-text-secondary uppercase"><Eye className="w-3 h-3" /> X-Ray Mode</div>
                <button onClick={() => setXray(!xray)} className={cn("w-8 h-4 rounded-full relative transition-all", xray ? "bg-accent" : "bg-bg-hover border border-border-color")}>
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", xray ? "left-4.5" : "left-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-text-secondary uppercase"><Maximize2 className="w-3 h-3" /> Wireframe All</div>
                <button onClick={() => setWireframe(!wireframe)} className={cn("w-8 h-4 rounded-full relative transition-all", wireframe ? "bg-accent" : "bg-bg-hover border border-border-color")}>
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", wireframe ? "left-4.5" : "left-0.5")} />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-text-secondary uppercase"><Zap className="w-3 h-3" /> Global Physics</div>
                <button onClick={() => setIsPhysicsActive(!isPhysicsActive)} className={cn("w-8 h-4 rounded-full relative transition-all", isPhysicsActive ? "bg-cyber-lime" : "bg-bg-hover border border-border-color")}>
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", isPhysicsActive ? "left-4.5" : "left-0.5")} />
                </button>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] text-text-tertiary uppercase">Background</div>
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-full h-4 bg-transparent border-none cursor-pointer" />
              </div>
            </div>
          </section>

          {/* AI Module */}
          <section className="panel p-4 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-accent">
              <Cpu className="w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">AI Design Engine</h2>
            </div>
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="GENERATE COMPLEX GEOMETRY..."
              className="w-full h-20 bg-bg-hover border border-border-color rounded p-3 text-[10px] font-mono focus:outline-none focus:border-accent transition-all resize-none placeholder:text-text-tertiary text-text-primary"
            />
            <div className="grid grid-cols-3 gap-1">
              <button onClick={handleGenerateAI} disabled={isGenerating || !prompt} className="py-2 bg-accent text-white text-[9px] font-bold uppercase rounded hover:bg-accent-hover transition-all flex items-center justify-center gap-1">
                <Dna className="w-3 h-3" /> BUILD
              </button>
              <button onClick={handleGenerativeDesign} disabled={isGenerating || !selectedId} className="py-2 bg-cyber-magenta text-white text-[9px] font-bold uppercase rounded hover:bg-white hover:text-black transition-all flex items-center justify-center gap-1">
                <Zap className="w-3 h-3" /> OPTIMIZE
              </button>
              <button onClick={handleGenerateTexture} disabled={isGenerating || !selectedObj} className="py-2 bg-bg-hover border border-border-color text-text-primary text-[9px] font-bold uppercase rounded hover:bg-border-color transition-all flex items-center justify-center gap-1">
                <ImageIcon className="w-3 h-3" /> TEXTURE
              </button>
            </div>
          </section>

          {/* Advanced Tools */}
          <section className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-text-secondary border-b border-border-color pb-2">
              <Zap className="w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Advanced Tools</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => performBoolean('union')} className="p-2 bg-bg-hover border border-border-color rounded text-[8px] font-bold hover:bg-accent hover:text-white transition-all text-text-primary">UNION</button>
              <button onClick={() => performBoolean('subtract')} className="p-2 bg-bg-hover border border-border-color rounded text-[8px] font-bold hover:bg-accent hover:text-white transition-all text-text-primary">SUB</button>
              <button onClick={() => performBoolean('intersect')} className="p-2 bg-bg-hover border border-border-color rounded text-[8px] font-bold hover:bg-accent hover:text-white transition-all text-text-primary">INT</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={addAnnotation} className="p-2 bg-bg-hover border border-border-color rounded text-[8px] font-bold hover:bg-cyber-magenta hover:text-white transition-all flex items-center justify-center gap-2 text-text-primary"><Tag className="w-3 h-3" /> ANNOTATE</button>
              <button onClick={() => selectedId && updateObject(selectedId, { isPhysicsEnabled: !selectedObj?.isPhysicsEnabled })} className={cn("p-2 border rounded text-[8px] font-bold transition-all flex items-center justify-center gap-2", selectedObj?.isPhysicsEnabled ? "bg-cyber-lime text-black border-cyber-lime" : "bg-bg-hover border-border-color text-text-primary")}>
                <Zap className="w-3 h-3" /> {selectedObj?.isPhysicsEnabled ? "PHYSICS ON" : "PHYSICS OFF"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-color">
              <button onClick={() => exportScene('glb')} className="p-2 bg-bg-hover border border-border-color rounded text-[8px] font-bold hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 text-text-primary"><Download className="w-3 h-3" /> GLB</button>
              <button onClick={() => exportScene('stl')} className="p-2 bg-bg-hover border border-border-color rounded text-[8px] font-bold hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 text-text-primary"><Download className="w-3 h-3" /> STL</button>
              <button onClick={exportPCB} className="p-2 bg-bg-hover border border-border-color rounded text-[8px] font-bold hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2 text-text-primary col-span-2"><Download className="w-3 h-3" /> PCB (GERBER/DRL)</button>
            </div>
          </section>
        </div>

        {/* Center Panel: 3D Viewer */}
        <div className={cn(
          "relative panel bg-black group z-10 overflow-hidden min-h-[40vh]",
          isMobile ? "col-span-1" : "col-span-6"
        )}>
          {/* Viewport Statistics & Controls Overlay */}
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
            {selectedObj && (
              <div className="pointer-events-none flex flex-col gap-1">
                <div className="px-3 py-2 bg-bg-panel/80 border border-border-color backdrop-blur-md rounded-lg flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-accent mb-1">
                    <Activity className="w-3 h-3" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">Object Statistics</span>
                  </div>
                  <div className="flex justify-between gap-6 text-[8px] font-mono">
                    <span className="text-white/30 uppercase">Name</span>
                    <span className="text-white/80">{selectedObj.name}</span>
                  </div>
                  {selectedObj.stats && (
                    <>
                      <div className="flex justify-between gap-6 text-[8px] font-mono">
                        <span className="text-white/30 uppercase">Vertices</span>
                        <span className="text-accent">{selectedObj.stats.vertices.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-6 text-[8px] font-mono">
                        <span className="text-white/30 uppercase">Faces</span>
                        <span className="text-accent">{selectedObj.stats.faces.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Viewport Controls */}
            <div className="pointer-events-auto flex flex-col gap-2">
              <button 
                onClick={zoomIn}
                className="w-8 h-8 flex items-center justify-center bg-black/60 border border-border-color rounded-lg text-accent hover:bg-bg-hover transition-all shadow-lg"
                title="Zoom In"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button 
                onClick={zoomOut}
                className="w-8 h-8 flex items-center justify-center bg-black/60 border border-border-color rounded-lg text-accent hover:bg-bg-hover transition-all shadow-lg"
                title="Zoom Out"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button 
                onClick={zoomToFit}
                className="w-8 h-8 flex items-center justify-center bg-black/60 border border-border-color rounded-lg text-accent hover:bg-bg-hover transition-all shadow-lg"
                title="Reset View"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
          </div>

          <Canvas 
            shadows 
            gl={{ preserveDrawingBuffer: true }}
            onPointerDown={(e) => {
              if (isRulerMode) {
                // If we didn't hit an object, we can use the ground plane
              }
            }}
          >
            <Suspense fallback={null}>
              <color attach="background" args={[bgColor]} />
              <PerspectiveCamera ref={cameraRef} makeDefault position={[5, 5, 5]} far={10000} />
              <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport axisColors={['#ff4444', '#44ff44', '#4444ff']} labelColor="white" />
              </GizmoHelper>
              <OrbitControls 
                makeDefault 
                minDistance={0.05} 
                maxDistance={1000} 
                zoomSpeed={1.5}
                enabled={!isDraggingTransform && !isRulerMode && !isDrawingMode} 
              />
              
              <Environment preset="city" />
              <ambientLight intensity={0.4} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
              <pointLight position={[-10, -10, -10]} intensity={0.5} />
              
              <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4.5} />

              <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport axisColors={['#ff4444', '#44ff44', '#4444ff']} labelColor="white" />
              </GizmoHelper>

              <Physics gravity={[0, isPhysicsActive ? -9.81 : 0, 0]}>
                <PhysicsGround />
                {objects.map(obj => (
                  <Shape 
                    key={obj.id} 
                    obj={{
                      ...obj, 
                      params: {
                        ...obj.params, 
                        wireframe: wireframe || obj.params.wireframe
                      }
                    }} 
                    isSelected={selectedId === obj.id} 
                    isXray={xray}
                    shadingMode={shadingMode}
                    faceOrientation={faceOrientation}
                    isDraggingTransform={isDraggingTransform}
                    onMount={onMount}
                    onSelect={(id, e) => {
                      if (isRulerMode) {
                        const clickedObj = objects.find(o => o.id === id);
                        if (clickedObj) {
                          const pos = new THREE.Vector3(...clickedObj.position);
                          setRulerPoints(prev => {
                            const next = [...prev, pos].slice(-2);
                            if (next.length === 2) {
                              setRulerDistance(next[0].distanceTo(next[1]));
                            }
                            return next;
                          });
                        }
                      } else {
                        if (e.shiftKey) {
                          setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
                        } else {
                          setSelectedIds([id]);
                        }
                      }
                    }} 
                  />
                ))}
              </Physics>

              {annotations.map(ann => (
                <Html key={ann.id} position={ann.position}>
                  <div className="px-2 py-1 bg-accent text-white text-[8px] font-bold rounded shadow-lg whitespace-nowrap">
                    {ann.text}
                  </div>
                </Html>
              ))}

              {/* Invisible Plane for Ruler */}
              {isRulerMode && (
                <mesh 
                  rotation={[-Math.PI / 2, 0, 0]} 
                  position={[0, -0.01, 0]} 
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const pos = e.point;
                    setRulerPoints(prev => {
                      const next = [...prev, pos].slice(-2);
                      if (next.length === 2) {
                        setRulerDistance(next[0].distanceTo(next[1]));
                      }
                      return next;
                    });
                  }}
                >
                  <planeGeometry args={[100, 100]} />
                  <meshBasicMaterial transparent opacity={0} />
                </mesh>
              )}

              {/* Drawing System */}
              <DrawingSystem 
                isDrawingMode={isDrawingMode}
                currentStroke={currentStroke}
                setCurrentStroke={setCurrentStroke}
                onFinishStroke={(points) => {
                  const newStroke: SceneObject = {
                    id: Math.random().toString(36).substr(2, 9),
                    type: 'stroke',
                    name: `Stroke_${objects.length + 1}`,
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                    color: brushColor,
                    metalness: 0,
                    roughness: 1,
                    visible: true,
                    points: points,
                    params: { lineWidth: brushSize }
                  };
                  setObjects([...objects, newStroke]);
                  addLog("Grease Pencil: Stroke added.");
                }}
                brushColor={brushColor}
                brushSize={brushSize}
                drawOnSurface={drawOnSurface}
              />
              {currentStroke.length > 1 && (
                <Line points={currentStroke} color={brushColor} lineWidth={brushSize} />
              )}

              <TransformControlsWrapper 
                selectedId={selectedId} 
                transformMode={transformMode} 
                snapToGrid={snapToGrid} 
                updateObject={updateObject} 
                setIsDraggingTransform={setIsDraggingTransform} 
              />

              {showGrid && (
                <Grid 
                  infiniteGrid 
                  fadeDistance={20} 
                  sectionSize={1} 
                  sectionThickness={1.5} 
                  sectionColor="#00f3ff" 
                  cellColor="#00f3ff" 
                  cellSize={0.5}
                />
              )}
              
              {isRulerMode && rulerPoints.map((p, i) => (
                <mesh key={i} position={p}>
                  <sphereGeometry args={[0.05, 16, 16]} />
                  <meshBasicMaterial color="#ff00ff" />
                </mesh>
              ))}
              
              {isRulerMode && rulerPoints.length === 2 && (
                <line>
                  <bufferGeometry attach="geometry" onUpdate={self => self.setFromPoints(rulerPoints)} />
                  <lineBasicMaterial attach="material" color="#ff00ff" linewidth={2} />
                </line>
              )}

              <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={10} blur={2} far={4.5} />
            </Suspense>
          </Canvas>

          {/* HUD Overlay */}
          <div className="absolute top-4 left-4 pointer-events-none space-y-2">
            <div className="flex gap-2">
              <div className="px-2 py-1 bg-accent/10 border border-accent/30 text-[8px] font-mono text-accent">FPS: 60</div>
              <div className="px-2 py-1 bg-black/60 border border-border-color text-[8px] font-mono text-text-secondary uppercase">Objects: {objects.length}</div>
              {isRulerMode && (
                <div className="px-2 py-1 bg-cyber-magenta/20 border border-cyber-magenta/40 text-[8px] font-mono text-cyber-magenta uppercase animate-pulse">
                  Ruler Active: {rulerDistance ? `${rulerDistance.toFixed(3)} units` : "Select 2 points"}
                </div>
              )}
            </div>
          </div>

          {/* Camera Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1">
            <button onClick={() => setCameraView('top')} className="w-8 h-8 bg-black/60 border border-border-color rounded flex items-center justify-center text-[8px] font-bold hover:bg-accent hover:text-white transition-all text-text-secondary">TOP</button>
            <button onClick={() => setCameraView('front')} className="w-8 h-8 bg-black/60 border border-border-color rounded flex items-center justify-center text-[8px] font-bold hover:bg-accent hover:text-white transition-all text-text-secondary">FRNT</button>
            <button onClick={() => setCameraView('side')} className="w-8 h-8 bg-black/60 border border-border-color rounded flex items-center justify-center text-[8px] font-bold hover:bg-accent hover:text-white transition-all text-text-secondary">SIDE</button>
            <button onClick={() => setCameraView('perspective')} className="w-8 h-8 bg-black/60 border border-border-color rounded flex items-center justify-center text-[8px] font-bold hover:bg-accent hover:text-white transition-all text-text-secondary">PERP</button>
          </div>

          {/* Cyber Scan Effect */}
          <AnimatePresence>
            {isProcessing && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center overflow-hidden"
              >
                <div className="absolute inset-0 bg-cyber-magenta/5 animate-pulse" />
                <motion.div 
                  initial={{ top: '-100%' }}
                  animate={{ top: '100%' }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-1 bg-cyber-magenta shadow-[0_0_20px_#ff00ff] z-30"
                />
                <div className="relative flex flex-col items-center gap-4">
                  <div className="w-32 h-32 border-2 border-cyber-magenta/50 rounded-full animate-spin border-t-transparent shadow-[0_0_30px_rgba(255,0,255,0.2)]" />
                  <p className="text-cyber-magenta font-black tracking-[0.3em] text-[10px] animate-pulse">AI DEEP SCAN IN PROGRESS...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Panel: Terminal & Analysis */}
        <div className={cn(
          "flex flex-col gap-4 z-50 transition-all duration-300",
          isMobile 
            ? "absolute right-0 top-0 bottom-0 w-[85vw] max-w-xs bg-bg-base/95 border-l border-border-color p-4" 
            : "col-span-3",
          isMobile && !rightSidebarOpen && "translate-x-full"
        )}>
          {/* NEW: Model Preview Section */}
          <section className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-accent border-b border-border-color pb-2">
              <Eye className="w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Visual Inspector</h2>
            </div>
            <ModelPreview obj={selectedObj} />
          </section>

          {/* Theme Selector */}
          <section className="panel p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-accent border-b border-border-color pb-2">
              <Palette className="w-3.5 h-3.5" />
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">UI Themes</h2>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map(theme => (
                <button 
                  key={theme.id}
                  onClick={() => setCurrentTheme(theme)}
                  className={cn(
                    "w-full aspect-square rounded border transition-all flex items-center justify-center",
                    currentTheme.id === theme.id ? "border-accent shadow-[0_0_10px_rgba(0,243,255,0.3)]" : "border-border-color hover:border-accent/50"
                  )}
                  style={{ backgroundColor: theme.bg }}
                  title={theme.name}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.cyan }} />
                </button>
              ))}
            </div>
          </section>

          {/* Modifier Panel */}
          {selectedObj && (
            <section className="panel p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-cyber-lime border-b border-border-color pb-2">
                <Grid3X3 className="w-3.5 h-3.5" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Modifiers</h2>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-text-secondary uppercase">UV Unwrap</span>
                  <button 
                    onClick={() => {
                      const mods = selectedObj.modifiers || [];
                      const uvMod = mods.find(m => m.type === 'uv-unwrap');
                      if (uvMod) {
                        updateObject(selectedObj.id, { modifiers: mods.map(m => m.type === 'uv-unwrap' ? { ...m, enabled: !m.enabled } : m) });
                      } else {
                        updateObject(selectedObj.id, { modifiers: [...mods, { type: 'uv-unwrap', enabled: true }] });
                      }
                    }}
                    className={cn("p-1 rounded transition-all", selectedObj.modifiers?.find(m => m.type === 'uv-unwrap')?.enabled ? "text-accent" : "text-text-tertiary")}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                {selectedObj.modifiers?.find(m => m.type === 'array')?.enabled && (
                  <div className="space-y-2 p-2 bg-bg-hover rounded border border-border-color">
                    <div className="flex justify-between text-[8px] text-text-tertiary uppercase">
                      <span>Count</span>
                      <span className="text-accent">{selectedObj.modifiers.find(m => m.type === 'array')?.count}</span>
                    </div>
                    <input 
                      type="range" min="1" max="10" step="1" 
                      value={selectedObj.modifiers.find(m => m.type === 'array')?.count || 1} 
                      onChange={(e) => {
                        const count = parseInt(e.target.value);
                        updateObject(selectedObj.id, { modifiers: selectedObj.modifiers?.map(m => m.type === 'array' ? { ...m, count } : m) });
                      }}
                      className="w-full accent-accent" 
                    />
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-text-secondary uppercase">Mirror Modifier</span>
                  <button 
                    onClick={() => {
                      const mods = selectedObj.modifiers || [];
                      const mirrorMod = mods.find(m => m.type === 'mirror');
                      if (mirrorMod) {
                        updateObject(selectedObj.id, { modifiers: mods.map(m => m.type === 'mirror' ? { ...m, enabled: !m.enabled } : m) });
                      } else {
                        updateObject(selectedObj.id, { modifiers: [...mods, { type: 'mirror', enabled: true }] });
                      }
                    }}
                    className={cn("p-1 rounded transition-all", selectedObj.modifiers?.find(m => m.type === 'mirror')?.enabled ? "text-accent" : "text-text-tertiary")}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-text-secondary uppercase">Subdivision</span>
                  <button 
                    onClick={() => {
                      const mods = selectedObj.modifiers || [];
                      const subMod = mods.find(m => m.type === 'subdivision');
                      if (subMod) {
                        updateObject(selectedObj.id, { modifiers: mods.map(m => m.type === 'subdivision' ? { ...m, enabled: !m.enabled } : m) });
                      } else {
                        updateObject(selectedObj.id, { modifiers: [...mods, { type: 'subdivision', count: 2, enabled: true }] });
                      }
                    }}
                    className={cn("p-1 rounded transition-all", selectedObj.modifiers?.find(m => m.type === 'subdivision')?.enabled ? "text-accent" : "text-text-tertiary")}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                {selectedObj.modifiers?.find(m => m.type === 'subdivision')?.enabled && (
                  <div className="space-y-2 p-2 bg-bg-hover rounded border border-border-color">
                    <div className="flex justify-between text-[8px] text-text-tertiary uppercase">
                      <span>Levels</span>
                      <span className="text-accent">{selectedObj.modifiers.find(m => m.type === 'subdivision')?.count}</span>
                    </div>
                    <input 
                      type="range" min="1" max="4" step="1" 
                      value={selectedObj.modifiers.find(m => m.type === 'subdivision')?.count || 1} 
                      onChange={(e) => {
                        const count = parseInt(e.target.value);
                        updateObject(selectedObj.id, { modifiers: selectedObj.modifiers?.map(m => m.type === 'subdivision' ? { ...m, count } : m) });
                      }}
                      className="w-full accent-accent" 
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-text-secondary uppercase">Wireframe</span>
                  <button 
                    onClick={() => {
                      const mods = selectedObj.modifiers || [];
                      const wfMod = mods.find(m => m.type === 'wireframe');
                      if (wfMod) {
                        updateObject(selectedObj.id, { modifiers: mods.map(m => m.type === 'wireframe' ? { ...m, enabled: !m.enabled } : m) });
                      } else {
                        updateObject(selectedObj.id, { modifiers: [...mods, { type: 'wireframe', thickness: 0.05, enabled: true }] });
                      }
                    }}
                    className={cn("p-1 rounded transition-all", selectedObj.modifiers?.find(m => m.type === 'wireframe')?.enabled ? "text-accent" : "text-text-tertiary")}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                {selectedObj.modifiers?.find(m => m.type === 'wireframe')?.enabled && (
                  <div className="space-y-2 p-2 bg-bg-hover rounded border border-border-color">
                    <div className="flex justify-between text-[8px] text-text-tertiary uppercase">
                      <span>Thickness</span>
                      <span className="text-accent">{selectedObj.modifiers.find(m => m.type === 'wireframe')?.thickness?.toFixed(3)}</span>
                    </div>
                    <input 
                      type="range" min="0.01" max="0.5" step="0.01" 
                      value={selectedObj.modifiers.find(m => m.type === 'wireframe')?.thickness || 0.05} 
                      onChange={(e) => {
                        const thickness = parseFloat(e.target.value);
                        updateObject(selectedObj.id, { modifiers: selectedObj.modifiers?.map(m => m.type === 'wireframe' ? { ...m, thickness } : m) });
                      }}
                      className="w-full accent-accent" 
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* PCB Inspector */}
          {selectedObj?.type === 'pcb' && (
            <section className="panel p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-cyber-lime border-b border-border-color pb-2">
                <CircuitBoard className="w-3.5 h-3.5" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">PCB Inspector</h2>
              </div>
              <div className="space-y-2">
                <p className="text-[8px] text-text-tertiary uppercase font-bold">Layers</p>
                <div className="space-y-1">
                  {selectedObj.pcbData?.layers.map(layer => (
                    <div key={layer.id} className="flex items-center justify-between p-2 bg-bg-hover border border-border-color rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color }} />
                        <span className="text-[9px] text-text-primary">{layer.name}</span>
                      </div>
                      <button 
                        onClick={() => {
                          const newLayers = selectedObj.pcbData?.layers.map(l => 
                            l.id === layer.id ? { ...l, visible: !l.visible } : l
                          );
                          updateObject(selectedObj.id, { pcbData: { ...selectedObj.pcbData!, layers: newLayers! } });
                        }}
                        className={cn("p-1 rounded transition-all", layer.visible ? "text-accent" : "text-text-tertiary")}
                      >
                        {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-[8px] text-text-tertiary uppercase font-bold">Components</p>
                <div className="grid grid-cols-2 gap-1">
                  {selectedObj.pcbData?.components.map(comp => (
                    <div key={comp.id} className="p-1.5 bg-bg-hover border border-border-color rounded text-[8px] text-text-secondary flex items-center gap-1">
                      <Cpu className="w-2.5 h-2.5 text-accent" />
                      {comp.name} ({comp.type.toUpperCase()})
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Drawing Toolbar */}
          {isDrawingMode && (
            <section className="panel p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-accent border-b border-border-color pb-2">
                <Pencil className="w-3.5 h-3.5" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Grease Pencil</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase">
                    <span>Brush Color</span>
                    <span className="text-accent">{brushColor}</span>
                  </div>
                  <input 
                    type="color" 
                    value={brushColor} 
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-full h-8 bg-transparent border-none cursor-pointer"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[9px] text-text-secondary uppercase">
                    <span>Brush Size</span>
                    <span className="text-accent">{brushSize}px</span>
                  </div>
                  <input 
                    type="range" min="1" max="10" step="0.5" 
                    value={brushSize} 
                    onChange={(e) => setBrushSize(parseFloat(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>

                <div className="flex items-center justify-between p-2 bg-bg-hover rounded border border-border-color">
                  <span className="text-[9px] text-text-secondary uppercase">Surface Snapping</span>
                  <button 
                    onClick={() => setDrawOnSurface(!drawOnSurface)}
                    className={cn("p-1 rounded transition-all", drawOnSurface ? "text-accent" : "text-text-tertiary")}
                  >
                    {drawOnSurface ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => {
                      setObjects(objects.filter(o => o.type !== 'stroke'));
                      addLog("Grease Pencil: All strokes cleared.");
                    }}
                    className="py-2 bg-red-500/10 border border-red-500/30 text-red-500 text-[9px] font-bold uppercase rounded hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </button>
                  <button 
                    onClick={() => setIsDrawingMode(false)}
                    className="py-2 bg-accent/10 border border-accent/30 text-accent text-[9px] font-bold uppercase rounded hover:bg-accent hover:text-white transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            </section>
          )}

          <section className="flex-1 panel flex flex-col overflow-hidden">
            <div className="p-3 border-b border-border-color flex items-center justify-between bg-bg-hover">
              <div className="flex items-center gap-2 text-accent">
                <TerminalIcon className="w-3.5 h-3.5" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">Command Kernel</h2>
              </div>
            </div>
            <div className="flex-1 p-4 font-mono text-[9px] overflow-y-auto custom-scrollbar bg-black/40 space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="text-text-secondary leading-relaxed">
                  <span className="text-accent/40 mr-2">❯</span>
                  {log}
                </div>
              ))}
            </div>
            <form onSubmit={handleCommand} className="p-2 bg-black/60 border-t border-border-color flex items-center gap-2">
              <span className="text-accent font-mono text-[10px]">❯</span>
              <input 
                type="text" 
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
                placeholder="TYPE COMMAND..."
                className="flex-1 bg-transparent border-none text-[10px] font-mono focus:outline-none placeholder:text-text-tertiary text-text-primary"
              />
              <Command className="w-3 h-3 text-text-tertiary" />
            </form>
          </section>

          <section className="panel p-4 flex flex-col gap-4 max-h-[500px] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyber-magenta">
                <Activity className="w-3.5 h-3.5" />
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">AI Model Auditor</h2>
              </div>
              <button 
                onClick={handleProcessCAD} 
                disabled={isProcessing || !selectedObj}
                className={cn(
                  "p-1.5 bg-cyber-magenta/10 hover:bg-cyber-magenta/20 border border-cyber-magenta/30 rounded text-cyber-magenta transition-all",
                  isProcessing && "animate-spin"
                )}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            
            {analysis ? (
              <div className="space-y-4">
                <div className="p-3 bg-bg-hover border border-border-color rounded">
                  <p className="text-[8px] text-accent uppercase font-bold mb-1">AI Summary</p>
                  <div className="text-[9px] text-text-secondary leading-relaxed italic prose-invert">
                    <Markdown>{analysis.summary}</Markdown>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-bg-hover rounded border border-border-color">
                    <p className="text-[8px] text-text-tertiary uppercase">Volume</p>
                    <p className="text-sm font-mono text-accent">{analysis.volume.toFixed(2)}</p>
                  </div>
                  <div className="p-2 bg-bg-hover rounded border border-border-color">
                    <p className="text-[8px] text-text-tertiary uppercase">Efficiency</p>
                    <p className="text-sm font-mono text-cyber-lime">{(analysis.materialEfficiency * 100).toFixed(0)}%</p>
                  </div>
                  {analysis.blenderStats && (
                    <>
                      <div className="p-2 bg-bg-hover rounded border border-border-color">
                        <p className="text-[8px] text-text-tertiary uppercase">Vertices</p>
                        <p className="text-xs font-mono text-text-secondary">{analysis.blenderStats.vertices}</p>
                      </div>
                      <div className="p-2 bg-bg-hover rounded border border-border-color">
                        <p className="text-[8px] text-text-tertiary uppercase">Faces</p>
                        <p className="text-xs font-mono text-text-secondary">{analysis.blenderStats.faces}</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-[9px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> Advantages
                    </h3>
                    <ul className="space-y-1">
                      {analysis.advantages?.map((adv, i) => (
                        <li key={i} className="text-[9px] text-text-secondary leading-tight border-l border-accent/30 pl-2 py-0.5">{adv}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-[9px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> Disadvantages
                    </h3>
                    <ul className="space-y-1">
                      {analysis.disadvantages?.map((dis, i) => (
                        <li key={i} className="text-[9px] text-text-secondary leading-tight border-l border-red-400/30 pl-2 py-0.5">{dis}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-[9px] font-bold text-cyber-magenta uppercase tracking-wider flex items-center gap-1">
                      <ChevronRight className="w-3 h-3" /> Modifications
                    </h3>
                    <ul className="space-y-1">
                      {analysis.modifications?.map((mod, i) => (
                        <li key={i} className="text-[9px] text-text-secondary leading-tight border-l border-cyber-magenta/30 pl-2 py-0.5">{mod}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-24 flex flex-col items-center justify-center text-[9px] text-text-tertiary italic gap-2">
                <Search className="w-5 h-5 opacity-20" />
                <span>Run Deep Scan to analyze model integrity</span>
              </div>
            )}
            <button onClick={generateReport} className="w-full py-2 bg-bg-hover border border-border-color rounded text-[9px] font-bold uppercase tracking-widest hover:bg-border-color transition-all text-text-primary">Export Audit Report</button>
          </section>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--color-accent); border-radius: 10px; opacity: 0.1; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--color-accent); opacity: 0.3; }
        input[type="range"] { -webkit-appearance: none; background: var(--color-bg-hover); height: 2px; border-radius: 2px; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 10px; height: 10px; background: var(--color-accent); border-radius: 50%; cursor: pointer; box-shadow: 0 0 10px var(--color-accent); }
      `}</style>
    </div>
  );
}
