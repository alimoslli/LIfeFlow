import { adBreak } from "./ad-break";
import { hectic } from "./hectic";
import { oneLastJob } from "./one-last-job";
import { theGate } from "./the-gate";
import { mission } from "./mission";
import { productDemo } from "./product-demo";
import { skylingAd } from "./skyling-ad";
import type { Project } from "./types";

/** Every video project. A new video = a new file here with its scenes. */
export const PROJECTS: Project[] = [theGate, oneLastJob, hectic, adBreak, productDemo, skylingAd, mission];
