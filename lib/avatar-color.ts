// Initials sit on a color the USER picked (or the default), so no fixed text
// color is safe: white on a pale amber is unreadable, dark on a deep blue
// too. Pick whichever of near-black / white contrasts better; the better of
// the two is always at least 4.58:1, i.e. WCAG AA for normal text.
export function readableTextOn(background: string): "#ffffff" | "#0b1a24" {
  const hex = background.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";

  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Contrast of white is 1.05/(L+0.05); of #0b1a24 (L ~ 0.009) is (L+0.05)/0.059.
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.059
    ? "#ffffff"
    : "#0b1a24";
}
