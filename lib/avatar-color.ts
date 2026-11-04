// Initials sit on a color the USER picked (or the default), so no fixed text
// color is safe: white on a pale amber is unreadable, dark on a deep blue
// too. Pick whichever of black / white contrasts better. With PURE black the
// better of the two is always at least 4.58:1 (the worst case, a mid-tone
// around #777), i.e. WCAG AA for normal text on any background. A softer
// near-black would look nicer but dips to about 4.2:1 on some colors, so it is
// deliberately plain black.
export function readableTextOn(background: string): "#ffffff" | "#000000" {
  const hex = background.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";

  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Contrast of white is 1.05/(L+0.05); of black is (L+0.05)/0.05.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05
    ? "#ffffff"
    : "#000000";
}
