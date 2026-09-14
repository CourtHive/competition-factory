import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A winner/loser swap must not put an ineligible participant into a FIRST_MATCH consolation.
 *
 * `allowChangePropagation` short-circuits `resolveAndApplyOutcome` to `swapWinnerLoser` BEFORE the
 * `activeDownstream` dispatch, so none of the refusals guarding a re-score apply to it. TMX's score
 * modal (`services/transitions/scoreMatchUp.ts`) sends that flag on every score, so this is the
 * production path, not a corner.
 *
 * `swapWinnerLoser` then swaps the two participants' assignments in EVERY subsequent structure:
 *
 *     if (existingLoserAssignment) existingLoserAssignment.participantId = existingWinnerParticipantId;
 *
 * — with no eligibility test. That is exactly the question its own header comment leaves open:
 * *"for FMLC 2nd round matchUps test whether it works if a first loss for both participants"*.
 *
 * FMLC's consolation is NOT a mirror of the main draw. Only a FIRST-MATCH loser enters it, which
 * `directLoser` enforces with `validForConsolation = linkCondition === FIRST_MATCHUP &&
 * getDrawPositionWinCount(...) === 0`, placing a BYE at the backdraw position when the loser does
 * not qualify. So when a winning side flips, the consolation feed does not swap — it can VANISH
 * (the new loser had already won a match) or APPEAR (they had not).
 *
 * MEASURED on the scenario below (seed 9000349):
 *
 *     Main|2|6  side 1  Sheldon Shelley   scoredWins=1   R1 Main|1|11 COMPLETED
 *               side 2  Leeloo Goldstein  scoredWins=0   R1 Main|1|12 BYE
 *
 * Leeloo's first match IS Main|2|6, so losing it feeds her to the consolation — correct. Flipping
 * the result makes SHELDON the loser, and his second loss does not feed. Reached the legitimate way
 * (clear the consolation result, correct, redo) the slot becomes a BYE and the opponent advances.
 * Reached through `allowChangePropagation`, Sheldon was written into the consolation instead — a
 * participant with a scored win, placed onto the losing side of a walkover played before he was
 * ever in that matchUp.
 *
 * `getDrawInconsistencies` rates both draws clean: `droppedProgressionForLink` only reports
 * eligible-but-ABSENT and has no ineligible-but-PRESENT counterpart. Hence this test asserts the
 * invariant directly rather than trusting the integrity scan.
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

function buildScenario(drawId: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 27, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
    nonRandom: 9000349,
    setState: true,
  });
  setSubscriptions({});
}

function play(drawId: string, step: any, allowChangePropagation?: boolean) {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const target = matchUps.find((matchUp: any) => coordinates(matchUp) === coordinates(step));
  // a step that matched nothing would make every assertion below vacuous
  expect(target, `no matchUp at ${coordinates(step)}`).toBeDefined();
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    outcome: step.outcome,
    drawId,
    ...(allowChangePropagation ? { allowChangePropagation: true } : {}),
  });
  return result?.error?.code;
}

/**
 * Every participant in a FIRST_MATCH consolation structure, with the scored wins they hold in the
 * MAIN structure. A consolation occupant with one or more is one the feed rule excludes.
 */
function ineligibleConsolationOccupants(drawId: string) {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const mainRoundOne = matchUps.filter((matchUp: any) => matchUp.structureName === 'Main' && matchUp.roundNumber === 1);
  const drawDefinition: any = tournamentEngine.getEvent({ drawId })?.drawDefinition;
  const consolation = (drawDefinition?.structures ?? []).find((s: any) => s.structureName === 'Consolation');

  const offenders: any[] = [];
  for (const assignment of consolation?.positionAssignments ?? []) {
    if (!assignment.participantId || assignment.bye) continue;
    // the participant's drawPosition in the MAIN structure is where their wins were accrued
    const mainAssignment = (drawDefinition.structures ?? [])
      .find((s: any) => s.structureName === 'Main')
      ?.positionAssignments?.find((a: any) => a.participantId === assignment.participantId);
    if (typeof mainAssignment?.drawPosition !== 'number') continue;
    const wins = getDrawPositionWinCount({
      sourceMatchUps: mainRoundOne as any,
      drawPosition: mainAssignment.drawPosition,
    });
    if (wins > 0) {
      offenders.push({
        participantId: assignment.participantId,
        consolationDrawPosition: assignment.drawPosition,
        wins,
      });
    }
  }
  return offenders;
}

/** the consolation matchUp the feed lands in, as a comparable string */
function consolationState(drawId: string, coordinate: string): string {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const matchUp: any = matchUps.find((candidate: any) => coordinates(candidate) === coordinate);
  const sides = (matchUp?.sides ?? [])
    .map((side: any) => `${side.sideNumber}:${side.bye ? 'BYE' : (side.participantId ?? '-')}`)
    .join(' ');
  return `[${matchUp?.matchUpStatus ?? '-'} ws=${matchUp?.winningSide ?? '-'}] ${sides}`;
}

const CLEAR_OUTCOME = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: 'TO_BE_PLAYED',
  winningSide: undefined,
};

const STEPS = {
  mainRoundOne: { structureName: 'Main', roundNumber: 1, roundPosition: 11, outcome: { winningSide: 2 } },
  feedTheLoser: {
    structureName: 'Main',
    roundNumber: 2,
    roundPosition: 6,
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1 },
  },
  playConsolation: {
    structureName: 'Consolation',
    roundNumber: 2,
    roundPosition: 6,
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
  },
  flipTheResult: {
    structureName: 'Main',
    roundNumber: 2,
    roundPosition: 6,
    outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
  },
};

it('the control: the scenario really does place an eligible first-match loser first', () => {
  const drawId = 'swap-control';
  buildScenario(drawId);
  expect(play(drawId, STEPS.mainRoundOne)).toBeUndefined();
  expect(play(drawId, STEPS.feedTheLoser)).toBeUndefined();

  // before any flip, the consolation holds only first-match losers — otherwise the assertion in the
  // test below would pass for the wrong reason
  expect(ineligibleConsolationOccupants(drawId)).toEqual([]);
});

it('a swap through allowChangePropagation does not place a participant the feed rule excludes', () => {
  const drawId = 'swap-acp';
  buildScenario(drawId);
  expect(play(drawId, STEPS.mainRoundOne)).toBeUndefined();
  expect(play(drawId, STEPS.feedTheLoser)).toBeUndefined();
  expect(play(drawId, STEPS.playConsolation)).toBeUndefined();

  // the production path: TMX sends allowChangePropagation on every score
  play(drawId, STEPS.flipTheResult, true);

  expect(ineligibleConsolationOccupants(drawId)).toEqual([]);
});

it('the override reaches the same state as the legitimate clear-and-redo sequence', () => {
  // The legitimate path: clear the consolation result, apply the correction, and let `directLoser`
  // decide the feed from the new facts.
  const legitimate = 'swap-legit';
  buildScenario(legitimate);
  play(legitimate, STEPS.mainRoundOne);
  play(legitimate, STEPS.feedTheLoser);
  play(legitimate, STEPS.playConsolation);
  play(legitimate, { ...STEPS.playConsolation, outcome: CLEAR_OUTCOME });
  expect(play(legitimate, STEPS.flipTheResult)).toBeUndefined();

  // Captured BEFORE the next scenario is generated: `setState: true` REPLACES the tournament
  // record, so a draw built first is no longer queryable once the second one exists — measured, as
  // an empty comparison string that would have compared two nothings.
  const legitimateState = consolationState(legitimate, 'Consolation|2|6');
  // the control: a comparison of two empty strings would pass while proving nothing
  expect(legitimateState).toContain('BYE');

  // The override path: `allowChangePropagation`, which never clears anything.
  const override = 'swap-override';
  buildScenario(override);
  play(override, STEPS.mainRoundOne);
  play(override, STEPS.feedTheLoser);
  play(override, STEPS.playConsolation);
  expect(play(override, STEPS.flipTheResult, true)).toBeUndefined();

  const coordinate = 'Consolation|2|6';
  expect(consolationState(override, coordinate)).toEqual(legitimateState);
  expect(tournamentEngine.getDrawInconsistencies({ drawId: override })?.inconsistencies ?? []).toEqual([]);
});
