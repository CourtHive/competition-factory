import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { POLICY_SCORING_DEFAULT } from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
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
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
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

const R1 = (roundPosition: number, structureName?: string): Target => ({
  roundNumber: 1,
  roundPosition,
  structureName,
});

const SCENARIOS: [string, Scenario][] = [
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
function play(mode: OutcomePipelineMode, { drawProfile, steps, setup = [], policyDefinitions }: Scenario) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  if (policyDefinitions) tournamentEngine.attachPolicies({ policyDefinitions });
  for (const { target, outcome } of setup) {
    const result = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: findTarget(target), outcome });
    if (!result.success) throw new Error(`setup step failed: ${JSON.stringify(target)}`);
  }
  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
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
    setClock(`2026-10-25T00:0${i + 1}:00.000Z`);
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
  it('FEED_IN_CHAMPIONSHIP: a double exit whose loser seats take BYEs in the consolation', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      steps: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(v1.v1Writes);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });

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
});
