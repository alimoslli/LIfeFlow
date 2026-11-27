import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { GRID, companionOf, pixels, type CompanionKey, type Pose } from "../app-bridge";

/** A skyling exactly as the app draws it (24 x 24 grid from the app's own code), scaled up crisp. */
export function PixelSkyling({
  who,
  pose = "idle",
  scale = 12,
  night = false,
  flip = false,
  glow = false,
  poseFps = 4,
  poseFrame,
  style,
}: {
  who: CompanionKey;
  pose?: Pose;
  scale?: number;
  night?: boolean;
  flip?: boolean;
  glow?: boolean;
  poseFps?: number;
  /** fixed pose frame; otherwise it plays at poseFps */
  poseFrame?: number;
  style?: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const pf = poseFrame ?? Math.floor((frame / fps) * poseFps);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    for (const [x, y, col] of pixels(companionOf(who), pose, pf, night, glow)) {
      g.fillStyle = col;
      g.fillRect((flip ? GRID - 1 - x : x) * scale, y * scale, scale, scale);
    }
  }, [who, pose, pf, night, glow, flip, scale]);
  return <canvas ref={ref} width={GRID * scale} height={GRID * scale} style={{ imageRendering: "pixelated", ...style }} />;
}
