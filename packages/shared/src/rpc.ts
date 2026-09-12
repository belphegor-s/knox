import { createId } from "./id.js";

interface RpcRequest {
  id: string;
  method: string;
  args: unknown[];
}

interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { message: string; code?: string };
}

type PostMessageTarget = Pick<Worker, "postMessage"> & {
  addEventListener: Worker["addEventListener"];
  removeEventListener: Worker["removeEventListener"];
};

/** Typed RPC client over postMessage; call signatures come from T. */
export function createRpcClient<T extends Record<string, (...args: any[]) => Promise<any>>>(
  target: PostMessageTarget,
): T {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const onMessage = (event: MessageEvent<RpcResponse>) => {
    const { id, result, error } = event.data;
    const waiter = pending.get(id);
    if (!waiter) return;
    pending.delete(id);
    if (error) waiter.reject(Object.assign(new Error(error.message), { code: error.code }));
    else waiter.resolve(result);
  };
  target.addEventListener("message", onMessage as EventListener);

  return new Proxy(
    {},
    {
      get(_t, method: string) {
        return (...args: unknown[]) =>
          new Promise((resolve, reject) => {
            const id = createId("rpc");
            pending.set(id, { resolve, reject });
            target.postMessage({ id, method, args } satisfies RpcRequest);
          });
      },
    },
  ) as T;
}

/** Worker-side counterpart: dispatches incoming RPC calls to handlers. */
export function exposeRpc(handlers: Record<string, (...args: any[]) => Promise<unknown>>, scope: DedicatedWorkerGlobalScope | Worker = self as unknown as DedicatedWorkerGlobalScope): void {
  const onMessage = (event: MessageEvent<RpcRequest>) => {
    const { id, method, args } = event.data;
    const handler = handlers[method];
    if (!handler) {
      (scope as DedicatedWorkerGlobalScope).postMessage({ id, error: { message: `Unknown method: ${method}` } } satisfies RpcResponse);
      return;
    }
    handler(...args)
      .then((result) => (scope as DedicatedWorkerGlobalScope).postMessage({ id, result } satisfies RpcResponse))
      .catch((err: unknown) =>
        (scope as DedicatedWorkerGlobalScope).postMessage({
          id,
          error: { message: err instanceof Error ? err.message : String(err), code: (err as { code?: string })?.code },
        } satisfies RpcResponse),
      );
  };
  scope.addEventListener("message", onMessage as EventListener);
}
