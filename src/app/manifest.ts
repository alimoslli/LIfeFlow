import type { MetadataRoute } from "next";

/** Lets phones install LifeFlow to the home screen and open it full-screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LifeFlow",
    short_name: "LifeFlow",
    description: "Your money, school, work and time, with a personal AI assistant.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // theme_color tints the system bars; background_color is the launch screen behind the first paint (the app's page color).
    theme_color: "#2f5d50",
    background_color: "#f4f2ec",
    categories: ["productivity", "finance", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon (Android; iOS ignores shortcuts).
    shortcuts: [
      { name: "Ask Jarvis", short_name: "Jarvis", url: "/jarvis", icons: [{ src: "/icons/shortcut-jarvis.png", sizes: "96x96", type: "image/png" }] },
      { name: "Add to-do", short_name: "To-do", url: "/tasks?add=todo", icons: [{ src: "/icons/shortcut-todo.png", sizes: "96x96", type: "image/png" }] },
      {
        name: "Log spending",
        short_name: "Spending",
        url: "/money?add=spending",
        icons: [{ src: "/icons/shortcut-spending.png", sizes: "96x96", type: "image/png" }],
      },
    ],
    // Shown in the richer install dialog on Android and desktop Chrome.
    screenshots: [
      { src: "/screenshots/today-phone.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Today: your plan, money and what's next" },
      { src: "/screenshots/money-phone.png", sizes: "780x1688", type: "image/png", form_factor: "narrow", label: "Money: safe to spend, budgets and goals" },
      { src: "/screenshots/today-wide.png", sizes: "1440x900", type: "image/png", form_factor: "wide", label: "LifeFlow on a computer" },
    ],
  };
}
