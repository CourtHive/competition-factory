import { getExitSides, isPropagatedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { ORIGIN_ON_UNDECIDED_MATCHUP } from '@Query/drawDefinition/getStructureInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, COMPLETED, WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

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
