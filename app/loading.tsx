import Image from "next/image";

// Root loading state — shown while any page below the root layout is
// fetching data server-side (e.g. right after signing in, while the role's
// layout loads), in place of a fully blocked blank screen. The DormVision
// mark pulses gently; the pulse is switched off for reduced-motion users.
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-full flex-1 items-center justify-center bg-background px-6 py-12"
    >
      <Image
        src="/logo-icon.png"
        alt=""
        width={96}
        height={96}
        priority
        className="h-16 w-16 animate-pulse object-contain motion-reduce:animate-none"
      />
    </div>
  );
}
