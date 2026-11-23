import { derivedGoesToOrLinkError, hasStoredGoesTo, needsFinishingRounds } from '@Query/matchUps/addGoesTo';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '../../..';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * P53: getMatchUpDependencies derives the edges only for a draw that does not store them (`derivedGoesToOrLinkError`),
 * where it used to run `addGoesTo` on every call. `addGoesTo` does one more thing than the edges: a lone structure the
 * factory did not generate, with no `finishingPositionRange` on any matchUp, is given its finishing rounds. A ONE-ROUND
 * draw stores no edges and needs none, so the edges alone said "nothing owed" and the ranges were never written. Found
 * by comparing getParticipants output on Button's ingest corpus, old against new: UTR "Bonus Matches" draws, 15
 * matchUps in one round.
 */
const oneRoundForeignDraw = () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 2, drawType: SINGLE_ELIMINATION }] });
  const drawDefinition = tournamentRecord.events[0].drawDefinitions[0];
  for (const matchUp of drawDefinition.structures[0].matchUps) delete matchUp.finishingPositionRange;
  tournamentEngine.setState(tournamentRecord);
  return { drawId };
};

const storedMatchUps = (drawId: string) => tournamentEngine.getEvent({ drawId }).drawDefinition.structures[0].matchUps;

it('a one-round foreign draw stores its edges and still owes its finishing rounds', () => {
  const { drawId } = oneRoundForeignDraw();
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(hasStoredGoesTo({ drawDefinition })).toEqual(true);
  expect(needsFinishingRounds(drawDefinition)).toEqual(true);
});

// The finishing rounds were written here for getParticipants, which read them after calling this query for its repair.
// getParticipants now derives them on a copy of its own (P54), and getMatchUpDependencies writes nothing.
it('getMatchUpDependencies leaves a one-round foreign draw without the finishing rounds it owes', () => {
  const { drawId } = oneRoundForeignDraw();
  expect(storedMatchUps(drawId).every((matchUp: any) => !matchUp.finishingPositionRange)).toEqual(true);

  const result: any = tournamentEngine.getMatchUpDependencies({ drawIds: [drawId] });
  expect(result.success).toEqual(true);
  expect(storedMatchUps(drawId).every((matchUp: any) => !matchUp.finishingPositionRange)).toEqual(true);
});

it('a draw the factory generated owes nothing', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 16 }] });
  tournamentEngine.setState(tournamentRecord);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  expect(hasStoredGoesTo({ drawDefinition })).toEqual(true);
  expect(needsFinishingRounds(drawDefinition)).toEqual(false);
  expect(derivedGoesToOrLinkError({ drawDefinition })).toBeUndefined();
});
