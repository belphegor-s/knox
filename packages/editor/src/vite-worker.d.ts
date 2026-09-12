// Ambient type for Vite's `?worker` imports (avoids depending on vite/client).
declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
