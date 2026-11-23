import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

/**
 * WHAT A CENSUS A1 WITHDRAWAL WRITES IS ANNOUNCED (#5599; NOTE 2026-10-18 "unannounced carry writes").
 *
 * Two of #5599's withdrawals rewrite a matchUp's side record that no state write in the same call rewrites, so nothing
 * announced it and a notice-driven save (a server projection, an embedding client) kept the stale record:
 *
 *  - `withdrawDisplacedCarry` takes a displaced carrier's carry from EVERY matchUp their seat reached; only the furthest
 *    is rewritten (as a BYE) and announced by that write.
 *  - `withdrawSharedByeClaims` takes a dissolved convergence's claim off a BYE others still hold.
 *
 * The scenarios are the census rows that pin each withdrawal (`aDisplacedCarrierLeavesNoCarryInAnyRound`,
 * `aDissolvedConvergenceLeavesASharedByeClaim`), played as they play them. Falsified without the announcements: the
 * named matchUp changes in the named call and is absent from its MODIFY_MATCHUP notices.
 */
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const stripped = ({ updatedAt: _updatedAt, ...rest }: any) => JSON.stringify(rest);
const storedAt = (drawId: string, at: string) =>
  stripped(
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: false })
      .matchUps.find((matchUp: any) => matchUp.matchUpId === matchUpIdAt(drawId, at)),
  );
const matchUpIdAt = (drawId: string, at: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === at)?.matchUpId;

afterEach(() => setSubscriptions({}));

/** play the row's steps as the census row does, and return what the call at `callIndex` announced and changed at `at` */
function announcedAt(row: any, drawId: string, callIndex: number, at: string) {
  setSubscriptions({});
  expect(prepareDraw(row.config, drawId, row.policyDefinitions ?? undefined)).toEqual(true);
  const steps = [...row.steps, row.probe];
  for (const [index, step] of steps.entries()) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const seated = (target?.sides ?? []).filter((side: any) => side?.participantId).length === 2;
    if (index < row.steps.length && !seated) continue;
    const observed = index === callIndex;
    const before = observed ? storedAt(drawId, at) : undefined;
    const announced: string[] = [];
    if (observed)
      setSubscriptions({
        subscriptions: {
          [MODIFY_MATCHUP]: (notices: any[]) => notices.forEach((notice) => announced.push(notice.matchUp?.matchUpId)),
        },
      });
    let result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: row.config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    // a step the row plays may be refused, as `observeMutation` lets it be; the observed call may not
    if (observed) expect(result.error, coordinate(step)).toBeUndefined();
    if (observed)
      return { changed: before !== storedAt(drawId, at), announced: announced.includes(matchUpIdAt(drawId, at)) };
  }
  throw new Error(`no call ${callIndex}`);
}

const DISPLACED = {
  config: { participantsCount: 31, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21079296 },
  policyDefinitions: null,
  probe: {
    structureName: 'East',
    roundNumber: 1,
    roundPosition: 9,
    outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
  },
  watch: ['Southeast|1|2'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 13, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 6,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 1,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 11,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 7,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 2,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 13,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'East', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 2, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 16, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 10, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 12, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 7,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 15,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
    { structureName: 'West', roundNumber: 1, roundPosition: 8, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
    },
  ],
};

const SHARED = {
  config: { participantsCount: 31, propagateExitStatus: true, drawSize: 32, drawType: 'COMPASS', seed: 21055187 },
  policyDefinitions: { progression: { doubleExitPropagateBye: false } },
  probe: { structureName: 'East', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
  watch: ['South|1|1', 'West|1|2'],
  steps: [
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 10,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 12, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 2, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 2,
      roundPosition: 1,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 5, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 9, outcome: { winningSide: 1 } },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
    },
    { structureName: 'East', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 13,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    { structureName: 'West', roundNumber: 1, roundPosition: 5, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 12,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 16, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 5,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 15, outcome: { winningSide: 2 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 14, outcome: { winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 15,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 9,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
    {
      structureName: 'West',
      roundNumber: 1,
      roundPosition: 3,
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
    },
    { structureName: 'East', roundNumber: 1, roundPosition: 7, outcome: { winningSide: 1 } },
    { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
    {
      structureName: 'East',
      roundNumber: 1,
      roundPosition: 4,
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
    },
  ],
};

it('a displaced carry withdrawn from a matchUp the BYE does not rewrite is announced', () => {
  // step 23, East|1|12's double walkover: its BYE takes the carrier's seat, and Southeast|1|2 loses the carry
  const { changed, announced } = announcedAt(DISPLACED, 'displacedCarryIsAnnounced', 23, 'Southeast|1|2');
  expect(changed).toBe(true); // CONTROL: the withdrawal wrote there in this call
  expect(announced).toBe(true);
});

it('a shared BYE claim withdrawn by a dissolved convergence is announced', () => {
  // step 29 clears East|1|4: the convergence it fed re-derives to a single exit, and South|1|1 loses its share of the claim
  const { changed, announced } = announcedAt(SHARED, 'sharedByeClaimIsAnnounced', 29, 'South|1|1');
  expect(changed).toBe(true); // CONTROL: the withdrawal wrote there in this call
  expect(announced).toBe(true);
});
