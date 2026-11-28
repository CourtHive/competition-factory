import { deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { originalNoticeValue } from '@Global/state/noticePayloadAudit';
import { getNoticeState } from '@Global/state/globalState';

// types
import type { TemporalPhases } from './apply';
import type { BuildViewArgs } from './types';

/**
 * A REPLAYABLE EFFECT SCOPE. A call with no captured instant is owned only through a complete phase program
 * (`compileTemporalPhases`) over a scope its temporal effects can be replayed in: notice state to replay into, a draw,
 * and arguments, phases and buffered notices made of plain data a private copy can hold. That is plain objects and
 * arrays (null-prototype objects among them), Dates, Sets and Maps of their own classes, functions (a deferred query's
 * arguments are data too), and own data properties only. Anything else (a class instance, a subclass of Date, Set or
 * Map, an accessor) leaves the call `clock`-abstained.
 *
 * Reads and allocates nothing beyond the walk: it asks of every value what a copy of it would need, and copies none.
 */
export function replayableEffectScope(args: BuildViewArgs, phases: TemporalPhases): boolean {
  const state = getNoticeState();
  if (!state || !args.drawDefinition) return false;
  const seen = new Set<unknown>();
  const plain = (value: unknown): boolean => {
    /* v8 ignore next -- @preserve: compiled out of every published bundle */
    if (__NOTICE_PAYLOAD_DIAGNOSTICS__) value = originalNoticeValue(value);
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return true;
    if (seen.has(value)) return true;
    seen.add(value);
    if (typeof value === 'function') {
      const binding = deferredQueryBinding(value);
      return !binding || plain(binding.args);
    }
    return plainContainer(value, plain) && plainProperties(value, plain);
  };
  return plain({ args, phases, notices: state.notices });
}

/** a Date, Set or Map of its own class whose entries are plain, an array, or a plain or null-prototype object */
function plainContainer(value: object, plain: (value: unknown) => boolean): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (value instanceof Date) return prototype === Date.prototype;
  if (value instanceof Set) return prototype === Set.prototype && [...Set.prototype.values.call(value)].every(plain);
  if (value instanceof Map)
    return (
      prototype === Map.prototype &&
      [...Map.prototype.entries.call(value)].every(([key, item]) => plain(key) && plain(item))
    );
  return Array.isArray(value) || prototype === Object.prototype || prototype === null;
}

/** every own property a data property holding a plain value: an accessor cannot be copied */
function plainProperties(value: object, plain: (value: unknown) => boolean): boolean {
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return 'value' in descriptor && plain(descriptor.value);
  });
}
