import { resolveTieFormat, tieFormatConstants, tieFormats } from '@courthive/competition-catalogue';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, test } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * Every named tie format is published by the catalogue package, and addEvent takes each as an object. The factory
 * resolves no names: a `tieFormatName` alone, whether a catalogue name, `STANDARD` or a typo, is refused.
 */
describe('named tieFormats', () => {
  test('the catalogue publishes every named tieFormat constant', () => {
    expect(Object.keys(tieFormats).sort()).toEqual(Object.keys(tieFormatConstants).sort());
  });

  test('addEvent takes every catalogue tieFormat as an object, and refuses a name alone', () => {
    for (const name of Object.keys(tieFormatConstants)) {
      tournamentEngine.newTournamentRecord();
      const result: any = tournamentEngine.addEvent({
        event: { eventType: TEAM_EVENT, tieFormat: resolveTieFormat(name) },
      });
      expect([name, result.success]).toEqual([name, true]);
    }
    for (const tieFormatName of [...Object.keys(tieFormatConstants), 'STANDARD', 'NOT_A_FORMAT']) {
      tournamentEngine.newTournamentRecord();
      const result: any = tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormatName } });
      expect([tieFormatName, result.error]).toEqual([tieFormatName, INVALID_VALUES]);
    }
  });
});
