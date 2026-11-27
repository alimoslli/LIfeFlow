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
/** Where the camera is at a frame (shared by the 3D scene and by 2D layers that must line up with it). */
export function camAt(keys: CamKey[], frame: number, handheld = 0) {
  const fs = keys.map((k) => k.f);
  const at = (pick: (k: CamKey) => number) =>
    keys.length === 1 ? pick(keys[0]) : interpolate(frame, fs, keys.map(pick), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeInOut });
  const h = handheld * 0.012;
  return {
    pos: [at((k) => k.pos[0]) + wob(frame, 1) * h, at((k) => k.pos[1]) + wob(frame, 2) * h, at((k) => k.pos[2]) + wob(frame, 3) * h * 0.5] as [number, number, number],
    look: [at((k) => k.look[0]) + wob(frame, 5) * h * 0.5, at((k) => k.look[1]) + wob(frame, 6) * h * 0.5, at((k) => k.look[2])] as [number, number, number],
    fov: at((k) => k.fov ?? 35),
  };
}
/** The screen positions (pixels) of 3D points as the camera sees them at a frame. */
export function projectPoints(keys: CamKey[], frame: number, width: number, height: number, pts: [number, number, number][], handheld = 0) {
  const c = camAt(keys, frame, handheld);
  const cam = new THREE.PerspectiveCamera(c.fov, width / height, 0.2, 160);
  cam.position.set(...c.pos);
  cam.lookAt(...c.look);
  cam.updateMatrixWorld();
  return pts.map((p) => {
    const v = new THREE.Vector3(...p).project(cam);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height] as [number, number];
  });
}
function CameraRig({ keys, handheld = 0 }: { keys: CamKey[]; handheld?: number }) {
  const frame = useCurrentFrame();
  const { camera } = useThree();
  useLayoutEffect(() => {
    const c = camAt(keys, frame, handheld);
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(...c.pos);
    cam.fov = c.fov;
    cam.updateProjectionMatrix();
    cam.lookAt(...c.look);
  }, [frame, keys, camera, handheld]);
  return null;
}
/** Studio lighting without downloads: an in-memory room for reflections, a key light with soft shadows, a rim light. */
function Lights({ warmth = 0.5, env = 0.55, ambient = 0.35, keyLight = 1.5 }: { warmth?: number; env?: number; ambient?: number; keyLight?: number }) {
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
      <ambientLight intensity={ambient} />
      <directionalLight position={[3, 5, 4]} intensity={keyLight} color={key} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#8fb6ff" />
    </>
  );
}
/** A 3D scene filling the frame. Background stays transparent so 2D layers (sky, text) show around it. */
export function Stage3D({ cam, children, warmth, env, shadows = false, handheld = 0, ambient, keyLight = 1.5 }: { cam: CamKey[]; children: ReactNode; warmth?: number; env?: number; shadows?: boolean; handheld?: number; ambient?: number; keyLight?: number }) {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas width={width} height={height} shadows={shadows} flat gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }} camera={{ fov: 35, near: 0.2, far: 160 }}>
      <CameraRig keys={cam} handheld={handheld} />
      <Lights warmth={warmth} env={env} ambient={ambient} keyLight={keyLight} />
      {children}
    </ThreeCanvas>
  );
}
