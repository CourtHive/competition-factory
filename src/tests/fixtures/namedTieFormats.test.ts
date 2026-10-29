import { tieFormatConstants } from '@Constants/tieFormatConstants';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * Every named tieFormat is published: INTENNSE_2026 had a constant, a template and a JSON, but no fixture entry, so
 * addEvent refused it while every other entry point accepted it (building-a-tournament.md § 8).
 */
describe('named tieFormats', () => {
  test('the fixtures publish every named tieFormat constant', () => {
    expect(Object.keys(tieFormats).sort()).toEqual(Object.keys(tieFormatConstants).sort());
  });

  test('addEvent takes every named tieFormat, and refuses a name that is not one', () => {
    for (const tieFormatName of Object.keys(tieFormatConstants)) {
      tournamentEngine.newTournamentRecord();
      const result: any = tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormatName } });
      expect([tieFormatName, result.success]).toEqual([tieFormatName, true]);
    }
    // STANDARD is the builder's fallback for a name it does not know, not a named format: a typo stays a refusal
    for (const tieFormatName of ['STANDARD', 'NOT_A_FORMAT']) {
      tournamentEngine.newTournamentRecord();
      const result: any = tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormatName } });
      expect(result.error).toEqual(INVALID_VALUES);
    }
  });
});
