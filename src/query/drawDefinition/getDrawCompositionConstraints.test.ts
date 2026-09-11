/**
 * Unit tests for `getDrawCompositionConstraints` — resolves draw composition
 * constraints from the tournament's `sanctioningConstraints` extension.
 */
import { describe, expect, it } from 'vitest';

import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { getDrawCompositionConstraints } from './getDrawCompositionConstraints';

const sanctioned = (events: any[]) =>
  ({
    extensions: [{ name: SANCTIONING_CONSTRAINTS, value: { events } }],
  }) as any;

describe('getDrawCompositionConstraints', () => {
  it('returns {} when no tournamentRecord is supplied', () => {
    expect(getDrawCompositionConstraints({})).toEqual({});
  });

  it('returns {} when the tournament has no sanctioningConstraints extension', () => {
    expect(getDrawCompositionConstraints({ tournamentRecord: { extensions: [] } as any })).toEqual({});
  });

  it('returns {} when sanctioningConstraints exists but events is empty', () => {
    expect(getDrawCompositionConstraints({ tournamentRecord: sanctioned([]) })).toEqual({});
  });

  it('returns {} when no event is supplied (cannot match)', () => {
    const tournamentRecord = sanctioned([{ eventType: 'SINGLES', drawSize: 32 }]);
    expect(getDrawCompositionConstraints({ tournamentRecord })).toEqual({});
  });

  it('returns {} when event does not match by eventType', () => {
    const tournamentRecord = sanctioned([{ eventType: 'SINGLES', drawSize: 32 }]);
    const event = { eventType: 'DOUBLES' } as any;
    expect(getDrawCompositionConstraints({ tournamentRecord, event })).toEqual({});
  });

  it('returns {} when matched eventConstraints exists but contains no constraint fields', () => {
    const tournamentRecord = sanctioned([{ eventType: 'SINGLES' }]);
    const event = { eventType: 'SINGLES' } as any;
    expect(getDrawCompositionConstraints({ tournamentRecord, event })).toEqual({});
  });

  it('returns all four constraint fields when set on the matched entry', () => {
    const tournamentRecord = sanctioned([
      { eventType: 'SINGLES', drawSize: 32, maxWildcards: 4, maxAlternates: 2, maxQualifiers: 8 },
    ]);
    const event = { eventType: 'SINGLES' } as any;
    expect(getDrawCompositionConstraints({ tournamentRecord, event })).toEqual({
      constraints: { drawSize: 32, maxWildcards: 4, maxAlternates: 2, maxQualifiers: 8 },
    });
  });

  it('matches narrower entries by eventName when supplied on the constraint', () => {
    const tournamentRecord = sanctioned([
      { eventType: 'SINGLES', eventName: 'Open', drawSize: 64 },
      { eventType: 'SINGLES', drawSize: 32 },
    ]);
    const event = { eventType: 'SINGLES', eventName: 'Open' } as any;
    expect(getDrawCompositionConstraints({ tournamentRecord, event })).toEqual({ constraints: { drawSize: 64 } });
  });

  it('rejects the entry when eventName is set on the constraint but the event has a different name', () => {
    const tournamentRecord = sanctioned([{ eventType: 'SINGLES', eventName: 'Open', drawSize: 64 }]);
    const event = { eventType: 'SINGLES', eventName: 'Masters' } as any;
    expect(getDrawCompositionConstraints({ tournamentRecord, event })).toEqual({});
  });

  it('matches when constraint category.categoryName equals event.category.categoryName', () => {
    const tournamentRecord = sanctioned([{ eventType: 'SINGLES', category: { categoryName: 'U18' }, maxWildcards: 6 }]);
    const event = { eventType: 'SINGLES', category: { categoryName: 'U18' } } as any;
    expect(getDrawCompositionConstraints({ tournamentRecord, event })).toEqual({
      constraints: { maxWildcards: 6 },
    });
  });

  it('rejects when constraint category.categoryName mismatches event.category.categoryName', () => {
    const tournamentRecord = sanctioned([{ eventType: 'SINGLES', category: { categoryName: 'U18' }, maxWildcards: 6 }]);
    const event = { eventType: 'SINGLES', category: { categoryName: 'U16' } } as any;
    expect(getDrawCompositionConstraints({ tournamentRecord, event })).toEqual({});
  });
});
