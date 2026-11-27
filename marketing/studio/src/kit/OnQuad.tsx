import type { ReactNode } from "react";

/**
 * Pin a flat 2D layer (w x h) onto any four screen points (top-left, top-right, bottom-right, bottom-left), with true
 * perspective: a CSS homography. Used to put a whole composition on a TV, a billboard or a phone in a 3D shot.
 */
export function OnQuad({ w, h, quad, children }: { w: number; h: number; quad: [number, number][]; children: ReactNode }) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  // projective map from the unit square to the quad (Heckbert)
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  // scale the w x h layer down to the unit square first
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transformOrigin: "0 0", transform: `matrix3d(${m.join(",")})` }}>{children}</div>
  );
}
