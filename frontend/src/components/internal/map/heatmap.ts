/**
 * Color ramp for D3 contour fills — matching Radar 1.0 "Mid contrast" style.
 * Contour fills create the heat map effect (NOT a raster canvas).
 *
 * t = 0 (lowest density) → t = 1 (highest density)
 */

/**
 * Contour fill color based on normalized density level.
 * Matches Radar 1.0: transparent → lavender → blue → cyan → green → yellow → red
 */
export function contourFillColor(t: number): string {
  if (t < 0.02) return "none";

  // [t, R, G, B, A]
  const stops: [number, number, number, number, number][] = [
    [0.10,  200, 205, 235, 0.20],  // faint lavender
    [0.20,  175, 190, 235, 0.35],  // light purple
    [0.30,  140, 175, 230, 0.50],  // blue-purple
    [0.35,  100, 165, 225, 0.60],  // blue
    [0.45,  60,  175, 215, 0.68],  // cyan
    [0.55,  45,  195, 180, 0.74],  // teal
    // [0.50,  60,  205, 135, 0.80],  // green
    [0.65,  120, 215, 80,  0.84],  // yellow-green
    [0.70,  190, 222, 50,  0.87],  // yellow
    [0.92,  200, 200, 40,  0.90],  // gold/orange
    [0.95,  220, 120, 25,  0.92],  // orange-red
    [1,  230, 60,  20,  0.94],  // red
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const [t0, r0, g0, b0, a0] = stops[i];
      const [t1, r1, g1, b1, a1] = stops[i + 1];
      const blend = (t - t0) / (t1 - t0);
      const r = Math.round(r0 + (r1 - r0) * blend);
      const g = Math.round(g0 + (g1 - g0) * blend);
      const b = Math.round(b0 + (b1 - b0) * blend);
      const a = a0 + (a1 - a0) * blend;
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
    }
  }

  return "rgba(235, 60, 20, 0.94)";
}

/**
 * Radar 1.0 contour color — returns [R, G, B] for a given density t.
 * Ramp: blue (8, 0, 255) → cyan → green → yellow → red (225, 13, 13)
 * Used for both stroke (opaque) and fill (same RGB at 0.15 alpha).
 */
export function radar10ContourRGBA(t: number): [number, number, number, number] {
  // [t, R, G, B, A] — A is fill alpha (stroke is always opaque)
  const stops: [number, number, number, number, number][] = [
    [0.00,    8,   0, 255, 0.05],  // blue (lowest)
    [0.05,    4,  50, 255, 0.05],  // blue-2
    [0.10,    0, 100, 255, 0.05],  // blue-cyan
    [0.15,    0, 140, 240, 0.08],  // cyan-blue
    [0.20,    0, 160, 230, 0.10],  // light cyan
    [0.25,    0, 170, 225, 0.11],  // cyan
    [0.30,    0, 180, 220, 0.12],  // cyan-2
    [0.35,    0, 185, 180, 0.16],  // teal
    [0.40,    0, 190, 150, 0.20],  // teal-green
    // [0.45,    0, 190, 135, 0.5],  // green-teal
    [0.50,    0, 190, 120, 0.5],  // green
    [0.55,   50, 200,  85, 0.5],  // green-2
    [0.60,  100, 210,  50, 0.65],  // yellow-green
    [0.65,  150, 215,  40, 0.65],  // yellow-green-2
    [0.70,  200, 200,  30, 0.65],  // yellow
    [0.75,  210, 160,  25, 0.7],  // yellow-orange
    [0.80,  220, 120,  20, 0.7],  // orange
    [0.85,  222,  70,  16, 0.70],  // orange-red
    // [0.95,  225,  13,  13, 0.75],  // red
    [1,  230,   0,   0, 1],  // deep red (highest)
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const [t0, r0, g0, b0, a0] = stops[i];
      const [t1, r1, g1, b1, a1] = stops[i + 1];
      const blend = (t - t0) / (t1 - t0);
      return [
        Math.round(r0 + (r1 - r0) * blend),
        Math.round(g0 + (g1 - g0) * blend),
        Math.round(b0 + (b1 - b0) * blend),
        a0 + (a1 - a0) * blend,
      ];
    }
  }
  return [225, 13, 13, 0.65];
}

/**
 * Contour stroke color — subtle, slightly darker than fill.
 */
export function contourStrokeColor(t: number): string {
  if (t < 0.02) return "rgba(180, 185, 210, 0.2)";

  const stops: [number, number, number, number, number][] = [
    [0.02,  170, 175, 210, 0.25],
    [0.20,  120, 145, 200, 0.35],
    [0.40,  50,  140, 190, 0.40],
    [0.60,  40,  170, 120, 0.45],
    [0.80,  150, 185, 40,  0.50],
    [1.0,   200, 100, 20,  0.55],
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      const [t0, r0, g0, b0, a0] = stops[i];
      const [t1, r1, g1, b1, a1] = stops[i + 1];
      const blend = (t - t0) / (t1 - t0);
      const r = Math.round(r0 + (r1 - r0) * blend);
      const g = Math.round(g0 + (g1 - g0) * blend);
      const b = Math.round(b0 + (b1 - b0) * blend);
      const a = a0 + (a1 - a0) * blend;
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
    }
  }

  return "rgba(200, 100, 20, 0.55)";
}
