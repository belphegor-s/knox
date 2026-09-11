import { useEffect, useState } from "react";
import type { VirtualFileSystem } from "@knox/shared";
import { MAX_OPENABLE_BYTES } from "@knox/editor";

export type BufferKind = "text" | "binary" | "image" | "too-large";

export interface FileBuffer {
  status: "loading" | "ready" | "error";
  kind: BufferKind;
  text: string;
  bytes: Uint8Array | null;
  sizeBytes: number;
  error: string | null;
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);

function looksBinary(bytes: Uint8Array): boolean {
  const sampleLength = Math.min(bytes.length, 8000);
  for (let i = 0; i < sampleLength; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

/** Loads a file's content for the editor, classifying it (text/binary/image/too-large) before ever touching Monaco (SPEC section 33/5). */
export function useFileBuffer(fs: VirtualFileSystem | null, path: string | null): FileBuffer {
  const [buffer, setBuffer] = useState<FileBuffer>({
    status: "loading",
    kind: "text",
    text: "",
    bytes: null,
    sizeBytes: 0,
    error: null,
  });

  useEffect(() => {
    if (!fs || !path) return;
    let cancelled = false;
    setBuffer((b) => ({ ...b, status: "loading" }));

    (async () => {
      try {
        const stat = await fs.stat(path);
        if (cancelled) return;
        if (stat.size > MAX_OPENABLE_BYTES) {
          setBuffer({ status: "ready", kind: "too-large", text: "", bytes: null, sizeBytes: stat.size, error: null });
          return;
        }
        const ext = path.split(".").pop()?.toLowerCase() ?? "";
        if (IMAGE_EXTENSIONS.has(ext) && ext !== "svg") {
          const bytes = await fs.readFile(path);
          if (cancelled) return;
          setBuffer({ status: "ready", kind: "image", text: "", bytes, sizeBytes: stat.size, error: null });
          return;
        }
        const bytes = await fs.readFile(path);
        if (cancelled) return;
        if (looksBinary(bytes)) {
          setBuffer({ status: "ready", kind: "binary", text: "", bytes, sizeBytes: stat.size, error: null });
          return;
        }
        const text = new TextDecoder().decode(bytes);
        setBuffer({ status: "ready", kind: "text", text, bytes, sizeBytes: stat.size, error: null });
      } catch (err) {
        if (!cancelled) {
          setBuffer((b) => ({ ...b, status: "error", error: err instanceof Error ? err.message : String(err) }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fs, path]);

  return buffer;
}
