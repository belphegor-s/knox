// Re-exported from @knox/shared so both the filesystem backend and the web
// app's own persistence layer (workspace/session storage) use one implementation.
export { openDb, reqToPromise, txDone } from "@knox/shared";
