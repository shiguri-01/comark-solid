/** `Promise.withResolvers` is ES2024; the repo tsconfig lib is es2023. */
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Streaming results carry `$` position metadata; ground truth does not. Strip it before comparing. */
export function strip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, v) => (key === "$" ? undefined : v)));
}
