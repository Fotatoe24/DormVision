import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Guards the colour themes in app/globals.css. Contrast is computed with the WCAG
// formula for the text/background pairs the UI actually uses, in light and dark
// mode and in every palette, so an edit to a colour that quietly makes text
// unreadable fails here instead of reaching users. 4.5:1 is WCAG AA for normal text.

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

type Tokens = Record<string, string>;

function tokens(re: RegExp): Tokens {
  const body = css.match(re)?.[1] ?? "";
  return Object.fromEntries(
    [...body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]])
  );
}

const light = tokens(/:root\s*\{([^}]*)\}/);
const dark = { ...light, ...tokens(/\n\.dark\s*\{([^}]*)\}/) };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channel = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// What Tailwind's `bg-x/15` renders as: the colour at 15% over what's behind it.
const tint = (fg: string, bg: string, alpha: number) => {
  const f = rgb(fg);
  const b = rgb(bg);
  return "#" + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
};

function failures(t: Tokens) {
  const pairs: Array<[string, string, string]> = [
    ["muted text on the page", t["foreground-muted"], t.background],
    ["muted text on a card", t["foreground-muted"], t.surface],
    ["muted text on a tinted row/pill", t["foreground-muted"], t["surface-muted"]],
    ["primary text (links) on the page", t.primary, t.background],
    ["primary text on a card", t.primary, t.surface],
    ["primary text on its own 10% tint", t.primary, tint(t.primary, t.surface, 0.1)],
    ["button label on primary", t.surface, t.primary],
    ["button label on status-paid", t.surface, t["status-paid"]],
    ["button label on status-overdue", t.surface, t["status-overdue"]],
    ["error text on the page", t["status-overdue"], t.background],
  ];

  for (const s of ["paid", "partial", "unpaid", "overdue"]) {
    pairs.push([`status-${s} badge text on its 15% tint`, t[`status-${s}`], tint(t[`status-${s}`], t.surface, 0.15)]);
    pairs.push([`status-${s} text on a 10% banner`, t[`status-${s}`], tint(t[`status-${s}`], t.background, 0.1)]);
  }

  return pairs
    .map(([name, fg, bg]) => ({ name, ratio: contrast(fg, bg) }))
    .filter((p) => p.ratio < 4.5)
    .map((p) => `${p.name}: ${p.ratio.toFixed(2)}:1`);
}

test("the token blocks were found (so the checks below mean something)", () => {
  for (const name of ["background", "surface", "surface-muted", "foreground-muted", "primary", "status-paid", "status-overdue"]) {
    assert.match(light[name] ?? "", /^#[0-9a-f]{6}$/i, `light --${name}`);
    assert.match(dark[name] ?? "", /^#[0-9a-f]{6}$/i, `dark --${name}`);
  }
  assert.notEqual(dark.background, light.background, "the .dark block was found");
});

test("light mode meets WCAG AA", () => assert.deepEqual(failures(light), []));
test("dark mode meets WCAG AA", () => assert.deepEqual(failures(dark), []));

for (const id of ["ocean", "violet", "rose", "brass", "forest"]) {
  const lightPalette = {
    ...light,
    ...tokens(new RegExp(`html\\[data-palette="${id}"\\]\\s*\\{([^}]*)\\}`)),
  };
  const darkPalette = {
    ...dark,
    ...tokens(new RegExp(`html\\.dark\\[data-palette="${id}"\\]\\s*\\{([^}]*)\\}`)),
  };

  test(`${id} palette (light) meets WCAG AA`, () => assert.deepEqual(failures(lightPalette), []));
  test(`${id} palette (dark) meets WCAG AA`, () => assert.deepEqual(failures(darkPalette), []));
}
