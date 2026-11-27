import { ThreeCanvas } from "@remotion/three";
import { useLayoutEffect, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { easeInOut } from "./util";

export type CamKey = { f: number; pos: [number, number, number]; look: [number, number, number]; fov?: number };
/** A slow, seeded wobble so a locked-off camera feels handheld (0 = tripod). Same every render. */
const wob = (f: number, k: number) => Math.sin(f * 0.07 + k) * 0.6 + Math.sin(f * 0.13 + k * 2.1) * 0.3 + Math.sin(f * 0.31 + k * 4.7) * 0.1;

/** Moves the camera through keyframes (frame, position, look-at, lens), eased between them. */
function CameraRig({ keys, handheld = 0 }: { keys: CamKey[]; handheld?: number }) {
  const frame = useCurrentFrame();
  const { camera } = useThree();
  useLayoutEffect(() => {
    const fs = keys.map((k) => k.f);
    const at = (pick: (k: CamKey) => number) => interpolate(frame, fs, keys.map(pick), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
    const cam = camera as THREE.PerspectiveCamera;
    const h = handheld * 0.012;
    cam.position.set(at((k) => k.pos[0]) + wob(frame, 1) * h, at((k) => k.pos[1]) + wob(frame, 2) * h, at((k) => k.pos[2]) + wob(frame, 3) * h * 0.5);
    cam.fov = at((k) => k.fov ?? 35);
    cam.updateProjectionMatrix();
    cam.lookAt(at((k) => k.look[0]) + wob(frame, 5) * h * 0.5, at((k) => k.look[1]) + wob(frame, 6) * h * 0.5, at((k) => k.look[2]));
  }, [frame, keys, camera, handheld]);
  return null;
}
/** Studio lighting without downloads: an in-memory room for reflections, a key light with soft shadows, a rim light. */
function Lights({ warmth = 0.5, env = 0.55 }: { warmth?: number; env?: number }) {
  const { gl, scene } = useThree();
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = tex;
    scene.environmentIntensity = env;
    return () => {
      tex.dispose();
      pm.dispose();
    };
  }, [gl, scene, env]);
  const key = new THREE.Color().lerpColors(new THREE.Color("#dfe9ff"), new THREE.Color("#ffd9a8"), warmth);
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} color={key} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#8fb6ff" />
    </>
  );
}
/** A 3D scene filling the frame. Background stays transparent so 2D layers (sky, text) show around it. */
export function Stage3D({ cam, children, warmth, env, shadows = false, handheld = 0 }: { cam: CamKey[]; children: ReactNode; warmth?: number; env?: number; shadows?: boolean; handheld?: number }) {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} shadows={shadows} flat gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }} camera={{ fov: 35, near: 0.05, far: 200 }}>
      <CameraRig keys={cam} handheld={handheld} />
      <Lights warmth={warmth} env={env} />
      {children}
    </ThreeCanvas>
  );
}
