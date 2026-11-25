import { deferredQueries } from './deferredNoticeBinding';

// Internal to the suite setup. Neither the globalState barrel nor the engine exposes this switch.
export const noticePayloadTestMode = { enabled: false };

// Diagnostic callback views. A raw reference held by an observer is distinct from its
// view. Weak caches preserve aliases across enqueue, delivery and retained callbacks.
let views: WeakMap<object, object> | undefined;
let originals: WeakMap<object, object> | undefined;

// A private copier chooses its traversal once. A previously enqueued view can
// still be present after diagnosis is disabled, including in a custom provider.
export function noticeViewOrigins(): Pick<WeakMap<object, object>, 'get'> | undefined {
  return originals;
}

export function originalNoticeValue<T extends object>(value: T): T {
  return (originals?.get(value) as T) ?? value;
}

function rejectWrite(): never {
  throw new TypeError('Write through read-only notice payload');
}

function objectLike(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

type Callable = (...args: unknown[]) => unknown;

function shadowTarget(value: object): object {
  // Bound constructable functions have no fixed own prototype, caller or arguments.
  if (typeof value === 'function') return Object.bind(undefined);
  if (Array.isArray(value)) return [];
  return {};
}

function inheritedSize(value: object) {
  for (let owner: object | null = value; owner; owner = Reflect.getPrototypeOf(owner)) {
    if (Object.hasOwn(owner, 'size')) return owner === Map.prototype || owner === Set.prototype;
  }
  return false;
}

function* viewIterator(items: Iterable<unknown>) {
  for (const item of items) yield readonlyNoticeValue(item);
}

function readCollection(
  collection: Map<unknown, unknown> | Set<unknown>,
  fn: Callable,
  receiver: unknown,
  args: unknown[],
) {
  const proto = collection instanceof Map ? Map.prototype : Set.prototype;
  const [key, context] = args;
  const item = objectLike(key) ? originalNoticeValue(key) : key;
  if (fn === proto.delete || fn === proto.clear || fn === Map.prototype.set || fn === Set.prototype.add)
    return rejectWrite();
  if (fn === proto.has) return Reflect.apply(proto.has, collection, [item]);
  if (collection instanceof Map && fn === Map.prototype.get)
    return readonlyNoticeValue(Map.prototype.get.call(collection, item));
  if (fn === proto.keys) return viewIterator(Reflect.apply(proto.keys, collection, []));
  if (fn === proto.values) return viewIterator(Reflect.apply(proto.values, collection, []));
  if (fn === proto.entries) return viewIterator(Reflect.apply(proto.entries, collection, []));
  if (fn === proto.forEach) {
    if (typeof key !== 'function') throw new TypeError('forEach callback must be a function');
    return Reflect.apply(proto.forEach, collection, [
      (v: unknown, k: unknown) =>
        Reflect.apply(key, context, [readonlyNoticeValue(v), readonlyNoticeValue(k), receiver]),
    ]);
  }
  return readonlyNoticeValue(Reflect.apply(fn, receiver, args));
}

// Methods with internal slots only receive a raw receiver when the intrinsic is a
// known read. In particular user overrides and generic toJSON keep the protected this.
function applyView(fn: Callable, receiver: unknown, args: unknown[]) {
  const raw = objectLike(receiver) && originals?.get(receiver);
  if (raw instanceof Map || raw instanceof Set) return readCollection(raw, fn, receiver, args);
  if (raw instanceof Date && Object.getOwnPropertyDescriptor(Date.prototype, fn.name)?.value === fn) {
    if (fn.name.startsWith('set')) return rejectWrite();
    if (fn !== Date.prototype.toJSON && /^(get|to|valueOf)/.test(fn.name)) return Reflect.apply(fn, raw, args);
  }
  const result = Reflect.apply(fn, receiver, args);
  // Native array algorithms already read through the protected receiver. Their new
  // arrays and iterators belong to the consumer and contain protected references.
  if (Array.isArray(raw) && Reflect.get(Array.prototype, fn.name) === fn) return result;
  return readonlyNoticeValue(result);
}

export function readonlyNoticeValue<T>(value: T): T {
  if (!objectLike(value)) return value;
  views ??= new WeakMap();
  originals ??= new WeakMap();
  if (originals.has(value)) return value;
  const existing = views.get(value);
  if (existing) return existing as T;

  // A separate target lets even a frozen data property's value be returned as a
  // view without violating the Proxy invariant for the raw object's fixed fields.
  const shadow = shadowTarget(value);
  const handler: ProxyHandler<object> = {
    set: rejectWrite,
    deleteProperty: rejectWrite,
    defineProperty: rejectWrite,
    setPrototypeOf: rejectWrite,
    preventExtensions: rejectWrite,
    get(_, key, receiver) {
      if (key === 'size' && (value instanceof Map || value instanceof Set) && inheritedSize(value)) return value.size;
      return readonlyNoticeValue(Reflect.get(value, key, receiver));
    },
    has: (_, key) => Reflect.has(value, key),
    ownKeys: () => Reflect.ownKeys(value),
    getPrototypeOf: () => readonlyNoticeValue(Reflect.getPrototypeOf(value)),
    getOwnPropertyDescriptor(_, key) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor) return undefined;
      if ('value' in descriptor) descriptor.value = readonlyNoticeValue(descriptor.value);
      else {
        descriptor.get = readonlyNoticeValue(descriptor.get);
        descriptor.set = descriptor.set && rejectWrite;
      }
      if (!descriptor.configurable) Reflect.defineProperty(shadow, key, descriptor);
      return descriptor;
    },
    apply: (_, receiver, args) => applyView(value as Callable, receiver, args),
    construct(_, args, newTarget) {
      const created = Reflect.construct(
        value as new (...args: unknown[]) => object,
        args,
        originalNoticeValue(newTarget),
      );
      return (value as unknown) === Array ? created : readonlyNoticeValue(created);
    },
  };
  const view = new Proxy(shadow, handler);
  if (typeof value === 'function') {
    const binding = deferredQueries.get(value);
    if (binding) deferredQueries.set(view, binding);
  }
  views.set(value, view);
  originals.set(view, value);
  return view as T;
}
