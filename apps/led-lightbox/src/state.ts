import { DEFAULT_PREPROCESS, type RGB, type Ring, type PreprocessParams } from '@vostok/trace';

export type WireExit = 'none' | 'side' | 'back' | 'both';
export type LipPlacement = 'none' | 'cover' | 'box';
/** Geometry from the existing @vostok/trace image preparation/quantization pipeline. */
export interface ArtworkRegion {
  color: RGB;
  /** Each component is one outer boundary with optional inner holes, in normalized coordinates. */
  components: Ring[][];
}
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
  /** Thickness of the entire diffuser including its 0.4 mm multicolour face layer. */
  diffuserThickness: number;
  includeColors: boolean;
  colorCount: number;
  smoothing: number;
  limitedColors: RGB[];
  preprocess: PreprocessParams;
  lipPlacement: LipPlacement;
  lipWidth: number;
  lipHeight: number;
  /** Diametral profile clearance measured radially, in millimetres PER SIDE. */
  lipClearance: number;
  outline: Ring;
  artwork: ArtworkRegion[];
}
export const DEFAULT_OUTLINE: Ring = [
  [-0.48, -0.32], [0.48, -0.32], [0.5, -0.3], [0.5, 0.3],
  [0.48, 0.32], [-0.48, 0.32], [-0.5, 0.3], [-0.5, -0.3],
];
export const DEFAULT_SETTINGS: LightboxSettings = {
  size: 120, depth: 24, wall: 2.2, back: 2.4,
  ledgeWidth: 8, ledgeHeight: 2, holeDiameter: 5,
  wireExit: 'back', removeBackground: true,
  diffuserThickness: 1.2, includeColors: true, colorCount: 4,
  smoothing: 0.4, limitedColors: [], preprocess: { ...DEFAULT_PREPROCESS },
  lipPlacement: 'none', lipWidth: 1.2, lipHeight: 0.6, lipClearance: 0.2,
  outline: DEFAULT_OUTLINE.map((p) => [...p]), artwork: [],
};
const limits: Record<Exclude<keyof LightboxSettings, 'wireExit' | 'removeBackground' | 'includeColors' | 'outline' | 'artwork' | 'limitedColors' | 'preprocess' | 'lipPlacement'>, [number, number]> = {
  size: [45, 250], depth: [10, 60], wall: [1.2, 5], back: [1.2, 5],
  ledgeWidth: [3, 12], ledgeHeight: [0.8, 4], holeDiameter: [2, 10],
  diffuserThickness: [0.6, 3], colorCount: [1, 6], smoothing: [0,1],
  lipWidth: [0.6, 2.4], lipHeight: [0.4, 2.4], lipClearance: [0, 0.5],
};
const exits: WireExit[] = ['none', 'side', 'back', 'both'];
const placements: LipPlacement[] = ['none', 'cover', 'box'];
const validRing = (r: unknown): r is Ring =>
  Array.isArray(r) && r.length >= 3 && r.length <= 2500 &&
  r.every((p) => Array.isArray(p) && p.length === 2 &&
    p.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 2));

/** The project includes traced artwork so it can be reopened without the original image. */
export function coerceSettings(raw: unknown): LightboxSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: LightboxSettings = {
    ...DEFAULT_SETTINGS,
    outline: DEFAULT_OUTLINE.map((p) => [...p]),
    artwork: [], limitedColors: [], preprocess: { ...DEFAULT_PREPROCESS },
  };
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = v[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      const [lo, hi] = limits[key];
      out[key] = Math.max(lo, Math.min(hi, value));
    }
  }
  out.colorCount = Math.round(out.colorCount);
  if (typeof v.lipPlacement === 'string' && placements.includes(v.lipPlacement as LipPlacement)) out.lipPlacement = v.lipPlacement as LipPlacement;
  if (Array.isArray(v.limitedColors)) out.limitedColors = v.limitedColors.slice(0, 6).filter(
    (rgb: unknown) => Array.isArray(rgb) && rgb.length === 3 && rgb.every(
      (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255
    )).map((rgb: RGB) => [...rgb] as RGB);
  if (v.preprocess && typeof v.preprocess === 'object') {
    const rawPrep = v.preprocess as Record<string, unknown>;
    const prep = { ...DEFAULT_PREPROCESS };
    for (const k of ['contrast','exposure','saturation','brightness','whiteBalance','highlights','shadows'] as const) {
      if (typeof rawPrep[k] === 'number' && Number.isFinite(rawPrep[k])) prep[k] = Math.max(0, Math.min(2, rawPrep[k] as number));
    }
    prep.keepBackground = !!rawPrep.keepBackground;
    out.preprocess = prep;
  }
  if (typeof v.wireExit === 'string' && exits.includes(v.wireExit as WireExit)) out.wireExit = v.wireExit as WireExit;
  if (typeof v.removeBackground === 'boolean') out.removeBackground = v.removeBackground;
  if (typeof v.includeColors === 'boolean') out.includeColors = v.includeColors;
  if (validRing(v.outline)) out.outline = v.outline.map((p) => [p[0], p[1]]);
  // Keep saved projects bounded; exclude malformed and pathologically complex geometry.
  if (Array.isArray(v.artwork) && v.artwork.length <= 6) {
    const validated: ArtworkRegion[] = [];
    for (const region of v.artwork) {
      if (!region || typeof region !== 'object' || !Array.isArray(region.color) ||
        region.color.length !== 3 || !region.color.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255) ||
        !Array.isArray(region.components) || region.components.length > 120) continue;
      const components: Ring[][] = [];
      let vertices = 0;
      for (const component of region.components) {
        if (!Array.isArray(component) || component.length > 20 || !component.every(validRing)) continue;
        vertices += component.reduce((n: number, r: Ring) => n + r.length, 0);
        if (vertices > 30000) break;
        components.push(component.map((r: Ring) => r.map((p) => [p[0], p[1]])));
      }
      if (components.length) validated.push({ color: [...region.color] as RGB, components });
    }
    out.artwork = validated;
  }
  return out;
}
