import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { POLICY_SCORING_DEFAULT } from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { replayFailure } from '@Tests/testHarness/exitPropagation/sweep';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  AD_HOC,
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  OLYMPIC,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';

/**
 * S3: v2 OWNS THE FIRST DIRECTION (outcome v2 executor plan § 6 S3). Under `v2`, a result naming a winner whose complete
 * plan is the direction shape (`plan.ts`: the winner into the next matchUp of the same structure, and a loser, if any,
 * placed on a free seat across a link, carrying nothing) is written by v2 (`outcome/apply.ts`) and v1's writer is not
 * asked. Anything else in the direction family (an exit, a cascade, a link for the winner, settle work) abstains to v1.
 *
 * The claim is equality, as for the local write (`ownedLocalWrites.test.ts`): the same steps from the same record,
 * under a fixed clock, leave the same record, raise the same notices (payloads included, in order) and return the same
 * results under `v1` and `v2`. Ownership is asserted separately by counting v1's writer.
 */
const v1Writes = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
const won = (winningSide: 1 | 2) => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;
const cleared = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };
const walkover = (winningSide: 1 | 2) =>
  generateOutcomeFromScoreString({ matchUpStatus: WALKOVER, winningSide }).outcome;
const exited = (matchUpStatus: string, winningSide: 1 | 2) =>
  generateOutcomeFromScoreString({ matchUpStatus, winningSide }).outcome;
const retired = (winningSide: 1 | 2) =>
  generateOutcomeFromScoreString({ scoreString: '6-1 2-0', matchUpStatus: RETIRED, winningSide }).outcome;

// a round robin's matchUps have no roundPosition: `nth` picks the nth of the round in the structure instead
type Target = { structureName?: string; roundNumber: number; roundPosition?: number; nth?: number };
// `params`: further setMatchUpStatus arguments (a swap's `allowChangePropagation`)
type Step = { target: Target; outcome: Record<string, unknown>; params?: Record<string, unknown> };
// `setup`: steps played under v1 before the comparison starts, for a state the owned steps need but do not own;
// `policyDefinitions`: attached to the tournament before the setup
type Scenario = {
  drawProfile: Record<string, unknown>;
  steps: Step[];
  setup?: Step[];
  policyDefinitions?: Record<string, unknown>;
};

// `propagateExitStatus`: a WALKOVER or DEFAULTED follows its loser across the link (S5)
const CARRIED = { propagateExitStatus: true };
// a swap (`allowChangePropagation`, the other side winning), and one that carries the new loser's exit (S6 tail)
const SWAP = { allowChangePropagation: true };
const SWAP_CARRIED = { ...SWAP, ...CARRIED };
// a double exit's loser seat shows the exit it produced, not a BYE (USTA's policy; CA ruling (A), 2026-10-21)
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };

const R1 = (roundPosition: number, structureName?: string): Target => ({
  roundNumber: 1,
  roundPosition,
  structureName,
});

/** an 8-draw's Main round 1 played: its losers fill the consolation's first round (S6 tail, family 7) */
const MAIN_R1_8: Step[] = [1, 2, 3, 4].map((roundPosition) => ({ target: R1(roundPosition, 'Main'), outcome: won(1) }));

/** an 8-draw played to its final, which is then a double walkover (S6 tail, family 6) */
const FINAL_8 = (structureName?: string): Target => ({ roundNumber: 3, roundPosition: 1, structureName });
const TO_FINAL_8 = (structureName?: string): Step[] => [
  ...[1, 2, 3, 4].map((roundPosition) => ({ target: R1(roundPosition, structureName), outcome: won(1) })),
  ...[1, 2].map((roundPosition) => ({ target: { roundNumber: 2, roundPosition, structureName }, outcome: won(1) })),
  { target: FINAL_8(structureName), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
];

/** round 1 positions 1 and 2 both double exits: their produced exits converge in round 2 (S6 tail, family 4) */
const PAIRED = (first: string, second: string, structureName?: string): Step[] => [
  { target: R1(1, structureName), outcome: { matchUpStatus: first } },
  { target: R1(2, structureName), outcome: { matchUpStatus: second } },
];

/** Main 1/1 given `first`, then its winner played on in round 2: Main 1/1's downstream is active (`apply-values`) */
const PLAYED_ON = (first: Record<string, unknown>, params?: Record<string, unknown>): Step[] => [
  { target: R1(1, 'Main'), outcome: first, ...(params ? { params } : {}) },
  { target: R1(2, 'Main'), outcome: won(2) },
  { target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome: won(1) },
];

/** FIC 8 after `PLAYED_ON`: Main 2/2 played too, so Consolation 2/1 holds its fed seat beside the awardee of Main 1/1's
 * carry (who won Consolation 1/1 by it), and the awardee wins it: they have played on from the carry */
const AWARDEE_PLAYED_ON: Step[] = [
  { target: R1(3, 'Main'), outcome: won(1) },
  { target: R1(4, 'Main'), outcome: won(1) },
  { target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' }, outcome: won(1) },
  { target: { roundNumber: 2, roundPosition: 1, structureName: 'Consolation' }, outcome: won(2) },
];

const SCENARIOS: [string, Scenario][] = [
  // S6 tail, family 8: a final's double exit ENTERED produces nothing: the own write, and the own loser seat's BYE where
  // a link feeds one
  [
    'SINGLE_ELIMINATION: the final entered as a double walkover',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: TO_FINAL_8().slice(0, 6),
      steps: [{ target: FINAL_8(), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION 2: the one matchUp entered as a double default',
    {
      drawProfile: { drawSize: 2, drawType: SINGLE_ELIMINATION },
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: the Main final entered as a double walkover: its consolation seat takes a BYE',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: TO_FINAL_8('Main').slice(0, 6),
      steps: [{ target: FINAL_8('Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: the Main final entered as a double walkover (no loser link from the final)',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: TO_FINAL_8('Main').slice(0, 6),
      steps: [{ target: FINAL_8('Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  // S6 tail, family 7: a consolation double exit whose produced exit lands in a FEED round, pending beside the fed seat's
  // structural position (reserved on into the next round): the feed path written back, the reservation taken back
  [
    'FEED_IN_CHAMPIONSHIP: a consolation double walkover cleared, its produced exit pending in the feed round',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [...MAIN_R1_8, { target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Consolation'), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: a consolation double default cleared, its produced exit pending in the feed round',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [...MAIN_R1_8, { target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(2, 'Consolation'), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: a consolation double walkover cleared after the fed loser arrived beside its pending exit',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        ...MAIN_R1_8,
        { target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Consolation'), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION: a double walkover cleared whose awardee reached the final beside the other finalist',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2), outcome: won(1) },
        { target: R1(3), outcome: won(1) },
        { target: R1(4), outcome: won(1) },
        { target: { roundNumber: 2, roundPosition: 2 }, outcome: won(1) },
      ],
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 16: a consolation double walkover cleared, pending in the feed round, two feed rounds beyond',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((roundPosition) => ({ target: R1(roundPosition, 'Main'), outcome: won(1) })),
        { target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Consolation'), outcome: cleared }],
    },
  ],
  // S6 tail, family 6: a final's double exit, which produced nothing, cleared or given a winner: the own write, and the
  // own loser seat's BYE withdrawn where a link feeds one
  [
    'SINGLE_ELIMINATION: the final a double walkover, cleared',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: TO_FINAL_8(),
      steps: [{ target: FINAL_8(), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION: the final a double walkover, given a winner',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: TO_FINAL_8(),
      steps: [{ target: FINAL_8(), outcome: won(2) }],
    },
  ],
  [
    'SINGLE_ELIMINATION 2: the one matchUp a double default, cleared',
    {
      drawProfile: { drawSize: 2, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: the Main final a double walkover, cleared: its consolation seat BYE withdrawn',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: TO_FINAL_8('Main'),
      steps: [{ target: FINAL_8('Main'), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: the Main final a double walkover, given a winner: the loser on the freed seat',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: TO_FINAL_8('Main'),
      steps: [{ target: FINAL_8('Main'), outcome: won(2) }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: the Main final a double walkover, cleared (no loser link from the final)',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: TO_FINAL_8('Main'),
      steps: [{ target: FINAL_8('Main'), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 6 of 8: the Main final a double walkover, cleared: its consolation seat beside a BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 6, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: won(1) },
        ...[1, 2].map((roundPosition) => ({
          target: { roundNumber: 2, roundPosition, structureName: 'Main' },
          outcome: won(1),
        })),
        { target: FINAL_8('Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: FINAL_8('Main'), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: the Main final a double walkover, cleared under doubleExitPropagateBye false',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      setup: TO_FINAL_8('Main'),
      steps: [{ target: FINAL_8('Main'), outcome: cleared }],
    },
  ],
  // S6 tail, family 5: a double exit cleared whose produced exit was awarded to a participant who came through the paired
  // matchUp's BYE (the BYE-origin pair recorded opposite the exit): the awardee's position back out of the next round
  [
    'SINGLE_ELIMINATION 7 of 8: a double walkover beside the BYE cleared, its produced exit awarded through the BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(2), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 7 of 8: a double walkover beside the BYE cleared, awarded through the BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: cleared }],
    },
  ],
  [
    'DOUBLE_ELIMINATION 7 of 8: a double walkover beside the BYE cleared, awarded through the BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: cleared }],
    },
  ],
  // S6 tail, family 4 (a): a double exit cleared whose produced exit had converged with its paired matchUp's in the next
  // matchUp; the convergence is re-derived to the kept origin's pending exit and what it produced onward is taken back
  [
    'SINGLE_ELIMINATION: a double walkover cleared, its produced exit converged with the paired double walkover',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER),
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION: a double default cleared beside a double walkover: the convergence keeps the walkover',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: PAIRED(DOUBLE_DEFAULT, DOUBLE_WALKOVER),
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION: a double default cleared beside a double default (no score stored): the blank score written',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: PAIRED(DOUBLE_DEFAULT, DOUBLE_DEFAULT),
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION: a double walkover cleared beside a double default: the convergence keeps the default',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_DEFAULT),
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION 16: four double walkovers, the first cleared: two convergences re-derived, the final reset',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [
        ...PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER),
        { target: R1(3), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(4), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: a double walkover cleared, converged; the BYE behind the re-derived matchUp stands',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'FIRST_ROUND_LOSER_CONSOLATION 16: paired double walkovers cleared where the seat beyond their double BYE is taken',
    {
      drawProfile: { drawSize: 16, drawType: FIRST_ROUND_LOSER_CONSOLATION },
      setup: [
        { target: R1(3, 'Main'), outcome: won(1) },
        { target: R1(4, 'Main'), outcome: won(1) },
        { target: R1(2, 'Consolation'), outcome: won(1) },
        ...PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'DOUBLE_ELIMINATION: a double walkover cleared, converged, the Decider beyond the final',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION: a first-round winner goes on to round 2',
    { drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION }, steps: [{ target: R1(1), outcome: won(1) }] },
  ],
  [
    'SINGLE_ELIMINATION: the second winner fills the other seat of round 2',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [
        { target: R1(1), outcome: won(1) },
        { target: R1(2), outcome: won(2) },
      ],
    },
  ],
  [
    'SINGLE_ELIMINATION: the final, after both semifinals (nothing is directed)',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      steps: [
        { target: R1(1), outcome: won(1) },
        { target: R1(2), outcome: won(2) },
        { target: { roundNumber: 2, roundPosition: 1 }, outcome: won(1) },
      ],
    },
  ],
  [
    'ROUND_ROBIN: two results in one group, the second re-tallying the group (setParticipantResults)',
    {
      drawProfile: { drawSize: 8, drawType: ROUND_ROBIN },
      steps: [
        { target: { structureName: 'Group 1', roundNumber: 1, nth: 0 }, outcome: won(1) },
        { target: { structureName: 'Group 1', roundNumber: 1, nth: 1 }, outcome: won(2) },
      ],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a round 2 loser whose first match it was is fed to the consolation round 2',
    {
      // 7 of 8: drawPosition 2 holds the BYE, so the Main R2 loser from that half played their first match there
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      // its loser is placed opposite the consolation's BYE and goes on through it (a cascade, v1's)
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [
        { target: R1(3, 'Main'), outcome: won(1) },
        { target: R1(4, 'Main'), outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 }, outcome: won(2) },
      ],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a round 2 loser who has won is kept out, and a BYE takes their seat',
    {
      // the R2 loser won R1 (round position 2); no reservation stands, as R1 position 1 was a walkover, not a scored win
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 }, outcome: won(1) }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a round 2 loser who has won is kept out of a seat already reserved',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 }, outcome: won(2) }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a loser placed opposite a consolation BYE goes on through it',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      steps: [{ target: R1(2, 'Main'), outcome: won(1) }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION: a consolation winner whose next matchUp holds a reservation BYE goes on past it',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      // both Main R1 feeders of Main R2-1 decided: its consolation seat is reserved with a BYE
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Consolation'), outcome: won(1) }],
    },
  ],
  [
    'AD_HOC: two results in a one-round structure, each re-tallying it (assignments rebuilt from its matchUps)',
    {
      drawProfile: { drawSize: 8, drawType: AD_HOC, roundsCount: 1, automated: true },
      steps: [
        { target: { roundNumber: 1, nth: 0 }, outcome: won(1) },
        { target: { roundNumber: 1, nth: 1 }, outcome: won(2) },
      ],
    },
  ],
  [
    'LUCKY_DRAW: a result in a pre-feed round (an odd round) advances no one',
    {
      drawProfile: { drawSize: 6, drawType: LUCKY_DRAW },
      steps: [
        { target: R1(1), outcome: won(1) },
        { target: R1(2), outcome: won(2) },
      ],
    },
  ],
  [
    'SINGLE_ELIMINATION (S4): a new score beneath an active downstream keeps its winner (apply-values)',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(1), outcome: won(1) },
        { target: R1(2), outcome: won(2) },
        { target: { roundNumber: 2, roundPosition: 1 }, outcome: won(1) },
      ],
      steps: [
        { target: R1(1), outcome: generateOutcomeFromScoreString({ scoreString: '7-5 6-4', winningSide: 1 }).outcome },
      ],
    },
  ],
  [
    'SINGLE_ELIMINATION (S4): a cleared result takes its winner back out of the next matchUp (remove-directed)',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [
        {
          target: R1(1),
          outcome: { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } },
        },
      ],
    },
  ],
  [
    'SINGLE_ELIMINATION (S4): the same winner entered again, with a new score, re-directs nobody',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [
        { target: R1(1), outcome: generateOutcomeFromScoreString({ scoreString: '7-5 6-4', winningSide: 1 }).outcome },
      ],
    },
  ],
  [
    'SINGLE_ELIMINATION (S4): the same winner entered again with no score keeps the score it holds',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: { winningSide: 1 } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S4): the same winner entered again finds the loser in the Backdraw already',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [
        {
          target: R1(1, 'Main'),
          outcome: generateOutcomeFromScoreString({ scoreString: '6-3 6-3', winningSide: 1 }).outcome,
        },
      ],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S4): a cleared result takes its winner back and its loser out of the Backdraw',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S4): a result cleared with no status named leaves the Backdraw matchUp its codes',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' } } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S4): a cleared result takes its loser back out of the consolation',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: won(2) }],
      steps: [{ target: R1(2, 'Main'), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S4): a changed winner replaces the old one in the next matchUp',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: won(2) }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S4): a changed winner replaces the old one, and the new loser takes the Backdraw seat',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: won(2) }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S4): a changed winner naming its status re-derives the codes of the Backdraw matchUp',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: { ...won(2), matchUpStatus: COMPLETED } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S4): a swap exchanges the two positions in the next matchUp',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: won(2), params: { allowChangePropagation: true } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S4): a swap beneath a decided final relabels its path and keeps its result',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(1), outcome: won(1) },
        { target: R1(2), outcome: won(1) },
        { target: { roundNumber: 2, roundPosition: 1 }, outcome: won(1) },
      ],
      steps: [{ target: R1(1), outcome: won(2), params: { allowChangePropagation: true } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S4): a swap relabels the Backdraw seat, its played result kept',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: won(1) },
        { target: R1(4, 'Main'), outcome: won(1) },
        { target: R1(1, 'Backdraw'), outcome: won(1) },
        { target: R1(2, 'Backdraw'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(2), params: { allowChangePropagation: true } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S4): a swap relabels the consolation seat of the loser',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: won(2) }],
      steps: [{ target: R1(2, 'Main'), outcome: won(1), params: { allowChangePropagation: true } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S4): a Main round 3 result cleared, the draw holding FIRST_MATCHUP links',
    {
      drawProfile: { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: won(1) },
        { target: R1(4, 'Main'), outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 }, outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 }, outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 3, roundPosition: 1 }, outcome: won(1) },
      ],
      steps: [{ target: { structureName: 'Main', roundNumber: 3, roundPosition: 1 }, outcome: cleared }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S4): a Main round 3 result entered again, the draw holding FIRST_MATCHUP links',
    {
      drawProfile: { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: won(1) },
        { target: R1(4, 'Main'), outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 }, outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 }, outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 3, roundPosition: 1 }, outcome: won(1) },
      ],
      steps: [{ target: { structureName: 'Main', roundNumber: 3, roundPosition: 1 }, outcome: { winningSide: 1 } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S4): a swap in the consolation relabels nothing upstream in Main',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(1, 'Consolation'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Consolation'), outcome: won(2), params: { allowChangePropagation: true } }],
    },
  ],
  [
    'COMPASS (S4): a swap in West relabels the structures West feeds and leaves East as it is',
    {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      setup: [
        { target: R1(1, 'East'), outcome: won(1) },
        { target: R1(2, 'East'), outcome: won(1) },
        { target: R1(1, 'West'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'West'), outcome: won(2), params: { allowChangePropagation: true } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S4): a round 1 swap, eligibility unchanged, relabels the consolation seat',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(2), params: { allowChangePropagation: true } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S4): a round 2 swap between two who have won keeps both out of the consolation',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 }, outcome: won(1) },
      ],
      steps: [
        {
          target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 },
          outcome: won(2),
          params: { allowChangePropagation: true },
        },
      ],
    },
  ],
  [
    'DOUBLE_ELIMINATION: a Main first-round result sends the winner on and the loser into the Backdraw',
    { drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION }, steps: [{ target: R1(1, 'Main'), outcome: won(1) }] },
  ],
  [
    'SINGLE_ELIMINATION (S5): a first-round walkover sends its winner on, as a played result would',
    { drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION }, steps: [{ target: R1(1), outcome: walkover(2) }] },
  ],
  [
    'SINGLE_ELIMINATION (S5): a default into a round 2 the other winner already stands in',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(2), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: exited(DEFAULTED, 1) }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): under propagateExitStatus a walkover with no loser link carries nothing',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [{ target: R1(1), outcome: walkover(1), params: { propagateExitStatus: true } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a default with propagation off sends its loser plainly into the consolation',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 2) }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a retirement under propagateExitStatus, which carries no retirement, is directed as played',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(1, 'Main'), outcome: retired(1), params: { propagateExitStatus: true } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a walkover carried into the consolation is awarded to the seat nobody has reached',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a carried walkover whose carrier lands on side 2 awards side 1',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a carried default writes no score where it lands',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 2), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a retirement the policy propagates is carried as a walkover',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(1, 'Main'), outcome: retired(1), params: { ...CARRIED, propagateRetirementAsExit: true } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S5): a first-round walkover is carried into the consolation',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a walkover carried onto a seat opposite a participant sends them on (RULE 3)',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a default carried opposite a participant in a 16 draw sends them on (RULE 3)',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S5): a carried walkover opposite a participant sends them on (RULE 3)',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a walkover carried past a consolation BYE is recorded beside it and lands beyond (RULE 1)',
    {
      drawProfile: { drawSize: 8, participantsCount: 6, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a carry past a BYE on side 1 lands on side 2 beyond it (RULE 1)',
    {
      drawProfile: { drawSize: 16, participantsCount: 12, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(5, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a default carried past a consolation BYE (RULE 1)',
    {
      drawProfile: { drawSize: 16, participantsCount: 12, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(4, 'Main'), outcome: exited(DEFAULTED, 2), params: CARRIED }],
    },
  ],
  [
    'COMPASS (S5): a carried walkover goes on level by level, East to West to South',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      steps: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS (S5): a default carried through four structures of a 16 draw',
    {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      steps: [{ target: R1(3, 'East'), outcome: exited(DEFAULTED, 2), params: CARRIED }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S5): a double walkover: both consolation seats BYEs, the advanced position goes on twice',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S5): a double default in a 16 draw',
    {
      drawProfile: { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      steps: [{ target: R1(6, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'COMPASS (S5): a carried walkover meets a BYE a level down, in South, and lands beyond it',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: COMPASS },
      steps: [{ target: R1(3, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS (S5): a carried default past a BYE two levels down',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: COMPASS },
      steps: [{ target: R1(4, 'East'), outcome: exited(DEFAULTED, 2), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC (S5): a carried walkover past a BYE in North',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: OLYMPIC },
      steps: [{ target: R1(3, 'East'), outcome: walkover(2), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC (S5): a carried walkover goes on from East to West to the next level',
    {
      drawProfile: { drawSize: 16, drawType: OLYMPIC },
      steps: [{ target: R1(2, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): a double walkover produces a pending walkover in round 2',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): a double default produces a pending default on the side it feeds',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      steps: [{ target: R1(4), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): a double default entered with a score object keeps it on its own matchUp alone',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [
        {
          target: R1(1),
          outcome: { matchUpStatus: DOUBLE_DEFAULT, score: { sets: [], scoreStringSide1: '', scoreStringSide2: '' } },
        },
      ],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a consolation double exit lands pending beside a fed seat, whose position goes ahead',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a consolation double default beside a fed seat in a 16 draw',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(2) },
      ],
      steps: [{ target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a carried walkover meets one standing there: a double walkover, which produces on',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): two carried defaults converge into a double default',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a carried walkover meeting a default makes a double walkover, its score blanked',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a double exit leaves BYEs on the seats nobody can fill, and a position goes through',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a double default in a 16 draw, its two loser seats BYEs',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S5): a double walkover with both rounds linking their losers on',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): a double walkover awards its produced walkover to the winner already there, who goes on',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(2), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): a double default awards its produced default on side 1, the opponent there going on',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(3), outcome: won(2) }],
      steps: [{ target: R1(4), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a double walkover beside a played result: the winner there goes on, the loser through a BYE',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S5): a double default awarded to the winner beside it, both rounds linking their losers on',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(3, 'Main'), outcome: won(2) }],
      steps: [{ target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S5): a double walkover awarded to the winner beside it, its loser seat a BYE in the Backdraw',
    {
      drawProfile: { drawSize: 16, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(1, 'Main'), outcome: won(2) }],
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): a second double walkover converges round 2 into a double walkover, which produces on',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a second double walkover converges, its loser seat a double BYE, the next loser seat a BYE',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S5): two double defaults converge, each loser seat in the Backdraw a BYE',
    {
      drawProfile: { drawSize: 16, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): two double defaults converge into a double default in a 16 draw',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(4), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(3), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S5): a double walkover meeting a produced default converges to a double walkover',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(2), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'ROUND_ROBIN (S5): a double walkover in a group, re-tallying it, sends nobody on',
    {
      drawProfile: { drawSize: 8, drawType: ROUND_ROBIN },
      setup: [{ target: { structureName: 'Group 1', roundNumber: 1, nth: 1 }, outcome: won(1) }],
      steps: [
        { target: { structureName: 'Group 1', roundNumber: 2, nth: 0 }, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
    },
  ],
  [
    'ROUND_ROBIN (S5): a double default in a group of a 16 draw',
    {
      drawProfile: { drawSize: 16, drawType: ROUND_ROBIN },
      steps: [
        { target: { structureName: 'Group 2', roundNumber: 2, nth: 0 }, outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      ],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5): a double walkover beside a BYE: the consolation BYE goes on, and the fed seat through it',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S5): a double default beside a BYE, a double BYE in the Backdraw',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: DOUBLE_ELIMINATION },
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'COMPASS (S5): a double walkover in a 16 draw: its BYEs go on West to South to Southeast, and North to Northwest',
    {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      steps: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'OLYMPIC (S5): a double default in a 16 draw, each BYE sending the position opposite on and a BYE a level down',
    {
      drawProfile: { drawSize: 16, drawType: OLYMPIC },
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S5): a double walkover in a 32 draw',
    {
      drawProfile: { drawSize: 32, drawType: CURTIS_CONSOLATION },
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS (S5, doubleExitPropagateBye off): West takes the walkover, and its loser seat in South a BYE',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'OLYMPIC (S5, doubleExitPropagateBye off): West takes the default in a 16 draw, the BYE beyond it going on',
    {
      drawProfile: { drawSize: 16, drawType: OLYMPIC },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'COMPASS (S5, doubleExitPropagateBye off): a double walkover in a 32 draw',
    {
      drawProfile: { drawSize: 32, drawType: COMPASS },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(5, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5, doubleExitPropagateBye off): beside a consolation BYE the walkover is recorded and carried on',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS (S5, doubleExitPropagateBye off): beside a BYE in West the walkover goes on into West round 2',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: COMPASS },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S5, doubleExitPropagateBye off): a double default beside a Backdraw BYE',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5, doubleExitPropagateBye off): a double default produces a default in the consolation',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S5, doubleExitPropagateBye off): the Backdraw matchUp takes the produced walkover',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S5, doubleExitPropagateBye off): the produced walkover awarded to the winner already there',
    {
      drawProfile: { drawSize: 16, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S5, doubleExitPropagateBye off): the consolation default awarded to the loser standing there',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(4, 'Main'), outcome: won(2) }],
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S5, doubleExitPropagateBye off): a double default in a 16 draw produces a Backdraw default',
    {
      drawProfile: { drawSize: 16, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a cleared double walkover takes back its pending walkover, and its path to the final',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a cleared double default in a 32 draw, four matchUps on its path',
    {
      drawProfile: { drawSize: 32, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(6), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(6), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a cleared double walkover beside results the unwind does not reach',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(5), outcome: won(1) },
        { target: R1(6), outcome: won(2) },
        { target: R1(2), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(2), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a cleared double walkover withdraws the BYEs its loser seats took, and what they advanced',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S6): a cleared double walkover, the Play Off its path reaches announced and stamped',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a cleared double walkover whose walkover was awarded takes the award and its advance back',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(2), outcome: won(1) },
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): the same, the winner beside it arriving after the double walkover',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2), outcome: won(2) },
      ],
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a cleared double default whose default was awarded, beside loser links',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(4, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      ],
      steps: [{ target: R1(3, 'Main'), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a cleared walkover takes its winner back out of round 2, and its codes with it',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: { ...walkover(1), matchUpStatusCodes: ['W1'] } }],
      steps: [{ target: R1(1), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a cleared default takes its loser back out of the consolation seat its link fed',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: exited(DEFAULTED, 2) }],
      steps: [{ target: R1(2, 'Main'), outcome: cleared }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6): a cleared retirement blanks its score and takes back both directions',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(3, 'Main'), outcome: retired(1) }],
      steps: [{ target: R1(3, 'Main'), outcome: cleared }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a walkover relabelled a default for the same winner rewrites its status alone',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: walkover(1) }],
      steps: [{ target: R1(1), outcome: exited(DEFAULTED, 1) }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a walkover carried nowhere (no loser link) re-entered under propagateExitStatus',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(2), outcome: walkover(2), params: CARRIED }],
      steps: [{ target: R1(2), outcome: walkover(2), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a played result relabelled a walkover for the other side, both directions remade',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2) }],
    },
  ],
  [
    'COMPASS (S6): a default replaced by a played result for the same winner, its score written',
    {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: exited(DEFAULTED, 1) }],
      steps: [{ target: R1(1, 'East'), outcome: won(1) }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6): a default relabelled a retirement, its partial score written',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1) }],
      steps: [{ target: R1(1, 'Main'), outcome: retired(1) }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a double walkover given a winner unwinds its path, then the winner goes on',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1), outcome: walkover(1) }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a double default replaced by a played result in a 32 draw, beside a played matchUp',
    {
      drawProfile: { drawSize: 32, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(3), outcome: won(1) },
        { target: R1(6), outcome: { matchUpStatus: DOUBLE_DEFAULT } },
      ],
      steps: [{ target: R1(6), outcome: won(2) }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a double walkover given a winner withdraws its BYEs, the loser placed on their seat',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1) }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a double default replaced by a played result for side 2, beside loser links',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(3, 'Main'), outcome: won(2) }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S6): a double walkover given a winner, the loser placed where its BYE stood',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2) }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a double walkover asked for again is satisfied, nothing written',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a double default asked for again with a blank score, nothing written',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(3), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(3), outcome: { matchUpStatus: DOUBLE_DEFAULT, score: cleared.score } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a double walkover beside loser links asked for again, its BYEs left standing',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a double walkover whose walkover was awarded on, asked for again',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(2), outcome: won(1) },
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a played result turned into a double walkover, its winner taken back, its score blanked',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a walkover turned into a double walkover',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: walkover(2) }],
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6): a played result turned into a double default keeps its score',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(3), outcome: won(2) }],
      steps: [{ target: R1(3), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a played result turned into a double default, its loser taken back and BYEs placed',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a played result relabelled a walkover, the carry landing on its loser where they stand',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a played result relabelled a default for the same winner, the default carried',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(3, 'Main'), outcome: won(2) }],
      steps: [{ target: R1(3, 'Main'), outcome: exited(DEFAULTED, 2), params: CARRIED }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S6): a played result relabelled a walkover, its loser carrying it in Consolation 1',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a carried walkover relabelled a played result, the carry withdrawn off its loser',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: won(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a carried default relabelled a played result for side 2, its scoredTime taken',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(3, 'Main'), outcome: exited(DEFAULTED, 2), params: CARRIED }],
      steps: [{ target: R1(3, 'Main'), outcome: won(2), params: CARRIED }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S6): a carried walkover relabelled a played result in Main, Consolation 1 to be played again',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(2, 'Main'), outcome: won(1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC (S6): a double walkover in a 32 draw whose BYEs meet a BYE a level down, a double BYE there too',
    {
      drawProfile: { drawSize: 32, participantsCount: 28, drawType: OLYMPIC },
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS (S6): a double walkover with one BYE in the draw, a double BYE a level down awaiting its other feeder',
    {
      drawProfile: { drawSize: 32, participantsCount: 31, drawType: COMPASS },
      steps: [{ target: R1(5, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'OLYMPIC (S6): a double default in a 16 draw with one BYE, a double BYE a level down before its feeder plays',
    {
      drawProfile: { drawSize: 16, participantsCount: 15, drawType: OLYMPIC },
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6): a double walkover beside a BYE, its unfillable fed seat opposite a winner who goes on',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S6): a double walkover whose unfillable Backdraw seat stands opposite a winner',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: DOUBLE_ELIMINATION },
      setup: [
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S6): a second double walkover, the position its BYE sends on passing through a Backdraw BYE',
    {
      drawProfile: { drawSize: 16, drawType: DOUBLE_ELIMINATION },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(4, 'Main'), outcome: won(1) },
        { target: R1(5, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(6, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6): a double walkover whose two Consolation BYEs meet, a double BYE in round 2',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6): the same for a double default in a 16 draw with four BYEs',
    {
      drawProfile: { drawSize: 16, participantsCount: 12, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'COMPASS (S6): a double walkover in an 8 draw whose chain ends in a double BYE in a final, stamped there',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: COMPASS },
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'OLYMPIC (S6): the same for a double default in an 8 draw',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: OLYMPIC },
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  [
    'OLYMPIC (S6): a double walkover whose double BYE goes on through a BYE it had passed, a third BYE in a row',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: OLYMPIC },
      steps: [{ target: R1(5, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  // S6 tail, the given-winner unwind beside links that are not plain loser links: a WINNER link out of the structure
  // (DOUBLE_ELIMINATION's Main to its Decider) and a FIRST_MATCHUP loser link the double exit placed its BYE behind
  [
    'DOUBLE_ELIMINATION (S6 tail): a double walkover given a winner, the unwind the plain one beside the WINNER link to the Decider',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: won(1) }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S6 tail): a double default given a walkover for side 2, the Backdraw seats back and the loser placed',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(3, 'Main'), outcome: walkover(2) }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S6 tail): a double walkover cleared beside the WINNER link to the Decider',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: TO_BE_PLAYED } }],
    },
  ],
  // S6 tail, the given-winner unwind behind a FIRST_MATCHUP link, and a withdrawn BYE whose onward matchUp it leaves empty
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6 tail): a double default given a walkover, its own BYE withdrawn and the matchUp it had advanced into released',
    {
      drawProfile: { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1) }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6 tail): a double walkover given a winner, the unfillable BYE behind FIRST_MATCHUP withdrawn and its double BYE unmade two rounds on',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: won(1) }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6 tail): a double walkover cleared, both BYEs withdrawn and the consolation written back',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: TO_BE_PLAYED } }],
    },
  ],
  [
    'FIRST_ROUND_LOSER_CONSOLATION (S6 tail): a double walkover cleared, the matchUp its withdrawn BYE had advanced into released',
    {
      drawProfile: { drawSize: 16, drawType: FIRST_ROUND_LOSER_CONSOLATION },
      setup: [{ target: R1(5, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(5, 'Main'), outcome: { matchUpStatus: TO_BE_PLAYED } }],
    },
  ],
  [
    'FIRST_ROUND_LOSER_CONSOLATION (S6 tail): a double walkover given a winner, the matchUp its BYE had advanced into released',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_ROUND_LOSER_CONSOLATION },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: won(2) }],
    },
  ],
  // S6 tail, the relabels where the winner already stands: the carry follows the label where the loser stands
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover relabelled a default for the same winner, the carry rewritten where it stands',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover entered again for the same winner leaves the carry as it is',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a played result relabelled a walkover beneath an active downstream, the carry landing on its loser and the opponent sent on',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(won(1)),
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a played result relabelled a default beneath an active downstream, the loser alone in the consolation',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(won(1)),
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover relabelled a played result beneath an active downstream, the awardee released',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(walkover(1), CARRIED),
      steps: [{ target: R1(1, 'Main'), outcome: won(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried default relabelled a played result beneath an active downstream, nobody awarded yet',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(exited(DEFAULTED, 1), CARRIED),
      steps: [{ target: R1(1, 'Main'), outcome: won(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover relabelled a default beneath an active downstream, the carry rewritten where it stands',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(walkover(1), CARRIED),
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover entered again beneath an active downstream writes the matchUp alone',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(walkover(1), CARRIED),
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a played result relabelled a walkover beneath an active downstream with no propagation, the write alone',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(won(1)),
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1) }],
    },
  ],
  [
    'SINGLE_ELIMINATION (S6 tail): a played result relabelled a retirement beneath an active downstream, no loser link',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: PLAYED_ON(won(2)),
      steps: [{ target: R1(1, 'Main'), outcome: exited(RETIRED, 2), params: CARRIED }],
    },
  ],
  // ...and swapped to the other side: the carry follows the label onto the seat the old loser held, now the new loser's
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover swapped to the other side leaves the carry on the relabelled seat',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED },
        { target: R1(2, 'Main'), outcome: won(2) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2), params: SWAP_CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover swapped to the other side beneath an active downstream, the path relabelled two rounds on',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: PLAYED_ON(walkover(1), CARRIED),
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2), params: SWAP_CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a played result swapped to a walkover for the other side, the new loser carrying it',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: won(1) },
        { target: R1(2, 'Main'), outcome: won(2) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2), params: SWAP_CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a carried walkover swapped to a default for the other side, the carry rewritten where it stands',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED },
        { target: R1(2, 'Main'), outcome: won(2) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 2), params: SWAP_CARRIED }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail): a walkover swapped to the other side with no propagation, the relabel and the write alone',
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: walkover(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2), params: SWAP }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S6 tail): a played result swapped to a default for the other side, carried into Consolation 1',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(2, 'Main'), outcome: exited(DEFAULTED, 2), params: SWAP_CARRIED }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S6 tail): a played result relabelled a walkover beneath an active downstream, carried into Consolation 1',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      setup: PLAYED_ON(won(1)),
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  // S6 tail, `doubleExitPropagateBye: false`: the double exit's loser seat held its carried exit, not a BYE, so v1's
  // unwind visits that matchUp and walks on from it over winner and loser links alike, writing each matchUp back
  [
    'DOUBLE_ELIMINATION (S6 tail, policy off): a double walkover cleared, the Backdraw matchUp holding its carry and the Backdraw path written back',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S6 tail, policy off): a double walkover cleared once the carry was won, the awardee taken back out of Backdraw round 2',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      setup: [
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'CURTIS_CONSOLATION (S6 tail, policy off): a double walkover cleared, the consolation path written back across its winner link',
    {
      drawProfile: { drawSize: 16, drawType: CURTIS_CONSOLATION },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6 tail, policy off): a double walkover cleared once the carry was won, the awardee back out of two consolation rounds and the BYE behind FIRST_MATCHUP withdrawn',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      policyDefinitions: POLICY_OFF,
      setup: [
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2, 'Main'), outcome: won(1) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP (S6 tail, policy off): a double walkover cleared, the consolation path written back',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION (S6 tail, policy off): a double walkover given a winner, the loser placed on the seat the unwind wrote back',
    {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: won(1) }],
    },
  ],
  [
    'DOUBLE_ELIMINATION (S6 tail, policy off): a double walkover given a winner, the loser placed in the Backdraw matchUp the unwind wrote back',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: won(1) }],
    },
  ],
  [
    'COMPASS 8/5 (S6 tail, the BYE passage): the carrier passes the West BYE into the West final, a BYE too: the carry recorded beside both, and it stops',
    {
      drawProfile: { drawSize: 8, participantsCount: 5, drawType: COMPASS },
      steps: [{ target: R1(3, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16/10 (S6 tail, the BYE passage): past two BYE-held matchUps into a clean one, where the walkover lands',
    {
      drawProfile: { drawSize: 16, participantsCount: 10, drawType: COMPASS },
      steps: [{ target: R1(2, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16/10 (S6 tail, the BYE passage): a DEFAULTED carried through the passage',
    {
      drawProfile: { drawSize: 16, participantsCount: 10, drawType: COMPASS },
      steps: [{ target: R1(2, 'East'), outcome: exited(DEFAULTED, 2), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16/10 (S6 tail, the BYE passage): a retirement the policy propagates, carried through the passage as a walkover',
    {
      drawProfile: { drawSize: 16, participantsCount: 10, drawType: COMPASS },
      steps: [{ target: R1(2, 'East'), outcome: retired(1), params: { ...CARRIED, propagateRetirementAsExit: true } }],
    },
  ],
  [
    'COMPASS 32/18 (S6 tail, the BYE passage): three BYE-held matchUps passed, then a clean landing',
    {
      drawProfile: { drawSize: 32, participantsCount: 18, drawType: COMPASS },
      steps: [{ target: R1(13, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16/9 (S6 tail, the BYE passage): three BYE-held matchUps passed to the last round of its structure',
    {
      drawProfile: { drawSize: 16, participantsCount: 9, drawType: COMPASS },
      steps: [{ target: R1(7, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16/11 (S6 tail, the BYE passage): a one-round structure at a deeper level holds a BYE: recorded beside it, the carry stops',
    {
      drawProfile: { drawSize: 16, participantsCount: 11, drawType: COMPASS },
      steps: [{ target: R1(5, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16/13 (S6 tail, the BYE passage): a passage at a deeper level through two BYEs to its last round',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: COMPASS },
      steps: [{ target: R1(5, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 32/26 (S6 tail, the BYE passage): a passage at a deeper level into a clean matchUp, where the walkover lands',
    {
      drawProfile: { drawSize: 32, participantsCount: 26, drawType: COMPASS },
      steps: [{ target: R1(13, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 32/25 (S6 tail, the BYE passage): a passage at a deeper level through three BYEs',
    {
      drawProfile: { drawSize: 32, participantsCount: 25, drawType: COMPASS },
      steps: [{ target: R1(13, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC 8/7 (S6 tail, the BYE passage): a one-round structure at the second level holds a BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: OLYMPIC },
      steps: [{ target: R1(3, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC 16/10 (S6 tail, the BYE passage): past two BYE-held matchUps into a clean one',
    {
      drawProfile: { drawSize: 16, participantsCount: 10, drawType: OLYMPIC },
      steps: [{ target: R1(2, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC 32/26 (S6 tail, the BYE passage): a passage at a deeper level into a clean matchUp',
    {
      drawProfile: { drawSize: 32, participantsCount: 26, drawType: OLYMPIC },
      steps: [{ target: R1(13, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 8 (S6 tail, a deeper convergence): two carries meet in the South final, a double walkover that produces nothing',
    {
      drawProfile: { drawSize: 8, participantsCount: 8, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(3, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 8 (S6 tail, a deeper convergence): the carrier arrives on side 1 of the South final',
    {
      drawProfile: { drawSize: 8, participantsCount: 8, drawType: COMPASS },
      setup: [{ target: R1(3, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 8 (S6 tail, a deeper convergence): a default meeting a walkover converges as a double walkover',
    {
      drawProfile: { drawSize: 8, participantsCount: 8, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(3, 'East'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC 16 (S6 tail, a deeper convergence): the double walkover produces its walkover into the next round',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: OLYMPIC },
      setup: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(3, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC 16 (S6 tail, a deeper convergence): two defaults converge as a double default, which produces a default',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: OLYMPIC },
      setup: [{ target: R1(3, 'East'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
      steps: [{ target: R1(1, 'East'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ],
];

// both first-round feeders of Main round 2 decided: its loser will have won, so FIRST_MATCHUP keeps them out of the
// consolation and the seat they would have taken is reserved with a BYE as the second winner arrives
const FMLC_RESERVATION: Scenario = {
  drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
  steps: [
    { target: R1(1, 'Main'), outcome: won(1) },
    { target: R1(2, 'Main'), outcome: won(2) },
  ],
};

function findTarget(target: Target): string {
  const matchUps = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
  const candidates = matchUps.filter(
    (matchUp: any) =>
      matchUp.roundNumber === target.roundNumber &&
      (target.roundPosition === undefined || matchUp.roundPosition === target.roundPosition) &&
      (!target.structureName || matchUp.structureName === target.structureName),
  );
  return candidates[target.nth ?? 0].matchUpId;
}

/** the steps from a fresh record, every topic subscribed and the clock fixed */
function play(
  mode: OutcomePipelineMode,
  { drawProfile, steps, setup = [], policyDefinitions }: Scenario,
  { realClock }: { realClock?: boolean } = {},
) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock(realClock ? undefined : '2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  if (policyDefinitions) tournamentEngine.attachPolicies({ policyDefinitions });
  for (const { target, outcome, params } of setup) {
    const result = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: findTarget(target),
      outcome,
      ...params,
    });
    if (!result.success) throw new Error(`setup step failed: ${JSON.stringify(target)}`);
  }
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      // the differential plans the stored topics, not the in-context one (a notice v2 defers to its apply), and compares
      // what is subscribed: the real-clock arm asks only what it can compare
      (realClock ? TOPICS.filter((topic) => topic !== UPDATE_INCONTEXT_MATCHUP) : TOPICS).map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((p) => notices.push(`${topic} ${canonicalJson(p)}`)),
      ]),
    ),
  });
  // the targets are found before the pipeline is set, so finding them is not part of what is compared
  const matchUpIds = steps.map(({ target }) => findTarget(target));
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  const results = steps.map(({ outcome, params }, i) => {
    if (!realClock) setClock(`2026-10-25T00:0${i + 1}:00.000Z`);
    return tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: matchUpIds[i], outcome, ...params });
  });
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    v1Writes: v1Writes.count,
    notices,
    results: results.map(({ stack: _stack, ...result }: any) => result),
  };
}

describe('under v2, the first direction is v2s, and leaves exactly what v1 leaves', () => {
  it.each(SCENARIOS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    // CONTROL: v1 wrote through its own writer, and each step succeeded (a carried exit writes the matchUp it lands in
    // through the same writer, nested, so a step can count more than once)
    expect(v1.v1Writes).toBeGreaterThanOrEqual(scenario.steps.length);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);

    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

// The fixed clock gives every stamp one value, so a stamp the plan's ops leave out can still read equal: v2's apply
// announces the matchUp, and the notice stamps its structure. Under `differential` the shadow applies the ops alone,
// against v1's record, at real instants: a missing stamp op diverges there (S6 slice 10 met one)
describe('under differential with a real clock, every owned scenario compares whole', () => {
  it.each(SCENARIOS)('%s', (_label, scenario) => {
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, { realClock: true });
    expect(compared.results.every((result: any) => result.success)).toEqual(true);
  });
});

describe('under v2, a FIRST_MATCHUP reservation is v2s', () => {
  it('FIRST_MATCH_LOSER_CONSOLATION: the second winner into Main round 2 reserves its loser seat with a BYE', () => {
    const v1 = play(OUTCOME_PIPELINE_V1, FMLC_RESERVATION);
    // CONTROL: v1 reserved the seat, so the scenario exercises the reservation
    const reserved = JSON.parse(v1.record)
      .events[0].drawDefinitions[0].structures.find((structure: any) => structure.structureName === 'Consolation')
      .positionAssignments.filter((assignment: any) => assignment.bye && assignment.byeFromPropagation);
    expect(reserved.length).toEqual(1);

    const v2 = play(OUTCOME_PIPELINE_V2, FMLC_RESERVATION);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('under v2, an exit v2 does not plan is v1s, whole', () => {
  it('F9: a carry that would reach v1s bound is v1s, which refuses there; v2 never plans the bound', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      steps: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
    };
    const saved = SETTLE_PASS_LIMITS.exitLevels;
    SETTLE_PASS_LIMITS.exitLevels = 1;
    try {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      // CONTROL: East's carry goes West then South, two levels, so a bound of one stops it
      expect(v1.results[0].error?.code).toEqual(SETTLE_BOUND_REACHED.code);
      expect(v2.v1Writes).toBeGreaterThan(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
    } finally {
      SETTLE_PASS_LIMITS.exitLevels = saved;
    }
  });

  it('F9 (S6 tail): a BYE passage costs v1 one iteration per BYE passed, so a carry within the levels can still reach the bound', () => {
    // COMPASS 16/13: East 1/5's carry lands in West (one iteration), then passes two BYE-held matchUps in South (two more)
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: COMPASS },
      steps: [{ target: R1(5, 'East'), outcome: walkover(1), params: CARRIED }],
    };
    const saved = SETTLE_PASS_LIMITS.exitLevels;
    SETTLE_PASS_LIMITS.exitLevels = 2;
    try {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      // CONTROL: v1 refuses at the bound
      expect(v1.results[0].error?.code).toEqual(SETTLE_BOUND_REACHED.code);
      expect(v2.v1Writes).toBeGreaterThan(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
    } finally {
      SETTLE_PASS_LIMITS.exitLevels = saved;
    }
  });

  it('S6 tail: two carries converging in a matchUp that links its own loser on is v1s (the double exit seats a BYE there)', () => {
    // COMPASS 8: East 1/1's and 1/2's carries meet in West 1/1, whose loser seat in South then takes a BYE and the first
    // carrier leaves it (the BYE chain)
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(2, 'East'), outcome: walkover(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6 tail: a loser who carries nothing, placed opposite a BYE with BYE-held matchUps beyond, is v1s', () => {
    // COMPASS 16/10: a retirement the policy does not propagate is directed as played; its loser goes on through two BYEs
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, participantsCount: 10, drawType: COMPASS },
      steps: [{ target: R1(2, 'East'), outcome: retired(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6 tail: a double walkover under policy off cleared while another double exit holds a BYE on its consolation path is v1s', () => {
    // FEED_IN_CHAMPIONSHIP 8: Main 1/3's double walkover leaves Main 2/2 nobody for a loser, so Consolation 2/1 (where
    // Main 1/1's carry would send its awardee on) holds a propagated BYE that is not this unwind's: the branch stops there
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      setup: [
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6 tail: an OLYMPIC census replay under policy off (20779675) compares whole, a cleared double default whose branch meets a result', () => {
    // census (`aCarrierComesHomeWithOnlyTheirOwnCarry`): East 1/9's double default carries into West, where its awardee
    // plays on (West 1/6) before the double default is cleared; the branch's walk meets that result and stops (v1's)
    const at = (key: string, outcome: any) => {
      const [structureName, roundNumber, roundPosition] = key.split('|');
      return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
    };
    const config = {
      drawType: OLYMPIC,
      propagateExitStatus: true,
      participantsCount: 29,
      drawSize: 32,
      seed: 20779675,
    };
    const schedule = [
      at('East|1|10', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|11', { winningSide: 1 }),
      at('East|1|9', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|12', { winningSide: 1 }),
      at('East|1|14', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('West|1|6', { winningSide: 2 }),
      at('East|1|9', cleared),
    ];
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    expect(replayFailure(config, schedule, 'olympic-policy-off-differential-2', POLICY_OFF)).toBeNull();
  });

  it('S6 tail: an OLYMPIC census replay under policy off (20609643) compares whole, the branch stopping at a standing BYE', () => {
    // census S8 policy-off, OLYMPIC 32/30 (`aPendingExitAwaitingAnArrivalCanDeliver`): West's carries reach South,
    // where a BYE stands behind the branch's own loser link; the branch walks that link and stops there (v1's). Dropping
    // the stop plans a branch that writes less than v1
    const at = (key: string, outcome: any) => {
      const [structureName, roundNumber, roundPosition] = key.split('|');
      return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
    };
    const config = {
      drawType: OLYMPIC,
      propagateExitStatus: true,
      participantsCount: 30,
      drawSize: 32,
      seed: 20609643,
    };
    const schedule = [
      at('East|1|11', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|12', { matchUpStatus: WALKOVER, winningSide: 2 }),
      at('East|1|2', { winningSide: 2 }),
      at('East|1|9', { matchUpStatus: DOUBLE_WALKOVER }),
      at('East|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    ];
    // under `differential`: the shadow of such a branch diverges from v1's record, which the replay reports as a finding
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    expect(replayFailure(config, schedule, 'olympic-policy-off-differential', POLICY_OFF)).toBeNull();
  });

  it('S6 tail: a cleared double walkover under policy off whose carry sent BYEs on through a BYE chain (COMPASS) is v1s', () => {
    // the award of the carried walkover had nobody for a loser, so its seat took a BYE, and that BYE went on across the
    // consolation's own loser link: the chain is the main path's unwind to withdraw, which v2 leaves to v1
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6: a cleared double walkover whose loser seat BYE went on across a further loser link (COMPASS) is v1s', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });

  it('S6: a cleared walkover that carried its exit across the loser link is v1s (its provenance there)', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  // S6 tail: a carry the awardee has played on from stands as it was (v1's `withdrawable`), whatever the relabel says
  it('S6 tail: a carried walkover relabelled a default once the awardee has played on is v1s, the carry kept', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [...PLAYED_ON(walkover(1), CARRIED), ...AWARDEE_PLAYED_ON],
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    // and the direction v2 plans for it says nothing v1 does not write: the carry is not read as the exit it would be
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results[0].success).toEqual(true);
  });

  // ...and a relabel to a played result once the awardee has played on is a change of kind over a recorded result: refused
  // (§ 2 row 22), by v2 as by v1
  it('S6 tail: a carried walkover relabelled a played result once the awardee has played on is refused, by both', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [...PLAYED_ON(walkover(1), CARRIED), ...AWARDEE_PLAYED_ON],
      steps: [{ target: R1(1, 'Main'), outcome: won(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].error).toBeDefined();
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  // S6 tail: a swap away from a carried exit withdraws the carry from the seat the new loser takes: v1's
  it('S6 tail: a carried walkover swapped to a played result for the other side is v1s, whole', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED },
        { target: R1(2, 'Main'), outcome: won(2) },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(2), params: SWAP_CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    if (v1.results[0].success) expect(v2.v1Writes).toBeGreaterThan(0);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
  });

  // S6 tail: a swap whose new loser arrives at a pending exit standing on the seat the old loser held wins it (RULE 3), as
  // v1's `swapWinnerLoser` sends them: no carry is planned there (`planSwap`), and the call is v1's
  // (`swapWinnerLoserResort.test.ts`: census 9100555, DOUBLE_ELIMINATION 8/6, flag ON)
  it('S6 tail: a swap onto a seat holding a pending walkover is v1s, and the direction plans no carry', () => {
    const steps: [string, Record<string, unknown>][] = [
      ['Main|1|2', { winningSide: 2 }],
      ['Main|1|3', { winningSide: 2 }],
      ['Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }],
      ['Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['Backdraw|3|1', { winningSide: 2 }],
      ['Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Backdraw|3|1', { matchUpStatus: DOUBLE_WALKOVER }],
    ];
    const run = (mode: OutcomePipelineMode) => {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      setClock('2026-10-25T00:00:00.000Z');
      setSubscriptions({ subscriptions: {} });
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 6, drawId: 'd' }],
        nonRandom: 9100555,
        setState: true,
      });
      const find = (key: string): any =>
        tournamentEngine
          .allDrawMatchUps({ drawId: 'd', inContext: true })
          .matchUps.find((m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}` === key);
      const submit = (key: string, outcome: Record<string, unknown>) =>
        tournamentEngine.setMatchUpStatus({ ...SWAP_CARRIED, matchUpId: find(key).matchUpId, outcome, drawId: 'd' });
      // every step under the mode: the sixth flips Main|2|1 from a default to a walkover for the other side, onto a
      // Backdraw seat holding that default's carry beside a pending exit
      setOutcomePipeline(mode);
      v1Writes.count = 0;
      for (const [key, outcome] of steps) expect(submit(key, outcome).success).toEqual(true);
      const flipped = find('Main|1|2');
      const result: any = submit('Main|1|2', { winningSide: 3 - flipped.winningSide });
      return {
        result,
        v1Writes: v1Writes.count,
        record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
      };
    };
    const v1 = run(OUTCOME_PIPELINE_V1);
    const v2 = run(OUTCOME_PIPELINE_V2);
    expect(v1.result.success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    const compared = run(OUTCOME_PIPELINE_DIFFERENTIAL);
    expect(compared.result.success).toEqual(true);
  });

  // the consolation matchUp holds both feeders' carries: withdrawing one is not the plain withdrawal
  it('S6: a carried walkover relabelled a played result beside a second carry on its loser matchUp is v1s', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED },
        { target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6: a played result relabelled a walkover for the other side, its new loser carrying it, is v1s', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: won(1) }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(2), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it.each<[string, Scenario]>([
    [
      'S6: a double walkover given a winner whose loser carries the walkover across their link (FEED_IN_CHAMPIONSHIP) is v1s',
      {
        drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
        setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
        steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      },
    ],
  ])('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it.each<[string, Scenario]>([
    [
      'S6: a round robin result turned into a double walkover is v1s (the group is tallied)',
      {
        drawProfile: { drawSize: 4, drawType: ROUND_ROBIN },
        setup: [{ target: { roundNumber: 1, nth: 0 }, outcome: won(1) }],
        steps: [{ target: { roundNumber: 1, nth: 0 }, outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      },
    ],
    [
      'S6: a walkover its loser carried across their link, turned into a double walkover, is v1s (FEED_IN_CHAMPIONSHIP)',
      {
        drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
        setup: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
        steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      },
    ],
  ])('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('S6: a double walkover given a winner whose produced walkover was awarded on is v1s', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(2), outcome: won(2) },
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1), outcome: walkover(1) }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });

  it('a default under a scoring policy naming incompleteAssignmentsOnDefault: v1 may write processCodes', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      policyDefinitions: POLICY_SCORING_DEFAULT,
      steps: [{ target: R1(1), outcome: exited(DEFAULTED, 1) }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(1);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });

  it('S6: a walkover relabelled a default under that policy is v1s too', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      policyDefinitions: POLICY_SCORING_DEFAULT,
      setup: [{ target: R1(1), outcome: walkover(1) }],
      steps: [{ target: R1(1), outcome: exited(DEFAULTED, 1) }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(1);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });
});

// S6 tail, family 4: the dissolved convergence beyond a clear is v2's; given a winner (the winner then awarded the
// re-derived pending exit and sent on) and under `doubleExitPropagateBye: false` (the consolation convergence of the two
// carries re-derived too) it stays v1's, whole
describe('under v2, a dissolved convergence beyond the clear is v2s; given a winner or under policy off it is v1s', () => {
  const V1S: [string, Scenario][] = [
    [
      'SINGLE_ELIMINATION: a double walkover given a winner, its produced exit converged',
      {
        drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER),
        steps: [{ target: R1(1), outcome: won(1) }],
      },
    ],
    [
      'FIRST_MATCH_LOSER_CONSOLATION: a double walkover cleared, converged: the freed seat advances on through a BYE',
      {
        drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
    [
      'SINGLE_ELIMINATION 16: four double walkovers, the final awarded to the other half, the first cleared',
      {
        drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
        setup: [
          ...PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER),
          { target: R1(3), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
          { target: R1(4), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
          { target: R1(5), outcome: won(1) },
          { target: R1(6), outcome: won(1) },
          { target: R1(7), outcome: won(1) },
          { target: R1(8), outcome: won(1) },
          { target: { roundNumber: 2, roundPosition: 3 }, outcome: won(1) },
          { target: { roundNumber: 2, roundPosition: 4 }, outcome: won(1) },
          { target: { roundNumber: 3, roundPosition: 2 }, outcome: won(1) },
        ],
        steps: [{ target: R1(1), outcome: cleared }],
      },
    ],
    [
      'FIRST_ROUND_LOSER_CONSOLATION 16: paired double walkovers, the seat beyond their double BYE still empty',
      {
        drawProfile: { drawSize: 16, drawType: FIRST_ROUND_LOSER_CONSOLATION },
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
    [
      'FIRST_MATCH_LOSER_CONSOLATION 7 of 8: a double walkover beside the BYE cleared, awarded through the BYE',
      {
        drawProfile: { drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
        steps: [{ target: R1(2, 'Main'), outcome: cleared }],
      },
    ],
    [
      'SINGLE_ELIMINATION 7 of 8: a double walkover beside the BYE given a winner, awarded through the BYE',
      {
        drawProfile: { drawSize: 8, participantsCount: 7, drawType: SINGLE_ELIMINATION },
        setup: [{ target: R1(2), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
        steps: [{ target: R1(2), outcome: won(1) }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: a consolation double walkover given a winner, its produced exit pending in the feed round',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        setup: [...MAIN_R1_8, { target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
        steps: [{ target: R1(1, 'Consolation'), outcome: won(1) }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: a consolation double walkover cleared once the fed loser was awarded its produced exit',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        setup: [
          ...MAIN_R1_8,
          { target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
          { target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' }, outcome: won(1) },
        ],
        steps: [{ target: R1(1, 'Consolation'), outcome: cleared }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: the Main final entered as a double default under doubleExitPropagateBye false',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        policyDefinitions: POLICY_OFF,
        setup: TO_FINAL_8('Main').slice(0, 6),
        steps: [{ target: FINAL_8('Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      },
    ],
    [
      'DOUBLE_ELIMINATION: the Main final entered as a double walkover: the Decider is its winner target',
      {
        drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
        setup: TO_FINAL_8('Main').slice(0, 6),
        steps: [{ target: FINAL_8('Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      },
    ],
    [
      'DOUBLE_ELIMINATION: the Main final a double walkover cleared: the Decider, fed by both its links, is visited',
      {
        drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
        setup: TO_FINAL_8('Main'),
        steps: [{ target: FINAL_8('Main'), outcome: cleared }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: a double walkover cleared, converged, under doubleExitPropagateBye false',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        policyDefinitions: POLICY_OFF,
        setup: PAIRED(DOUBLE_WALKOVER, DOUBLE_WALKOVER, 'Main'),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
  ];
  it.each(V1S)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

// S6 tail: a refusal v2 returns is v1's result, field for field: row 9's `activeDownstream` beside `error` (a double
// exit cleared or re-entered over an active downstream), and rows 13 / 14's context naming the stored matchUp (a double
// exit given a winner once its awardee has played on)
describe('under v2, a refused outcome returns exactly the result v1 returns', () => {
  const AWARDEE_WON_ON: Step[] = [
    { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    { target: R1(2), outcome: won(1) },
    { target: R1(3), outcome: won(1) },
    { target: R1(4), outcome: won(1) },
    { target: { roundNumber: 2, roundPosition: 2 }, outcome: won(1) },
    { target: { roundNumber: 3, roundPosition: 1 }, outcome: won(1) },
  ];
  const REFUSED: [string, Scenario][] = [
    [
      'SINGLE_ELIMINATION: a double walkover cleared once its awardee has played on (row 9, activeDownstream)',
      {
        drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
        setup: AWARDEE_WON_ON,
        steps: [{ target: R1(1), outcome: cleared }],
      },
    ],
    [
      'SINGLE_ELIMINATION: a double walkover given a winner once its awardee has played on (row 13, the matchUp named)',
      {
        drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
        setup: AWARDEE_WON_ON,
        steps: [{ target: R1(1), outcome: won(1) }],
      },
    ],
    [
      'FEED_IN_CHAMPIONSHIP: a double walkover cleared once its awardee has played on, beside a consolation (row 9)',
      {
        drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
        setup: AWARDEE_WON_ON.map(({ target, outcome }) => ({ target: { ...target, structureName: 'Main' }, outcome })),
        steps: [{ target: R1(1, 'Main'), outcome: cleared }],
      },
    ],
  ];
  it.each(REFUSED)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    // CONTROL: v1 refused
    expect(v1.results.every((result: any) => result.error)).toEqual(true);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});
