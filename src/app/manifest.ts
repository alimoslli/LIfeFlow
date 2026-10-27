import type { MetadataRoute } from "next";

/** Lets phones install LifeFlow to the home screen and open it full-screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LifeFlow",
    short_name: "LifeFlow",
    description: "Your money, school, work and time — with Jarvis.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f2ec",
    theme_color: "#f4f2ec",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
