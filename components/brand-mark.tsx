import Image from "next/image";

// The single DormVision logo mark, used in both sidebar headers
// (components/app-sidebar.tsx) and the mobile header fallback
// (components/admin-shell.tsx, components/tenant-shell.tsx), plus the
// login card. One shared component so the logo only ever needs to be
// swapped in one place.
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <Image
      src="/logo-icon.png"
      alt="DormVision"
      width={64}
      height={64}
      priority
      className={`${className} shrink-0 object-contain`}
    />
  );
}
