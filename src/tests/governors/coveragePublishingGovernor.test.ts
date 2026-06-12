// Coverage tests for three publishing-governor methods:
// getTournamentPublishStatus, isEmbargoed, isVisiblyPublished

// Query
import { isEmbargoed, isVisiblyPublished } from '@Query/publishing/isEmbargoed';

// Engines
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// Testing
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2025-06-15T12:00:00Z').getTime();
const FUTURE_EMBARGO = '2025-06-20T12:00:00Z';
const PAST_EMBARGO = '2025-06-10T12:00:00Z';

describe('getTournamentPublishStatus', () => {
  it('returns empty object when nothing has been published', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    let result: any = tournamentEngine.getTournamentPublishStatus();
    expect(result).toEqual({});
  });

  it('returns orderOfPlay after publishOrderOfPlay', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4 }],
      setState: true,
    });

    let result: any = tournamentEngine.publishOrderOfPlay();
    expect(result.success).toBe(true);

    result = tournamentEngine.getTournamentPublishStatus();
    expect(result.orderOfPlay).toBeDefined();
    expect(result.orderOfPlay.published).toBe(true);
  });
});

describe('isEmbargoed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when detail is undefined', () => {
    expect(isEmbargoed()).toBe(false);
  });

  it('returns false when detail has no embargo', () => {
    expect(isEmbargoed({ published: true })).toBe(false);
  });

  it('returns true when embargo is in the future', () => {
    expect(isEmbargoed({ published: true, embargo: FUTURE_EMBARGO })).toBe(true);
  });

  it('returns false when embargo is in the past', () => {
    expect(isEmbargoed({ published: true, embargo: PAST_EMBARGO })).toBe(false);
  });

  it('returns false when embargo is an invalid date string', () => {
    expect(isEmbargoed({ published: true, embargo: 'not-a-date' })).toBe(false);
  });
});

describe('isVisiblyPublished', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when detail is undefined', () => {
    expect(isVisiblyPublished()).toBe(false);
  });

  it('returns false when not published', () => {
    expect(isVisiblyPublished({ published: false })).toBe(false);
  });

  it('returns true when published with no embargo', () => {
    expect(isVisiblyPublished({ published: true })).toBe(true);
  });

  it('returns false when published with future embargo', () => {
    expect(isVisiblyPublished({ published: true, embargo: FUTURE_EMBARGO })).toBe(false);
  });

  it('returns true when published with past embargo', () => {
    expect(isVisiblyPublished({ published: true, embargo: PAST_EMBARGO })).toBe(true);
  });
});
