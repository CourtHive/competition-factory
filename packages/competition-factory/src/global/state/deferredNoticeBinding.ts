// A recorder can inspect a lazy notice without invoking the query. A diagnostic
// view of the thunk shares the same binding, including later argument rebinding.
export type DeferredQuery = { query: (args: unknown) => unknown; args: unknown };
export const deferredQueries = new WeakMap<object, DeferredQuery>();
