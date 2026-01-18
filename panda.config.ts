import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  presets: ["@pandacss/preset-panda"],
  include: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
  outdir: "styled-system",
  theme: {
    extend: {
      tokens: {
        fonts: {
          body: {
            value: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
          },
          mono: {
            value: '"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace',
          },
        },
        fontSizes: {
          xs: { value: "12px" },
          sm: { value: "13px" },
          md: { value: "15px" },
          lg: { value: "16px" },
          xl: { value: "18px" },
          hero: { value: "clamp(28px, 4vw, 46px)" },
        },
        colors: {
          surface: { value: "#fffaf1" },
          surfaceAlt: { value: "#fff6e8" },
          ink: { value: "#1b1813" },
          muted: { value: "#4c4033" },
          accent: { value: "#8a3d12" },
          accentHover: { value: "#6f2f0f" },
          border: { value: "#cdbca8" },
          highlight: { value: "#f0e1c7" },
          canvas: { value: "#f6eddc" },
          infoBg: { value: "#e4effb" },
          successBg: { value: "#daf5e5" },
          errorBg: { value: "#f6d7d7" },
          errorText: { value: "#9c4b4b" },
          overlay: { value: "rgba(27, 24, 19, 0.4)" },
        },
        borderWidths: {
          thin: { value: "1px" },
          thick: { value: "2px" },
        },
        shadows: {
          card: { value: "0 18px 40px rgba(99, 62, 28, 0.12)" },
        },
        radii: {
          sm: { value: "8px" },
          md: { value: "12px" },
          lg: { value: "16px" },
          xl: { value: "20px" },
          full: { value: "999px" },
        },
        spacing: {
          px1: { value: "1px" },
        },
        sizes: {
          containerLg: { value: "1200px" },
          copyWidth: { value: "520px" },
          modalWidth: { value: "420px" },
          searchMin: { value: "220px" },
          thumb: { value: "80px" },
          px1: { value: "1px" },
        },
      },
    },
  },
  globalCss: {
    "html, body": {
      minHeight: "100%",
      bg: "canvas",
      color: "ink",
      fontFamily: "body",
    },
    body: {
      margin: 0,
      backgroundImage:
        "radial-gradient(circle at top, #fef3d2 0%, #f9f1e1 40%, #f5ebe2 100%)",
    },
    "*": {
      boxSizing: "border-box",
    },
    ".skip-link": {
      position: "absolute",
      left: "3",
      top: "3",
      zIndex: 999,
      paddingBlock: "2",
      paddingInline: "3",
      borderRadius: "full",
      background: "ink",
      color: "surface",
      textDecoration: "none",
      transform: "translateY(-200%)",
      transition: "transform 0.2s ease",
    },
    ".skip-link:focus": {
      transform: "translateY(0)",
    },
    img: {
      maxWidth: "100%",
      display: "block",
    },
    button: {
      fontFamily: "inherit",
    },
    "button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible": {
      outlineStyle: "solid",
      outlineWidth: "thick",
      outlineColor: "accent",
      outlineOffset: "0.5",
    },
    a: {
      color: "inherit",
      textDecoration: "none",
    },
  },
});
