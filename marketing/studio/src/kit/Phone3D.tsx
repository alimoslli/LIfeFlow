import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cancelRender, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useLoader, useThree } from "@react-three/fiber";

/** Phone proportions (a 6.1" class phone, 71.5 x 147.5 x 7.8 mm) in world units of 1 = 100 mm. */
const W = 0.715;
const H = 1.475;
const D = 0.078;
const R = 0.11;

function rounded(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
/** Shape geometry with UVs stretched 0..1 over its box, so a screenshot maps edge to edge. */
function screenGeo(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(rounded(w, h, r), 12);
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / w + 0.5;
    uv[i * 2 + 1] = pos.getY(i) / h + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
/**
 * The screen plays a capture as frame pictures (public/captures/<profile>/<shot>/0000.jpg ...), one per video frame,
 * loaded for exactly the frame being rendered. Frame-exact and reliable in headless rendering.
 */
function FrameScreen({ src, geo, offset = 0, rate = 1 }: { src: string; geo: THREE.BufferGeometry; offset?: number; rate?: number }) {
  const frame = useCurrentFrame();
  const [count, setCount] = useState<number | null>(null);
  const [meta] = useState(() => delayRender(`capture ${src}`));
  useEffect(() => {
    fetch(staticFile(`${src}.json`))
      .then((r) => r.json())
      .then((j) => {
        setCount(j.frames);
        continueRender(meta);
      })
      .catch((e) => cancelRender(e));
  }, [src, meta]);
  const idx = count === null ? 0 : Math.min(count - 1, Math.max(0, Math.floor(frame * rate) + offset));
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const pending = useRef<number | null>(null);
  useEffect(() => {
    if (count === null) return;
    const h = delayRender(`capture frame ${idx}`);
    pending.current = h;
    new THREE.TextureLoader().load(
      staticFile(`${src}/${String(idx).padStart(4, "0")}.jpg`),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        setTex((old) => {
          old?.dispose();
          return t;
        });
      },
      undefined,
      (e) => cancelRender(e),
    );
  }, [idx, count, src]);
  // release the frame only once the new picture is on the screen
  const { advance } = useThree();
  useLayoutEffect(() => {
    if (tex && pending.current !== null) {
      // draw the canvas again with the new picture before the frame is taken
      advance(performance.now());
      continueRender(pending.current);
      pending.current = null;
    }
  }, [tex, advance]);
  return (
    <mesh geometry={geo} position={[0, 0, D / 2 + 0.006]}>
      {/* a new material per picture, so three compiles it with the texture */}
      <meshBasicMaterial key={tex?.uuid ?? "none"} map={tex ?? undefined} color={tex ? "#ffffff" : "#000000"} toneMapped={false} />
    </mesh>
  );
}
function ImageScreen({ src, geo }: { src: string; geo: THREE.BufferGeometry }) {
  const tex = useLoader(THREE.TextureLoader, staticFile(src));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return (
    <mesh geometry={geo} position={[0, 0, D / 2 + 0.006]}>
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}
/**
 * A phone you can fly the camera around. The screen shows a real capture of the LifeFlow app: frames
 * (`screen`, from scripts/capture.mjs) or a still (`screenImage`). Glass with a soft reflection over it.
 */
export function Phone3D({
  screen,
  screenImage,
  screenOffset = 0,
  screenRate = 1,
  body = "#2b2d31",
  rotation = [0, 0, 0],
  position = [0, 0, 0],
  scale = 1,
}: {
  /** a capture, e.g. "captures/alex-student/today" (frames from npm run capture) */
  screen?: string;
  screenImage?: string;
  /** start this many capture frames in, and play at this speed */
  screenOffset?: number;
  screenRate?: number;
  body?: string;
  rotation?: [number, number, number];
  position?: [number, number, number];
  scale?: number;
}) {
  useCurrentFrame();
  useVideoConfig();
  const bodyGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(rounded(W - 0.02, H - 0.02, R), { depth: D - 0.02, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 6, curveSegments: 24 });
    g.translate(0, 0, -(D - 0.02) / 2);
    return g;
  }, []);
  const glassGeo = useMemo(() => screenGeo(W - 0.03, H - 0.03, R - 0.015), []);
  const scr = useMemo(() => screenGeo(W - 0.05, H - 0.05, R - 0.025), []);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh geometry={bodyGeo} castShadow receiveShadow>
        <meshPhysicalMaterial color={body} metalness={0.85} roughness={0.32} clearcoat={0.4} />
      </mesh>
      {/* black glass under the screen */}
      <mesh geometry={glassGeo} position={[0, 0, D / 2 + 0.001]}>
        <meshPhysicalMaterial color="#050608" roughness={0.08} metalness={0} clearcoat={1} />
      </mesh>
      {screen ? <FrameScreen src={screen} geo={scr} offset={screenOffset} rate={screenRate} /> : screenImage ? <ImageScreen src={screenImage} geo={scr} /> : null}
      {/* the glass: a faint reflection that moves with the light */}
      <mesh geometry={glassGeo} position={[0, 0, D / 2 + 0.011]}>
        <meshPhysicalMaterial transparent opacity={0.12} roughness={0.05} metalness={0} clearcoat={1} color="#ffffff" />
      </mesh>
      {/* the island */}
      <mesh position={[0, H / 2 - 0.075, D / 2 + 0.013]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.022, 0.1, 6, 16]} />
        <meshBasicMaterial color="#000" />
      </mesh>
      {/* side buttons */}
      {[
        [W / 2 + 0.004, 0.25, 0.16],
        [-W / 2 - 0.004, 0.35, 0.08],
        [-W / 2 - 0.004, 0.2, 0.12],
      ].map(([x, y, h], i) => (
        <mesh key={i} position={[x, y, 0]}>
          <boxGeometry args={[0.01, h, 0.03]} />
          <meshPhysicalMaterial color={body} metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}
