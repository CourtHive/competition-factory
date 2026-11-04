import { overtimeScoreVerdict } from '@Validators/overtimeScore';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * Overtime end to end (activation S6): a draw generated with an overtime format, every matchUp completed by the mocks
 * engine, and every result the static verdict accepts. Until the gate opened, draw generation refused the format
 * (ERR_UNRECOGNIZED_MATCHUP_FORMAT).
 */
describe('a draw played in an overtime format', () => {
  it.each(['HAL2XA-S:T45P-O:2X/T15P-F:SO5', 'PER3XA-S:T20P-O:1SD/T5P-F:TB1', 'QTR4XA-S:T12P-O:U/T5P'])(
    '%s',
    (matchUpFormat) => {
      const result: any = mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawSize: 16, matchUpFormat }],
        completeAllMatchUps: true,
        randomWinningSide: true,
        setState: true,
      });
      expect(result.error).toBeUndefined();

      const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { matchUpStatuses: [COMPLETED] } });
      expect(matchUps).toHaveLength(15);
      for (const matchUp of matchUps) {
        expect(matchUp.matchUpFormat).toEqual(matchUpFormat);
        const verdict = overtimeScoreVerdict({
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          sets: matchUp.score?.sets,
          matchUpFormat,
        });
        expect({ matchUpId: matchUp.matchUpId, verdict }).toEqual({
          matchUpId: matchUp.matchUpId,
          verdict: { applies: true, valid: true, winningSide: matchUp.winningSide },
        });
      }
    },
  );
});
