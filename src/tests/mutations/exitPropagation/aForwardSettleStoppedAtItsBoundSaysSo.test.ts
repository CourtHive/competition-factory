import { FORWARD_SETTLE_EXHAUSTED } from '@Mutate/matchUps/matchUpStatus/settleForwardConsequences';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

/**
 * A FORWARD SETTLE THAT STOPS AT ITS BOUND SAYS SO (`settleForwardConsequences`, `PASS_LIMIT`).
 *
 * The settle acts on one owed answer per pass and stops after `PASS_LIMIT` (64) passes. Census A1 never measured a draw
 * owing more than a handful, so the bound is a guard against a loop rather than a budget, but a call that stops with
 * something still owed must not report a settled draw: it returns a `FORWARD_SETTLE_EXHAUSTED` warning naming the
 * matchUp still owed, and `setMatchUpStatus` passes it on.
 *
 * No play owes 64 forward answers at once, so the record is written by hand: a SINGLE_ELIMINATION 256 draw with every
 * first-round matchUp decided and every second-round matchUp emptied of its drawPositions. That owes 128 winner
 * advances (question 1), each acted on by `directWinner`. Re-scoring one first-round matchUp advances its own winner
 * and runs the settle, which places 64 more and stops.
 */

const DRAW_ID = 'forward-settle-bound';
const roundMatchUps = (roundNumber: number) =>
  (tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true }).matchUps ?? []).filter(
    (matchUp: any) => matchUp.roundNumber === roundNumber,
  );
const advancedPositions = () =>
  roundMatchUps(2).reduce(
    (count: number, matchUp: any) => count + (matchUp.drawPositions ?? []).filter(Boolean).length,
    0,
  );
const rescore = (matchUp: any) =>
  tournamentEngine.setMatchUpStatus({
    outcome: mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: matchUp.winningSide })
      .outcome,
    matchUpId: matchUp.matchUpId,
    drawId: DRAW_ID,
  });

it('a settle that stops with winners still owed returns FORWARD_SETTLE_EXHAUSTED, and the next call settles the rest', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 256, drawId: DRAW_ID, completionGoal: 128 }],
  });
  const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];
  expect(structure.matchUps.filter((matchUp: any) => matchUp.winningSide).length).toEqual(128);
  for (const matchUp of structure.matchUps) if (matchUp.roundNumber === 2) matchUp.drawPositions = [];
  tournamentEngine.setState(tournamentRecord);
  expect(advancedPositions()).toEqual(0);

  const [first, second] = roundMatchUps(1);
  const stopped: any = rescore(first);
  expect(stopped.success).toEqual(true);
  const warning = stopped.warnings?.find((candidate: any) => candidate.code === FORWARD_SETTLE_EXHAUSTED);
  expect(warning?.matchUpIds).toHaveLength(1);
  // the re-scored winner, then the 64 the settle placed before it stopped
  expect(advancedPositions()).toEqual(65);

  // the matchUp it names is one whose winner it did not reach
  const owed = roundMatchUps(1).find((matchUp: any) => matchUp.matchUpId === warning.matchUpIds[0]);
  const winner = owed.sides.find((side: any) => side.sideNumber === owed.winningSide);
  const next = roundMatchUps(2).find((matchUp: any) => matchUp.matchUpId === owed.winnerMatchUpId);
  expect(next.drawPositions ?? []).not.toContain(winner.drawPosition);

  const settled: any = rescore(second);
  expect(settled.success).toEqual(true);
  expect(settled.warnings?.some((candidate: any) => candidate.code === FORWARD_SETTLE_EXHAUSTED)).toBeFalsy();
  expect(advancedPositions()).toEqual(128);
}, 180_000);
