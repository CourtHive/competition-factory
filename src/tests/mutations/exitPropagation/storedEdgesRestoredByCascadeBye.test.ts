import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A DRAW STORED WITHOUT `winnerMatchUpId` / `loserMatchUpId` IS GIVEN THEM BY THE FIRST BYE A CASCADE
 * PLACES — and the rest of the cascade, which reads the stored ids, then decides as it would have.
 *
 * Draws the factory generates store those edges. A record from elsewhere may not: an older record,
 * or a file the factory did not produce. `assignDrawPositionBye` used to restore them as a side
 * effect of asking a question it did not need answered; when that question stopped being asked
 * (assessment G15), the restoration went with it, and a hundred matrix cells played on stripped
 * draws ended in a different draw 44 times instead of 14. It is restored by name: `ensureGoesTo`.
 */

const storedMatchUps = (drawId: string): any[] =>
  tournamentEngine.getEvent({ drawId }).drawDefinition.structures.flatMap((structure: any) => structure.matchUps ?? []);

function generate(drawType: string, drawId: string, strip: boolean) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize: 8, participantsCount: 8, drawId }],
    nonRandom: 1,
  });
  let stripped = 0;
  if (strip) {
    for (const structure of tournamentRecord.events[0].drawDefinitions[0].structures) {
      for (const matchUp of structure.matchUps ?? []) {
        if (matchUp.winnerMatchUpId || matchUp.loserMatchUpId) stripped += 1;
        delete matchUp.winnerMatchUpId;
        delete matchUp.loserMatchUpId;
      }
    }
  }
  tournamentEngine.setState(tournamentRecord);
  return stripped;
}

const drawOf = (drawId: string) => tournamentEngine.getEvent({ drawId }).drawDefinition;

it('a generated draw stores its edges, and a round robin has none to store', () => {
  generate(FIRST_MATCH_LOSER_CONSOLATION, 'intact', false);
  expect(hasStoredGoesTo({ drawDefinition: drawOf('intact') })).toEqual(true);

  generate(ROUND_ROBIN, 'groups', false);
  expect(storedMatchUps('groups').some((matchUp) => matchUp.winnerMatchUpId || matchUp.loserMatchUpId)).toEqual(false);
  expect(hasStoredGoesTo({ drawDefinition: drawOf('groups') })).toEqual(true);
});

it('a draw stored without its edges has them after a double exit places a BYE', () => {
  const drawId = 'stripped';
  // CONTROL: there was something to strip, and it is gone
  expect(generate(FIRST_MATCH_LOSER_CONSOLATION, drawId, true)).toBeGreaterThan(0);
  expect(storedMatchUps(drawId).some((matchUp) => matchUp.winnerMatchUpId || matchUp.loserMatchUpId)).toEqual(false);
  expect(hasStoredGoesTo({ drawDefinition: drawOf(drawId) })).toEqual(false);

  const target = nextPlayable(drawId);
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: target.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // the double exit's loser seat became a BYE in the consolation, and placing it restored the edges
  expect(hasStoredGoesTo({ drawDefinition: drawOf(drawId) })).toEqual(true);
  const first = storedMatchUps(drawId).find((matchUp) => matchUp.matchUpId === target.matchUpId);
  expect(first.winnerMatchUpId).toBeDefined();
  expect(first.loserMatchUpId).toBeDefined();
});
