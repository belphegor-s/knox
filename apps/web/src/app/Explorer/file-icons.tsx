import { File, FileCode, FileCog, FileImage, FileJson, FileTerminal, FileText, Palette } from "lucide-react";

type IconComponent = typeof File;

const EXTENSION_ICONS: Record<string, { icon: IconComponent; color: string }> = {
  ts: { icon: FileCode, color: "#5b9bd5" },
  tsx: { icon: FileCode, color: "#5b9bd5" },
  mts: { icon: FileCode, color: "#5b9bd5" },
  js: { icon: FileCode, color: "#d4c15c" },
  jsx: { icon: FileCode, color: "#d4c15c" },
  mjs: { icon: FileCode, color: "#d4c15c" },
  cjs: { icon: FileCode, color: "#d4c15c" },
  json: { icon: FileJson, color: "#9fb37a" },
  jsonc: { icon: FileJson, color: "#9fb37a" },
  css: { icon: Palette, color: "#b98cc7" },
  scss: { icon: Palette, color: "#d68ba0" },
  less: { icon: Palette, color: "#7fa8c9" },
  html: { icon: FileCode, color: "#d98a5f" },
  htm: { icon: FileCode, color: "#d98a5f" },
  md: { icon: FileText, color: "#8b9099" },
  mdx: { icon: FileText, color: "#8b9099" },
  py: { icon: FileCode, color: "#6a9fb5" },
  rs: { icon: FileCode, color: "#d98a5f" },
  go: { icon: FileCode, color: "#6ec9c2" },
  c: { icon: FileCode, color: "#9aa5b1" },
  h: { icon: FileCode, color: "#9aa5b1" },
  cpp: { icon: FileCode, color: "#9aa5b1" },
  cc: { icon: FileCode, color: "#9aa5b1" },
  hpp: { icon: FileCode, color: "#9aa5b1" },
  cs: { icon: FileCode, color: "#9b7fc7" },
  java: { icon: FileCode, color: "#d98a5f" },
  rb: { icon: FileCode, color: "#d9776b" },
  php: { icon: FileCode, color: "#8a92c9" },
  sql: { icon: FileCode, color: "#6a9fb5" },
  sh: { icon: FileTerminal, color: "#8fb37a" },
  bash: { icon: FileTerminal, color: "#8fb37a" },
  zsh: { icon: FileTerminal, color: "#8fb37a" },
  yml: { icon: FileCog, color: "#8b9099" },
  yaml: { icon: FileCog, color: "#8b9099" },
  toml: { icon: FileCog, color: "#8b9099" },
  ini: { icon: FileCog, color: "#8b9099" },
  env: { icon: FileCog, color: "#d3a54b" },
  xml: { icon: FileCode, color: "#d98a5f" },
  svg: { icon: FileImage, color: "#b98cc7" },
  png: { icon: FileImage, color: "#8b9099" },
  jpg: { icon: FileImage, color: "#8b9099" },
  jpeg: { icon: FileImage, color: "#8b9099" },
  gif: { icon: FileImage, color: "#8b9099" },
  webp: { icon: FileImage, color: "#8b9099" },
  ico: { icon: FileImage, color: "#8b9099" },
  bmp: { icon: FileImage, color: "#8b9099" },
  avif: { icon: FileImage, color: "#8b9099" },
};

const DEFAULT_ICON = { icon: File, color: "var(--knox-text-secondary)" };

export function fileIconFor(name: string): { icon: IconComponent; color: string } {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_ICONS[ext] ?? DEFAULT_ICON;
}
