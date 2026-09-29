import { getExitSides, isPropagatedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { ORIGIN_ON_UNDECIDED_MATCHUP } from '@Query/drawDefinition/getStructureInconsistencies';
import { MATRIX_CELLS, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, COMPASS } from '@Constants/drawDefinitionConstants';
import {
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  COMPLETED,
  WALKOVER,
  BYE,
  DOUBLE_DEFAULT,
} from '@Constants/matchUpStatusConstants';

/**
 * `sideExitProvenance` IS READ BY WHAT IT SAYS. **Punch-list P19.**
 *
 * The field holds three different facts under one key — a CARRIED EXIT, an ARRIVAL, and a BYE CLAIM
 * LEDGER — and only the first is an exit. Two things follow, and they are pinned separately because
 * they fail separately:
 *
 *  1. a READER asks the entry what it is, so an arrival or a ledger is not mistaken for an exit;
 *  2. a DETECTOR refuses an origin recorded on a matchUp that is neither an exit nor a BYE, because
 *     that is the state an over-permissive writer leaves, and no reader can tell its entry from a
 *     real one.
 *
 * The second is the one that matters. Re-creating the writer P19 cites moved the suite by ONE
 * failure when the reader changed (64 -> 63); what it actually broke was `DO_UNDO_IDENTITY`, 58
 * times, by leaving a record behind.
 */

const matchUpWith = (matchUpStatus: string, sideExitProvenance: any): any => ({ matchUpStatus, sideExitProvenance });

it('counts a side as carrying an exit only when its entry says so', () => {
  const carried = { matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER, sourceMatchUpId: 'a' };
  const arrival = { matchUpStatus: COMPLETED, previousMatchUpStatus: COMPLETED, sourceMatchUpId: 'b' };
  const ledger = { byeClaims: ['c'] };

  // CONTROL: the reader can say yes, and names the side
  expect(getExitSides({ matchUp: matchUpWith(WALKOVER, { 2: carried }) })).toEqual([2]);
  expect(getExitSides({ matchUp: matchUpWith(DOUBLE_WALKOVER, { 1: carried, 2: carried }) })).toEqual([1, 2]);

  // an arrival beside a carried exit is one exiting side, not two
  expect(getExitSides({ matchUp: matchUpWith(WALKOVER, { 1: arrival, 2: carried }) })).toEqual([2]);

  // and neither an arrival nor a ledger is an exit on its own — each of these read `true` by presence
  expect(isPropagatedExit({ matchUp: matchUpWith(BYE, { 1: arrival }) })).toEqual(false);
  expect(isPropagatedExit({ matchUp: matchUpWith(BYE, { 1: ledger }) })).toEqual(false);
  expect(isPropagatedExit({ matchUp: matchUpWith(BYE, { 1: ledger, 2: ledger }) })).toEqual(false);
  expect(isPropagatedExit({ matchUp: matchUpWith(TO_BE_PLAYED, undefined) })).toEqual(false);
  expect(isPropagatedExit({ matchUp: matchUpWith(TO_BE_PLAYED, {}) })).toEqual(false);
});

function generate(drawId: string) {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, idPrefix: 'origin', drawId }],
    nonRandom: 1,
  });
  tournamentEngine.setState(tournamentRecord);
}

function scan(drawId: string) {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const result: any = tournamentEngine.getDrawInconsistencies({ drawDefinition, drawId });
  return {
    issueTypes: (result.inconsistencies ?? []).map((issue: any) => issue.issueType),
    valid: result.valid,
  };
}

/** write an entry straight onto a stored matchUp, the way a writer with no gate would */
function stamp(drawId: string, matchUpId: string, sideExitProvenance: any) {
  const { tournamentRecord }: any = tournamentEngine.getTournament();
  const drawDefinition = tournamentRecord.events[0].drawDefinitions.find((draw: any) => draw.drawId === drawId);
  const stored = drawDefinition.structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === matchUpId);
  stored.sideExitProvenance = sideExitProvenance;
  tournamentEngine.setState(tournamentRecord);
}

it('reports an origin recorded on a matchUp that is still to be played', () => {
  const drawId = 'stray-origin';
  generate(drawId);

  // CONTROL: a freshly generated draw is clean, so whatever the scan reports below was stamped
  expect(scan(drawId)).toEqual({ issueTypes: [], valid: true });

  stamp(drawId, 'origin-2-1', {
    1: { matchUpStatus: WALKOVER, previousMatchUpStatus: DOUBLE_WALKOVER, sourceMatchUpId: 'origin-1-1' },
  });

  const stamped = scan(drawId);
  // `PROPAGATED_EXIT_LOST` reports the same matchUp, from the other direction: it sees a carried
  // exit whose matchUp stopped being one. It cannot see an ARRIVAL, which the next test stamps.
  expect(stamped.issueTypes).toContain(ORIGIN_ON_UNDECIDED_MATCHUP);
  expect(
    stamped.valid,
    'an error, not a warning: the draw carries a fact about a matchUp it does not describe',
  ).toEqual(false);
});

it('reports an ARRIVAL recorded on an undecided matchUp too, and exempts a claim ledger', () => {
  const drawId = 'stray-arrival';
  generate(drawId);

  stamp(drawId, 'origin-2-1', {
    2: { matchUpStatus: COMPLETED, previousMatchUpStatus: COMPLETED, sourceMatchUpId: 'origin-1-2' },
  });
  expect(scan(drawId).issueTypes).toEqual([ORIGIN_ON_UNDECIDED_MATCHUP]);

  // a ledger carries no origin — it says which double exits claim a BYE and nothing about a side
  stamp(drawId, 'origin-2-1', { 1: { byeClaims: ['origin-1-1'] } });
  expect(scan(drawId)).toEqual({ issueTypes: [], valid: true });
});

it('reports nothing for the origins the cascade itself records', () => {
  const drawId = 'real-origins';
  generate(drawId);

  for (const matchUpId of ['origin-1-1', 'origin-1-2']) {
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: DOUBLE_WALKOVER },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // CONTROL: the cascade ran and recorded origins — on exits, double exits and a BYE
  const carrying = (tournamentEngine.allTournamentMatchUps().matchUps ?? []).filter((matchUp: any) =>
    isPropagatedExit({ matchUp }),
  );
  expect(carrying.length).toBeGreaterThan(2);
  expect(new Set(carrying.map((matchUp: any) => matchUp.matchUpStatus)).size).toBeGreaterThan(1);

  expect(scan(drawId)).toEqual({ issueTypes: [], valid: true });
});

/**
 * A BYE RECORDS NO ARRIVAL BY RESULT — and keeps the two things it may record.
 *
 * CA, 2026-09-29: *"a BYE should not carry COMPLETED provenance"*, and that `BYE -> BYE` *"is
 * legitimate and should stay"*. The three cases below are the rule, its control, and the detector
 * that would catch a writer which got round it.
 */
const arrivalsByResult = (matchUp: any) =>
  Object.values(matchUp.sideExitProvenance ?? {}).filter((entry: any) => entry?.matchUpStatus === COMPLETED);

it('does not record how a participant ARRIVED at a BYE they advanced through', () => {
  setSubscriptions({});
  const drawId = 'bye-arrival';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, drawId }],
    nonRandom: 9000230,
    setState: true,
  });
  const allMatchUps = (): any[] => tournamentEngine.allTournamentMatchUps().matchUps ?? [];
  const occupied = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side.participantId).length;

  // three double exits to begin with, then ordinary results to the end
  let byesReachedByAWinner = 0;
  for (let step = 0; step < 200; step++) {
    const next = allMatchUps().find((matchUp) => matchUp.matchUpStatus === TO_BE_PLAYED && occupied(matchUp) === 2);
    if (!next) break;
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: step < 3 ? { matchUpStatus: DOUBLE_DEFAULT } : { winningSide: 1 },
      matchUpId: next.matchUpId,
      drawId,
    });
    expect(result.success, `step ${step}`).toEqual(true);

    for (const matchUp of allMatchUps().filter((candidate) => candidate.matchUpStatus === BYE)) {
      if (occupied(matchUp) === 1) byesReachedByAWinner += 1;
      expect(arrivalsByResult(matchUp), `step ${step}`).toEqual([]);
    }
  }

  // CONTROL: participants did advance through BYEs, so the assertion above had something to refuse
  expect(byesReachedByAWinner).toBeGreaterThan(0);
  expect(scan(drawId).issueTypes).toEqual([]);
});

it('still records a BYE that arrived through a BYE', () => {
  const cell = MATRIX_CELLS.find(({ seed }) => seed === 337) as any;
  expect(playMatrixCell(cell, 'bye-through-bye')).toEqual(true);

  const meeting = (tournamentEngine.allTournamentMatchUps().matchUps ?? []).find(
    (matchUp: any) =>
      matchUp.structureName === 'Consolation' && matchUp.roundNumber === 5 && matchUp.roundPosition === 1,
  );
  expect(meeting.matchUpStatus).toEqual(BYE);
  expect(meeting.sideExitProvenance?.[2]).toMatchObject({ previousMatchUpStatus: BYE, matchUpStatus: BYE });
  // and beside it, the exit the other side carries
  expect(getExitSides({ matchUp: meeting })).toEqual([1]);
});

it('reports an arrival by result stamped on a BYE, and not a BYE that arrived through one', () => {
  setSubscriptions({});
  const drawId = 'stamped-bye';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: FIRST_MATCH_LOSER_CONSOLATION, participantsCount: 7, idPrefix: 'origin', drawSize: 8, drawId },
    ],
    nonRandom: 1,
    setState: true,
  });
  const bye = (tournamentEngine.allTournamentMatchUps().matchUps ?? []).find(
    (matchUp: any) => matchUp.structureName === 'Main' && matchUp.matchUpStatus === BYE,
  );
  // CONTROL: there is a BYE to stamp, and the draw is clean before anything is stamped on it
  expect(bye?.matchUpId).toBeDefined();
  expect(scan(drawId)).toEqual({ issueTypes: [], valid: true });

  stamp(drawId, bye.matchUpId, { 1: { matchUpStatus: BYE, previousMatchUpStatus: BYE, sourceMatchUpId: 'x' } });
  expect(scan(drawId)).toEqual({ issueTypes: [], valid: true });

  stamp(drawId, bye.matchUpId, {
    1: { matchUpStatus: COMPLETED, previousMatchUpStatus: COMPLETED, sourceMatchUpId: 'x' },
  });
  expect(scan(drawId)).toEqual({ issueTypes: [ORIGIN_ON_UNDECIDED_MATCHUP], valid: false });
});
