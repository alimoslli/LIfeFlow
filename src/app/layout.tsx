import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, THEME_COOKIE, parseAccent, parseTheme } from "@/lib/theme";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { Splash, SPLASH_SCRIPT } from "@/components/motion/splash";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], style: ["normal", "italic"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://lifeflowweb.com"),
  title: { default: "LifeFlow", template: "%s · LifeFlow" },
  description: "Your whole life, made simple. LifeFlow brings your money, school, work, health, and time into one calm place.",
  applicationName: "LifeFlow",
  appleWebApp: { capable: true, title: "LifeFlow", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/brand/lifeflow-mark-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/lifeflow-mark-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/lifeflow-apple-touch.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "LifeFlow",
    title: "LifeFlow — Your whole life, made simple.",
    description: "A calm place for your money, school, work, health, and time.",
    images: [{ url: "/brand/lifeflow-social.png", width: 1200, height: 630, alt: "LifeFlow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LifeFlow — Your whole life, made simple.",
    description: "A calm place for your money, school, work, health, and time.",
    images: ["/brand/lifeflow-social.png"],
  },
  formatDetection: { telephone: false },
};

const THEME_COLORS = { light: "#f4f2ec", dark: "#0e0e0d" };

/** Browser chrome color follows the chosen theme (or the device setting). */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    viewportFit: "cover",
    // The on-screen keyboard resizes the layout, so fixed bars and the composer stay above it.
    interactiveWidget: "resizes-content",
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
          ]
        : THEME_COLORS[theme],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const accent = parseAccent(jar.get(ACCENT_COOKIE)?.value);
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={theme === "system" ? undefined : theme}
      data-accent={accent === "green" ? undefined : accent}
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <Splash />
        {children}
      </body>
    </html>
  );
}
