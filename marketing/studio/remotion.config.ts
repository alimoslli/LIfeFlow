import { Config } from "@remotion/cli/config";
import { webpackOverride } from "./webpack-override.mjs";

// Studio preview (npm run studio) uses the same settings as scripts/render.mjs.
Config.overrideWebpackConfig(webpackOverride);
Config.setChromiumOpenGlRenderer("angle");
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
