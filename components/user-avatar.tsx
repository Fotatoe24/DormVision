import Image from "next/image";
import { readableTextOn } from "@/lib/avatar-color";

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

// A person's display photo, or their initials on their chosen avatar color
// when they haven't uploaded one -- the same fallback the Profile page uses,
// so a person looks the same everywhere.
//
// Decorative on purpose (alt=""): every place it's used already prints the
// person's name right beside it.
//
// `unoptimized`: uploads are already compressed (about 512 px WebP, see
// components/profile-view.tsx) and have a unique URL per upload, so Next's
// image optimizer would only re-encode them at lower quality.
export function UserAvatar({
  name,
  url,
  color,
  size = 28,
  className = "",
}: {
  name?: string | null;
  url?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };

  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        unoptimized
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={box}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`flex shrink-0 select-none items-center justify-center rounded-full font-semibold ${className}`}
      style={{
        ...box,
        background: color || "#0a786e",
        color: readableTextOn(color || "#0a786e"),
        fontSize: Math.max(10, Math.round(size * 0.4)),
      }}
    >
      {initialsOf(name ?? "") || "?"}
    </span>
  );
}
