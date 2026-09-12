import * as monaco from "monaco-editor";

export function defineKnoxThemes(): void {
  monaco.editor.defineTheme("knox-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7076", fontStyle: "italic" },
      { token: "keyword", foreground: "d99a6c" },
      { token: "string", foreground: "9fb87a" },
      { token: "number", foreground: "c9a5e0" },
      { token: "type", foreground: "7fb8c4" },
      { token: "function", foreground: "e0c185" },
      { token: "variable", foreground: "d8dadd" },
      { token: "constant", foreground: "c9a5e0" },
    ],
    colors: {
      "editor.background": "#0e0f11",
      "editor.foreground": "#d8dadd",
      "editorLineNumber.foreground": "#3d4046",
      "editorLineNumber.activeForeground": "#8b9099",
      "editor.selectionBackground": "#c9a56733",
      "editor.inactiveSelectionBackground": "#c9a56718",
      "editorCursor.foreground": "#c9a567",
      "editor.lineHighlightBackground": "#ffffff08",
      "editorWhitespace.foreground": "#2a2c30",
      "editorIndentGuide.background": "#212327",
      "editorIndentGuide.activeBackground": "#35373c",
      "editorBracketMatch.background": "#c9a56722",
      "editorBracketMatch.border": "#c9a56766",
      "editorGutter.modifiedBackground": "#7fb8c4",
      "editorGutter.addedBackground": "#9fb87a",
      "editorGutter.deletedBackground": "#c97a7a",
      "scrollbarSlider.background": "#ffffff14",
      "scrollbarSlider.hoverBackground": "#ffffff22",
    },
  });

  monaco.editor.defineTheme("knox-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8a8f98", fontStyle: "italic" },
      { token: "keyword", foreground: "9a5a1f" },
      { token: "string", foreground: "3f6b2a" },
      { token: "number", foreground: "6b4a91" },
      { token: "type", foreground: "1f6b7a" },
      { token: "function", foreground: "8a6a1f" },
      { token: "variable", foreground: "24262b" },
    ],
    colors: {
      "editor.background": "#fbfaf8",
      "editor.foreground": "#24262b",
      "editorLineNumber.foreground": "#c2c4c9",
      "editorLineNumber.activeForeground": "#6b7076",
      "editor.selectionBackground": "#a5793322",
      "editorCursor.foreground": "#a57933",
      "editor.lineHighlightBackground": "#00000006",
    },
  });
}
