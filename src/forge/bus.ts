/**
 * engine.on/once/off/waitFor — typed event bus (developer-JOY #5)
 *
 * Multi-subscriber ergonomic surface over the existing single-callback
 * `setSubscriptions` system. Handlers receive ONE payload per call (the bus
 * iterates the underlying notice array for you), supports unsubscribe by
 * returned closure, and exposes a `waitFor(topic[, predicate])` Promise for
 * tests.
 *
 * Semantics:
 *   - `engine.on(topic, handler)` — returns an Unsubscribe. Multiple
 *     handlers per topic are supported; each is called once per published
 *     notice. Errors in one handler do not stop other handlers.
 *   - `engine.once(topic, handler)` — fires once, auto-unsubscribes.
 *   - `engine.off(topic, handler?)` — omit handler to clear all listeners
 *     for that topic.
 *   - `engine.waitFor(topic, predicate?)` — Promise that resolves with the
 *     first payload that matches the predicate (or just the first if no
 *     predicate). One-shot.
 *
 * Interop with the legacy `setSubscriptions({TOPIC: cb})`:
 * The bus claims the underlying subscription slot on first `on()` for a
 * topic, replacing any legacy callback. If a topic has no remaining bus
 * listeners after `off()` the slot is released back to `null`. Don't mix
 * the two APIs on the same topic — use one or the other.
 *
 * Typing: see `topicTypes.ts` for the `TopicPayloadMap`. ~12 topics are
 * precisely typed today; the rest fall through the index signature as
 * `unknown` and consumers cast at the call site.
 */

import { setSubscriptions } from '@Global/state/globalState';
import { Topic, TopicPayloadMap } from './topicTypes';

export type Unsubscribe = () => void;
type AnyHandler = (payload: any) => void;

export type EventHandler<T extends Topic> = (payload: TopicPayloadMap[T]) => void;
export type EventPredicate<T extends Topic> = (payload: TopicPayloadMap[T]) => boolean;

export interface EventBus {
  on<T extends Topic>(topic: T, handler: EventHandler<T>): Unsubscribe;
  once<T extends Topic>(topic: T, handler: EventHandler<T>): Unsubscribe;
  off<T extends Topic>(topic: T, handler?: EventHandler<T>): void;
  waitFor<T extends Topic>(topic: T, predicate?: EventPredicate<T>): Promise<TopicPayloadMap[T]>;
}

// Each entry in `payloads` is the unwrapped payload from one buffered notice
// (the `Notice.payload` field). `getNotices` / `getPayloads` already map each
// stored Notice down to its `payload` before this array is built.
function dispatchPayloads(topic: string, handlers: AnyHandler[], payloads: any[]): void {
  for (const payload of payloads) {
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        // Isolation: one bad handler must not stop the others.

        console.error(`[engine.on] handler error on topic "${topic}":`, err);
      }
    }
  }
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<AnyHandler>>();

  function ensureRegistration(topic: string): Set<AnyHandler> {
    let set = listeners.get(topic);
    if (set) return set;
    set = new Set<AnyHandler>();
    listeners.set(topic, set);
    setSubscriptions({
      subscriptions: {
        [topic]: (payloads: any[]) => {
          // Snapshot — safe against unsubscribe-during-dispatch.
          dispatchPayloads(topic, Array.from(set!), payloads);
        },
      },
    });
    return set;
  }

  function releaseIfEmpty(topic: string): void {
    const set = listeners.get(topic);
    if (!set || set.size > 0) return;
    listeners.delete(topic);
    // Passing a non-function value deletes the underlying slot
    // (see syncGlobalState.setSubscriptions).
    setSubscriptions({ subscriptions: { [topic]: null } });
  }

  function on(topic: string, handler: AnyHandler): Unsubscribe {
    const set = ensureRegistration(topic);
    set.add(handler);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      set.delete(handler);
      releaseIfEmpty(topic);
    };
  }

  function once(topic: string, handler: AnyHandler): Unsubscribe {
    const unsubscribe = on(topic, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  function off(topic: string, handler?: AnyHandler): void {
    const set = listeners.get(topic);
    if (!set) return;
    if (handler) {
      set.delete(handler);
    } else {
      set.clear();
    }
    releaseIfEmpty(topic);
  }

  function waitFor(topic: string, predicate?: (payload: any) => boolean): Promise<any> {
    return new Promise((resolve) => {
      const unsubscribe = on(topic, (payload) => {
        if (predicate && !predicate(payload)) return;
        unsubscribe();
        resolve(payload);
      });
    });
  }

  return { on, once, off, waitFor } as EventBus;
}
