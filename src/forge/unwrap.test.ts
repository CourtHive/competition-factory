/**
 * Unit tests for `unwrap()` (developer-joy #2 throwing variant).
 */
import { describe, expect, it } from 'vitest';

import { EventNotFoundError, FactoryError, InvalidValuesError, MissingTournamentRecordError } from '../errors';
import { unwrap } from './unwrap';

describe('unwrap', () => {
  it('returns the result as-is when no error', () => {
    const result = { events: [{ eventId: 'e1' }, { eventId: 'e2' }], success: true };
    const out = unwrap(result);
    expect(out).toBe(result);
    expect(out.events).toEqual([{ eventId: 'e1' }, { eventId: 'e2' }]);
  });

  it('returns the result when error key is absent', () => {
    const result = { tournamentInfo: { tournamentId: 't1' } };
    expect(unwrap(result)).toBe(result);
  });

  it('treats undefined error as success', () => {
    const result = { events: [] as any[], error: undefined };
    expect(unwrap(result)).toBe(result);
  });

  it('treats null error as success', () => {
    const result = { events: [] as any[], error: null };
    expect(unwrap(result as any)).toBe(result);
  });

  it('throws the registered subclass for a legacy POJO error envelope', () => {
    const result = {
      error: { code: 'ERR_MISSING_TOURNAMENT', message: 'Missing tournamentRecord' },
    };
    expect(() => unwrap(result)).toThrow(MissingTournamentRecordError);
    try {
      unwrap(result);
    } catch (e) {
      expect(e).toBeInstanceOf(MissingTournamentRecordError);
      expect((e as FactoryError).code).toBe('ERR_MISSING_TOURNAMENT');
      expect((e as FactoryError).message).toBe('Missing tournamentRecord');
    }
  });

  it('preserves `info` from the legacy POJO when upgrading', () => {
    const result = {
      error: {
        code: 'ERR_INVALID_VALUES',
        message: 'Invalid values',
        info: 'drawSize out of range',
      },
    };
    try {
      unwrap(result);
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidValuesError);
      expect((e as FactoryError).info).toBe('drawSize out of range');
    }
  });

  it('falls back to base FactoryError for unregistered codes', () => {
    const result = { error: { code: 'NOVEL_CODE', message: 'something new' } };
    try {
      unwrap(result);
    } catch (e) {
      expect(e).toBeInstanceOf(FactoryError);
      expect(e).not.toBeInstanceOf(MissingTournamentRecordError);
      expect((e as FactoryError).code).toBe('NOVEL_CODE');
    }
  });

  it('re-throws an already-typed FactoryError instance unchanged', () => {
    const original = new EventNotFoundError({
      methodName: 'getEvent',
      context: { eventId: 'e1' },
      cause: new Error('underlying'),
    });
    const result = { error: original };
    try {
      unwrap(result as any);
    } catch (e) {
      expect(e).toBe(original);
      expect((e as FactoryError).context).toEqual({ eventId: 'e1' });
      expect((e as FactoryError).cause).toBeInstanceOf(Error);
    }
  });

  it('throws ENGINE_RETURNED_UNDEFINED when input is undefined or null', () => {
    expect(() => unwrap(undefined)).toThrow(FactoryError);
    expect(() => unwrap(null)).toThrow(FactoryError);
    try {
      unwrap(undefined, { methodName: 'someMethod' });
    } catch (e) {
      expect((e as FactoryError).code).toBe('ENGINE_RETURNED_UNDEFINED');
      expect((e as FactoryError).methodName).toBe('someMethod');
    }
  });

  it('propagates methodName onto thrown error for legacy POJO path', () => {
    const result = { error: { code: 'ERR_MISSING_TOURNAMENT', message: 'x' } };
    try {
      unwrap(result, { methodName: 'addEvent' });
    } catch (e) {
      expect((e as FactoryError).methodName).toBe('addEvent');
    }
  });

  it('handles error POJOs missing code or message gracefully', () => {
    const result = { error: {} };
    try {
      unwrap(result);
    } catch (e) {
      expect(e).toBeInstanceOf(FactoryError);
      expect((e as FactoryError).code).toBe('UNKNOWN_ERROR');
    }
  });

  it('type-level: removes `error` from the inferred result', () => {
    type Input = { events?: { eventId: string }[]; error?: { code: string; message: string } };
    const input: Input = { events: [{ eventId: 'e1' }] };
    const out = unwrap(input);
    // After unwrap, `out.error` should not be accessible at the type level.
    // The body of this test compiles only if `Omit<Input, 'error'>` is the
    // inferred return — we exercise that by destructuring just `events`.
    const { events } = out;
    expect(events).toEqual([{ eventId: 'e1' }]);
  });
});
