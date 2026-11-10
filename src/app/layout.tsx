import { liveBuild } from "@/lib/app-version";
import { ErrorReporter } from "@/components/error-reporter";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { TEXT_COOKIE, THEME_COOKIE, parseTextSize, parseTheme } from "@/lib/theme";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Splash, SPLASH_SCRIPT } from "@/components/motion/splash";
import "./globals.css";
// the sky buttons and skyling pieces are used on every page (owner, 2026-11-10)
import "@/components/skylings/skylings.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Day Sky (v3): a soft, warm serif for titles.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://lifeflowweb.com"),
  title: { default: "LifeFlow", template: "%s · LifeFlow" },
  description:
    "LifeFlow puts your calendar, tasks, schedules, money, goals, habits and health on one calm sky, with a little skyling who keeps an eye on your day.",
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
    title: "LifeFlow: Your whole life, in flow.",
    description: "Your whole week on one calm sky, with a little skyling who keeps an eye on it.",
    images: [{ url: "/brand/lifeflow-social.png", width: 1200, height: 630, alt: "LifeFlow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "LifeFlow: Your whole life, in flow.",
    description: "Your whole week on one calm sky, with a little skyling who keeps an eye on it.",
    images: ["/brand/lifeflow-social.png"],
  },
  formatDetection: { telephone: false },
};

const THEME_COLORS = { light: "#f6f8fb", dark: "#07101f" };

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
  const textSize = parseTextSize(jar.get(TEXT_COOKIE)?.value);
  // The landing page for signed-out visitors has no app to load, so it skips the splash.
  const landing = (await headers()).get("x-lf-landing") === "1";
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={theme === "system" ? undefined : theme}
      data-text={textSize === "default" ? undefined : textSize}
      data-build={liveBuild() || undefined}
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {!landing && <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />}
        {!landing && <Splash />}
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
