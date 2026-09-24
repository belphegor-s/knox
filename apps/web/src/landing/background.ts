// The landing page's hero field: Paper Shaders' "Dithering" (https://shaders.paper.design,
// Apache-2.0, credited in the page's hero and footer as its NOTICE asks). Ordered Bayer dithering
// over a slow warp, in the brand accent - a pixel texture that belongs to a terminal tool more
// than a soft gradient would. The only script on the landing page besides its inline one, and it
// never pulls in React or the app shell.
import { ShaderMount, ditheringFragmentShader, defaultPatternSizing, ShaderFitOptions, DitheringShapes, DitheringTypes, getShaderColorFromString } from "@paper-design/shaders";

const host = document.getElementById("hero-field");

function isLightTheme(): boolean {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit) return explicit === "light";
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function themeColors(): { u_colorBack: number[]; u_colorFront: number[] } {
  // Transparent back so the page's own background (and its light/dark switch) shows through;
  // only the ink pixels are drawn.
  return {
    u_colorBack: getShaderColorFromString("rgba(0, 0, 0, 0)"),
    u_colorFront: getShaderColorFromString(isLightTheme() ? "rgba(193, 96, 47, 0.72)" : "rgba(207, 112, 56, 0.6)"),
  };
}

if (host) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  try {
    const mount = new ShaderMount(
      host,
      ditheringFragmentShader,
      {
        ...themeColors(),
        u_shape: DitheringShapes.warp,
        u_type: DitheringTypes["4x4"],
        u_pxSize: 3,
        u_fit: ShaderFitOptions[defaultPatternSizing.fit],
        u_scale: 1.1,
        u_rotation: 0,
        u_originX: defaultPatternSizing.originX,
        u_originY: defaultPatternSizing.originY,
        u_offsetX: 0,
        u_offsetY: 0,
        u_worldWidth: defaultPatternSizing.worldWidth,
        u_worldHeight: defaultPatternSizing.worldHeight,
      },
      { alpha: true, premultipliedAlpha: false },
      reducedMotion.matches ? 0 : 0.28,
      // A fixed starting frame, so the still image reduced-motion users get is a considered one.
      7_400,
      // Dithering is drawn in whole device pixels already - rendering above 1x buys nothing.
      1,
    );
    host.classList.add("is-live");

    const syncTheme = () => mount.setUniforms(themeColors());
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", syncTheme);
    reducedMotion.addEventListener("change", () => mount.setSpeed(reducedMotion.matches ? 0 : 0.28));
  } catch {
    // No WebGL (blocked, or an old GPU blocklisted by the browser): the hero keeps its plain
    // CSS background, nothing else depends on this.
  }
}
