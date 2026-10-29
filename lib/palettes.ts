// Color-scheme palettes. The actual token overrides live in
// app/globals.css under `html[data-palette="<id>"]`; this file is the
// list the Appearance settings render, plus the storage contract shared
// with the pre-hydration script in app/layout.tsx.
//
// `swatch` is only used to paint the preview chips — it mirrors each
// palette's --primary / --accent / --sidebar tokens for light and dark.
export type PaletteId =
  | "teal"
  | "ocean"
  | "violet"
  | "rose"
  | "brass"
  | "forest";

export type Palette = {
  id: PaletteId;
  label: string;
  blurb: string;
  swatch: {
    light: [primary: string, accent: string, sidebar: string];
    dark: [primary: string, accent: string, sidebar: string];
  };
};

export const DEFAULT_PALETTE: PaletteId = "teal";

export const PALETTE_STORAGE_KEY = "dv-palette";
export const PALETTE_CHANGE_EVENT = "dv-palette-change";

export const PALETTES: Palette[] = [
  {
    id: "teal",
    label: "Ledger Teal",
    blurb: "The classic DormVision look.",
    swatch: {
      light: ["#0c9488", "#0f3657", "#022B47"],
      dark: ["#22c7b4", "#5fb3e0", "#0c2c46"],
    },
  },
  {
    id: "ocean",
    label: "Ocean Blue",
    blurb: "Crisp and calm.",
    swatch: {
      light: ["#2563eb", "#1e3a8a", "#0f2a5c"],
      dark: ["#60a5fa", "#93c5fd", "#111c3a"],
    },
  },
  {
    id: "violet",
    label: "Violet",
    blurb: "Modern and bold.",
    swatch: {
      light: ["#7c3aed", "#4c1d95", "#2e1065"],
      dark: ["#a78bfa", "#c4b5fd", "#1c1238"],
    },
  },
  {
    id: "rose",
    label: "Rose",
    blurb: "Warm and friendly.",
    swatch: {
      light: ["#e11d48", "#881337", "#4c0519"],
      dark: ["#fb7185", "#fda4af", "#2a1119"],
    },
  },
  {
    id: "brass",
    label: "Brass",
    blurb: "Earthy, like a ledger book.",
    swatch: {
      light: ["#b45309", "#78350f", "#3b2410"],
      dark: ["#f59e0b", "#fcd34d", "#2a1e0e"],
    },
  },
  {
    id: "forest",
    label: "Forest",
    blurb: "Fresh and easy on the eyes.",
    swatch: {
      light: ["#15803d", "#14532d", "#052e16"],
      dark: ["#4ade80", "#86efac", "#0e2417"],
    },
  },
];

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}
