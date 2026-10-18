import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { TEAM } from '@Constants/eventConstants';
import {
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  OLYMPIC,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';

/**
 * A completed fixture is complete: `completeDrawMatchUps` reports what is still to play (`remainingCount`),
 * and for every draw family `completeAllMatchUps` leaves nothing (phase 7 of the mocksEngine hardening
 * plan). A `success` result says the calls succeeded; this is the certificate that the draw is done.
 */

const FAMILIES = [
  SINGLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  COMPASS,
  OLYMPIC,
  CURTIS_CONSOLATION,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  DOUBLE_ELIMINATION,
  FEED_IN,
];

describe('completeAllMatchUps leaves nothing to play', () => {
  for (const drawType of FAMILIES) {
    for (const drawSize of [8, 16]) {
      it(`${drawType} ${drawSize}`, () => {
        tournamentEngine.reset();
        const generated: any = mocksEngine.generateTournamentRecord({
          drawProfiles: [{ drawId: 'd', drawType, drawSize }],
          completeAllMatchUps: true,
          randomWinningSide: true,
          nonRandom: drawSize,
          setState: true,
        });
        expect(generated.success).toEqual(true);

        const result: any = tournamentEngine.completeDrawMatchUps({ drawId: 'd', completeAllMatchUps: true });
        expect(result.completedCount).toEqual(0);
        expect(result.remainingCount).toEqual(0);
      });
    }
  }

  it('a TEAM draw', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', drawSize: 4, eventType: TEAM }],
      completeAllMatchUps: true,
      setState: true,
    });
    const result: any = tournamentEngine.completeDrawMatchUps({ drawId: 'd', completeAllMatchUps: true });
    expect(result.remainingCount).toEqual(0);
  });
});

describe('what remains is reported', () => {
  it('a completion goal leaves the rest to play, and says how many', () => {
    tournamentEngine.reset();
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId: 'd', drawSize: 16 }], setState: true });
    const result: any = tournamentEngine.completeDrawMatchUps({
      drawId: 'd',
      completionGoal: 5,
      completeAllMatchUps: true,
    });
    expect(result.completedCount).toEqual(5);
    expect(result.remainingCount).toEqual(15 - 5);

    const rest: any = tournamentEngine.completeDrawMatchUps({ drawId: 'd', completeAllMatchUps: true });
    expect(rest.completedCount).toEqual(10);
    expect(rest.remainingCount).toEqual(0);
  });
});
