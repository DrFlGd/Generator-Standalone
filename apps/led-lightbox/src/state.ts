import type { Ring } from '@vostok/trace';

export type WireExit = 'none' | 'side' | 'back' | 'both';
export interface LightboxSettings {
  size: number;
  depth: number;
  wall: number;
  back: number;
  ledgeWidth: number;
  ledgeHeight: number;
  holeDiameter: number;
  wireExit: WireExit;
  removeBackground: boolean;
  outline: Ring;
}
export const DEFAULT_OUTLINE: Ring = [
  [-0.48, -0.32], [0.48, -0.32], [0.5, -0.3], [0.5, 0.3],
  [0.48, 0.32], [-0.48, 0.32], [-0.5, 0.3], [-0.5, -0.3],
];
export const DEFAULT_SETTINGS: LightboxSettings = {
  size: 120, depth: 24, wall: 2.2, back: 2.4,
  ledgeWidth: 8, ledgeHeight: 2, holeDiameter: 5,
  wireExit: 'back', removeBackground: true, outline: DEFAULT_OUTLINE.map((p) => [...p]),
};
const limits: Record<Exclude<keyof LightboxSettings, 'wireExit' | 'removeBackground' | 'outline'>, [number, number]> = {
  size: [45, 250], depth: [10, 60], wall: [1.2, 5], back: [1.2, 5],
  ledgeWidth: [3, 12], ledgeHeight: [0.8, 4], holeDiameter: [2, 10],
};
const exits: WireExit[] = ['none','side','back','both'];
export function coerceSettings(raw: unknown): LightboxSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: LightboxSettings = { ...DEFAULT_SETTINGS, outline: DEFAULT_OUTLINE.map((p) => [...p]) };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = v[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const [lo, hi] = limits[key];
      out[key] = Math.max(lo, Math.min(hi, value));
    }
  }
  if (typeof v.wireExit === 'string' && exits.includes(v.wireExit as WireExit)) out.wireExit = v.wireExit as WireExit;
  if (typeof v.removeBackground === 'boolean') out.removeBackground = v.removeBackground;
  // User projects contain the traced outline, not just a reference to the upload.
  if (Array.isArray(v.outline) && v.outline.length >= 3 && v.outline.length <= 10000 &&
    v.outline.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 2))) {
    out.outline = (v.outline as Ring).map((p) => [p[0], p[1]]);
  }
  return out;
}
