import test from "node:test";
import assert from "node:assert/strict";
import { readableTextOn } from "@/lib/avatar-color";

// Initials are drawn on a colour the USER picked, so the text colour has to be
// chosen per background.

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test("white text on dark colours, dark text on light ones", () => {
  assert.equal(readableTextOn("#0a786e"), "#ffffff"); // the default teal
  assert.equal(readableTextOn("#13222d"), "#ffffff");
  assert.equal(readableTextOn("#ffffff"), "#000000");
  assert.equal(readableTextOn("#ec9a3b"), "#000000"); // the amber option: white would be 2:1
});

test("every colour in the avatar picker gets readable initials (WCAG AA)", () => {
  for (const color of ["#0c9488", "#0f3657", "#2ba686", "#ec9a3b", "#8a9aa8", "#f54f4e", "#13222d"]) {
    assert.ok(contrast(readableTextOn(color), color) >= 4.5, color);
  }
});

test("holds for any colour at all, not just the picker's", () => {
  for (let r = 0; r < 256; r += 51) {
    for (let g = 0; g < 256; g += 51) {
      for (let b = 0; b < 256; b += 51) {
        const color = "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
        assert.ok(contrast(readableTextOn(color), color) >= 4.5, color);
      }
    }
  }
});

test("a malformed colour falls back to white rather than throwing", () => {
  assert.equal(readableTextOn("not-a-colour"), "#ffffff");
});
