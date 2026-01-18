import { Platform } from "react-native";

export const colors = {
  ink: "#2a2218",
  inkMuted: "#5a4a36",
  accent: "#3f2b18",
  accentSoft: "#efe6d6",
  accentStrong: "#8b5a2b",
  surface: "#fffaf2",
  surfaceAlt: "#fdf6ea",
  border: "#d9c6a8",
  background: "#f4efe6",
  success: "#2f7c57",
  error: "#9c4b4b",
  info: "#386ea6",
  overlay: "rgba(36, 29, 22, 0.35)",
};

export const fonts = {
  heading: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  body: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  mono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};
