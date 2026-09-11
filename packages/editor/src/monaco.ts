// The Monaco-backed half of @knox/editor. Only ever import this via
// `await import("@knox/editor/monaco")` (or React.lazy) - never statically -
// so it lands in its own chunk instead of the app shell's initial bundle.
export * from "./theme.js";
export * from "./workers.js";
export * from "./model-registry.js";
export * from "./KnoxEditor.js";
