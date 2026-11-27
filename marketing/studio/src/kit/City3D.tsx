import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rng } from "./util";

/** A window texture: a grid of lit and dark windows (seeded), drawn once on a canvas. */
function windows(seed: number) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0f1a";
  g.fillRect(0, 0, 128, 256);
  const r = rng(seed);
  for (let y = 6; y < 256; y += 14)
    for (let x = 6; x < 128; x += 12) {
      const lit = r() < 0.42;
      g.fillStyle = lit ? (r() < 0.7 ? "#ffd9a0" : "#9fd3ff") : "#141b2b";
      g.globalAlpha = lit ? 0.55 + r() * 0.45 : 1;
      g.fillRect(x, y, 7, 9);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/**
 * A night city in code: blocks of towers with lit windows along two avenues, a wet road, street lamps, neon strips
 * and fog. Stylised, not photoreal (see docs: where MAGI-2 footage would be the better call).
 */
export function City3D({ seed = 11, fog = "#1a1f3a", neon = ["#ff5fa2", "#38e1ff", "#ffd77a"] }: { seed?: number; fog?: string; neon?: string[] }) {
  const { scene } = useThree();
  useLayoutEffect(() => {
    scene.fog = new THREE.FogExp2(fog, 0.028);
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);
  const towers = useMemo(() => {
    const r = rng(seed);
    const out: { x: number; z: number; w: number; d: number; h: number; tex: number }[] = [];
    for (let z = -6; z > -120; z -= 7)
      for (const side of [-1, 1])
        for (let k = 0; k < 2; k++) {
          const w = 4 + r() * 4;
          out.push({ x: side * (8 + k * 9 + r() * 2), z: z - r() * 3, w, d: 4 + r() * 4, h: 8 + r() * (k ? 40 : 26), tex: Math.floor(r() * 4) });
        }
    return out;
  }, [seed]);
  const texes = useMemo(() => [0, 1, 2, 3].map((i) => windows(seed * 10 + i)), [seed]);
  const mats = useMemo(() => texes.map((t) => new THREE.MeshStandardMaterial({ color: "#1b2233", map: t, emissiveMap: t, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 1.6, roughness: 0.7 })), [texes]);
  const lamp = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = lamp.current;
    if (!m) return;
    const o = new THREE.Object3D();
    let i = 0;
    for (let z = -4; z > -120; z -= 9)
      for (const x of [-5.2, 5.2]) {
        o.position.set(x, 5, z);
        o.updateMatrix();
        m.setMatrixAt(i++, o.matrix);
      }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <group>
      {/* the road: dark and glossy so the lights smear on it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -60]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#0a0c14" roughness={0.18} metalness={0.7} />
      </mesh>
      {/* lane markings */}
      {Array.from({ length: 28 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2 - i * 4.2]}>
          <planeGeometry args={[0.18, 1.8]} />
          <meshBasicMaterial color="#e9d9a8" />
        </mesh>
      ))}
      {towers.map((t, i) => {
        const m = mats[t.tex].clone();
        m.map = m.map!.clone();
        m.map.repeat.set(t.w / 6, t.h / 12);
        m.map.needsUpdate = true;
        m.emissiveMap = m.map;
        return (
          <mesh key={i} position={[t.x, t.h / 2, t.z]} material={m}>
            <boxGeometry args={[t.w, t.h, t.d]} />
          </mesh>
        );
      })}
      {/* neon strips on the nearest buildings */}
      {towers.slice(0, 16).map((t, i) => (
        <mesh key={`n${i}`} position={[t.x - Math.sign(t.x) * (t.w / 2 + 0.02), 3 + (i % 3), t.z]} rotation={[0, Math.sign(t.x) > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <planeGeometry args={[t.d * 0.8, 0.22]} />
          <meshBasicMaterial color={neon[i % neon.length]} toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={lamp} args={[undefined, undefined, 40]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
      </instancedMesh>
      <pointLight position={[0, 6, -8]} intensity={40} color="#ffcf8a" distance={30} />
      <pointLight position={[-4, 3, -22]} intensity={30} color="#ff5fa2" distance={25} />
      <pointLight position={[4, 3, -30]} intensity={30} color="#38e1ff" distance={25} />
    </group>
  );
}
