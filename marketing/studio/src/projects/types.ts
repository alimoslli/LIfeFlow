import type { FC } from "react";
import type { Format } from "../kit/util";

/**
 * How a scene is made. code: all programmatic (free). hybrid: AI footage composited with code and the real app.
 * ai: generation-heavy, only where code can't reach the look on our budget. Paid modes never run without a yes.
 */
export type Mode = "code" | "hybrid" | "ai";
export type Scene = {
  id: string;
  title: string;
  seconds: number;
  mode: Mode;
  /** why this mode: the studio's recommendation, shown on the dashboard */
  why: string;
  /** for hybrid/ai scenes: what it would cost to generate (credits) and on which model */
  estimate?: { credits: number; model: string; note?: string };
  component: FC<{ format: Format }>;
};
export type Cue = { t: number; sfx: string; gain?: number };
export type Project = {
  id: string;
  title: string;
  concept: string;
  formats: Format[];
  scenes: Scene[];
  /** the app captures this project shows (public/captures/...), checked for freshness by QC */
  captures?: string[];
  music?: { file: string; from?: number; gain?: number };
  cues?: Cue[];
};
/** What the render script and dashboard read (no components). */
export const metaOf = (p: Project) => ({
  id: p.id,
  title: p.title,
  concept: p.concept,
  formats: p.formats,
  captures: p.captures ?? [],
  music: p.music ?? null,
  cues: p.cues ?? [],
  scenes: p.scenes.map(({ id, title, seconds, mode, why, estimate }) => ({ id, title, seconds, mode, why, estimate: estimate ?? null })),
});
