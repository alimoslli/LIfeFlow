import { useMemo } from "react";
import * as THREE from "three";
import { rng } from "./util";

/** The TV's screen corners in the room (top-left, top-right, bottom-right, bottom-left), for OnQuad. */
export const TV_SCREEN: [number, number, number][] = [
  [-0.78, 1.69, -2.935],
  [0.78, 1.69, -2.935],
  [0.78, 0.81, -2.935],
  [-0.78, 0.81, -2.935],
];
function skyline(seed: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, "#0b1233");
  grd.addColorStop(0.7, "#3a2654");
  grd.addColorStop(1, "#ff8a5c");
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 256);
  const r = rng(seed);
  for (let x = 0; x < 512; ) {
    const w = 18 + r() * 40;
    const h = 60 + r() * 150;
    g.fillStyle = "#0a0d1c";
    g.fillRect(x, 256 - h, w, h);
    for (let y = 256 - h + 6; y < 250; y += 9)
      for (let xx = x + 4; xx < x + w - 4; xx += 7) if (r() < 0.35) (g.fillStyle = r() < 0.8 ? "#ffd9a0" : "#9fd3ff"), g.fillRect(xx, y, 3, 4);
    x += w + 2;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/**
 * A game-style apartment at night: pastel walls, a big window onto the city, a couch seen from behind, a TV on the
 * wall (its screen is left dark: put a composition on it with OnQuad and TV_SCREEN), warm lamp and TV glow.
 */
export function Room3D({ tvGlow = "#7fb2ff" }: { tvGlow?: string }) {
  const city = useMemo(() => skyline(9), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.5]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#2e2018" roughness={0.55} />
      </mesh>
      {/* back wall with the TV */}
      <mesh position={[0, 1.6, -3]}>
        <planeGeometry args={[8, 3.2]} />
        <meshStandardMaterial color="#1d3438" roughness={0.9} />
      </mesh>
      {/* left wall with the window */}
      <mesh position={[-2.6, 1.6, -0.5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[6, 3.2]} />
        <meshStandardMaterial color="#4a2a2a" roughness={0.9} />
      </mesh>
      <mesh position={[-2.58, 1.65, -1.2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[2.4, 1.5]} />
        <meshBasicMaterial map={city} toneMapped={false} />
      </mesh>
      {/* right wall */}
      <mesh position={[2.6, 1.6, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[6, 3.2]} />
        <meshStandardMaterial color="#3a3026" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.2, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#1c1a22" />
      </mesh>
      {/* the TV: a thin black slab; the picture is drawn on top in 2D */}
      <mesh position={[0, 1.25, -2.96]}>
        <boxGeometry args={[1.64, 0.94, 0.04]} />
        <meshStandardMaterial color="#0b0b0e" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* sideboard under it */}
      <mesh position={[0, 0.3, -2.75]}>
        <boxGeometry args={[2.2, 0.6, 0.45]} />
        <meshStandardMaterial color="#6b665e" roughness={0.6} />
      </mesh>
      {/* couch, seen from behind */}
      <mesh position={[0, 0.45, 0.6]}>
        <boxGeometry args={[2.3, 0.9, 0.35]} />
        <meshStandardMaterial color="#2c3b52" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.3, 0.2]}>
        <boxGeometry args={[2.3, 0.6, 0.8]} />
        <meshStandardMaterial color="#26344a" roughness={0.8} />
      </mesh>
      {/* coffee table, a plant, a lamp */}
      <mesh position={[0, 0.22, -1.2]}>
        <boxGeometry args={[1.1, 0.06, 0.55]} />
        <meshStandardMaterial color="#c79a6b" roughness={0.4} />
      </mesh>
      <mesh position={[1.9, 0.5, -2.5]}>
        <cylinderGeometry args={[0.18, 0.14, 0.4, 16]} />
        <meshStandardMaterial color="#e9e4dc" />
      </mesh>
      <mesh position={[1.9, 1.05, -2.5]}>
        <sphereGeometry args={[0.42, 16, 12]} />
        <meshStandardMaterial color="#2f6b45" roughness={0.9} />
      </mesh>
      <mesh position={[-1.9, 1.35, -2.4]}>
        <sphereGeometry args={[0.16, 16, 12]} />
        <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
      </mesh>
      <pointLight position={[-1.9, 1.35, -2.3]} intensity={9} distance={6} color="#ffbf80" />
      <pointLight position={[0, 1.25, -2.4]} intensity={8} distance={5} color={tvGlow} />
      <pointLight position={[-2.2, 1.8, -1.2]} intensity={3} distance={5} color="#ff8a5c" />
    </group>
  );
}
