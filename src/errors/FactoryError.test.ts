/**
 * Unit tests for the rich-error hierarchy (developer-joy #7).
 */
import { describe, expect, it } from 'vitest';

import {
  EventNotFoundError,
  FactoryError,
  InvalidValuesError,
  MissingTournamentRecordError,
  ParticipantNotFoundError,
  constructFactoryError,
  registerSuggestions,
} from './index';

describe('FactoryError', () => {
  it('is an Error subclass with code + message', () => {
    const err = new FactoryError('ANYTHING', 'something went wrong');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FactoryError);
    expect(err.code).toBe('ANYTHING');
    expect(err.message).toBe('something went wrong');
    expect(err.name).toBe('FactoryError');
  });

  it('propagates native ES2022 `cause`', () => {
    const root = new Error('underlying network failure');
    const err = new FactoryError('ERR_FETCH', 'fetch failed', { cause: root });
    expect(err.cause).toBe(root);
  });

  it('does not set `cause` when not supplied (Node 16 polyfill behavior)', () => {
    const err = new FactoryError('X', 'no cause');
    expect(err.cause).toBeUndefined();
  });

  it('carries methodName / path / context / info', () => {
    const err = new FactoryError('X', 'x', {
      methodName: 'getEvent',
      path: 'events[2].drawDefinitions[0]',
      context: { drawSize: 33 },
      info: 'inner detail',
    });
    expect(err.methodName).toBe('getEvent');
    expect(err.path).toBe('events[2].drawDefinitions[0]');
    expect(err.context).toEqual({ drawSize: 33 });
    expect(err.info).toBe('inner detail');
  });

  it('serializes to the legacy envelope shape via toJSON', () => {
    const err = new MissingTournamentRecordError({ info: 'no state loaded' });
    expect(JSON.parse(JSON.stringify({ error: err }))).toEqual({
      error: {
        code: 'ERR_MISSING_TOURNAMENT',
        message: 'Missing tournamentRecord',
        info: 'no state loaded',
      },
    });
  });

  it('omits info from JSON projection when absent', () => {
    const err = new InvalidValuesError();
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      code: 'ERR_INVALID_VALUES',
      message: 'Invalid values',
    });
  });

  it('returns empty suggestions when no factory is registered', () => {
    const err = new EventNotFoundError();
    expect(err.suggestions).toEqual([]);
  });

  it('lazily resolves suggestions from the registry by code', () => {
    registerSuggestions('TEST_SUGGEST_CODE', (ctx) => [`try ${ctx?.try ?? 'something'}`, 'or restart']);
    const err = new FactoryError('TEST_SUGGEST_CODE', 'x', { context: { try: 'a coffee' } });
    expect(err.suggestions).toEqual(['try a coffee', 'or restart']);
  });

  it('swallows suggestion-factory exceptions so error propagation is unaffected', () => {
    registerSuggestions('TEST_SUGGEST_THROW', () => {
      throw new Error('factory blew up');
    });
    const err = new FactoryError('TEST_SUGGEST_THROW', 'x');
    expect(err.suggestions).toEqual([]);
  });
});

describe('concrete subclasses', () => {
  it('match the legacy code + message for backwards compatibility', () => {
    const cases: Array<[FactoryError, string, string]> = [
      [new MissingTournamentRecordError(), 'ERR_MISSING_TOURNAMENT', 'Missing tournamentRecord'],
      [new InvalidValuesError(), 'ERR_INVALID_VALUES', 'Invalid values'],
      [new ParticipantNotFoundError(), 'ERR_NOT_FOUND_PARTICIPANT', 'Participant Not Found'],
      [new EventNotFoundError(), 'ERR_NOT_FOUND_EVENT', 'Event not found'],
    ];
    for (const [err, code, message] of cases) {
      expect(err.code).toBe(code);
      expect(err.message).toBe(message);
    }
  });

  it('set `name` to the subclass constructor name', () => {
    expect(new MissingTournamentRecordError().name).toBe('MissingTournamentRecordError');
    expect(new ParticipantNotFoundError().name).toBe('ParticipantNotFoundError');
  });

  it('are instanceof both their concrete class AND FactoryError', () => {
    const err = new ParticipantNotFoundError();
    expect(err).toBeInstanceOf(ParticipantNotFoundError);
    expect(err).toBeInstanceOf(FactoryError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('constructFactoryError (code registry)', () => {
  it('returns the matching subclass when code is registered', () => {
    const err = constructFactoryError('ERR_MISSING_TOURNAMENT', 'Missing tournamentRecord');
    expect(err).toBeInstanceOf(MissingTournamentRecordError);
    expect(err.code).toBe('ERR_MISSING_TOURNAMENT');
  });

  it('falls back to base FactoryError for unregistered codes', () => {
    const err = constructFactoryError('SOME_NOVEL_CODE', 'novel');
    expect(err).toBeInstanceOf(FactoryError);
    expect(err).not.toBeInstanceOf(MissingTournamentRecordError);
    expect(err.code).toBe('SOME_NOVEL_CODE');
    expect(err.message).toBe('novel');
  });

  it('forwards options to the constructed subclass', () => {
    const root = new Error('underlying');
    const err = constructFactoryError('ERR_INVALID_VALUES', 'Invalid values', {
      cause: root,
      methodName: 'addDrawDefinition',
      context: { drawSize: 33 },
    });
    expect(err).toBeInstanceOf(InvalidValuesError);
    expect(err.cause).toBe(root);
    expect(err.methodName).toBe('addDrawDefinition');
    expect(err.context).toEqual({ drawSize: 33 });
  });
});
