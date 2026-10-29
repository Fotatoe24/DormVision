import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { DEFAULT_PALETTE, PALETTES, PALETTE_STORAGE_KEY } from "@/lib/palettes";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: "DormVision",
  description:
    "Dormitory Management and Accounting Information System with Digital Billing and Financial Monitoring",
};

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve
// to anything but 0 on notched/home-indicator devices — needed now that
// AdminShell/TenantShell render a fixed bottom nav (see components/
// bottom-nav.tsx).
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved color-scheme palette before first paint so
            there's no flash of the default colors. See lib/palettes.ts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=localStorage.getItem(${JSON.stringify(
              PALETTE_STORAGE_KEY
            )});if(p&&${JSON.stringify(
              PALETTES.map((x) => x.id)
            )}.indexOf(p)>-1&&p!==${JSON.stringify(
              DEFAULT_PALETTE
            )})document.documentElement.dataset.palette=p}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster richColors position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
