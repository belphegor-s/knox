// Ambient declaration for Vite's `?worker` import suffix (turns a module
// into a Worker constructor). Declared locally rather than depending on
// `vite/client` so this package type-checks standalone, outside the web app.
declare module "*?worker" {
  const WorkerFactory: new () => Worker;
  export default WorkerFactory;
}
