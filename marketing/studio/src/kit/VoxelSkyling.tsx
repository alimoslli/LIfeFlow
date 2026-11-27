import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GRID, companionOf, pixels, type CompanionKey, type Pose } from "../app-bridge";

/**
 * A skyling as a 3D toy of glossy cubes, built at render time from the app's own pixel art: every pixel of the 24 x 24
 * grid becomes a column of cubes, deeper toward the middle so the body is rounded like a pillow. Same art as the app,
 * so a change to a skyling in the app changes it here too.
 */
export function VoxelSkyling({
  who,
  pose = "idle",
  poseFrame = 0,
  night = false,
  glow = false,
  height = 2,
  maxDepth = 4,
}: {
  who: CompanionKey;
  pose?: Pose;
  poseFrame?: number;
  night?: boolean;
  glow?: boolean;
  /** world-space height of the 24-pixel grid */
  height?: number;
  maxDepth?: number;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const cubes = useMemo(() => {
    const px = pixels(companionOf(who), pose, poseFrame, night, glow);
    const at = new Map<string, string>();
    // see-through pixels (the soft ground shadow) aren't cubes
    const solid = (c: string) => !/^rgba?\(/.test(c) || !/,\s*0?\.\d+\)$/.test(c);
    for (const [x, y, c] of px) if (solid(c)) at.set(`${x},${y}`, c);
    // distance from the edge (4-neighbour) gives each pixel its depth
    const dist = new Map<string, number>();
    const q: [number, number][] = [];
    for (const k of at.keys()) {
      const [x, y] = k.split(",").map(Number);
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => !at.has(`${x + dx},${y + dy}`));
      if (edge) {
        dist.set(k, 0);
        q.push([x, y]);
      }
    }
    while (q.length) {
      const [x, y] = q.shift()!;
      const d = dist.get(`${x},${y}`)!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const k = `${x + dx},${y + dy}`;
        if (at.has(k) && !dist.has(k)) {
          dist.set(k, d + 1);
          q.push([x + dx, y + dy]);
        }
      }
    }
    const out: { p: [number, number, number]; c: string }[] = [];
    for (const [k, c] of at) {
      const [x, y] = k.split(",").map(Number);
      const layers = Math.min(maxDepth, 1 + 2 * (dist.get(k) ?? 0));
      for (let i = 0; i < layers; i++) out.push({ p: [x - GRID / 2 + 0.5, GRID / 2 - y - 0.5, i - (layers - 1) / 2], c });
    }
    return out;
  }, [who, pose, poseFrame, night, glow, maxDepth]);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    cubes.forEach((cube, i) => {
      o.position.set(...cube.p);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.set(cube.c));
    });
    m.count = cubes.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cubes]);
  const s = height / GRID;
  return (
    <group scale={[s, s, s]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, 24 * 24 * maxDepth]}>
        <boxGeometry args={[0.94, 0.94, 0.94]} />
        {/* standard (not physical) material: the same glossy look at about half the cost per pixel */}
        <meshStandardMaterial roughness={0.3} metalness={0.05} emissive={glow ? "#ffd77a" : "#000"} emissiveIntensity={glow ? 0.08 : 0} />
      </instancedMesh>
    </group>
  );
}
