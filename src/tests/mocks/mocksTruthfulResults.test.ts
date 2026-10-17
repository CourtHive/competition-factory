import { generateTournamentRecord } from '@Generators/mocks/generateTournamentRecord';
import { modifyTournamentRecord } from '@Generators/mocks/modifyTournamentRecord';
import { getDevContext, setDevContext } from '@Global/state/globalState';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_TIME_ZONE, INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * A mocksEngine result is true: `success` means the record was generated, and an error in any stage
 * is the call's error (2026-10-17 mocks assessment, M1 and M9).
 *
 * Before: an invalid `localTimeZone` produced an error envelope that was then decorated with
 * participants and events and returned with `success: true`; a venue error landed INSIDE `venueIds`;
 * a refused `schedulingProfile` reported success with an empty schedule; a thrown generator returned
 * `undefined`, and under devContext left devContext on for the next, unrelated call.
 */

const KEEP_ID = 'keep-me';

function installKnownTournament() {
  const result: any = mocksEngine.generateTournamentRecord({
    tournamentAttributes: { tournamentId: KEEP_ID },
    setState: true,
  });
  expect(result.success).toEqual(true);
  expect(tournamentEngine.getTournament().tournamentRecord?.tournamentId).toEqual(KEEP_ID);
}

describe('stage errors are the call error', () => {
  it('an invalid header (time zone) is refused, not decorated', () => {
    const result: any = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { localTimeZone: 'NOT_A_ZONE' },
      drawProfiles: [{ drawSize: 4 }],
    });
    expect(result.error).toEqual(INVALID_TIME_ZONE);
    expect(result.success).toBeUndefined();
    expect(result.tournamentRecord).toBeUndefined();
  });

  it('a venue error is refused, not returned inside venueIds', () => {
    const result: any = mocksEngine.generateTournamentRecord({ venueProfiles: [{ courtsCount: -1 }] });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.success).toBeUndefined();
    expect(result.venueIds).toBeUndefined();
  });

  it('a refused schedulingProfile is refused, not an empty schedule', () => {
    const result: any = mocksEngine.generateTournamentRecord({ schedulingProfile: 'invalid' });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.success).toBeUndefined();
    expect(result.schedulerResult).toBeUndefined();
  });

  it('the generator and the public wrapper agree on each refusal', () => {
    const cases: any[] = [
      { tournamentAttributes: { localTimeZone: 'NOT_A_ZONE' } },
      { venueProfiles: [{ courtsCount: -1 }] },
      { schedulingProfile: 'invalid' },
      { scenarioProfile: { anchor: 'not-a-date' }, drawProfiles: [{ drawSize: 4 }] },
    ];
    for (const params of cases) {
      const direct: any = generateTournamentRecord({ ...params });
      const wrapped: any = mocksEngine.generateTournamentRecord({ ...params });
      expect(direct.error).toBeDefined();
      expect(wrapped.error).toEqual(direct.error);
    }
  });

  it('modifyTournamentRecord refuses a venue error instead of reporting the error as venueIds', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    const result: any = modifyTournamentRecord({
      venueProfiles: [{ courtsCount: -1 }],
      tournamentRecord,
    } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  });
});

describe('setState installs only what was generated', () => {
  it('a refused generation leaves the selected tournament in place', () => {
    installKnownTournament();

    const result: any = mocksEngine.generateTournamentRecord({
      tournamentAttributes: { localTimeZone: 'NOT_A_ZONE' },
      setState: true,
    });
    expect(result.error).toEqual(INVALID_TIME_ZONE);
    expect(tournamentEngine.getTournament().tournamentRecord?.tournamentId).toEqual(KEEP_ID);
  });

  it('a refused install leaves the selected tournament in place', () => {
    installKnownTournament();

    // not a record and not a { [tournamentId]: record } map
    const result: any = tournamentEngine.setState({ error: 'not a record' });
    expect(result.error).toBeDefined();
    expect(tournamentEngine.getTournament().tournamentRecord?.tournamentId).toEqual(KEEP_ID);
  });
});

describe('a thrown generator', () => {
  describe('outside devContext', () => {
    useEngineCatch();

    it('returns a structured error, not undefined', () => {
      const result: any = mocksEngine.generateTournamentRecord({ drawProfiles: [null] });
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.success).toBeUndefined();
    });

    it('does not install anything when setState is requested', () => {
      installKnownTournament();
      const result: any = mocksEngine.generateTournamentRecord({ drawProfiles: [null], setState: true });
      expect(result.error).toBeDefined();
      expect(tournamentEngine.getTournament().tournamentRecord?.tournamentId).toEqual(KEEP_ID);
    });
  });

  it('under an invocation-scoped devContext rethrows, then leaves devContext off', () => {
    expect(() => mocksEngine.devContext(true).generateTournamentRecord({ drawProfiles: [null] })).toThrow();
    expect(getDevContext()).toBeFalsy();

    const result: any = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 4 }] });
    expect(result.success).toEqual(true);
  });

  it('under a devContext the caller set, rethrows and leaves the caller its devContext', () => {
    setDevContext(true);
    try {
      expect(() => mocksEngine.generateTournamentRecord({ drawProfiles: [null] })).toThrow();
      expect(getDevContext()).toEqual(true);
    } finally {
      setDevContext(false);
    }
  });
});
