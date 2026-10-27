export const THEME_COOKIE = "lf_theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const parseTheme = (v: string | undefined): Theme => (THEMES.includes(v as Theme) ? (v as Theme) : "system");
