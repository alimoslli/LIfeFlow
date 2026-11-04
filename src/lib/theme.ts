export const THEME_COOKIE = "lf_theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const parseTheme = (v: string | undefined): Theme => (THEMES.includes(v as Theme) ? (v as Theme) : "system");

/** Text size. Everything in the app is sized in rem, so this scales text and spacing together. */
export const TEXT_COOKIE = "lf_text";
export const TEXT_SIZES = ["default", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const parseTextSize = (v: string | undefined): TextSize => (TEXT_SIZES.includes(v as TextSize) ? (v as TextSize) : "default");
