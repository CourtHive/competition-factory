import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CONSOLATION, COMPASS, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';

/**
 * A RELABEL CARRIES THE EXIT, BOTH WAYS (CA, 2026-10-02).
 *
 * A relabel keeps the winner and changes what the result says about the loser, after the loser was
 * already directed. CA: under exit propagation, a COMPLETED result re-entered as a WALKOVER carries the
 * exit to the loser's next matchUp, *"except when there is already a result in the loser's next
 * matchUp"*, and the reverse case (an exit re-entered as COMPLETED) withdraws it, on the same terms.
 * Before this, v1 changed the status alone in both directions: the loser's consolation matchUp stayed
 * TO_BE_PLAYED after a walkover, and kept a walkover after the exit was corrected to a played result.
 */
const DRAW_ID = 'relabel';

const at = (stage: string, roundNumber: number, roundPosition: number): any =>
  tournamentEngine
    .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
    .matchUps?.find(
      (matchUp: any) =>
        matchUp.stage === stage && matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition,
    );

const played = (winningSide: number) =>
  mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

function setup() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    setState: true,
  });
}

function enter(matchUp: any, outcome: any, propagateExitStatus?: boolean) {
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    propagateExitStatus,
    drawId: DRAW_ID,
    outcome,
  });
  expect(result.success).toEqual(true);
}

const loserSideIn = (matchUp: any, participantId: string) =>
  matchUp.sides.find((side: any) => side.participantId === participantId)?.sideNumber;

it('COMPLETED re-entered as a WALKOVER carries the exit to the loser already directed', () => {
  setup();
  enter(at(MAIN, 1, 1), played(1), true);
  const loserId = at(MAIN, 1, 1).sides.find((side: any) => side.sideNumber === 2).participantId;
  // CONTROL: the loser was directed, and their consolation matchUp awaits them
  expect(loserSideIn(at(CONSOLATION, 1, 1), loserId)).toBeDefined();
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(TO_BE_PLAYED);

  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, true);

  const consolation = at(CONSOLATION, 1, 1);
  expect(consolation.matchUpStatus).toEqual(WALKOVER);
  expect(consolation.winningSide).toEqual(3 - loserSideIn(consolation, loserId));
});

it('a WALKOVER re-entered as COMPLETED withdraws the exit it carried', () => {
  setup();
  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, true);
  const loserId = at(MAIN, 1, 1).sides.find((side: any) => side.sideNumber === 2).participantId;
  // CONTROL: the walkover was carried
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(WALKOVER);

  enter(at(MAIN, 1, 1), played(1), true);

  expect(at(MAIN, 1, 1).matchUpStatus).toEqual(COMPLETED);
  const consolation = at(CONSOLATION, 1, 1);
  expect(consolation.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(consolation.winningSide).toBeUndefined();
  // the loser stays where they were directed: only the label they carried is gone
  expect(loserSideIn(consolation, loserId)).toBeDefined();
});

it('a DEFAULTED re-entered as COMPLETED withdraws it too', () => {
  setup();
  enter(at(MAIN, 1, 1), { matchUpStatus: DEFAULTED, winningSide: 1 }, true);
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(DEFAULTED);

  enter(at(MAIN, 1, 1), played(1), true);

  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(TO_BE_PLAYED);
});

it('carries nothing where the loser has already played their next matchUp', () => {
  setup();
  enter(at(MAIN, 1, 1), played(1), true);
  enter(at(MAIN, 1, 2), played(1), true);
  // the consolation matchUp the loser of MAIN 1/1 went to now has a result of its own
  enter(at(CONSOLATION, 1, 1), played(1), true);
  const before = at(CONSOLATION, 1, 1);

  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, true);

  const after = at(CONSOLATION, 1, 1);
  expect(after.matchUpStatus).toEqual(COMPLETED);
  expect(after.winningSide).toEqual(before.winningSide);
  expect(after.score?.scoreStringSide1).toEqual(before.score?.scoreStringSide1);
});

it('carries nothing without exit propagation', () => {
  setup();
  enter(at(MAIN, 1, 1), played(1));
  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 });

  expect(at(MAIN, 1, 1).matchUpStatus).toEqual(WALKOVER);
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(TO_BE_PLAYED);
});

it('carries the exit when the WINNER has already played on (the active-downstream route)', () => {
  setup();
  enter(at(MAIN, 1, 1), played(1), true);
  enter(at(MAIN, 1, 2), played(1), true);
  enter(at(MAIN, 2, 1), played(1), true);
  const loserId = at(MAIN, 1, 1).sides.find((side: any) => side.sideNumber === 2).participantId;
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(TO_BE_PLAYED);

  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, true);

  const consolation = at(CONSOLATION, 1, 1);
  expect(consolation.matchUpStatus).toEqual(WALKOVER);
  expect(consolation.winningSide).toEqual(3 - loserSideIn(consolation, loserId));
});

it('withdraws the exit when the WINNER has already played on (the active-downstream route)', () => {
  setup();
  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, true);
  enter(at(MAIN, 1, 2), played(1), true);
  enter(at(MAIN, 2, 1), played(1), true);
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(WALKOVER);

  enter(at(MAIN, 1, 1), played(1), true);

  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(TO_BE_PLAYED);
});

it('COMPASS: withdrawing the carried exit also takes back where losing it sent the loser', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 16, drawType: COMPASS }],
    setState: true,
  });
  const byName = (structureName: string, roundNumber: number, roundPosition: number): any =>
    tournamentEngine
      .allDrawMatchUps({ drawId: DRAW_ID, inContext: true })
      .matchUps?.find(
        (matchUp: any) =>
          matchUp.structureName === structureName &&
          matchUp.roundNumber === roundNumber &&
          matchUp.roundPosition === roundPosition,
      );
  const holding = (participantId: string, structureName: string) =>
    (tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true }).matchUps ?? []).filter(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.sides?.some((side: any) => side.participantId === participantId),
    );

  enter(byName('East', 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, true);
  const loserId = byName('East', 1, 1).sides.find((side: any) => side.sideNumber === 2).participantId;
  // CONTROL: the carried walkover lost them West 1/1, and losing it sent them on to South
  expect(byName('West', 1, 1).matchUpStatus).toEqual(WALKOVER);
  expect(holding(loserId, 'South').length).toBeGreaterThan(0);

  enter(byName('East', 1, 1), played(1), true);

  expect(byName('West', 1, 1).matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(holding(loserId, 'West').length).toBeGreaterThan(0);
  expect(holding(loserId, 'South')).toEqual([]);
});

it('leaves a CONVERGED carried exit as it stands, and the draw consistent (census 9000008)', () => {
  setup();
  // both losers of MAIN 1/1 and 1/2 carry a walkover into CONSOLATION 1/1, where the two exits converge
  enter(at(MAIN, 1, 1), { matchUpStatus: WALKOVER, winningSide: 1 }, true);
  enter(at(MAIN, 1, 2), { matchUpStatus: WALKOVER, winningSide: 1 }, true);
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(DOUBLE_WALKOVER);

  enter(at(MAIN, 1, 1), played(1), true);

  // withdrawing one origin of a convergence re-derives the other, whose winner must then be directed:
  // open work, so the convergence stands rather than strand a winner
  expect(at(CONSOLATION, 1, 1).matchUpStatus).toEqual(DOUBLE_WALKOVER);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const errors = ((getDrawInconsistencies({ drawDefinition, drawId: DRAW_ID }) as any).inconsistencies ?? []).filter(
    (issue: any) => issue.severity === 'error',
  );
  expect(errors).toEqual([]);
});
