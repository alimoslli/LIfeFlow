export const THEME_COOKIE = "lf_theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const parseTheme = (v: string | undefined): Theme => (THEMES.includes(v as Theme) ? (v as Theme) : "system");

/** Text size. Everything in the app is sized in rem, so this scales text and spacing together. */
export const TEXT_COOKIE = "lf_text";
export const TEXT_SIZES = ["default", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const parseTextSize = (v: string | undefined): TextSize => (TEXT_SIZES.includes(v as TextSize) ? (v as TextSize) : "default");

/** A year, in seconds: how long the device remembers appearance and text size. */
export const PREF_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Saves a device preference in the browser right away, so a reload straight after the tap keeps it (the server save
 * that follows can be cut off by the reload). Same name, path and lifetime as the server's cookie.
 */
export function rememberOnDevice(name: typeof THEME_COOKIE | typeof TEXT_COOKIE, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${PREF_COOKIE_MAX_AGE}; samesite=lax`;
}
