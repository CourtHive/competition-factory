import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { POLICY_SCORING_DEFAULT } from '@Fixtures/policies/POLICY_SCORING_DEFAULT';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { replayFailure } from '@Tests/testHarness/exitPropagation/sweep';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { createSeededRandom } from '@Tools/prng';
import { setClock } from '@Tools/clock';

// constants
import { MISSING_ASSIGNMENTS, SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOMINANT_DUO, USTA_COLLEGE } from '@Constants/tieFormatConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import type { Tournament } from '@Types/tournamentTypes';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';
import {
  BYE,
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  ADAPTIVE,
  AD_HOC,
  COMPASS,
  CURTIS_CONSOLATION,
  DOUBLE_ELIMINATION,
  FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  LUCKY_DRAW,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
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
const NOTED = { notes: 'retired hurt' };
const walkover = (winningSide: 1 | 2) =>
  generateOutcomeFromScoreString({ matchUpStatus: WALKOVER, winningSide }).outcome;
const exited = (matchUpStatus: string, winningSide: 1 | 2) =>
  generateOutcomeFromScoreString({ matchUpStatus, winningSide }).outcome;
const retired = (winningSide: 1 | 2) =>
  generateOutcomeFromScoreString({ scoreString: '6-1 2-0', matchUpStatus: RETIRED, winningSide }).outcome;

// a round robin's matchUps have no roundPosition: `nth` picks the nth of the round in the structure instead
type Target = {
  structureName?: string;
  roundNumber: number;
  roundPosition?: number;
  nth?: number;
  singlesLine?: number;
};
// `params`: further setMatchUpStatus arguments (a swap's `allowChangePropagation`)
type Step = { target: Target; outcome: Record<string, unknown>; params?: Record<string, unknown> };
// `setup`: steps played under v1 before the comparison starts, for a state the owned steps need but do not own;
// `policyDefinitions`: attached to the tournament before the setup
type Scenario = {
  drawProfile: Record<string, unknown>;
  steps: Step[];
  setup?: Step[];
  policyDefinitions?: Record<string, unknown>;
  /** the generator's seed (an exit matrix cell's), where the draw's BYEs are where its steps need them */
  nonRandom?: number;
  /** Ambient RNG captured separately from the generator seed for public setup reproducibility. */
  randomSeed?: number;
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
/** a Main structure matchUp by round and position (the ruling 2 and ruling 10 pins) */
const MAIN = (roundNumber: number, roundPosition: number): Target => ({
  roundNumber,
  roundPosition,
  structureName: 'Main',
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

/**
 * S7, policy off: a first-round double walkover beside the BYE (or a double default), its carried exit sent past the
 * generated BYE on its loser seat and pending beyond; cleared, or given a winner (the loser then goes on through the
 * BYE themselves). FIRST_MATCH_LOSER_CONSOLATION's passage runs through the released award's reservation: the unfillable
 * seat's BYE matchUp relays the carry, and its BYE had sent the carrier's position on into the landing; the unwind
 * withdraws that BYE first, the landing's pending exit going with the position (`clearsPendingExit`), then the passage
 * writes the relay back to be played (S7, `UnwindRelay`)
 */
const PASSAGE_DRAWS: [number, number, number][] = [
  [8, 7, 2],
  [16, 15, 2],
  [16, 13, 4],
  [32, 29, 2],
];
const PASSAGE_STEPS: [string, string, Record<string, unknown>][] = [
  ['given a winner', DOUBLE_WALKOVER, won(1)],
  ['cleared', DOUBLE_WALKOVER, cleared],
  ['a double default given a walkover', DOUBLE_DEFAULT, walkover(2)],
];
const PASSAGES: [string, Scenario][] = (
  [
    [COMPASS, 'East'],
    [FEED_IN_CHAMPIONSHIP, 'Main'],
    [FIRST_ROUND_LOSER_CONSOLATION, 'Main'],
    [MODIFIED_FEED_IN_CHAMPIONSHIP, 'Main'],
    [OLYMPIC, 'East'],
    [CURTIS_CONSOLATION, 'Main'],
    [FIRST_MATCH_LOSER_CONSOLATION, 'Main'],
  ] as const
).flatMap(([drawType, structureName]) =>
  PASSAGE_DRAWS.flatMap(([drawSize, participantsCount, roundPosition]) =>
    // CURTIS 7 of 8 given a winner: Main's first round has no loser link, so the unwind's seat writes are the produced
    // exit's seat's alone and the winner is directed as any (owned since the carried-beside-BYE slice, S7)
    PASSAGE_STEPS.map(([label, doubleExit, outcome]): [string, Scenario] => [
      `${drawType} ${participantsCount} of ${drawSize} (policy off): R1/${roundPosition} past the BYE, ${label}`,
      {
        drawProfile: { drawSize, participantsCount, drawType },
        policyDefinitions: POLICY_OFF,
        setup: [{ target: R1(roundPosition, structureName), outcome: { matchUpStatus: doubleExit } }],
        steps: [{ target: R1(roundPosition, structureName), outcome }],
      },
    ]),
  ),
);

/**
 * S7, policy off: a first-round double exit whose loser seat stands opposite a generated BYE, the carry recorded beside
 * it and carried on through the BYE-held matchUps beyond (`heldLoser`'s relays) to a pending landing or the structure's
 * last round, and a landing whose other feeder is a BYE. Positions per draw shape (seed 9000230)
 */
const RELAY_DRAWS: [number, number, number[]][] = [
  [8, 5, [2]],
  [8, 6, [2, 3]],
  [16, 9, [5]],
  [16, 11, [2, 4, 5]],
  [16, 13, [2, 4]],
  [32, 21, [2, 4, 6, 11, 13]],
  [32, 27, [6, 8]],
];
const RELAYS: [string, Scenario][] = (
  [
    [COMPASS, 'East'],
    [OLYMPIC, 'East'],
    [FIRST_ROUND_LOSER_CONSOLATION, 'Main'],
  ] as const
).flatMap(([drawType, structureName]) =>
  RELAY_DRAWS.flatMap(([drawSize, participantsCount, positions]) =>
    positions.flatMap((roundPosition) =>
      [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
        `${drawType} ${participantsCount} of ${drawSize} (policy off): R1/${roundPosition} a ${matchUpStatus}, its carry relayed past the BYEs`,
        {
          drawProfile: { drawSize, participantsCount, drawType },
          nonRandom: 9000230,
          policyDefinitions: POLICY_OFF,
          steps: [{ target: R1(roundPosition, structureName), outcome: { matchUpStatus } }],
        },
      ]),
    ),
  ),
);

/**
 * S7: an award through a BYE released given a winner, its loser placed opposite a standing BYE and on through a chain of
 * BYEs (West's first round, then West 2/2, into West 3/1, a BYE still): v1 announces and stamps each matchUp passed
 * (`unwoundThrough`'s `onward`). Positions per draw shape (seed 9000230)
 */
const THROUGH_CHAIN_DRAWS: [number, number, number[]][] = [[16, 9, [5]]];
const THROUGH_CHAINS: [string, Scenario][] = (
  [
    [COMPASS, 'East'],
    [OLYMPIC, 'East'],
    [FIRST_ROUND_LOSER_CONSOLATION, 'Main'],
  ] as const
).flatMap(([drawType, structureName]) =>
  THROUGH_CHAIN_DRAWS.flatMap(([drawSize, participantsCount, positions]) =>
    positions.flatMap((roundPosition) =>
      (
        [
          [DOUBLE_WALKOVER, walkover(1)],
          [DOUBLE_DEFAULT, exited(DEFAULTED, 1)],
        ] as const
      ).map(([doubleExit, outcome]): [string, Scenario] => [
        `${drawType} ${participantsCount} of ${drawSize}: R1/${roundPosition} a ${doubleExit} beside the BYE given a winner, the loser on through two BYEs`,
        {
          drawProfile: { drawSize, participantsCount, drawType },
          nonRandom: 9000230,
          setup: [{ target: R1(roundPosition, structureName), outcome: { matchUpStatus: doubleExit } }],
          steps: [{ target: R1(roundPosition, structureName), outcome }],
        },
      ]),
    ),
  ),
);

/**
 * S7, policy off: a Main double exit past the first round, its loser seat a FED one (a feed round's): it takes a BYE
 * whatever `doubleExitPropagateBye` says, so the own seat's BYE chain plans it, not the produced exit. Main's earlier
 * rounds played
 */
const FED_SEAT_ROUNDS: [number, number, number][] = [
  [8, 2, 1],
  [8, 2, 2],
  [16, 2, 1],
  [16, 2, 2],
  [16, 3, 1],
];
const FED_SEATS: [string, Scenario][] = [
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FEED_IN_CHAMPIONSHIP_TO_SF,
].flatMap((drawType) =>
  FED_SEAT_ROUNDS.flatMap(([drawSize, roundNumber, roundPosition]) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
      `${drawType} ${drawSize} (policy off): Main ${roundNumber}/${roundPosition} a ${matchUpStatus}, its fed loser seat a BYE`,
      {
        drawProfile: { drawSize, drawType },
        policyDefinitions: POLICY_OFF,
        setup: [
          ...Array.from({ length: drawSize / 2 }, (_, i) => ({ target: R1(i + 1, 'Main'), outcome: won(1) })),
          ...(roundNumber === 3
            ? Array.from({ length: drawSize / 4 }, (_, i) => ({
                target: { roundNumber: 2, roundPosition: i + 1, structureName: 'Main' },
                outcome: won(1),
              }))
            : []),
        ],
        steps: [{ target: { roundNumber, roundPosition, structureName: 'Main' }, outcome: { matchUpStatus } }],
      },
    ]),
  ),
);

/**
 * S7, policy off: an FMLC Main double exit whose produced exit on its Consolation seat advances the empty position opposite
 * into the matchUp the unfillable seat (behind FIRST_MATCHUP) is in: that seat's BYE reads the matchUp as the advance
 * leaves it, and the position goes on through it. Positions per draw shape (seed 9000230)
 */
const JOINED_DRAWS: [number, number, number[]][] = [
  [8, 7, [3, 4]],
  [16, 13, [5, 6]],
  [16, 15, [3, 4, 5, 6, 7, 8]],
  [32, 27, [3, 4, 9, 10, 13, 14]],
];
const JOINED_SEATS: [string, Scenario][] = JOINED_DRAWS.flatMap(([drawSize, participantsCount, positions]) =>
  positions.flatMap((roundPosition) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
      `${FIRST_MATCH_LOSER_CONSOLATION} ${participantsCount} of ${drawSize} (policy off): R1/${roundPosition} a ${matchUpStatus}, the unfillable BYE beside the produced exit's advance`,
      {
        drawProfile: { drawSize, participantsCount, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        nonRandom: 9000230,
        policyDefinitions: POLICY_OFF,
        steps: [{ target: R1(roundPosition, 'Main'), outcome: { matchUpStatus } }],
      },
    ]),
  ),
);

/**
 * S7, policy off: an FMLC Main double exit whose Consolation seat is opposite a BYE, its exit carried on to the matchUp
 * the unfillable seat (behind FIRST_MATCHUP) is in: that seat's BYE makes the landing a BYE, and once the produced exit
 * is written the position goes on and the exit lands pending past it. Positions per draw shape (seed 9000230)
 */
const HELD_JOIN_DRAWS: [number, number, number[]][] = [
  [8, 5, [2]],
  [8, 6, [2, 3]],
  [8, 7, [2]],
  [16, 9, [5]],
  [16, 11, [2, 4, 5]],
  [16, 13, [2, 4, 7]],
  [16, 15, [2]],
  [32, 21, [2, 4, 6, 11, 13]],
  [32, 27, [2, 6, 8, 11, 15]],
];
const HELD_JOINS: [string, Scenario][] = HELD_JOIN_DRAWS.flatMap(([drawSize, participantsCount, positions]) =>
  positions.flatMap((roundPosition) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
      `${FIRST_MATCH_LOSER_CONSOLATION} ${participantsCount} of ${drawSize} (policy off): R1/${roundPosition} a ${matchUpStatus} beside a BYE, its exit carried past the unfillable BYE`,
      {
        drawProfile: { drawSize, participantsCount, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        nonRandom: 9000230,
        policyDefinitions: POLICY_OFF,
        steps: [{ target: R1(roundPosition, 'Main'), outcome: { matchUpStatus } }],
      },
    ]),
  ),
);

/**
 * S7, policy off: a COMPASS East double exit whose West loser matchUp links its own loser on into South, onto a seat
 * opposite a standing BYE: a double BYE there, whose matchUp was a BYE already and sent its BYE on into Southeast when it
 * became one, so the chain ends. Positions per draw shape (seed 9000230)
 */
const DOUBLE_BYE_END_DRAWS: [number, number, number[]][] = [
  [16, 13, [5, 6]],
  [16, 15, [3, 4]],
  [32, 27, [3, 4, 9, 10, 13, 14]],
];
const DOUBLE_BYE_ENDS: [string, Scenario][] = DOUBLE_BYE_END_DRAWS.flatMap(([drawSize, participantsCount, positions]) =>
  positions.flatMap((roundPosition) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
      `${COMPASS} ${participantsCount} of ${drawSize} (policy off): R1/${roundPosition} a ${matchUpStatus}, the double BYE beyond ending the chain`,
      {
        drawProfile: { drawSize, participantsCount, drawType: COMPASS },
        nonRandom: 9000230,
        policyDefinitions: POLICY_OFF,
        steps: [{ target: R1(roundPosition, 'East'), outcome: { matchUpStatus } }],
      },
    ]),
  ),
);

/**
 * S7: an FMLC Main round-2 double exit, its loser seat behind `FIRST_MATCHUP`: nobody loses it, and v1 places the BYE
 * whatever the condition says (the chain, or the walk where the chain's shapes refuse). Main's first round played
 */
const FIRST_MATCHUP_SEATS: [string, Scenario][] = [8, 16, 32].flatMap((drawSize) =>
  Array.from({ length: drawSize / 4 }, (_, i) => i + 1).flatMap((roundPosition) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
      `${FIRST_MATCH_LOSER_CONSOLATION} ${drawSize}: Main 2/${roundPosition} a ${matchUpStatus}, its loser seat behind FIRST_MATCHUP a BYE`,
      {
        drawProfile: { drawSize, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        setup: Array.from({ length: drawSize / 2 }, (_, i) => ({ target: R1(i + 1, 'Main'), outcome: won(1) })),
        steps: [{ target: { roundNumber: 2, roundPosition, structureName: 'Main' }, outcome: { matchUpStatus } }],
      },
    ]),
  ),
);

/**
 * S7, policy off: a COMPASS East round-2 double exit whose loser matchUp (North's one matchUp) is its structure's final:
 * the produced exit is written there, awarded to the empty side opposite, and nothing advances. East's first round played
 */
const PRODUCED_FINALS: [string, Scenario][] = [1, 2].flatMap((roundPosition) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
    `${COMPASS} 8 (policy off): East 2/${roundPosition} a ${matchUpStatus}, its exit produced on North's final`,
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      policyDefinitions: POLICY_OFF,
      setup: Array.from({ length: 4 }, (_, i) => ({ target: R1(i + 1, 'East'), outcome: won(1) })),
      steps: [{ target: { roundNumber: 2, roundPosition, structureName: 'East' }, outcome: { matchUpStatus } }],
    },
  ]),
);

/**
 * S7, policy off: the held exit's landing holds a participant on the other side (East R1/3's loser, through West's BYE):
 * the exit is theirs. West R2/1 is West's final, so nothing goes on (seed 9000230)
 */
const HELD_AWARDS: [string, Scenario][] = [COMPASS, OLYMPIC].flatMap((drawType) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
    `${drawType} 6 of 8 (policy off): R1/2 a ${matchUpStatus} beside a BYE, its exit awarded to the loser standing opposite`,
    {
      drawProfile: { drawSize: 8, participantsCount: 6, drawType },
      nonRandom: 9000230,
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(3, 'East'), outcome: won(1) }],
      steps: [{ target: R1(2, 'East'), outcome: { matchUpStatus } }],
    },
  ]),
);

/**
 * ...and where the landing is not the structure's final (OLYMPIC, East's other first-round matchUps played): the awarded
 * participant goes on into their next matchUp. First-round matchUps to be played per draw shape (seed 9000230)
 */
const HELD_AWARD_ONWARD_DRAWS: [number, number, number[], number[]][] = [
  [16, 13, [2, 4], [2, 4, 5, 6, 7]],
  [32, 27, [6, 8], [2, 3, 4, 6, 8, 9, 10, 11, 13, 14, 15]],
];
const HELD_AWARDS_ONWARD: [string, Scenario][] = HELD_AWARD_ONWARD_DRAWS.flatMap(
  ([drawSize, participantsCount, positions, played]) =>
    positions.flatMap((roundPosition) =>
      [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((matchUpStatus): [string, Scenario] => [
        `${OLYMPIC} ${participantsCount} of ${drawSize} (policy off): R1/${roundPosition} a ${matchUpStatus}, its exit awarded opposite and the winner on`,
        {
          drawProfile: { drawSize, participantsCount, drawType: OLYMPIC },
          nonRandom: 9000230,
          policyDefinitions: POLICY_OFF,
          setup: played
            .filter((position) => position !== roundPosition)
            .map((position) => ({ target: R1(position, 'East'), outcome: won(1) })),
          steps: [{ target: R1(roundPosition, 'East'), outcome: { matchUpStatus } }],
        },
      ]),
    ),
);

/**
 * S7, policy off: a first-round double exit beside the BYE whose unfillable seat's BYE stands in a double BYE (the other a
 * generated BYE) that sent the seat's own position on alone, into a matchUp a BYE until the unwind; given a winner or
 * cleared. The plain reading of the seat refuses (`doubleByeSeatOps`: the next matchUp holds one position), so the walk
 * (`unwindWalk`) takes the seats that hold a BYE while the own seat's passage is read plainly (`walkedSeatOps` under
 * `branched`). DOUBLE_ELIMINATION's Backdraw final links its winner on: a BYE's position there names nobody to release
 * across the link. Positions per draw shape (seed 9000230)
 */
const WALKED_SEAT_DRAWS: [string, number, number, number[]][] = [
  [DOUBLE_ELIMINATION, 8, 5, [2]],
  [DOUBLE_ELIMINATION, 16, 13, [2, 4]],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 8, 5, [2]],
];
const WALKED_SEATS: [string, Scenario][] = WALKED_SEAT_DRAWS.flatMap(
  ([drawType, drawSize, participantsCount, positions]) =>
    positions.flatMap((roundPosition) =>
      PASSAGE_STEPS.map(([label, doubleExit, outcome]): [string, Scenario] => [
        `${drawType} ${participantsCount} of ${drawSize} (policy off): R1/${roundPosition} past the BYE, its unfillable seat in a double BYE, ${label}`,
        {
          drawProfile: { drawSize, participantsCount, drawType },
          nonRandom: 9000230,
          policyDefinitions: POLICY_OFF,
          setup: [{ target: R1(roundPosition, 'Main'), outcome: { matchUpStatus: doubleExit } }],
          steps: [{ target: R1(roundPosition, 'Main'), outcome }],
        },
      ]),
    ),
);

/**
 * S7: a participant's carried exit standing beside the double exit's BYE in a structure's last round (COMPASS: East R1/3's
 * defaulted loser carried into West, then as West 1/2's loser into South's final beside the BYE East 1/1's double walkover
 * sent on through West 1/1; CURTIS: Main 2/1's walkover loser into the Play Off beside the BYE Main 1/3's double default
 * left on the Play Off seat). The BYE withdrawn, v1 re-derives the matchUp to the carried exit, awarded to the side
 * without it (`carriedBesideBye`). The exits are carried per call (`CARRIED`); census seeds
 */
const SOUTH_FINAL_CARRY: Step[] = [
  { target: R1(2, 'East'), outcome: won(2), params: CARRIED },
  { target: R1(3, 'East'), outcome: exited(DEFAULTED, 1), params: CARRIED },
];
const CARRIED_BESIDE_BYE: [string, Scenario][] = [
  ...[
    ['given a winner', won(1)],
    ['cleared', cleared],
  ].flatMap(([label, outcome]): [string, Scenario][] => [
    [
      `${COMPASS} 8 (seed 20318646): East 1/1 a double walkover, a default carried into South's final beside its BYE, ${label}`,
      {
        drawProfile: { drawSize: 8, drawType: COMPASS },
        nonRandom: 20318646,
        setup: [
          { target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
          ...SOUTH_FINAL_CARRY,
        ],
        steps: [{ target: R1(1, 'East'), outcome, params: CARRIED }],
      },
    ],
    [
      `${COMPASS} 8 (seed 20318646): the default carried into South's final first, then East 1/1's double walkover, ${label}`,
      {
        drawProfile: { drawSize: 8, drawType: COMPASS },
        nonRandom: 20318646,
        setup: [
          ...SOUTH_FINAL_CARRY,
          { target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        ],
        steps: [{ target: R1(1, 'East'), outcome, params: CARRIED }],
      },
    ],
    ...[WALKOVER, DEFAULTED].map((carried): [string, Scenario] => [
      `${CURTIS_CONSOLATION} 6 of 8 (policy off, seed 30009232): Main 1/3 a double default, Main 2/1's ${carried} loser carried into the Play Off beside its BYE, ${label}`,
      {
        drawProfile: { drawSize: 8, participantsCount: 6, drawType: CURTIS_CONSOLATION },
        nonRandom: 30009232,
        policyDefinitions: POLICY_OFF,
        setup: [
          { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED },
          { target: R1(2, 'Main'), outcome: won(1), params: CARRIED },
          {
            target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' },
            outcome: walkover(1),
            params: CARRIED,
          },
          // the carry relabelled a default once (#5554: the relabel rewrites the carry on the BYE-held matchUp)
          ...(carried === DEFAULTED
            ? [
                {
                  target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' },
                  outcome: exited(DEFAULTED, 1),
                  params: CARRIED,
                },
              ]
            : []),
        ],
        steps: [{ target: R1(3, 'Main'), outcome, params: CARRIED }],
      },
    ]),
  ]),
];

/**
 * S7: the carrier a double exit's BYE sent on comes home when the BYE goes (`carrierSentOn`). A first-round double
 * walkover leaves its loser seat a BYE; a walkover's loser is carried into that matchUp beside it, advanced by the BYE
 * past each matchUp another BYE holds (a relay) and lands with the carry pending over an empty seat (or awarded to the
 * participant there, sent on). Given a winner or cleared, v1 re-derives the BYE matchUp to the carry, releases the
 * carrier out of every round the BYE moved them through (the carry with them, an awardee back out of the matchUp beyond),
 * and the loser then arrives beside the carry, wins it as they are seated and goes on through the relays into the landing.
 * The exits are carried per call (`CARRIED`); the 8- and 16-draws are full, the census shapes keep their seeds
 */
const CARRY_HOME_STEPS: [string, Record<string, unknown>][] = [
  ['given a winner', won(1)],
  ['cleared', cleared],
];
const CARRIER_SENT_ON: [string, Scenario][] = CARRY_HOME_STEPS.flatMap(([label, outcome]): [string, Scenario][] => [
  ...[FIRST_ROUND_LOSER_CONSOLATION, DOUBLE_ELIMINATION, MODIFIED_FEED_IN_CHAMPIONSHIP].map(
    (drawType): [string, Scenario] => [
      `${drawType} 8: Main 1/2's walkover loser carried beside Main 1/1's BYE and sent on, the carrier comes home, ${label}`,
      {
        drawProfile: { drawSize: 8, drawType },
        setup: [
          { target: R1(2, 'Main'), outcome: walkover(2), params: CARRIED },
          { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        ],
        steps: [{ target: R1(1, 'Main'), outcome, params: CARRIED }],
      },
    ],
  ),
  ...[DOUBLE_ELIMINATION, FEED_IN_CHAMPIONSHIP].map((drawType): [string, Scenario] => [
    `${drawType} 16: Main 1/5's walkover loser carried past Main 1/6's BYE and a relay (Main 1/3's unfillable seat), the carrier comes home, ${label}`,
    {
      drawProfile: { drawSize: 16, drawType },
      setup: [
        { target: R1(4, 'Main'), outcome: won(1), params: CARRIED },
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(6, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(5, 'Main'), outcome: walkover(1), params: CARRIED },
      ],
      steps: [{ target: R1(6, 'Main'), outcome, params: CARRIED }],
    },
  ]),
  [
    `${MODIFIED_FEED_IN_CHAMPIONSHIP} 14 of 16 (seed 20685332): the carry past a relay awarded to Consolation 2/4's winner, sent on; the carrier comes home, ${label}`,
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: MODIFIED_FEED_IN_CHAMPIONSHIP },
      nonRandom: 20685332,
      setup: [
        { target: R1(2, 'Main'), outcome: won(1), params: CARRIED },
        { target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome: won(1), params: CARRIED },
        { target: R1(7, 'Main'), outcome: won(1), params: CARRIED },
        {
          target: { roundNumber: 2, roundPosition: 4, structureName: 'Consolation' },
          outcome: won(1),
          params: CARRIED,
        },
        { target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(5, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(6, 'Main'), outcome: walkover(2), params: CARRIED },
      ],
      steps: [{ target: R1(5, 'Main'), outcome: outcome === cleared ? cleared : won(2), params: CARRIED }],
    },
  ],
  [
    `${FEED_IN_CHAMPIONSHIP_TO_SF} 14 of 16 (seed 20660398): Main 1/6's default carried past Main 1/5's BYE and a relay, the carrier comes home, ${label}`,
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
      nonRandom: 20660398,
      setup: [
        { target: R1(5, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(6, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED },
        { target: R1(7, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
      ],
      steps: [{ target: R1(5, 'Main'), outcome: outcome === cleared ? cleared : won(2), params: CARRIED }],
    },
  ],
]);

/**
 * S7: a double exit given a single exit whose loser carries it across their link (`unwoundCarryReason`). The unwind
 * frees the loser's seat of the double exit's BYE (or, under `doubleExitPropagateBye: false`, writes their matchUp back
 * to be played), and v1 then directs the loser against the draw as the unwind leaves it: the carry lands on a fresh
 * carry's terms, awarded to the participant standing opposite, who goes on (the position the BYE had advanced, taken out
 * by the unwind and placed again), or pending over the empty side; a feed round's fed seat alike. Planned from the
 * unwound view (`rebuild`). The 8- and 16-draws are full
 */
const UNWOUND_CARRY: [string, Scenario][] = [
  ...[
    FIRST_MATCH_LOSER_CONSOLATION,
    FIRST_ROUND_LOSER_CONSOLATION,
    DOUBLE_ELIMINATION,
    MODIFIED_FEED_IN_CHAMPIONSHIP,
    FEED_IN_CHAMPIONSHIP,
  ].flatMap((drawType): [string, Scenario][] => [
    [
      `${drawType} 8: Main 1/1's double walkover given a walkover, the loser's carry awarded to Main 1/2's loser opposite, sent on`,
      {
        drawProfile: { drawSize: 8, drawType },
        setup: [
          { target: R1(2, 'Main'), outcome: won(2) },
          { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        ],
        steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      },
    ],
    [
      `${drawType} 8: Main 1/1's double walkover given a walkover, the loser's carry pending over the empty seat opposite`,
      {
        drawProfile: { drawSize: 8, drawType },
        setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
        steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
      },
    ],
  ]),
  ...[FIRST_MATCH_LOSER_CONSOLATION, FEED_IN_CHAMPIONSHIP].map((drawType): [string, Scenario] => [
    `${drawType} 8: Main 1/1's double walkover given a default, the loser's default awarded to Main 1/2's loser opposite, sent on`,
    {
      drawProfile: { drawSize: 8, drawType },
      setup: [
        { target: R1(2, 'Main'), outcome: won(2) },
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: exited(DEFAULTED, 1), params: CARRIED }],
    },
  ]),
  [
    `${DOUBLE_ELIMINATION} 8, policy off: Main 1/2's double walkover given a walkover, the loser's carry awarded to Main 1/1's loser opposite, sent on`,
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      policyDefinitions: POLICY_OFF,
      setup: [
        { target: R1(1, 'Main'), outcome: won(2) },
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(2, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    `${FEED_IN_CHAMPIONSHIP} 16: Main 1/1's double walkover given a walkover, the loser's carry pending over the empty seat opposite (the S6 pin, flipped)`,
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    `${FEED_IN_CHAMPIONSHIP} 16: Main 2/2's double walkover given a walkover, the loser's carry pending on the feed round's fed seat`,
    {
      drawProfile: { drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(3, 'Main'), outcome: won(1) },
        { target: R1(4, 'Main'), outcome: won(1) },
        {
          target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' },
          outcome: { matchUpStatus: DOUBLE_WALKOVER },
        },
      ],
      steps: [
        { target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' }, outcome: walkover(1), params: CARRIED },
      ],
    },
  ],
];

// S7: a carry brought home by the unwind meets the arriving loser's carry (RULE 4), producing into the freed relay.
const UNWOUND_CONVERGENCE: [string, Scenario][] = [FIRST_ROUND_LOSER_CONSOLATION, DOUBLE_ELIMINATION].flatMap(
  (drawType) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((stored) =>
      [WALKOVER, DEFAULTED].map((standing): [string, Scenario] => [
        `${drawType} 8: ${stored} given a walkover, converging with the home-coming ${standing}`,
        {
          drawProfile: { drawSize: 8, drawType },
          setup: [
            { target: R1(2, 'Main'), outcome: exited(standing, 2), params: CARRIED },
            { target: R1(1, 'Main'), outcome: { matchUpStatus: stored } },
          ],
          steps: [{ target: R1(1, 'Main'), outcome: walkover(1), params: CARRIED }],
        },
      ]),
    ),
);

// S7: a produced exit relayed past the BYE rests where that BYE was once the unwind withdraws it.
const PRODUCED_RELAY: [string, Scenario][] = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((produced) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((stored) =>
    (
      [
        ['cleared', cleared],
        ['played', won(1)],
        ['given a walkover', walkover(1)],
      ] as [string, Record<string, unknown>][]
    ).map(([label, outcome]): [string, Scenario] => [
      `DE 8 produced relay: ${produced} relayed beside the BYE of ${stored}, ${label}`,
      {
        drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
        setup: [
          ...MAIN_R1_8,
          { target: R1(1, 'Backdraw'), outcome: { matchUpStatus: produced } },
          { target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome: { matchUpStatus: stored } },
        ],
        steps: [{ target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome }],
      },
    ]),
  ),
);

// S7: the relay copy was awarded; it is withdrawn before the loser arrives on the re-derived home.
const AWARDED_PRODUCED_RELAY: [string, Scenario][] = [FEED_IN_CHAMPIONSHIP, FEED_IN_CHAMPIONSHIP_TO_SF].flatMap(
  (drawType) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((produced) =>
      [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((stored) =>
        (
          [
            ['cleared', cleared],
            ['played', won(1)],
            ['given a walkover', walkover(1)],
          ] as [string, Record<string, unknown>][]
        ).map(([label, outcome]): [string, Scenario] => [
          `${drawType} 8 awarded produced relay: ${produced} beside the BYE of ${stored}, ${label}`,
          {
            drawProfile: { drawSize: 8, drawType },
            setup: [
              ...MAIN_R1_8,
              { target: R1(1, 'Consolation'), outcome: { matchUpStatus: produced } },
              {
                target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' },
                outcome: { matchUpStatus: stored },
              },
              { target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome: won(1) },
              { target: R1(2, 'Consolation'), outcome: won(1) },
              { target: { roundNumber: 2, roundPosition: 2, structureName: 'Consolation' }, outcome: won(1) },
            ],
            steps: [{ target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' }, outcome }],
          },
        ]),
      ),
    ),
);

// M1 notice contract: the unwind writes the BYE quietly before the carrier records a fresh exit beside it.
const NOTICE_RELAY_CARRIES: [string, Scenario][] = [
  [
    'FEED_IN_CHAMPIONSHIP_TO_SF: a carry after the quiet unwind names its own writer and hydrates its final landing',
    {
      drawProfile: { drawSize: 16, participantsCount: 11, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
      nonRandom: 20473821,
      policyDefinitions: POLICY_OFF,
      setup: [
        { target: R1(5, 'Main'), outcome: { winningSide: 2 }, params: CARRIED },
        {
          target: { roundNumber: 2, roundPosition: 3, structureName: 'Main' },
          outcome: { matchUpStatus: DOUBLE_WALKOVER },
          params: CARRIED,
        },
      ],
      steps: [
        { target: { roundNumber: 2, roundPosition: 3, structureName: 'Main' }, outcome: walkover(1), params: CARRIED },
      ],
    },
  ],
];

const CONVERGED_RELAY_TRIGGERS: [string, Record<string, unknown>][] = [
  ['winner1', { winningSide: 1 }],
  ['winner2', { winningSide: 2 }],
  ['walkover1 carried', { matchUpStatus: WALKOVER, winningSide: 1 }],
  ['walkover2 carried', { matchUpStatus: WALKOVER, winningSide: 2 }],
  ['default1 carried', { matchUpStatus: DEFAULTED, winningSide: 1 }],
  ['default2 carried', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ['cleared', cleared],
];
const CONVERGED_RELAY_CAPTURES: [string, Scenario][] = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((first) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((source) =>
    [WALKOVER, DEFAULTED].flatMap((middle) =>
      CONVERGED_RELAY_TRIGGERS.map(([trigger, outcome]): [string, Scenario] => [
        `produced relay convergence: ${first}/${middle}/${source}/${trigger}`,
        {
          drawProfile: { drawSize: 16, participantsCount: 13, drawType: FIRST_MATCH_LOSER_CONSOLATION },
          nonRandom: 20496326,
          policyDefinitions: POLICY_OFF,
          setup: [
            { target: R1(2, 'Main'), outcome: { matchUpStatus: first }, params: CARRIED },
            { target: R1(4, 'Main'), outcome: { matchUpStatus: middle, winningSide: 1 }, params: CARRIED },
            { target: R1(3, 'Main'), outcome: { matchUpStatus: source }, params: CARRIED },
          ],
          steps: [{ target: R1(3, 'Main'), outcome, params: CARRIED }],
        },
      ]),
    ),
  ),
);

// The carried arrivals form a new convergence whose product reserves into the retained onward copy.
const CONVERGED_PRODUCED_RELAYS = CONVERGED_RELAY_CAPTURES.filter(([label]) => !label.includes(' carried'));
const CARRIED_CONVERGED_PRODUCED_RELAYS = CONVERGED_RELAY_CAPTURES.filter(([label]) => label.includes(' carried'));

// A direct produced copy is withdrawn from an occupied final, leaving the carrier's own awarded exit.
const OCCUPIED_FINAL_RELAY_CAPTURES: [string, Scenario][] = [WALKOVER, DEFAULTED].flatMap((carry) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((source) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((producer) =>
      (
        [
          ['clear', cleared],
          ['winner1', { winningSide: 1 }],
          ['winner2', { winningSide: 2 }],
        ] as [string, Record<string, unknown>][]
      ).map(([trigger, outcome]): [string, Scenario] => [
        `occupied final relay: ${carry}/${source}/${producer}/${trigger}`,
        {
          drawProfile: { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
          nonRandom: 20650915,
          setup: [
            { target: R1(2, 'Main'), outcome: { matchUpStatus: carry, winningSide: 1 }, params: CARRIED },
            { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
            { target: R1(4, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
            {
              target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' },
              outcome: { matchUpStatus: DOUBLE_WALKOVER },
              params: CARRIED,
            },
            { target: R1(2, 'Consolation'), outcome: { matchUpStatus: producer }, params: CARRIED },
            {
              target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' },
              outcome: { matchUpStatus: source },
              params: CARRIED,
            },
          ],
          steps: [{ target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome, params: CARRIED }],
        },
      ]),
    ),
  ),
);
const OCCUPIED_FINAL_CLEARS = OCCUPIED_FINAL_RELAY_CAPTURES.filter(([label]) => label.endsWith('/clear'));

// A directly produced exit beside the final loser-seat BYE has no onward relay or award to withdraw.
const TERMINAL_RELAY_CAPTURES: [string, Scenario][] = [WALKOVER, DEFAULTED].flatMap((carry) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((source) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((producer) =>
      (
        [
          ['clear', {}],
          ['winner1', { winningSide: 1 }],
          ['winner2', { winningSide: 2 }],
        ] as [string, Record<string, unknown>][]
      ).map(([trigger, outcome]): [string, Scenario] => [
        `terminal direct relay: ${carry}/${source}/${producer}/${trigger}`,
        {
          drawProfile: { drawSize: 8, participantsCount: 4, drawType: FEED_IN_CHAMPIONSHIP },
          nonRandom: 9000579,
          randomSeed: 2187201951,
          setup: [
            {
              target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' },
              outcome: { winningSide: 1 },
              params: { propagateExitStatus: false },
            },
            {
              target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' },
              outcome: { matchUpStatus: carry, winningSide: 2 },
              params: { propagateExitStatus: false },
            },
            { target: FINAL_8('Main'), outcome: { matchUpStatus: source }, params: { propagateExitStatus: false } },
            {
              target: { roundNumber: 3, roundPosition: 1, structureName: 'Consolation' },
              outcome: { matchUpStatus: producer },
              params: { propagateExitStatus: false },
            },
          ],
          steps: [{ target: FINAL_8('Main'), outcome, params: { propagateExitStatus: false } }],
        },
      ]),
    ),
  ),
);

// Only the trigger changes propagation; the captured setup remains unchanged.
const TERMINAL_TRUE_CAPTURES: [string, Scenario][] = TERMINAL_RELAY_CAPTURES.map(([label, scenario]) => [
  label.replace('terminal direct relay:', 'terminal trigger propagation:'),
  {
    ...scenario,
    steps: scenario.steps.map((step) => ({ ...step, params: { ...step.params, propagateExitStatus: true } })),
  },
]);
const TERMINAL_TRUE_CLEARS = TERMINAL_TRUE_CAPTURES.filter(([label]) => label.endsWith('/clear'));
const TERMINAL_TRUE_WINNERS = TERMINAL_TRUE_CAPTURES.filter(([label]) => !label.endsWith('/clear'));

// These first-match losers have one earlier BYE but zero qualifying wins; policy-off lacks the own BYE withdrawal.
const FIRST_MATCHUP_CAPTURES: [string, Scenario][] = [1, 2].flatMap((roundPosition) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((source) =>
    [1, 2].flatMap((winningSide) =>
      [false, true].flatMap((propagateExitStatus) =>
        [false, true].map((policyOff): [string, Scenario] => [
          `FMLC FIRST_MATCHUP: r2/${roundPosition} ${source} winner${winningSide} propagate${propagateExitStatus} policyOff${policyOff}`,
          {
            drawProfile: { drawSize: 8, participantsCount: 4, drawType: FIRST_MATCH_LOSER_CONSOLATION },
            nonRandom: 9000579,
            randomSeed: 2187201951,
            policyDefinitions: policyOff ? POLICY_OFF : undefined,
            setup: [
              {
                target: { roundNumber: 2, roundPosition, structureName: 'Main' },
                outcome: { matchUpStatus: source },
                params: { propagateExitStatus },
              },
            ],
            steps: [
              {
                target: { roundNumber: 2, roundPosition, structureName: 'Main' },
                outcome: { winningSide },
                params: { propagateExitStatus },
              },
            ],
          },
        ]),
      ),
    ),
  ),
);
const FIRST_MATCHUP_OWNED = FIRST_MATCHUP_CAPTURES;

// Captured CURTIS standing-BYE boundary: the corrected source does not own the deeper opponent's BYE.
// Preserve raw capture labels producer/source/trigger from variants.json; all four public setups propagate exits.
const STANDING_BYE_CAPTURES: [string, Scenario][] = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((producer) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((source) =>
    ['clear', 'winner'].map((trigger): [string, Scenario] => [
      `CURTIS standing BYE: ${producer}/${source}/${trigger}`,
      {
        drawProfile: { drawSize: 32, participantsCount: 27, drawType: CURTIS_CONSOLATION },
        nonRandom: 9000062,
        randomSeed: 2722004236,
        setup: [
          { target: R1(7, 'Main'), outcome: { matchUpStatus: WALKOVER, winningSide: 1 }, params: CARRIED },
          { target: R1(8, 'Main'), outcome: { matchUpStatus: WALKOVER, winningSide: 2 }, params: CARRIED },
          {
            target: { roundNumber: 2, roundPosition: 4, structureName: 'Main' },
            outcome: { matchUpStatus: producer },
            params: CARRIED,
          },
          { target: R1(3, 'Main'), outcome: { matchUpStatus: source }, params: CARRIED },
        ],
        steps: [
          {
            target: R1(3, 'Main'),
            outcome: trigger === 'clear' ? cleared : { matchUpStatus: WALKOVER, winningSide: 1 },
            params: CARRIED,
          },
        ],
      },
    ]),
  ),
);

// An indirect produced origin remains in the two-position relay while its onward award is withdrawn.
const INDIRECT_COMPOUND_CLEARS: [string, Scenario][] = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((source) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((producer) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((other): [string, Scenario] => [
      `indirect compound clear: ${source}/${producer}/${other}`,
      {
        drawProfile: { drawSize: 16, participantsCount: 11, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
        nonRandom: 20473821,
        randomSeed: 2496245122,
        policyDefinitions: POLICY_OFF,
        setup: [
          { target: R1(2, 'Main'), outcome: { matchUpStatus: source }, params: CARRIED },
          { target: R1(5, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
          { target: R1(7, 'Main'), outcome: { matchUpStatus: producer }, params: CARRIED },
          {
            target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' },
            outcome: { matchUpStatus: other },
            params: CARRIED,
          },
        ],
        steps: [{ target: R1(2, 'Main'), outcome: cleared, params: CARRIED }],
      },
    ]),
  ),
);

// C10: the source's ordinary award and same-level indirect relay reset unwind together, without a pending award.
const standaloneTarget: Target = { structureName: 'Main', roundNumber: 2, roundPosition: 1 };
const standaloneBase = {
  drawProfile: { drawSize: 16, participantsCount: 11, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
  nonRandom: 20473821,
  randomSeed: 2496245122,
  policyDefinitions: POLICY_OFF,
};
const STANDALONE_INDIRECT_CLEARS: [string, Scenario][] = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((source) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((producer) =>
    [WALKOVER, DEFAULTED].flatMap((paired) =>
      [WALKOVER, DEFAULTED].map((upstream): [string, Scenario] => [
        `C10 standalone indirect clear: ${source}/${producer}/${paired}/${upstream}`,
        {
          ...standaloneBase,
          setup: [
            { target: R1(5, 'Main'), outcome: { winningSide: 2 }, params: CARRIED },
            { target: R1(7, 'Main'), outcome: { matchUpStatus: producer }, params: CARRIED },
            {
              target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 },
              outcome: { matchUpStatus: paired, winningSide: 2 },
              params: CARRIED,
            },
            { target: R1(2, 'Main'), outcome: { matchUpStatus: upstream, winningSide: 1 }, params: CARRIED },
            { target: standaloneTarget, outcome: { matchUpStatus: source }, params: CARRIED },
          ],
          steps: [{ target: standaloneTarget, outcome: cleared, params: CARRIED }],
        },
      ]),
    ),
  ),
);
const standaloneMinimal = STANDALONE_INDIRECT_CLEARS[0][1];
STANDALONE_INDIRECT_CLEARS.push([
  'C10 standalone indirect clear: plain upstream',
  {
    ...standaloneMinimal,
    setup: standaloneMinimal.setup!.map((step, index) =>
      index === 3 ? { ...step, outcome: { winningSide: 1 } } : step,
    ),
  },
]);
const standaloneFull: Scenario = {
  ...standaloneBase,
  setup: [
    {
      target: { structureName: 'Main', roundNumber: 1, roundPosition: 5 },
      outcome: { winningSide: 2 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 3 },
      outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 1, roundPosition: 7 },
      outcome: { winningSide: 1 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 1, roundPosition: 5 },
      outcome: { winningSide: 2 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 1, roundPosition: 2 },
      outcome: { matchUpStatus: 'DOUBLE_DEFAULT' },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 4 },
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 4 },
      outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 4 },
      outcome: { winningSide: 1 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 4 },
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 3 },
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 1, roundPosition: 7 },
      outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 3, roundPosition: 2 },
      outcome: { matchUpStatus: 'RETIRED', winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 },
      outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
      params: CARRIED,
    },
    {
      target: { structureName: 'Consolation', roundNumber: 4, roundPosition: 2 },
      outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
      params: CARRIED,
    },
    {
      target: { structureName: 'Consolation', roundNumber: 4, roundPosition: 2 },
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Consolation', roundNumber: 4, roundPosition: 2 },
      outcome: { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 },
      outcome: { winningSide: 2 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 },
      outcome: { winningSide: 2 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 3, roundPosition: 2 },
      outcome: { winningSide: 1 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 },
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 1, roundPosition: 2 },
      outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      params: CARRIED,
    },
    {
      target: { structureName: 'Main', roundNumber: 2, roundPosition: 1 },
      outcome: { matchUpStatus: 'DOUBLE_WALKOVER' },
      params: CARRIED,
    },
  ],
  steps: [{ target: standaloneTarget, outcome: cleared, params: CARRIED }],
};
STANDALONE_INDIRECT_CLEARS.push(['C10 standalone indirect clear: full thirteen notices', standaloneFull]);
// Bare winners keep the retained foreign relay exit; carried WO/DEFAULTED corrections remain separate.
const STANDALONE_BARE_WINNERS: [string, Scenario][] = STANDALONE_INDIRECT_CLEARS.slice(0, 17).flatMap(
  ([label, scenario]) =>
    [1, 2].map((winningSide): [string, Scenario] => [
      `${label.replace('C10 standalone indirect clear', 'C11 standalone bare winner')}/${winningSide}`,
      { ...scenario, steps: [{ target: standaloneTarget, outcome: { winningSide }, params: CARRIED }] },
    ]),
);
for (const source of [DOUBLE_WALKOVER, DOUBLE_DEFAULT]) {
  for (const producer of [DOUBLE_WALKOVER, DOUBLE_DEFAULT]) {
    for (const winningSide of [1, 2]) {
      STANDALONE_BARE_WINNERS.push([
        `C11 standalone bare winner: full thirteen/${source}/${producer}/${winningSide}`,
        {
          ...standaloneFull,
          setup: standaloneFull.setup!.map((step, index, all) => {
            if (index === all.length - 1) return { ...step, outcome: { matchUpStatus: source } };
            if (
              step.target.roundNumber === 1 &&
              step.target.roundPosition === 7 &&
              step.outcome.matchUpStatus === DOUBLE_WALKOVER
            )
              return { ...step, outcome: { matchUpStatus: producer } };
            return step;
          }),
          steps: [{ target: standaloneTarget, outcome: { winningSide }, params: CARRIED }],
        },
      ]);
    }
  }
}

const STANDALONE_CARRIED_CONVERGENCES: [string, Scenario][] = STANDALONE_BARE_WINNERS.flatMap(([label, scenario]) =>
  [WALKOVER, DEFAULTED].map((matchUpStatus): [string, Scenario] => [
    `${label.replace('C11 standalone bare winner', 'C12 standalone carried convergence')}/${matchUpStatus}`,
    { ...scenario, steps: scenario.steps.map((step) => ({ ...step, outcome: { ...step.outcome, matchUpStatus } })) },
  ]),
);

// C13: public FIRST_MATCHUP corrections whose own unwind withdraws a marked BYE before restoring it.
const FMLC_NO_ARRIVAL_BASES: [string, Scenario][] = [
  [
    'small-four-call-FMLC8-standing-opponent',
    {
      drawProfile: {
        participantsCount: 7,
        drawSize: 8,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20099923,
      randomSeed: 294488990,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
    },
  ],
  [
    'real-F1-on20463476-remove-only-failed',
    {
      drawProfile: {
        participantsCount: 16,
        drawSize: 16,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20463476,
      randomSeed: 1531584124,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 6,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 1,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'DEFAULTED',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 7,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 6,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 1,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 8,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_DEFAULT',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 5,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_DEFAULT',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
    },
  ],
];
const FMLC_NO_ARRIVAL_WINNERS: [string, Scenario][] = FMLC_NO_ARRIVAL_BASES.flatMap(([label, base]) =>
  ([1, 2] as const).flatMap((winningSide) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((matchUpStatus) =>
      [undefined, WALKOVER, DEFAULTED].map((requested) => {
        const propagateExitStatus = requested === undefined;
        const setup = (base.setup ?? []).map((step) => {
          const { target } = step;
          let outcome = step.outcome;
          if (
            target.structureName === 'Main' &&
            target.roundNumber === 1 &&
            [3, 4].includes(target.roundPosition ?? 0)
          ) {
            const feeder = target.roundPosition === 3 ? 1 : 2;
            outcome = { winningSide: feeder, ...(feeder === winningSide ? { matchUpStatus: WALKOVER } : {}) };
          }
          if (
            target.structureName === 'Main' &&
            target.roundNumber === 2 &&
            target.roundPosition === 2 &&
            [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(step.outcome.matchUpStatus as typeof DOUBLE_WALKOVER)
          )
            outcome = { matchUpStatus };
          return { ...step, outcome, params: { ...step.params, propagateExitStatus } };
        });
        return [
          `C13 no-arrival/${label}/side${winningSide}/${matchUpStatus}/${requested ?? 'bare'}`,
          {
            ...base,
            setup,
            steps: [
              {
                ...base.steps[0],
                outcome: { winningSide, ...(requested ? { matchUpStatus: requested } : {}) },
                params: { ...base.steps[0].params, propagateExitStatus },
              },
            ],
          },
        ] as [string, Scenario];
      }),
    ),
  ),
);
const FMLC_NO_ARRIVAL_REAL: [string, Scenario][] = [
  [
    'C13 no-arrival real/real-F1-on20463476-step17-successful-only',
    {
      drawProfile: {
        participantsCount: 16,
        drawSize: 16,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20463476,
      randomSeed: 1531584124,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 6,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 1,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'DEFAULTED',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 7,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 6,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 1,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 8,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_DEFAULT',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 5,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_DEFAULT',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
    },
  ],
  [
    'C13 no-arrival real/real-censusF1-on20473585-step19-successful-only',
    {
      drawProfile: {
        participantsCount: 14,
        drawSize: 16,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20473585,
      randomSeed: 2035705846,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 7,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 5,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 5,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_DEFAULT',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 6,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 5,
          },
          outcome: {
            matchUpStatus: 'RETIRED',
            winningSide: 1,
            score: {
              sets: [
                {
                  side1Score: 6,
                  side2Score: 3,
                },
              ],
            },
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'RETIRED',
            winningSide: 1,
            score: {
              sets: [
                {
                  side1Score: 6,
                  side2Score: 3,
                },
              ],
            },
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 2,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
    },
  ],
  [
    'C13 no-arrival real/real-censusF1-on20486698-step10-successful-only',
    {
      drawProfile: {
        participantsCount: 13,
        drawSize: 16,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20486698,
      randomSeed: 873967781,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 2,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: false,
          },
        },
      ],
    },
  ],
];
const FMLC_STANDING_RESERVATIONS: [string, Scenario][] = [
  [
    'C13 standing reservation remains v1/real-censusF2-off20474808-step17-successful-only',
    {
      drawProfile: {
        participantsCount: 13,
        drawSize: 16,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20474808,
      randomSeed: 1828851803,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 6,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 5,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 7,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_DEFAULT',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DEFAULTED',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 3,
            roundPosition: 1,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
    },
  ],
  [
    'C13 standing reservation remains v1/real-censusF2-on20474808-step17-successful-only',
    {
      drawProfile: {
        participantsCount: 13,
        drawSize: 16,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20474808,
      randomSeed: 1627423709,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 6,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 5,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 7,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_DEFAULT',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DEFAULTED',
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 1,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 3,
            roundPosition: 1,
          },
          outcome: {
            score: {
              scoreStringSide1: '',
              scoreStringSide2: '',
            },
            matchUpStatus: 'TO_BE_PLAYED',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Consolation',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 7,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: true,
            propagateExitStatus: true,
          },
        },
      ],
    },
  ],
  [
    'C13 standing reservation remains v1/stall-off20099923-step6-successful-only',
    {
      drawProfile: {
        participantsCount: 7,
        drawSize: 8,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20099923,
      randomSeed: 294488990,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
    },
  ],
  [
    'C13 standing reservation remains v1/stall-policyoff20099923-step6-successful-only',
    {
      drawProfile: {
        participantsCount: 7,
        drawSize: 8,
        drawType: 'FIRST_MATCH_LOSER_CONSOLATION',
      },
      nonRandom: 20099923,
      randomSeed: 294488990,
      setup: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 3,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 1,
            roundPosition: 4,
          },
          outcome: {
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'WALKOVER',
            winningSide: 2,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            matchUpStatus: 'DOUBLE_WALKOVER',
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
      steps: [
        {
          target: {
            structureName: 'Main',
            roundNumber: 2,
            roundPosition: 2,
          },
          outcome: {
            winningSide: 1,
          },
          params: {
            allowChangePropagation: false,
            propagateExitStatus: true,
          },
        },
      ],
      policyDefinitions: {
        progression: {
          doubleExitPropagateBye: false,
        },
      },
    },
  ],
];

// C14 keeps the original reservation; explicit carried requests and other routes remain outside this program.
const FMLC_STANDING_WINNERS: [string, Scenario][] = FMLC_STANDING_RESERVATIONS.flatMap(([label, base]) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((matchUpStatus) =>
    ([1, 2] as const).flatMap((winningSide) =>
      [undefined, WALKOVER, DEFAULTED].map((requested) => {
        const target = base.steps[0].target;
        const setup = (base.setup ?? []).map((step) => ({
          ...step,
          outcome:
            step.target.structureName === target.structureName &&
            step.target.roundNumber === target.roundNumber &&
            step.target.roundPosition === target.roundPosition &&
            [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(step.outcome.matchUpStatus as typeof DOUBLE_WALKOVER)
              ? { matchUpStatus }
              : step.outcome,
          params: { ...step.params, ...(requested ? { propagateExitStatus: false } : {}) },
        }));
        return [
          `${label.replace('C13 standing reservation remains v1', 'C14 standing reservation')}/${matchUpStatus}/side${winningSide}/${requested ?? 'bare'}`,
          {
            ...base,
            setup,
            steps: [
              {
                ...base.steps[0],
                outcome: { winningSide, ...(requested ? { matchUpStatus: requested } : {}) },
                params: { ...base.steps[0].params, ...(requested ? { propagateExitStatus: false } : {}) },
              },
            ],
          },
        ] as [string, Scenario];
      }),
    ),
  ),
);
const FMLC_STANDING_OUTSIDE: [string, Scenario][] = FMLC_STANDING_RESERVATIONS.flatMap(([label, base]) =>
  (
    [
      ['clear', cleared],
      ['carried WO', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['carried DEF', { matchUpStatus: DEFAULTED, winningSide: 2 }],
      ['double correction', { matchUpStatus: DOUBLE_DEFAULT }],
    ] as const
  ).map(
    ([kind, outcome]) =>
      [`C14 outside/${label}/${kind}`, { ...base, steps: [{ ...base.steps[0], outcome }] }] as [string, Scenario],
  ),
);

const supersededRelayOutcome = (requested: string, winningSide: 1 | 2) => {
  if (requested === 'clear') return {};
  return { winningSide, ...(requested === 'bare' ? {} : { matchUpStatus: requested }) };
};
const SUPERSEDED_OWN_RELAY_TABLE: [string, Scenario][] = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((stored) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((producer) =>
    ([WALKOVER, DEFAULTED, 'bare', 'clear'] as const).flatMap((requested) =>
      (requested === 'clear' ? ([1] as const) : ([1, 2] as const)).map((winningSide): [string, Scenario] => [
        `C15 superseded own relay/${stored}/${producer}/${requested}/side${winningSide}`,
        {
          drawProfile: { drawType: FEED_IN_CHAMPIONSHIP_TO_SF, drawSize: 16, participantsCount: 13 },
          nonRandom: 20733977,
          randomSeed: 3488028307,
          setup: [
            { target: R1(4, 'Main'), outcome: { winningSide: 2 }, params: SWAP_CARRIED },
            { target: R1(5, 'Main'), outcome: { winningSide: 2 }, params: SWAP_CARRIED },
            {
              target: R1(6, 'Main'),
              outcome: { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } },
              params: SWAP_CARRIED,
            },
            { target: R1(7, 'Main'), outcome: { winningSide: 1 }, params: SWAP_CARRIED },
            {
              target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 },
              outcome: { matchUpStatus: stored },
              params: SWAP_CARRIED,
            },
            { target: R1(2, 'Main'), outcome: { matchUpStatus: DEFAULTED, winningSide: 1 }, params: SWAP_CARRIED },
            { target: R1(3, 'Consolation'), outcome: { matchUpStatus: producer }, params: SWAP_CARRIED },
          ],
          steps: [
            {
              target: { structureName: 'Main', roundNumber: 2, roundPosition: 2 },
              outcome: supersededRelayOutcome(requested, winningSide),
              params: SWAP_CARRIED,
            },
          ],
        },
      ]),
    ),
  ),
);
const ORIGINAL_SUPERSEDED_OWN_RELAYS = SUPERSEDED_OWN_RELAY_TABLE.filter(
  ([, scenario]) => !!scenario.steps[0].outcome.matchUpStatus,
);
// Public 16-participant mirror: the newly produced exit supersedes provenance on side 2.
const MIRRORED_SUPERSEDED_OWN_RELAYS: [string, Scenario][] = ORIGINAL_SUPERSEDED_OWN_RELAYS.map(([label, scenario]) => [
  label.replace('C15 superseded own relay/', 'C15 superseded own relay/mirror/'),
  {
    ...scenario,
    drawProfile: { ...scenario.drawProfile, participantsCount: 16 },
    setup: [
      ...Array.from({ length: 8 }, (_, index) => ({
        target: R1(index + 1, 'Main'),
        outcome: { winningSide: 1 },
        params: SWAP_CARRIED,
      })),
      {
        target: { structureName: 'Main', roundNumber: 2, roundPosition: 3 },
        outcome: scenario.setup![4].outcome,
        params: SWAP_CARRIED,
      },
      { target: R1(2, 'Consolation'), outcome: scenario.setup![6].outcome, params: SWAP_CARRIED },
    ],
    steps: [{ ...scenario.steps[0], target: { structureName: 'Main', roundNumber: 2, roundPosition: 3 } }],
  },
]);
const SUPERSEDED_OWN_RELAYS = [...ORIGINAL_SUPERSEDED_OWN_RELAYS, ...MIRRORED_SUPERSEDED_OWN_RELAYS];
const SUPERSEDED_OWN_RELAY_OUTSIDE = SUPERSEDED_OWN_RELAY_TABLE.filter(
  ([, scenario]) => !scenario.steps[0].outcome.matchUpStatus,
);

const SCENARIOS: [string, Scenario][] = [
  ...SUPERSEDED_OWN_RELAYS,
  ...FMLC_STANDING_WINNERS,
  ...FMLC_NO_ARRIVAL_WINNERS,
  ...FMLC_NO_ARRIVAL_REAL,
  ...STANDALONE_CARRIED_CONVERGENCES,
  ...STANDALONE_BARE_WINNERS,
  ...STANDALONE_INDIRECT_CLEARS,
  ...INDIRECT_COMPOUND_CLEARS,
  ...STANDING_BYE_CAPTURES,
  ...FIRST_MATCHUP_OWNED,
  ...TERMINAL_RELAY_CAPTURES,
  ...TERMINAL_TRUE_CLEARS,
  ...OCCUPIED_FINAL_RELAY_CAPTURES,
  ...CONVERGED_PRODUCED_RELAYS,
  ...CARRIED_CONVERGED_PRODUCED_RELAYS,
  ...NOTICE_RELAY_CARRIES,
  ...AWARDED_PRODUCED_RELAY,
  ...PRODUCED_RELAY,
  ...UNWOUND_CONVERGENCE,
  ...UNWOUND_CARRY,
  ...CARRIER_SENT_ON,
  ...CARRIED_BESIDE_BYE,
  ...WALKED_SEATS,
  ...PRODUCED_FINALS,
  ...HELD_AWARDS_ONWARD,
  ...HELD_AWARDS,
  ...FIRST_MATCHUP_SEATS,
  ...DOUBLE_BYE_ENDS,
  ...HELD_JOINS,
  ...JOINED_SEATS,
  ...FED_SEATS,
  [
    'FEED_IN_CHAMPIONSHIP: the Main final entered as a double default under doubleExitPropagateBye false: its fed loser seat takes the BYE (S7)',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      setup: TO_FINAL_8('Main').slice(0, 6),
      steps: [{ target: FINAL_8('Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
    },
  ],
  ...THROUGH_CHAINS,
  ...RELAYS,
  ...PASSAGES,
  // ...and into a plain round whose other position came through the paired BYE, which the unwind takes back too: both
  // released
  ...[FEED_IN_CHAMPIONSHIP, DOUBLE_ELIMINATION, MODIFIED_FEED_IN_CHAMPIONSHIP].map((drawType): [string, Scenario] => [
    `${drawType} 6 of 8: R1/2 a double walkover beside the BYE given a walkover, both positions beyond released`,
    {
      drawProfile: { drawSize: 8, participantsCount: 6, drawType },
      nonRandom: 9000230,
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: walkover(1) }],
    },
  ]),
  // the released award's seat a double BYE in the consolation's second round, its own position sent on into a feed
  // round that holds its fed seat beside it: taken out of it as v1's position clear takes it (S7)
  ...[FEED_IN_CHAMPIONSHIP, DOUBLE_ELIMINATION].map((drawType): [string, Scenario] => [
    `${drawType} 9 of 16 (policy off): R1/5 past the BYE given a walkover, the award through a BYE released beside a fed seat`,
    {
      drawProfile: { drawSize: 16, participantsCount: 9, drawType },
      nonRandom: 9000230,
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(5, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(5, 'Main'), outcome: walkover(1) }],
    },
  ]),
  // the census schedule (run 18, seed 20655968): Main 1/15's double default carried its DEFAULTED past Consolation 1/8's
  // BYE and the BYE Main 2/1's re-entered double default left in Consolation 2/8, which held no score: v1's score write
  // leaves the blank one there
  [
    'MODIFIED_FEED_IN_CHAMPIONSHIP 29 of 32 (policy off): a double default cleared, its carry past two BYEs, one unscored',
    {
      drawProfile: { drawSize: 32, participantsCount: 29, drawType: MODIFIED_FEED_IN_CHAMPIONSHIP },
      nonRandom: 20655968,
      policyDefinitions: POLICY_OFF,
      setup: [
        { target: R1(2, 'Main'), outcome: walkover(2) },
        { target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' }, outcome: won(2) },
        { target: R1(15, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } },
        {
          target: { roundNumber: 2, roundPosition: 1, structureName: 'Main' },
          outcome: { matchUpStatus: DOUBLE_DEFAULT },
        },
      ],
      steps: [{ target: R1(15, 'Main'), outcome: cleared }],
    },
  ],
  // S7: a double exit given a winner, its produced exit released by the unwind, as the clear releases it
  [
    'SINGLE_ELIMINATION 16: a double walkover given a walkover, its produced walkover awarded on to the paired winner',
    {
      drawProfile: { drawSize: 16, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(2), outcome: won(2) },
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1), outcome: walkover(1) }],
    },
  ],
  [
    'SINGLE_ELIMINATION: a double walkover awarded to the paired winner, who went on, then given a winner: the award released',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [
        { target: R1(2), outcome: won(1) },
        { target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1), outcome: won(1) }],
    },
  ],
  [
    'COMPASS: a double walkover awarded to the paired winner, who went on, then given a winner: the award released',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [
        { target: R1(2, 'East'), outcome: won(1) },
        { target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'East'), outcome: won(1) }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP: a consolation double walkover given a winner, its produced exit pending in the feed round: unwound, the winner directed',
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [...MAIN_R1_8, { target: R1(1, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Consolation'), outcome: won(1) }],
    },
  ],
  // S7: past the BYE, a produced exit stands pending beyond: the two converge, and the double exit produces on
  [
    'FIRST_MATCH_LOSER_CONSOLATION 16/15: Consolation 1/4 a double walkover converging past a BYE, twice, to the final',
    {
      drawProfile: { drawType: 'FIRST_MATCH_LOSER_CONSOLATION', drawSize: 16, participantsCount: 15 },
      nonRandom: 167,
      setup: [
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(5, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(6, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(3, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(7, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(8, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
      ],
      steps: [{ target: R1(4, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION 16/15: Consolation 1/4 a double default converging past a BYE, twice, to the final',
    {
      drawProfile: { drawType: 'FIRST_MATCH_LOSER_CONSOLATION', drawSize: 16, participantsCount: 15 },
      nonRandom: 169,
      setup: [
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED },
        { target: R1(5, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(6, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(3, 'Consolation'), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED },
        { target: R1(7, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(8, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
      ],
      steps: [{ target: R1(4, 'Consolation'), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED }],
    },
  ],
  [
    'MODIFIED_FEED_IN_CHAMPIONSHIP 16/16: Consolation 1/4 a double walkover converging past a BYE, pending beyond',
    {
      drawProfile: { drawType: 'MODIFIED_FEED_IN_CHAMPIONSHIP', drawSize: 16, participantsCount: 16 },
      nonRandom: 277,
      setup: [
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(2, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(5, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(6, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(3, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(7, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(8, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
      ],
      steps: [{ target: R1(4, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED }],
    },
  ],
  // S7: past the BYE, the matchUp beyond holds a position nobody has reached on its other side: the exit stands pending
  [
    'MODIFIED_FEED_IN_CHAMPIONSHIP 8/7: Consolation 1/2 a double walkover beside a BYE, a position unreached beyond',
    {
      drawProfile: { drawType: 'MODIFIED_FEED_IN_CHAMPIONSHIP', drawSize: 8, participantsCount: 7 },
      nonRandom: 257,
      setup: [
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
      ],
      steps: [{ target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED }],
    },
  ],
  // S7: past the BYE, an opponent stands in the matchUp beyond: the exit is theirs at once and they go on
  [
    'FIRST_MATCH_LOSER_CONSOLATION 16/16: Consolation 1/4 a double walkover beside a BYE, the opponent beyond awarded it',
    {
      drawProfile: { drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 16 },
      nonRandom: 157,
      setup: [
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(2, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        {
          target: { roundNumber: 3, roundPosition: 1, structureName: 'Consolation' },
          outcome: { winningSide: 1 },
          params: CARRIED,
        },
        { target: R1(5, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(6, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(7, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(8, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
      ],
      steps: [{ target: R1(4, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED }],
    },
  ],
  // S7: the produced exit past a BYE-held next matchUp walks on through BYE-held matchUps (each left a BYE, the exit
  // recorded), to a clean matchUp where it lands pending, or to the structure's end; exit matrix cells' sequences
  ...(
    [
      ['FIRST_MATCH_LOSER_CONSOLATION', 8, 7, 137, 'one BYE passed, then the final: nothing beyond'],
      ['FIRST_MATCH_LOSER_CONSOLATION', 16, 15, 167, 'one BYE passed, the exit pending in the matchUp beyond'],
      ['FIRST_ROUND_LOSER_CONSOLATION', 8, 7, 197, 'the BYE matchUp is the final: the exit recorded, nothing beyond'],
      ['FEED_IN_CHAMPIONSHIP_TO_QF', 8, 7, 100137, 'the BYE matchUp is the final: the exit recorded, nothing beyond'],
    ] as const
  ).map(([drawType, drawSize, participantsCount, nonRandom, shape]): [string, Scenario] => [
    `${drawType} ${drawSize}/${participantsCount}: Consolation 1/2 a double walkover beside a BYE, ${shape}`,
    {
      drawProfile: { drawType, drawSize, participantsCount },
      nonRandom,
      setup: [
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
      ],
      steps: [{ target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED }],
    },
  ]),
  // S7: a double exit whose next matchUp holds a BYE on the side its produced exit is awarded to (the fed seat a BYE):
  // that matchUp stays a BYE and records the exit, which stands pending in the matchUp beyond
  ...(['DOUBLE_WALKOVER', 'DOUBLE_DEFAULT'] as const).flatMap((status): [string, Scenario][] =>
    [1, 2, 3, 4].map((roundPosition) => [
      `FIRST_MATCH_LOSER_CONSOLATION 16: Consolation 1/${roundPosition} ${status} beside a fed BYE: the exit pending beyond`,
      {
        drawProfile: { drawSize: 16, drawType: FIRST_MATCH_LOSER_CONSOLATION },
        setup: [
          ...[1, 2, 3, 4, 5, 6, 7, 8].map((p) => ({ target: R1(p, 'Main'), outcome: won(1) })),
          ...[1, 2, 3, 4].map((p) => ({
            target: { roundNumber: 2, roundPosition: p, structureName: 'Main' },
            outcome: won(1),
          })),
        ],
        steps: [{ target: R1(roundPosition, 'Consolation'), outcome: { matchUpStatus: status } }],
      },
    ]),
  ),
  // S7: a semifinal's double exit beside a decided semifinal: the exit it produces in the final is the winner's at once,
  // who goes nowhere (no winner target): the award is all there is
  [
    'SINGLE_ELIMINATION: a semifinal double walkover beside a decided one: the final awarded, nothing onward',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [...TO_FINAL_8().slice(0, 4), { target: { roundNumber: 2, roundPosition: 2 }, outcome: won(2) }],
      steps: [{ target: { roundNumber: 2, roundPosition: 1 }, outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'SINGLE_ELIMINATION: a semifinal double default beside a decided one, under propagateExitStatus: the final awarded',
    {
      drawProfile: { drawSize: 4, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(2), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED }],
    },
  ],
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
    'notes: a winner with notes, written onto its matchUp with the result (S7)',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [{ target: R1(1), outcome: won(1), params: NOTED }],
    },
  ],
  [
    'notes: a score with no winner, with notes (the removal route)',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [
        {
          target: R1(1),
          outcome: { score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } },
          params: NOTED,
        },
      ],
    },
  ],
  [
    'notes: a winner re-scored with notes (the score-only route)',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: won(1), params: NOTED }],
    },
  ],
  [
    'notes: a result cleared with notes (the clear route): v1 writes the notes onto the cleared matchUp',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [{ target: R1(1), outcome: won(1) }],
      steps: [{ target: R1(1), outcome: cleared, params: NOTED }],
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
    'SINGLE_ELIMINATION: a matchUp in progress entered as a double walkover: its score written over',
    {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      setup: [
        {
          target: R1(1),
          outcome: { matchUpStatus: IN_PROGRESS, score: { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] } },
        },
      ],
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
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
  // the unwind walk (S6 tail): the unfillable seat's BYE and the own seat's meet in the consolation, removed as v1 removes
  // them, each matchUp announced as its last visit leaves it
  [
    'FIRST_MATCH_LOSER_CONSOLATION 7 of 8: a double walkover beside the BYE cleared, awarded through the BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: cleared }],
    },
  ],
  // S7: the same double exits given a winner: the award through the BYE released, the winner directed into the next
  // round; behind a loser link the loser lands on the seat the unwind freed, opposite the standing BYE, and goes on
  // through it into the matchUp that still holds their position (`unwoundThrough`)
  ...[SINGLE_ELIMINATION, FEED_IN_CHAMPIONSHIP, DOUBLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION].map(
    (drawType): [string, Scenario] => [
      `${drawType} 7 of 8: a double walkover beside the BYE given a winner, the award through the BYE released`,
      {
        drawProfile: { drawSize: 8, participantsCount: 7, drawType },
        setup: [
          {
            target: R1(2, drawType === SINGLE_ELIMINATION ? undefined : 'Main'),
            outcome: { matchUpStatus: DOUBLE_WALKOVER },
          },
        ],
        steps: [{ target: R1(2, drawType === SINGLE_ELIMINATION ? undefined : 'Main'), outcome: won(1) }],
      },
    ],
  ),
  [
    'FIRST_MATCH_LOSER_CONSOLATION 7 of 8: a double default beside the BYE given a walkover, the award through the BYE released',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT } }],
      steps: [{ target: R1(2, 'Main'), outcome: walkover(2) }],
    },
  ],
  [
    'COMPASS 5 of 8: a double walkover beside the BYE given a walkover: the loser through West 1/1 into West 2/1, a BYE still',
    {
      drawProfile: { drawSize: 8, participantsCount: 5, drawType: COMPASS },
      nonRandom: 9000230,
      policyDefinitions: { [POLICY_TYPE_PROGRESSION]: CARRIED },
      setup: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'East'), outcome: walkover(1) }],
    },
  ],
  // the unwind walk (S6 tail): a cleared double exit beside another, its BYEs removed as v1's removal recursion removes them
  [
    'COMPASS 8 of 8: a double walkover cleared, R1 position 3 a double walkover too: the release empties West 2/1 before the next task looks for it: no visit there',
    {
      drawProfile: { drawSize: 8, drawType: COMPASS },
      setup: [
        { target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    },
  ],
  [
    'COMPASS 7 of 8: a double walkover cleared',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: COMPASS },
      setup: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'East'), outcome: cleared }],
    },
  ],
  [
    'COMPASS 16 of 16: a double walkover cleared, R1 position 2 a double walkover too',
    {
      drawProfile: { drawSize: 16, drawType: COMPASS },
      setup: [
        { target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    },
  ],
  [
    'COMPASS 15 of 16: a double walkover cleared, R1 position 3 a double walkover too',
    {
      drawProfile: { drawSize: 16, participantsCount: 15, drawType: COMPASS },
      setup: [
        { target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(2, 'East'), outcome: cleared }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION 7 of 8: a double walkover cleared, R1 position 2 a double walkover too: the own seat visit to Consolation 2/2 announced, position 5 already gone from it',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(3, 'Main'), outcome: cleared }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION 13 of 16: a double walkover cleared, R1 position 4 a double walkover too',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(2, 'Main'), outcome: cleared }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 15 of 16: a double walkover cleared, R1 position 7 a double walkover too',
    {
      drawProfile: { drawSize: 16, participantsCount: 15, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(7, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(2, 'Main'), outcome: cleared }],
    },
  ],
  [
    'CURTIS_CONSOLATION 8 of 8: a double walkover cleared, R1 position 3 a double walkover too',
    {
      drawProfile: { drawSize: 8, drawType: CURTIS_CONSOLATION },
      setup: [
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'DOUBLE_ELIMINATION 8 of 8: a double walkover cleared, R1 position 3 a double walkover too',
    {
      drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION },
      setup: [
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'OLYMPIC 8 of 8: a double walkover cleared, R1 position 2 a double walkover too',
    {
      drawProfile: { drawSize: 8, drawType: OLYMPIC },
      setup: [
        { target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    },
  ],
  [
    'OLYMPIC 15 of 16: a double walkover cleared, R1 position 3 a double walkover too',
    {
      drawProfile: { drawSize: 16, participantsCount: 15, drawType: OLYMPIC },
      setup: [
        { target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(2, 'East'), outcome: cleared }],
    },
  ],
  [
    'MODIFIED_FEED_IN_CHAMPIONSHIP 8 of 8: a double walkover cleared, R1 position 3 a double walkover too',
    {
      drawProfile: { drawSize: 8, drawType: MODIFIED_FEED_IN_CHAMPIONSHIP },
      setup: [
        { target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
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
  [
    'FIRST_MATCH_LOSER_CONSOLATION 16/13 (S6 tail, the BYE chain): a double BYE passing a fed BYE that stands in the consolation feed round',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(5, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(6, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FIRST_MATCH_LOSER_CONSOLATION 16/14 (S6 tail, the BYE chain): a double BYE passing a BYE standing in a feed round, into the round beyond',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 8/7 (S6 tail, the BYE chain): the unfillable seat opposite a standing BYE: a double BYE there makes the next round a BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 8/8 (S6 tail, the BYE chain): the unfillable seat position joins the matchUp the own seat position passed into',
    {
      drawProfile: { drawSize: 8, participantsCount: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 16/13 (S6 tail, the BYE chain): the two chains meeting in the consolation, 16 draw',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(4, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(5, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'CURTIS_CONSOLATION 16/13 (S6 tail, the BYE chain): a double BYE beside a standing BYE in the consolation',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(7, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'DOUBLE_ELIMINATION 16/13 (S6 tail, the BYE chain): a double BYE beside a standing BYE in the Backdraw',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: DOUBLE_ELIMINATION },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(7, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'MODIFIED_FEED_IN_CHAMPIONSHIP 16/13 (S6 tail, the BYE chain): a double BYE beside a standing BYE in the consolation',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: MODIFIED_FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(7, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS 8/7 (S6 tail, the BYE chain): a double BYE making the West final a BYE: the position beside it goes nowhere',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: COMPASS },
      setup: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS 8/6 (S6 tail, the BYE chain): the chain reaching a South seat that holds a BYE already: nothing placed, the chain ends',
    {
      drawProfile: { drawSize: 8, participantsCount: 6, drawType: COMPASS },
      setup: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'OLYMPIC 16/16 (S6 tail, the BYE chain): a double BYE chain across the loser links, ending at a seat that holds a BYE',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: OLYMPIC },
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'OLYMPIC 16/13 (S6 tail, the BYE chain): a double BYE whose next matchUp is the final of its structure',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: OLYMPIC },
      setup: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(4, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS 16/16 (S6 tail, the BYE walk): a BYE-held matchUp linking its loser on sends a BYE across into another structure (the walk of v1s recursion)',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS 16/15 (S6 tail, the BYE walk): the double BYE whose next matchUp links its loser on: the BYE goes on across that link',
    {
      drawProfile: { drawSize: 16, participantsCount: 15, drawType: COMPASS },
      setup: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS 16/16 (S6 tail, the BYE walk): adjacent double walkovers converge, the own seat placed by the walk of v1s recursion',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS 16/14 (S6 tail, the BYE walk): the walk reaches a seat that holds a BYE already, which takes nothing and ends it',
    {
      drawProfile: { drawSize: 16, participantsCount: 14, drawType: COMPASS },
      setup: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'FEED_IN_CHAMPIONSHIP 8/7 (S6 tail, the BYE walk): the fed unfillable seat advances a position into the matchUp the own seat made a BYE',
    {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'MODIFIED_FEED_IN_CHAMPIONSHIP 8/6 (S6 tail, the BYE walk): both seats make the same matchUp a BYE, the event kept from the first',
    {
      drawProfile: { drawSize: 8, participantsCount: 6, drawType: MODIFIED_FEED_IN_CHAMPIONSHIP },
      setup: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(3, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
    },
  ],
  [
    'COMPASS 8 (S6 tail, a convergence that links on): two carries converge in West 1/1, which links its loser on: the first carrier is displaced from South by the BYE of the double exit',
    {
      drawProfile: { drawSize: 8, participantsCount: 8, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(2, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC 16 (S6 tail, a convergence that links on): the BYE of the convergence displaces the first carrier, announced last by the pass that takes its scored time',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: OLYMPIC },
      setup: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(2, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'OLYMPIC 16 (S6 tail, a convergence that links on): the second carrier arriving on side 1 of the convergence',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: OLYMPIC },
      setup: [{ target: R1(2, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16 (S6 tail, a convergence that links on): the carry converges at a deeper level, whose double exit seats its BYEs',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: walkover(1), params: CARRIED }],
      steps: [{ target: R1(3, 'East'), outcome: walkover(1), params: CARRIED }],
    },
  ],
  [
    'COMPASS 16 (S6 tail, the unwind cascade): a cleared double walkover whose loser seat BYE went on across a further loser link: the cascade takes it back',
    {
      drawProfile: { drawSize: 16, participantsCount: 16, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    },
  ],
  [
    'COMPASS 8 (S6 tail, the unwind cascade): a cleared double walkover: the unfillable seat BYE in a one-round structure, and the loser cascade into South',
    {
      drawProfile: { drawSize: 8, participantsCount: 8, drawType: COMPASS },
      setup: [{ target: R1(1, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'East'), outcome: cleared }],
    },
  ],
  [
    'CURTIS_CONSOLATION 8 (S6 tail, the unwind cascade): a cleared double walkover whose consolation BYE takes back what it sent on',
    {
      drawProfile: { drawSize: 8, participantsCount: 8, drawType: CURTIS_CONSOLATION },
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(1, 'Main'), outcome: cleared }],
    },
  ],
  [
    'OLYMPIC 16/13 (S6 tail, the unwind cascade): a cleared double walkover whose seat makes a double BYE, its matchUp keeping the other BYE',
    {
      drawProfile: { drawSize: 16, participantsCount: 13, drawType: OLYMPIC },
      setup: [{ target: R1(2, 'East'), outcome: { matchUpStatus: DOUBLE_WALKOVER } }],
      steps: [{ target: R1(2, 'East'), outcome: cleared }],
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
  const matchUp: any = candidates[target.nth ?? 0];
  return target.singlesLine === undefined
    ? matchUp.matchUpId
    : matchUp.tieMatchUps.filter((line: any) => line.matchUpType === 'SINGLES')[target.singlesLine].matchUpId;
}

/** the steps from a fresh record, every topic subscribed and the clock fixed */
function play(
  mode: OutcomePipelineMode,
  { drawProfile, steps, setup = [], policyDefinitions, nonRandom = 1, randomSeed }: Scenario,
  { realClock, prepared }: { realClock?: boolean; prepared?: Tournament } = {},
) {
  // Pin the capture RNG and restore it even when setup or comparison throws; absent seeds leave old behavior alone.
  const previousRandom = randomSeed === undefined ? undefined : Math.random;
  try {
    if (randomSeed !== undefined) Math.random = createSeededRandom(randomSeed);
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock(realClock ? undefined : '2026-10-25T00:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ ...drawProfile, drawId: 'd' }],
      nonRandom,
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
    if (prepared) tournamentEngine.setState(structuredClone(prepared));
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
    const recordBefore = canonicalJson(tournamentEngine.getTournament().tournamentRecord);
    setOutcomePipeline(mode);
    v1Writes.count = 0;
    const results = steps.map(({ outcome, params }, i) => {
      if (!realClock) setClock(`2026-10-25T00:0${i + 1}:00.000Z`);
      return tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: matchUpIds[i], outcome, ...params });
    });
    return {
      recordBefore,
      record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
      v1Writes: v1Writes.count,
      notices,
      results: results.map(({ stack: _stack, ...result }: any) => result),
    };
  } finally {
    if (previousRandom) Math.random = previousRandom;
  }
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

describe('M1 notice contracts also compare with in-context subscribers under differential', () => {
  const noops = SCENARIOS.filter(([label]) => label.includes('asked for again'));
  it.each([...noops, ...NOTICE_RELAY_CARRIES])('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results.every((result: any) => result.success)).toEqual(true);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 converged produced relays compare subscribed differential notices', () => {
  it.each(CONVERGED_RELAY_CAPTURES)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 CURTIS standing BYE compares subscribed differential notices', () => {
  it.each(STANDING_BYE_CAPTURES)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 FMLC FIRST_MATCHUP arrivals compare subscribed differential notices', () => {
  it.each(FIRST_MATCHUP_OWNED)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('C11 standalone bare winners compare v1 and all subscribed differential notices', () => {
  it.each(STANDALONE_BARE_WINNERS)('%s v1 oracle', (label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
    expect(v1.notices).toHaveLength(label.includes('thirteen') ? 13 : 12);
  });
  it.each(STANDALONE_BARE_WINNERS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('C10 standalone indirect v1 oracle and subscribed differential notices', () => {
  it.each(STANDALONE_INDIRECT_CLEARS)('%s v1 oracle', (label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
    expect(v1.notices).toHaveLength(label.includes('thirteen') ? 13 : 12);
  });
  it.each(STANDALONE_INDIRECT_CLEARS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});
describe('C12 standalone carries compare the real nested writers and subscribed notices', () => {
  it.each(STANDALONE_CARRIED_CONVERGENCES)('%s v1 oracle', (label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(2);
    expect(v1.notices).toHaveLength(label.includes('thirteen') ? 15 : 14);
  });
  it.each(STANDALONE_CARRIED_CONVERGENCES)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 indirect compound clears compare subscribed differential notices', () => {
  it.each(INDIRECT_COMPOUND_CLEARS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 the original indirect compound winner remains v1s', () => {
  it('Main 1/2 double default corrected to walkover retains two legacy writers, whole', () => {
    const captured = INDIRECT_COMPOUND_CLEARS.find(
      ([label]) => label === 'indirect compound clear: DOUBLE_DEFAULT/DOUBLE_WALKOVER/DOUBLE_WALKOVER',
    );
    expect(captured).toBeDefined();
    const scenario: Scenario = {
      ...captured![1],
      steps: [{ ...captured![1].steps[0], outcome: { matchUpStatus: WALKOVER, winningSide: 1 } }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(2);
    expect(v1.notices).toHaveLength(18);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(2);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

describe('S7 terminal direct relays compare subscribed differential notices', () => {
  it.each([...TERMINAL_RELAY_CAPTURES, ...TERMINAL_TRUE_CLEARS])('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 terminal propagation winners remain v1s', () => {
  it.each(TERMINAL_TRUE_WINNERS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(1);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

describe('S7 occupied-final results compare subscribed differential notices', () => {
  it('the public setup has a real carrier beside the relay producer in a final', () => {
    const [, scenario] = OCCUPIED_FINAL_CLEARS[0];
    play(OUTCOME_PIPELINE_V1, { ...scenario, steps: [] });
    const matchUps = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
    const at = (structureName: string, roundNumber: number, roundPosition: number) =>
      matchUps.find(
        (matchUp: any) =>
          matchUp.structureName === structureName &&
          matchUp.roundNumber === roundNumber &&
          matchUp.roundPosition === roundPosition,
      );
    const producer = at('Consolation', 1, 2);
    const relay = at('Consolation', 2, 2);
    const onward = at('Consolation', 3, 1);
    const carrierSource = at('Main', 1, 2);
    expect(producer.winnerMatchUpId).toEqual(relay.matchUpId);
    expect(relay.matchUpStatus).toEqual(BYE);
    expect(relay.drawPositions).toEqual([2]);
    expect(onward.matchUpStatus).toEqual(DOUBLE_WALKOVER);
    expect(onward.winnerMatchUpId).toBeUndefined();
    expect(onward.sides.filter((side: any) => side.participantId).map((side: any) => side.drawPosition)).toEqual([4]);
    expect(
      Object.values(onward.sideExitProvenance)
        .map((entry: any) => entry.sourceMatchUpId)
        .sort(),
    ).toEqual([producer.matchUpId, carrierSource.matchUpId].sort());
  });
  it.each(OCCUPIED_FINAL_RELAY_CAPTURES)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('S7 occupied-final winner scope controls remain v1s', () => {
  const controls: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['reported score', won(1), CARRIED],
    ['requested format', { winningSide: 1 }, { ...CARRIED, matchUpFormat: 'SET1-S:6/TB7' }],
    ['carried schedule', { winningSide: 1 }, { ...CARRIED, schedule: { scheduledDate: '2026-10-25' } }],
    ['carried notes', { winningSide: 1 }, { ...CARRIED, notes: 'occupied winner scope control' }],
  ];
  it.each(controls)('%s', (_label, outcome, params) => {
    const captured = OCCUPIED_FINAL_RELAY_CAPTURES.find(([label]) =>
      label.endsWith('WALKOVER/DOUBLE_WALKOVER/DOUBLE_WALKOVER/winner1'),
    );
    expect(captured).toBeDefined();
    const scenario: Scenario = {
      ...captured![1],
      steps: [{ ...captured![1].steps[0], outcome, params }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(v1.v1Writes);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

describe('S7 the nonterminal outer occupied correction remains v1s', () => {
  it('the original five-setup Main 1/2 double default corrected to walkover remains fallback, whole', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, participantsCount: 7, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
      nonRandom: 20650915,
      setup: [
        { target: R1(2, 'Main'), outcome: { matchUpStatus: DOUBLE_DEFAULT }, params: CARRIED },
        { target: R1(3, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        { target: R1(4, 'Main'), outcome: { winningSide: 1 }, params: CARRIED },
        {
          target: { roundNumber: 2, roundPosition: 2, structureName: 'Main' },
          outcome: { matchUpStatus: DOUBLE_WALKOVER },
          params: CARRIED,
        },
        { target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
      ],
      steps: [{ target: R1(2, 'Main'), outcome: { matchUpStatus: WALKOVER, winningSide: 1 }, params: CARRIED }],
    };
    const random = Math.random;
    try {
      Math.random = createSeededRandom(2519021469);
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      expect(v1.v1Writes).toEqual(2);
      expect(v1.notices).toHaveLength(12);
      for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
        Math.random = createSeededRandom(2519021469);
        const compared = play(mode, scenario);
        expect(compared.v1Writes).toEqual(2);
        expect(compared.results).toEqual(v1.results);
        expect(compared.record).toEqual(v1.record);
        expect(compared.notices).toEqual(v1.notices);
      }
    } finally {
      Math.random = random;
    }
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

  it('S7: FMLC, a double walkover awarded to the paired winner then given a winner: v1s (the consolation seat)', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FIRST_MATCH_LOSER_CONSOLATION },
      setup: [
        { target: R1(2, 'Main'), outcome: won(1) },
        { target: R1(1, 'Main'), outcome: { matchUpStatus: DOUBLE_WALKOVER } },
      ],
      steps: [{ target: R1(1, 'Main'), outcome: won(1) }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toBeGreaterThan(0);
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
// carries re-derived too) it stays v1's, whole. A released award given a winner is v2's since S7 (SCENARIOS)
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

describe('under v2, notes on a double exit are v1s (S7: v1 forwards the calls params to the exits it writes)', () => {
  it('a double walkover with notes abstains `notes`, and v2 leaves exactly what v1 leaves', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: SINGLE_ELIMINATION },
      steps: [{ target: R1(1), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: NOTED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const deferred = () => getDifferentialTally()['shadow:abstain:notes']?.deferred ?? 0;
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(deferred()).toEqual(before + 1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });
});

describe('C17 a cleared Main final whose loser a link fed is v2s (decision 5; ruling 10 found the shape)', () => {
  // `removalOps` emits a final's loser leg alone, as `resultToDoubleExit` needs; until C17 `removedOps` guarded a final
  // out before it, and that empty plan left the fed seat occupied, which the settle check abstained on. The guard is
  // gone: v1's `removeDirectedLoser` clears the seat and announces the consolation matchUp, and v2 plans the same.
  it('FIC 8, Main played out, the final cleared: v2 owns it, and leaves exactly what v1 leaves', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      setup: [MAIN(1, 1), MAIN(1, 2), MAIN(1, 3), MAIN(1, 4), MAIN(2, 1), MAIN(2, 2), MAIN(3, 1)].map((target) => ({
        target,
        outcome: won(1),
      })),
      steps: [{ target: MAIN(3, 1), outcome: cleared }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const tally = () => ({
      applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
      settle: getDifferentialTally()['shadow:abstain:settle']?.deferred ?? 0,
    });
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied + 1, settle: before.settle });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('the convergence beyond a relayed copy that feeds on is v1s (ruling 2: the geometry wall held by a test)', () => {
  // Consolation 3/1 converges to a double walkover holding the carrier alone, but feeds Consolation 4/1, which v1 also
  // rewrites (and takes a participant back out of 5/1). Every relay program refuses it; only `occupiedFinalRelaySeatOps`'s
  // `next.winnerMatchUpId` clause tells it from the occupied final. A classifier on the copy's content alone would own it.
  it('FIC_TO_SF 16 of 15 (seed 1): Main 2/3 cleared after Main 2/4 and Consolation 1/2 double walkovers abstains `exit`, and v2 leaves exactly what v1 leaves', () => {
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, participantsCount: 15, drawType: FEED_IN_CHAMPIONSHIP_TO_SF },
      nonRandom: 1,
      setup: [
        { target: MAIN(1, 2), outcome: walkover(1), params: CARRIED },
        ...[3, 4, 5, 6, 7, 8].map((roundPosition) => ({
          target: MAIN(1, roundPosition),
          outcome: won(1),
          params: CARRIED,
        })),
        { target: MAIN(2, 4), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: R1(2, 'Consolation'), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
        { target: MAIN(2, 3), outcome: { matchUpStatus: DOUBLE_WALKOVER }, params: CARRIED },
      ],
      steps: [{ target: MAIN(2, 3), outcome: cleared, params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const deferred = () => getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0;
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(deferred()).toEqual(before + 1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
  });
});

describe('C13 no-arrival public writers and subscribed differential notices', () => {
  it.each([...FMLC_NO_ARRIVAL_WINNERS, ...FMLC_NO_ARRIVAL_REAL])('%s v1 oracle', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
  });
  it.each([...FMLC_NO_ARRIVAL_WINNERS, ...FMLC_NO_ARRIVAL_REAL])('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
  const carried = FMLC_NO_ARRIVAL_WINNERS.filter(([, scenario]) => scenario.steps[0].outcome.matchUpStatus).map(
    ([label, scenario]): [string, Scenario] => [
      `${label}/carried still v1`,
      {
        ...scenario,
        steps: scenario.steps.map((step) => ({ ...step, params: { ...step.params, propagateExitStatus: true } })),
      },
    ],
  );
  it.each(carried)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(1);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

/** Entire stored Consolation structures, including raw field presence and timestamps. */
function consolationRecord(record: string) {
  const structures = JSON.parse(record)
    .events.flatMap((event: any) => event.drawDefinitions ?? [])
    .flatMap((draw: any) => draw.structures ?? [])
    .filter((structure: any) => structure.structureName === 'Consolation');
  expect(structures).toHaveLength(1);
  return structures;
}

const materialModes = (scenarios: [string, Scenario][]) =>
  scenarios.flatMap(([label, scenario]) =>
    ([OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2] as const).map((mode) => [`${label}/${mode}`, scenario, mode] as const),
  );

describe('C14 standing reservations preserve their original stored records', () => {
  it.each(materialModes(FMLC_STANDING_WINNERS))('%s independent standing material', (_label, scenario, mode) => {
    const actual = play(mode, scenario);
    expect(actual.results.every((result: any) => result.success)).toEqual(true);
    expect(consolationRecord(actual.record)).toEqual(consolationRecord(actual.recordBefore));
    expect(actual.v1Writes).toEqual(mode === OUTCOME_PIPELINE_V1 ? 1 : 0);
  });
  it.each(FMLC_STANDING_WINNERS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
  it.each(FMLC_STANDING_OUTSIDE)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(1);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
  it.each(materialModes(FMLC_NO_ARRIVAL_REAL))(
    '%s C14 boundary: the withdrawn BYE is actually re-announced',
    (_label, scenario, mode) => {
      const actual = play(mode, scenario);
      const at = (record: string) =>
        consolationRecord(record)[0].matchUps.find(
          (matchUp: any) =>
            matchUp.roundNumber === 2 && matchUp.roundPosition === scenario.steps[0].target.roundPosition,
        );
      const before = at(actual.recordBefore);
      const after = at(actual.record);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(before.matchUpStatus).toEqual(BYE);
      expect(after.matchUpStatus).toEqual(BYE);
      expect(after.updatedAt).not.toEqual(before.updatedAt);
      expect(after.updatedAt).toEqual('2026-10-25T00:01:00.000Z');
      expect(
        actual.notices.some((notice) => notice.includes('setMatchUpStatusBye') && notice.includes(after.matchUpId)),
      ).toEqual(true);
    },
  );
});

describe('C15 superseded own relay material and notice contracts', () => {
  it.each(SUPERSEDED_OWN_RELAYS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
  it.each(materialModes(SUPERSEDED_OWN_RELAYS))(
    '%s independent stored and writer contract',
    (_label, scenario, mode) => {
      const actual = play(mode, scenario);
      expect(actual.results.every((result: any) => result.success)).toEqual(true);
      const before = consolationRecord(actual.recordBefore)[0].matchUps;
      const after = consolationRecord(actual.record)[0].matchUps;
      const at = (list: any[], roundNumber: number, roundPosition: number) =>
        list.find((matchUp: any) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);
      const mirrored = _label.includes('/mirror/');
      const producedSide = mirrored ? 2 : 1;
      const relay = at(after, 2, mirrored ? 2 : 3);
      const target = at(after, 3, mirrored ? 1 : 2);
      const targetBefore = at(before, 3, mirrored ? 1 : 2);
      const producer = at(before, 1, mirrored ? 2 : 3);
      const isDefault =
        producer.matchUpStatus === DOUBLE_DEFAULT && scenario.steps[0].outcome.matchUpStatus === DEFAULTED;
      const producedStatus = isDefault ? DEFAULTED : WALKOVER;
      const doubleStatus = isDefault ? DOUBLE_DEFAULT : DOUBLE_WALKOVER;
      expect(targetBefore.sideExitProvenance?.[producedSide]?.sourceMatchUpId).toEqual(producer.matchUpId);
      expect(relay.matchUpStatus).toEqual(doubleStatus);
      expect(relay.score).toEqual({ scoreStringSide1: '', scoreStringSide2: '' });
      expect(relay.schedule.scoredTime).toEqual('2026-10-25T00:01:00.000Z');
      expect(target.drawPositions).toEqual([]);
      expect(target.matchUpStatus).toEqual(producedStatus);
      expect(target).not.toHaveProperty('winningSide');
      expect(target.score).toEqual({ scoreStringSide1: '', scoreStringSide2: '' });
      expect(target.matchUpStatusCodes).toEqual([]);
      expect(target.schedule ?? {}).not.toHaveProperty('scoredTime');
      expect(target.sideExitProvenance).toEqual({
        [producedSide]: {
          matchUpStatus: producedStatus,
          previousMatchUpStatus: doubleStatus,
          sourceMatchUpId: relay.matchUpId,
        },
      });
      expect(at(after, 4, mirrored ? 1 : 2)).toEqual(at(before, 4, mirrored ? 1 : 2));
      expect(at(after, 2, mirrored ? 1 : 4)).toEqual(at(before, 2, mirrored ? 1 : 4));
      expect(actual.v1Writes).toEqual(mode === OUTCOME_PIPELINE_V1 ? 2 : 0);
      const notices = actual.notices.map((notice) => {
        const split = notice.indexOf(' ');
        return { topic: notice.slice(0, split), payload: JSON.parse(notice.slice(split + 1)) };
      });
      expect(notices.map(({ topic }) => topic)).toEqual([
        MODIFY_DRAW_DEFINITION,
        MODIFY_POSITION_ASSIGNMENTS,
        ...Array(6).fill(MODIFY_MATCHUP),
        ...Array(5).fill(UPDATE_INCONTEXT_MATCHUP),
      ]);
      expect(notices.filter(({ topic }) => topic === MODIFY_MATCHUP).map(({ payload }) => payload.context)).toEqual([
        'modifyMatchUpScore',
        mirrored ? 'removeDrawPosition-2' : 'removeDrawPosition-1',
        'modifyMatchUpScore',
        'assignMatchUpDrawPosition',
        'modifyMatchUpScore',
        'modifyMatchUpScore',
      ]);
      expect(notices[6].payload.matchUp.matchUpId).toEqual(relay.matchUpId);
      expect(notices[7].payload.matchUp.matchUpId).toEqual(target.matchUpId);
    },
  );
  it.each(SUPERSEDED_OWN_RELAY_OUTSIDE)('%s preserves existing boundary', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
      // A locally owned clear still runs v1 in differential's comparison shadow.
      expect(compared.v1Writes).toEqual(_label.includes('/clear/') && mode === OUTCOME_PIPELINE_V2 ? 0 : 1);
    }
  });
});

/**
 * C16: THE LOSER BESIDE AN OPPONENT BYE GOES ON THROUGH THE CHAIN TO THE PASSAGE'S LANDING (census w2 9100153,
 * FIRST_ROUND_LOSER_CONSOLATION 16/11, seed 9100153, `doubleExitPropagateBye: false`). Main 1/4 a DOUBLE_DEFAULT: its
 * produced DEFAULTED passed Consolation 1/2's and 2/1's BYEs (RULE 1) and stood pending at Consolation 3/1. Given a
 * winner, v1 unwinds the passage (`removeDoubleExit`: each BYE matchUp keeps its BYE with the carry's provenance
 * withdrawn, the landing written back to be played, quietly, the carrier's position standing in it), writes the result,
 * and places the loser on seat 4: `assignDrawPosition` announces Consolation 2/1 and the landing as the position goes
 * on through both BYEs (`unwoundThrough`'s `onward`, read off the unwind's own ops: `unwoundLanding`). The eleven setup
 * entries are the census replay's accepted entries, in order (two of its thirteen were skipped or refused and wrote
 * nothing); the reduced setup was checked to leave the replay's record byte for byte.
 */
const CONSOLATION = (roundNumber: number, roundPosition: number): Target => ({
  roundNumber,
  roundPosition,
  structureName: 'Consolation',
});
const W2_9100153: Scenario = {
  drawProfile: { drawSize: 16, participantsCount: 11, drawType: FIRST_ROUND_LOSER_CONSOLATION },
  nonRandom: 9100153,
  policyDefinitions: POLICY_OFF,
  setup: (
    [
      [MAIN(1, 7), { matchUpStatus: WALKOVER, winningSide: 2 }],
      [MAIN(2, 1), { winningSide: 2 }],
      [MAIN(1, 5), { winningSide: 2 }],
      [CONSOLATION(2, 2), { matchUpStatus: WALKOVER, winningSide: 1 }],
      [MAIN(1, 4), { matchUpStatus: DOUBLE_DEFAULT }],
      [MAIN(1, 5), { matchUpStatus: DOUBLE_DEFAULT }],
      [MAIN(2, 1), { winningSide: 2 }],
      [MAIN(1, 5), { winningSide: 2 }],
      [MAIN(1, 7), { winningSide: 2 }],
      [MAIN(2, 4), { winningSide: 2 }],
      [MAIN(2, 3), { matchUpStatus: WALKOVER, winningSide: 1 }],
    ] as [Target, Record<string, unknown>][]
  ).map(([target, outcome]) => ({ target, outcome, params: CARRIED })),
  steps: [{ target: MAIN(1, 4), outcome: { winningSide: 1 }, params: CARRIED }],
};

describe('C16 the loser beside an opponent BYE goes on through the chain to the landing the unwind writes back', () => {
  it('census w2 9100153 (FRLC 16/11, policy off): v2 owns Main 1/4 given a winner and leaves exactly what v1 leaves', () => {
    const v1 = play(OUTCOME_PIPELINE_V1, W2_9100153);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    // the landing as v1 leaves it: Consolation 3/1 to be played, the loser's position standing in it alone
    const consolation = consolationRecord(v1.record)[0].matchUps;
    const landing = consolation.find((matchUp: any) => matchUp.roundNumber === 3 && matchUp.roundPosition === 1);
    expect(landing.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(landing.drawPositions).toEqual([4]);
    expect(landing.sideExitProvenance).toBeUndefined();
    const tally = () => ({
      applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
      exit: getDifferentialTally()['shadow:abstain:exit']?.deferred ?? 0,
    });
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, W2_9100153);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied + 1, exit: before.exit });
    const v2 = play(OUTCOME_PIPELINE_V2, W2_9100153);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

/**
 * C18: THE LOSER ARRIVES WHERE A CARRIED EXIT STANDS AWARDED TO THEIR SEAT, TAKES IT AND GOES ON. Main 1/1 a WALKOVER
 * (or DEFAULTED) carried across the loser link: the consolation matchUp it feeds stands as that exit, its `winningSide`
 * naming the empty seat, the carrier's provenance on the other side. Main 1/2 then played: its loser is placed on that
 * seat, and v1's `assignDrawPosition` reads the arrival as the award's winner (`participantArrivesAtExit`): the matchUp
 * is written back as it stands with its codes re-derived and announced as the assignment, and the arriving position
 * goes on into the next matchUp of the structure (`advanceIntoWinnerMatchUp`), or nowhere from the structure's last
 * round (a 4-draw's one-matchUp consolation). v2 plans the same (`standingAwardArrival`, `awardedArrivalOps`). A
 * produced exit standing pending (a double exit under `doubleExitPropagateBye: false`, no winner until somebody
 * arrives) is not this shape and stays v1's.
 */
const AWARD_DRAWS: [string, number, string][] = [
  [FEED_IN_CHAMPIONSHIP, 8, 'Main'],
  [FIRST_ROUND_LOSER_CONSOLATION, 8, 'Main'],
  [FEED_IN_CHAMPIONSHIP, 16, 'Main'],
  [FIRST_ROUND_LOSER_CONSOLATION, 4, 'Main'],
  [FEED_IN_CHAMPIONSHIP, 4, 'Main'],
  [CURTIS_CONSOLATION, 16, 'Main'],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 16, 'Main'],
  [COMPASS, 8, 'East'],
  [OLYMPIC, 8, 'East'],
  [DOUBLE_ELIMINATION, 8, 'Main'],
];
const STANDING_AWARDS: [string, Scenario][] = AWARD_DRAWS.flatMap(([drawType, drawSize, structureName]) =>
  ([WALKOVER, DEFAULTED] as const).map((exit): [string, Scenario] => [
    `${drawType} ${drawSize}: R1/1 a carried ${exit}, R1/2 played, its loser takes the standing award`,
    {
      drawProfile: { drawSize, drawType },
      setup: [{ target: R1(1, structureName), outcome: exited(exit, 1), params: CARRIED }],
      steps: [{ target: R1(2, structureName), outcome: won(1), params: CARRIED }],
    },
  ]),
);
const PRODUCED_PENDING: [string, Scenario][] = ([DOUBLE_WALKOVER, DOUBLE_DEFAULT] as const).map(
  (doubleExit): [string, Scenario] => [
    `FEED_IN_CHAMPIONSHIP 8 (policy off): R1/1 a ${doubleExit}, its produced exit pending, R1/2 played`,
    {
      drawProfile: { drawSize: 8, drawType: FEED_IN_CHAMPIONSHIP },
      policyDefinitions: POLICY_OFF,
      setup: [{ target: R1(1, 'Main'), outcome: { matchUpStatus: doubleExit }, params: CARRIED }],
      steps: [{ target: R1(2, 'Main'), outcome: won(1), params: CARRIED }],
    },
  ],
);

describe('C18 the loser arriving where a carried exit stands awarded to their seat takes it and goes on', () => {
  it.each(STANDING_AWARDS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const tally = () => ({
      applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
      cascade: getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0,
    });
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(tally()).toEqual({ applied: before.applied + 1, cascade: before.cascade });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
  it.each(PRODUCED_PENDING)('%s: a produced exit pending is not a standing award, v1s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const deferred = () => getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0;
    const before = deferred();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    expect(deferred()).toEqual(before + 1);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes).toBeGreaterThan(0);
    expect(v2.record).toEqual(v1.record);
  });
});

/** C19: the winner takes the single produced exit pending in their target and goes on, exact notices included. */
const PENDING_WINNER_DRAWS: [string, number, string][] = [
  [FIRST_ROUND_LOSER_CONSOLATION, 8, 'Main'],
  [OLYMPIC, 8, 'East'],
  [CURTIS_CONSOLATION, 16, 'Main'],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 16, 'Main'],
  [FEED_IN_CHAMPIONSHIP_TO_SF, 16, 'Main'],
  [SINGLE_ELIMINATION, 4, 'Main'],
  [SINGLE_ELIMINATION, 8, 'Main'],
  [SINGLE_ELIMINATION, 16, 'Main'],
  [FEED_IN_CHAMPIONSHIP, 8, 'Main'],
  [DOUBLE_ELIMINATION, 8, 'Main'],
  [COMPASS, 8, 'East'],
  [FIRST_MATCH_LOSER_CONSOLATION, 8, 'Main'],
];
const PENDING_WINNERS: [string, Scenario][] = PENDING_WINNER_DRAWS.flatMap(([drawType, drawSize, structureName]) =>
  [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((doubleExit) =>
    [false, true].flatMap((policyOff) =>
      [false, true].flatMap((propagateExitStatus) =>
        [1, 2].flatMap((arrival): [string, Scenario][] =>
          policyOff && drawType === SINGLE_ELIMINATION
            ? []
            : [
                [
                  `${drawType} ${drawSize}: ${doubleExit}, policy ${policyOff ? 'off' : 'on'}, propagation ${propagateExitStatus}, arrival ${arrival}`,
                  {
                    drawProfile: { drawSize, drawType },
                    ...(policyOff ? { policyDefinitions: POLICY_OFF } : {}),
                    setup: [
                      {
                        target: R1(3 - arrival, structureName),
                        outcome: { matchUpStatus: doubleExit },
                        params: { propagateExitStatus },
                      },
                    ],
                    steps: [{ target: R1(arrival, structureName), outcome: won(1), params: { propagateExitStatus } }],
                  },
                ],
              ],
        ),
      ),
    ),
  ),
);

// These also meet a pending exit at the LOSER's linked target (C18's produced-pending control), a separate wall.
const pendingWinnerIsOwned = (scenario: Scenario) =>
  !scenario.policyDefinitions && scenario.drawProfile.drawType !== FIRST_MATCH_LOSER_CONSOLATION;

// The generator's outcome fixtures can leave the produced exit's score absent. Arrival preserves that shape too.
const GENERATED_PENDING_WINNERS: [string, Scenario][] = PENDING_WINNERS.filter(([, scenario]) =>
  pendingWinnerIsOwned(scenario),
).map(([label, scenario]) => [
  `generated ${label}`,
  {
    ...scenario,
    drawProfile: {
      ...scenario.drawProfile,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: scenario.setup?.[0].target.roundPosition,
          ...scenario.setup?.[0].outcome,
        },
      ],
    },
    setup: [],
  },
]);

describe('C19 a winner arrives at a pending produced exit', () => {
  it.each([...PENDING_WINNERS.filter(([, scenario]) => pendingWinnerIsOwned(scenario)), ...GENERATED_PENDING_WINNERS])(
    '%s',
    (_label, scenario) => {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      const tally = () => ({
        applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
        cascade: getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0,
      });
      const before = tally();
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
      expect(tally()).toEqual({ applied: before.applied + 1, cascade: before.cascade });
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      expect(v2.v1Writes).toEqual(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
      expect(v2.notices).toEqual(v1.notices);
    },
  );
});

describe('C19 controls: the loser also meets a pending produced exit', () => {
  it.each(PENDING_WINNERS.filter(([, scenario]) => !pendingWinnerIsOwned(scenario) && !!scenario.policyDefinitions))(
    '%s stays v1s',
    (_label, scenario) => {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      const deferred = () => getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0;
      const before = deferred();
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
      expect(deferred()).toEqual(before + 1);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      expect(v2.v1Writes).toBeGreaterThan(0);
      expect(v2.results).toEqual(v1.results);
      expect(v2.record).toEqual(v1.record);
      expect(v2.notices).toEqual(v1.notices);
    },
  );
});

/** C20: a plain loser passes BYEs within the linked structure, including a last-round BYE. */
const PLAIN_BYE_RECIPES: [string, number, number, number, number, boolean][] = [
  [FEED_IN_CHAMPIONSHIP, 4, 3, 1, 2, true],
  [FEED_IN_CHAMPIONSHIP, 8, 3, 2, 1, true],
  [FEED_IN_CHAMPIONSHIP, 8, 2, 3, 1, true],
  [FEED_IN_CHAMPIONSHIP, 16, 3, 3, 1, false],
  [FEED_IN_CHAMPIONSHIP, 16, 2, 4, 1, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 4, 3, 1, 2, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 8, 5, 1, 3, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 16, 10, 1, 2, false],
  [FIRST_ROUND_LOSER_CONSOLATION, 16, 10, 1, 7, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 16, 9, 1, 7, true],
  [COMPASS, 8, 5, 1, 3, true],
  [COMPASS, 8, 3, 2, 1, true],
  [OLYMPIC, 8, 5, 1, 3, true],
  [OLYMPIC, 8, 3, 2, 1, true],
  [DOUBLE_ELIMINATION, 8, 3, 2, 1, true],
  [DOUBLE_ELIMINATION, 8, 2, 3, 1, true],
  [CURTIS_CONSOLATION, 16, 3, 3, 1, false],
  [FEED_IN_CHAMPIONSHIP_TO_SF, 16, 3, 3, 1, false],
  [FIRST_MATCH_LOSER_CONSOLATION, 8, 3, 2, 1, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 32, 20, 1, 4, false],
  [FIRST_ROUND_LOSER_CONSOLATION, 32, 20, 1, 8, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 32, 20, 1, 11, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 32, 20, 1, 13, true],
  [FIRST_ROUND_LOSER_CONSOLATION, 32, 17, 1, 8, false],
  [FEED_IN_CHAMPIONSHIP, 32, 3, 4, 2, true],
  [FEED_IN_CHAMPIONSHIP, 32, 2, 5, 1, true],
];
const PLAIN_BYE_ARRIVALS: [string, Scenario][] = PLAIN_BYE_RECIPES.flatMap(
  ([drawType, drawSize, participantsCount, roundNumber, roundPosition, reachesTeam]) =>
    [false, true].flatMap((team) =>
      team && !reachesTeam
        ? []
        : [false, true].flatMap((policyOff) =>
            [1, 2].map((winningSide): [string, Scenario] => [
              `${drawType} ${participantsCount}/${drawSize} R${roundNumber}/${roundPosition}, TEAM ${team}, policy off ${policyOff}, side ${winningSide}`,
              {
                nonRandom: 1,
                drawProfile: {
                  drawType,
                  drawSize,
                  participantsCount,
                  ...(team ? { eventType: 'TEAM', tieFormatName: 'USTA_COLLEGE' } : {}),
                },
                ...(policyOff ? { policyDefinitions: POLICY_OFF } : {}),
                steps: [
                  {
                    target: {
                      structureName: drawType === COMPASS || drawType === OLYMPIC ? 'East' : 'Main',
                      roundNumber,
                      roundPosition,
                    },
                    outcome: { winningSide },
                  },
                ],
              },
            ]),
          ),
    ),
);
const plainByeIsOwned = (scenario: Scenario) =>
  !(scenario.drawProfile.drawType === DOUBLE_ELIMINATION && scenario.drawProfile.participantsCount === 2);

describe('C20 a plain loser goes on through a BYE chain or a last-round BYE', () => {
  it.each(PLAIN_BYE_ARRIVALS)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const tally = () => ({
      applied: getDifferentialTally()['shadow:applied']?.compared ?? 0,
      cascade: getDifferentialTally()['shadow:abstain:cascade']?.deferred ?? 0,
    });
    const before = tally();
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
    const owned = plainByeIsOwned(scenario);
    expect(tally()).toEqual({ applied: before.applied + Number(owned), cascade: before.cascade + Number(!owned) });
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes === 0).toEqual(owned);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('C20 previously deferred BYE arrivals', () => {
  it('C20: a retirement carrying no exit sends its loser through two BYEs', () => {
    // COMPASS 16/10: a retirement the policy does not propagate is directed as played; its loser goes on through two BYEs
    const scenario: Scenario = {
      drawProfile: { drawSize: 16, participantsCount: 10, drawType: COMPASS },
      steps: [{ target: R1(2, 'East'), outcome: retired(1), params: CARRIED }],
    };
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results[0].success).toEqual(true);
    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});

describe('C20 the pending-exit winner whose loser passes a last-round BYE', () => {
  it.each(PENDING_WINNERS.filter(([, scenario]) => !pendingWinnerIsOwned(scenario) && !scenario.policyDefinitions))(
    '%s',
    (_label, scenario) => {
      const v1 = play(OUTCOME_PIPELINE_V1, scenario);
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
      const v2 = play(OUTCOME_PIPELINE_V2, scenario);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      expect(v2.v1Writes).toEqual(0);
      for (const actual of [compared, v2]) {
        expect(actual.results).toEqual(v1.results);
        expect(actual.record).toEqual(v1.record);
        expect(actual.notices).toEqual(v1.notices);
      }
    },
  );
});

// Prepare TEAM line-ups once: pair participants can receive fresh ids during the public setup.
describe('C20 deciding TEAM lines send their loser through BYEs', () => {
  it.each(PLAIN_BYE_ARRIVALS.filter(([, scenario]) => !!scenario.drawProfile.eventType))('%s', (_label, scenario) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ ...scenario.drawProfile, drawId: 'd' }],
      nonRandom: 1,
      setState: true,
    });
    if (scenario.policyDefinitions) tournamentEngine.attachPolicies({ policyDefinitions: scenario.policyDefinitions });
    expect(
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
    ).toEqual(true);
    const step = scenario.steps[0];
    for (const singlesLine of [0, 1, 2]) {
      expect(
        tournamentEngine.setMatchUpStatus({
          drawId: 'd',
          matchUpId: findTarget({ ...step.target, singlesLine }),
          outcome: step.outcome,
        }).success,
      ).toEqual(true);
    }
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const lineScenario = { ...scenario, steps: [{ ...step, target: { ...step.target, singlesLine: 3 } }] };
    const v1 = play(OUTCOME_PIPELINE_V1, lineScenario, { prepared });
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, lineScenario, { prepared });
    const v2 = play(OUTCOME_PIPELINE_V2, lineScenario, { prepared });
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v2.v1Writes === 0).toEqual(plainByeIsOwned(scenario));
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});

// C21 captures cover one to four structural BYEs, a clean landing or a final BYE, and linked winner controls.
const HELD_BYE_RECIPES: [string, number, number, number, number][] = [
  [FEED_IN_CHAMPIONSHIP, 4, 3, 1, 2],
  [FEED_IN_CHAMPIONSHIP, 8, 7, 1, 2],
  [FEED_IN_CHAMPIONSHIP, 8, 3, 2, 1],
  [FEED_IN_CHAMPIONSHIP, 8, 2, 3, 1],
  [FIRST_ROUND_LOSER_CONSOLATION, 4, 3, 1, 2],
  [FIRST_ROUND_LOSER_CONSOLATION, 8, 7, 1, 2],
  [FIRST_ROUND_LOSER_CONSOLATION, 8, 5, 1, 3],
  [FIRST_ROUND_LOSER_CONSOLATION, 16, 10, 1, 2],
  [FIRST_ROUND_LOSER_CONSOLATION, 16, 9, 1, 7],
  [COMPASS, 8, 7, 1, 2],
  [COMPASS, 8, 5, 1, 3],
  [COMPASS, 8, 3, 2, 1],
  [OLYMPIC, 8, 7, 1, 2],
  [OLYMPIC, 8, 5, 1, 3],
  [OLYMPIC, 8, 3, 2, 1],
  [DOUBLE_ELIMINATION, 8, 7, 1, 2],
  [DOUBLE_ELIMINATION, 8, 3, 2, 1],
  [DOUBLE_ELIMINATION, 8, 2, 3, 1],
  [CURTIS_CONSOLATION, 16, 15, 1, 2],
  [CURTIS_CONSOLATION, 16, 3, 3, 1],
  [MODIFIED_FEED_IN_CHAMPIONSHIP, 16, 15, 1, 2],
  [FEED_IN_CHAMPIONSHIP_TO_SF, 16, 15, 1, 2],
  [FEED_IN_CHAMPIONSHIP_TO_SF, 16, 3, 3, 1],
  [FIRST_MATCH_LOSER_CONSOLATION, 8, 7, 1, 2],
  [FIRST_ROUND_LOSER_CONSOLATION, 32, 17, 1, 8],
];
const HELD_BYE_REMOVALS: [string, Scenario, boolean][] = HELD_BYE_RECIPES.flatMap(
  ([drawType, drawSize, participantsCount, roundNumber, roundPosition]) => {
    const target = {
      structureName: [COMPASS, OLYMPIC].includes(drawType) ? 'East' : 'Main',
      roundNumber,
      roundPosition,
    };
    const drawProfile = { drawType, drawSize, participantsCount };
    const linkedWinner = drawType === DOUBLE_ELIMINATION && participantsCount === 2;
    return ([1, 2] as const).flatMap((side) => {
      const actions: [string, Record<string, unknown>, Record<string, unknown>, boolean][] = [
        ['clear', won(side), cleared, !linkedWinner],
        ['correct', won(side), won(side === 1 ? 2 : 1), !linkedWinner],
        [
          DOUBLE_WALKOVER,
          won(side),
          { matchUpStatus: DOUBLE_WALKOVER },
          !linkedWinner && !(drawType === DOUBLE_ELIMINATION && participantsCount === 3),
        ],
        [
          DOUBLE_DEFAULT,
          won(side),
          { matchUpStatus: DOUBLE_DEFAULT },
          !linkedWinner && !(drawType === DOUBLE_ELIMINATION && participantsCount === 3),
        ],
        ['carried WALKOVER clear control', walkover(side), cleared, false],
        ['retired correct', retired(side), won(side === 1 ? 2 : 1), !linkedWinner],
      ];
      return actions.flatMap(([action, initial, outcome, owned]): [string, Scenario, boolean][] => {
        const label = `C21 ${drawType} ${participantsCount}/${drawSize} R${roundNumber}/${roundPosition} side ${side}: ${action}`;
        const scenario: Scenario = {
          drawProfile,
          setup: [{ target, outcome: initial, params: CARRIED }],
          steps: [{ target, outcome }],
        };
        const cases: [string, Scenario, boolean][] = [[label, scenario, owned]];
        if ([DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(action)) {
          // Policy-off propagation at this later FIC source reaches an existing exit refusal.
          const exitControl = drawType === FEED_IN_CHAMPIONSHIP && participantsCount === 3 && drawSize === 8;
          cases.push([`${label}, policy off`, { ...scenario, policyDefinitions: POLICY_OFF }, owned && !exitControl]);
        }
        return cases;
      });
    });
  },
);

describe('C21 removing or relabelling a loser held beside a structural BYE', () => {
  it.each(HELD_BYE_REMOVALS)('%s', (_label, scenario, owned) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v2.v1Writes === 0).toEqual(owned);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
  });
});

const HELD_BYE_TEAMS = HELD_BYE_RECIPES.filter(
  ([drawType, , participantsCount]) =>
    // These public TEAM recipes leave the selected source unpopulated.
    !(drawType === FIRST_ROUND_LOSER_CONSOLATION && [10, 17].includes(participantsCount)) &&
    !([CURTIS_CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_SF].includes(drawType) && participantsCount === 3),
).flatMap(([drawType, drawSize, participantsCount, roundNumber, roundPosition]) =>
  ([1, 2] as const).flatMap((side) =>
    ['correct', 'undecide', 'clear control'].map((action) => ({
      label: `C21 TEAM ${drawType} ${participantsCount}/${drawSize} R${roundNumber}/${roundPosition} side ${side}: ${action}`,
      drawProfile: { drawType, drawSize, participantsCount, eventType: 'TEAM', tieFormatName: 'USTA_COLLEGE' },
      target: { structureName: [COMPASS, OLYMPIC].includes(drawType) ? 'East' : 'Main', roundNumber, roundPosition },
      side,
      action,
    })),
  ),
);
// Canonical JSON omits undefined: separately pin deletion of the stored TEAM side property.
function storedLineUpFields() {
  const fields: [string, boolean][] = [];
  const visit = (value: any, path: string) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.sides))
      value.sides.forEach((side: any, i: number) => fields.push([`${path}.sides.${i}`, Object.hasOwn(side, 'lineUp')]));
    for (const [key, child] of Object.entries(value)) visit(child, `${path}.${key}`);
  };
  visit(tournamentEngine.getTournament().tournamentRecord, 'record');
  return fields;
}

describe('C21 TEAM correction and a fresh line undoing a decided dual', () => {
  it.each(HELD_BYE_TEAMS.map((testCase) => [testCase.label, testCase] as const))(
    '%s',
    (_label, { drawProfile, target, side, action }) => {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      setClock('2026-10-25T00:00:00.000Z');
      setSubscriptions({ subscriptions: {} });
      mocksEngine.generateTournamentRecord({
        drawProfiles: [{ ...drawProfile, drawId: 'd' }],
        nonRandom: 1,
        setState: true,
      });
      expect(
        tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
      ).toEqual(true);
      expect(
        tournamentEngine.setMatchUpStatus({
          drawId: 'd',
          matchUpId: findTarget(target),
          outcome: { winningSide: side },
        }).success,
      ).toEqual(true);
      const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
      let outcome: Record<string, unknown> = cleared;
      if (action === 'undecide') outcome = won(side);
      if (action === 'correct') outcome = { winningSide: side === 1 ? 2 : 1 };
      const scenario: Scenario = {
        drawProfile,
        steps: [
          {
            target: action === 'undecide' ? { ...target, singlesLine: 0 } : target,
            outcome,
          },
        ],
      };
      const v1 = play(OUTCOME_PIPELINE_V1, scenario, { prepared });
      const v1LineUpFields = storedLineUpFields();
      const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, { prepared });
      const v2 = play(OUTCOME_PIPELINE_V2, scenario, { prepared });
      expect(storedLineUpFields()).toEqual(v1LineUpFields);
      expect(v1.results.every((result: any) => result.success)).toEqual(true);
      expect(v2.v1Writes === 0).toEqual(
        action !== 'clear control' &&
          !(drawProfile.drawType === DOUBLE_ELIMINATION && drawProfile.participantsCount === 2),
      );
      for (const actual of [compared, v2]) {
        expect(actual.results).toEqual(v1.results);
        expect(actual.record).toEqual(v1.record);
        expect(actual.notices).toEqual(v1.notices);
      }
    },
  );
});

// C22 v1-first recipes: one populated R1 source leaves the winning side of the target unreached.
// TEAM, draw type, size/count, source structure/position, target round/structure/position, empty side, ownership by carry.
const UNREACHED_WINNER_RECIPES: [
  boolean,
  string,
  number,
  number,
  string,
  number,
  number,
  string,
  number,
  1 | 2,
  boolean,
  boolean,
][] = [
  [false, SINGLE_ELIMINATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [false, FEED_IN_CHAMPIONSHIP, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [false, FIRST_ROUND_LOSER_CONSOLATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [false, FIRST_ROUND_LOSER_CONSOLATION, 16, 15, 'Main', 2, 2, 'Consolation', 1, 2, true, true],
  [false, COMPASS, 8, 8, 'East', 1, 2, 'East', 1, 2, true, true],
  [false, COMPASS, 16, 15, 'East', 2, 2, 'West', 1, 2, true, true],
  [false, OLYMPIC, 8, 8, 'East', 1, 2, 'East', 1, 2, true, true],
  [false, OLYMPIC, 16, 15, 'East', 2, 2, 'West', 1, 2, true, true],
  [false, DOUBLE_ELIMINATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [false, CURTIS_CONSOLATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [false, MODIFIED_FEED_IN_CHAMPIONSHIP, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [false, FEED_IN_CHAMPIONSHIP_TO_SF, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [false, FIRST_MATCH_LOSER_CONSOLATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, false],
  [true, SINGLE_ELIMINATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [true, FEED_IN_CHAMPIONSHIP, 8, 8, 'Main', 1, 1, 'Consolation', 1, 2, true, true],
  [true, FEED_IN_CHAMPIONSHIP, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, false],
  [true, FEED_IN_CHAMPIONSHIP, 16, 15, 'Main', 2, 2, 'Consolation', 1, 1, true, true],
  [true, FIRST_ROUND_LOSER_CONSOLATION, 8, 8, 'Main', 1, 1, 'Consolation', 1, 2, true, true],
  [true, FIRST_ROUND_LOSER_CONSOLATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [true, FIRST_ROUND_LOSER_CONSOLATION, 16, 15, 'Main', 2, 2, 'Consolation', 1, 2, true, true],
  [true, COMPASS, 8, 8, 'East', 1, 1, 'West', 1, 2, true, true],
  [true, COMPASS, 8, 8, 'East', 1, 2, 'East', 1, 2, true, true],
  [true, COMPASS, 16, 15, 'East', 2, 2, 'West', 1, 2, true, true],
  [true, OLYMPIC, 8, 8, 'East', 1, 1, 'West', 1, 2, true, true],
  [true, OLYMPIC, 8, 8, 'East', 1, 2, 'East', 1, 2, true, true],
  [true, OLYMPIC, 16, 15, 'East', 2, 2, 'West', 1, 2, true, true],
  [true, DOUBLE_ELIMINATION, 8, 8, 'Main', 1, 1, 'Backdraw', 2, 2, true, true],
  [true, DOUBLE_ELIMINATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, false],
  [true, DOUBLE_ELIMINATION, 16, 15, 'Main', 2, 2, 'Backdraw', 4, 1, true, true],
  [true, CURTIS_CONSOLATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, true],
  [true, CURTIS_CONSOLATION, 16, 15, 'Main', 2, 2, 'Consolation 1', 1, 1, true, true],
  [true, MODIFIED_FEED_IN_CHAMPIONSHIP, 8, 8, 'Main', 1, 1, 'Consolation', 1, 2, true, true],
  [true, MODIFIED_FEED_IN_CHAMPIONSHIP, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, false],
  [true, MODIFIED_FEED_IN_CHAMPIONSHIP, 16, 15, 'Main', 2, 2, 'Consolation', 1, 1, true, true],
  [true, FEED_IN_CHAMPIONSHIP_TO_SF, 8, 8, 'Main', 1, 1, 'Consolation', 1, 2, true, true],
  [true, FEED_IN_CHAMPIONSHIP_TO_SF, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, false],
  [true, FEED_IN_CHAMPIONSHIP_TO_SF, 16, 15, 'Main', 2, 2, 'Consolation', 1, 1, true, true],
  [true, FIRST_MATCH_LOSER_CONSOLATION, 8, 8, 'Main', 1, 1, 'Consolation', 1, 2, true, true],
  [true, FIRST_MATCH_LOSER_CONSOLATION, 8, 8, 'Main', 1, 2, 'Main', 1, 2, true, false],
  [true, FIRST_MATCH_LOSER_CONSOLATION, 16, 15, 'Main', 2, 2, 'Consolation', 1, 1, true, true],
];

function prepareUnreachedWinner(
  recipe: (typeof UNREACHED_WINNER_RECIPES)[number],
  policyDefinitions?: Record<string, unknown>,
) {
  const [team, drawType, drawSize, participantsCount, sourceStructure, sourcePosition] = recipe;
  const drawProfile = {
    drawType,
    drawSize,
    participantsCount,
    ...(team ? { eventType: 'TEAM', tieFormatName: 'USTA_COLLEGE' } : {}),
  };
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  if (policyDefinitions) tournamentEngine.attachPolicies({ policyDefinitions });
  if (team)
    expect(
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
    ).toEqual(true);
  expect(
    tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: findTarget(R1(sourcePosition, sourceStructure)),
      outcome: team ? { winningSide: 1 } : won(1),
    }).success,
  ).toEqual(true);
  return { drawProfile, prepared: structuredClone(tournamentEngine.getTournament().tournamentRecord) };
}

function compareUndirectedWinner(scenario: Scenario, owned: boolean, prepared?: Tournament) {
  const v1 = play(OUTCOME_PIPELINE_V1, scenario, { prepared });
  const before = getDifferentialTally()['shadow:applied']?.compared ?? 0;
  const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario, { prepared });
  expect((getDifferentialTally()['shadow:applied']?.compared ?? 0) - before).toEqual(Number(owned));
  const v2 = play(OUTCOME_PIPELINE_V2, scenario, { prepared });
  expect(v2.v1Writes === 0).toEqual(owned);
  for (const actual of [compared, v2]) {
    expect(actual.results).toEqual(v1.results);
    expect(actual.record).toEqual(v1.record);
    expect(actual.notices).toEqual(v1.notices);
  }
  return { v1, v2 };
}

const UNREACHED_WINNERS = UNREACHED_WINNER_RECIPES.flatMap((recipe) =>
  [WALKOVER, DEFAULTED].flatMap((status) =>
    [false, true].map((carry) => {
      const [team, drawType, size, count, , , round, structure, position, side, plainOwned, carriedOwned] = recipe;
      const policyOff = (status === WALKOVER) === carry;
      return [
        `C22 ${team ? 'TEAM ' : ''}${drawType} ${count}/${size} ${structure} ${round}/${position}: ${status} side ${side}, carry ${carry}, policy off ${policyOff}`,
        recipe,
        status,
        carry,
        policyOff,
        carry ? carriedOwned : plainOwned,
      ] as const;
    }),
  ),
);

describe('C22 a recorded single exit awards the side that has not arrived', () => {
  it.each(UNREACHED_WINNERS)('%s', (_label, recipe, status, carry, policyOff, owned) => {
    const policyDefinitions = policyOff ? POLICY_OFF : undefined;
    const { drawProfile, prepared } = prepareUnreachedWinner(recipe, policyDefinitions);
    const [, , , , , , roundNumber, structureName, roundPosition, side] = recipe;
    const scenario: Scenario = {
      drawProfile,
      policyDefinitions,
      steps: [
        {
          target: { structureName, roundNumber, roundPosition },
          outcome: exited(status, side),
          params: { propagateExitStatus: carry },
        },
      ],
    };
    const { v1 } = compareUndirectedWinner(scenario, owned, prepared);
    expect(v1.results[0].success).toEqual(true);
  });
});

function undirectedOutcome(status: string, side: 1 | 2): Record<string, unknown> {
  if (status === 'bare') return { winningSide: side };
  return status === COMPLETED ? won(side) : exited(status, side);
}

const LINKED_PRE_FEEDS = [14, 18].flatMap((drawSize) =>
  [1, 2].flatMap((position) =>
    [COMPLETED, WALKOVER, DEFAULTED, 'bare'].flatMap((status) =>
      ([1, 2] as const).flatMap((side) =>
        [false, true].map(
          (carry) =>
            [
              `C22 ADAPTIVE ${drawSize} R1/${position}: ${status} side ${side}, carry ${carry}`,
              drawSize,
              position,
              status,
              side,
              carry,
            ] as const,
        ),
      ),
    ),
  ),
);
describe('C22 lucky pre-feed defers its loser link with its winner', () => {
  it.each(LINKED_PRE_FEEDS)('%s', (_label, drawSize, position, status, side, carry) => {
    const outcome = undirectedOutcome(status, side);
    const scenario: Scenario = {
      drawProfile: { drawType: ADAPTIVE, drawSize, participantsCount: drawSize },
      steps: [{ target: R1(position, 'East'), outcome, params: { propagateExitStatus: carry } }],
    };
    const owned = !carry || status === COMPLETED || status === 'bare';
    expect(compareUndirectedWinner(scenario, owned).v1.results[0].success).toEqual(true);
  });
  it.each(
    [6, 10].flatMap((size) =>
      [WALKOVER, DEFAULTED].flatMap((status) => ([1, 2] as const).map((side) => [size, status, side] as const)),
    ),
  )('C22 LUCKY_DRAW %s %s side %s remains owned without a loser link', (drawSize, status, side) => {
    const scenario: Scenario = {
      drawProfile: { drawType: LUCKY_DRAW, drawSize, participantsCount: drawSize },
      steps: [{ target: R1(1), outcome: exited(status, side) }],
    };
    expect(compareUndirectedWinner(scenario, true).v1.results[0].success).toEqual(true);
  });
});

const REFUSAL_PREFIX_KEYS = new Set([
  'FEED_IN_CHAMPIONSHIP|8|8|Consolation|1|1',
  'FEED_IN_CHAMPIONSHIP|16|15|Consolation|2|1',
  'FIRST_ROUND_LOSER_CONSOLATION|8|8|Consolation|1|1',
  'DOUBLE_ELIMINATION|8|8|Backdraw|1|2',
  'DOUBLE_ELIMINATION|16|15|Backdraw|2|4',
  'CURTIS_CONSOLATION|16|15|Consolation 1|2|1',
  'MODIFIED_FEED_IN_CHAMPIONSHIP|8|8|Consolation|1|1',
  'MODIFIED_FEED_IN_CHAMPIONSHIP|16|15|Consolation|2|1',
  'FEED_IN_CHAMPIONSHIP_TO_SF|8|8|Consolation|1|1',
  'FEED_IN_CHAMPIONSHIP_TO_SF|16|15|Consolation|2|1',
  'FIRST_MATCH_LOSER_CONSOLATION|8|8|Consolation|1|1',
  'FIRST_MATCH_LOSER_CONSOLATION|16|15|Consolation|2|1',
]);
const UNREACHED_TEAM_REFUSALS = UNREACHED_WINNER_RECIPES.filter(
  ([team, type, size, count, , , round, structure, position]) =>
    team && REFUSAL_PREFIX_KEYS.has(`${type}|${size}|${count}|${structure}|${round}|${position}`),
).flatMap((recipe) =>
  [true, false].map(
    (requireParticipants) =>
      [
        `C22 TEAM refusal prefix ${recipe[1]} ${recipe[3]}/${recipe[2]} ${recipe[7]} ${recipe[6]}/${recipe[8]}, require participants ${requireParticipants}`,
        recipe,
        requireParticipants,
      ] as const,
  ),
);

describe('C22 the TEAM refusal prefix remains owed, while the scoring-policy override is owned', () => {
  it.each(UNREACHED_TEAM_REFUSALS)('%s', (_label, recipe, requireParticipants) => {
    const policyDefinitions = { scoring: { requireParticipantsForScoring: requireParticipants } };
    const { drawProfile, prepared } = prepareUnreachedWinner(recipe, policyDefinitions);
    const [, , , , , , roundNumber, structureName, roundPosition, emptySide] = recipe;
    const side = (emptySide === 1 ? 2 : 1) as 1 | 2;
    const scenario: Scenario = {
      drawProfile,
      policyDefinitions,
      steps: [{ target: { structureName, roundNumber, roundPosition }, outcome: { winningSide: side } }],
    };
    const { v1 } = compareUndirectedWinner(scenario, !requireParticipants, prepared);
    if (requireParticipants) {
      expect(v1.results[0].error).toEqual(MISSING_ASSIGNMENTS);
      expect(v1.record).not.toEqual(v1.recordBefore);
    } else expect(v1.results[0].success).toEqual(true);
  });
});

// C24N: an assignment at a standing award keeps its event through the later quiet lineup notice.
type TeamAwardNoticeCase = {
  label: string;
  drawProfile: Record<string, unknown>;
  nonRandom: number;
  setup: Step[];
  target?: Target;
  lineUps: boolean;
  entered: string;
  occupied?: boolean;
  owned: boolean;
};
const teamNoticeStep = (roundNumber: number, roundPosition: number, status = 'bare'): Step => ({
  target: { structureName: 'Main', roundNumber, roundPosition },
  outcome: status === 'bare' ? { winningSide: 1 } : { matchUpStatus: status, winningSide: 1 },
  params: CARRIED,
});
const TEAM_AWARD_NOTICE_WITNESSES: [number, number, number, Target, Step[]][] = [
  [200061, 8, 8, R1(2, 'Main'), [teamNoticeStep(1, 1, WALKOVER)]],
  [200083, 8, 5, MAIN(2, 2), [teamNoticeStep(1, 2, DEFAULTED), teamNoticeStep(2, 1)]],
  [200091, 16, 16, R1(2, 'Main'), [teamNoticeStep(1, 1, WALKOVER)]],
  [
    200113,
    16,
    13,
    MAIN(2, 4),
    [
      teamNoticeStep(1, 2, DEFAULTED),
      teamNoticeStep(1, 3),
      teamNoticeStep(1, 4),
      teamNoticeStep(1, 5, DEFAULTED),
      teamNoticeStep(1, 7),
      teamNoticeStep(2, 1),
      teamNoticeStep(2, 2, DEFAULTED),
      teamNoticeStep(2, 3),
    ],
  ],
];
const TEAM_AWARD_NOTICE_DRAWS = [
  FEED_IN_CHAMPIONSHIP,
  FIRST_ROUND_LOSER_CONSOLATION,
  COMPASS,
  OLYMPIC,
  DOUBLE_ELIMINATION,
  CURTIS_CONSOLATION,
  MODIFIED_FEED_IN_CHAMPIONSHIP,
  FIRST_MATCH_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP_TO_SF,
];
const TEAM_AWARD_NOTICE_CASES: TeamAwardNoticeCase[] = [
  ...TEAM_AWARD_NOTICE_WITNESSES.flatMap(([nonRandom, drawSize, participantsCount, target, setup]) =>
    [false, true].flatMap((lineUps) =>
      ['bare', COMPLETED, WALKOVER].map((entered) => ({
        label: `C24N witness ${nonRandom}: ${entered}, lineups ${lineUps}`,
        drawProfile: {
          drawType: DOUBLE_ELIMINATION,
          drawSize,
          participantsCount,
          eventType: 'TEAM',
          tieFormatName: DOMINANT_DUO,
        },
        nonRandom,
        setup,
        target,
        lineUps,
        entered,
        owned: true,
      })),
    ),
  ),
  ...TEAM_AWARD_NOTICE_WITNESSES.map(([nonRandom, drawSize, participantsCount, target, setup]) => ({
    label: `C24N already occupied ${nonRandom}`,
    drawProfile: {
      drawType: DOUBLE_ELIMINATION,
      drawSize,
      participantsCount,
      eventType: 'TEAM',
      tieFormatName: DOMINANT_DUO,
    },
    nonRandom,
    setup,
    target,
    lineUps: false,
    entered: 'bare',
    occupied: true,
    owned: false,
  })),
  ...TEAM_AWARD_NOTICE_DRAWS.flatMap((drawType) =>
    [
      [8, 7],
      [16, 15],
      [16, 11],
    ].flatMap(([drawSize, participantsCount]) =>
      [false, true].map((lineUps) => ({
        label: `C24N initial seat ${drawType} ${participantsCount}/${drawSize}, lineups ${lineUps}`,
        drawProfile: { drawType, drawSize, participantsCount, eventType: 'TEAM', tieFormatName: USTA_COLLEGE },
        nonRandom: 1,
        setup: [],
        lineUps,
        entered: 'bare',
        owned: true,
      })),
    ),
  ),
  ...TEAM_AWARD_NOTICE_DRAWS.flatMap((drawType) =>
    [8, 16].flatMap((drawSize) =>
      [false, true].flatMap((lineUps) =>
        [WALKOVER, DEFAULTED].map((exit) => {
          const structureName = drawType === COMPASS || drawType === OLYMPIC ? 'East' : 'Main';
          return {
            label: `C24N paired ${drawType} ${drawSize} ${exit}, lineups ${lineUps}`,
            drawProfile: {
              drawType,
              drawSize,
              participantsCount: drawSize,
              eventType: 'TEAM',
              tieFormatName: DOMINANT_DUO,
            },
            nonRandom: 1,
            setup: [
              { target: R1(1, structureName), outcome: { matchUpStatus: exit, winningSide: 1 }, params: CARRIED },
            ],
            target: R1(2, structureName),
            lineUps,
            entered: 'bare',
            owned: true,
          };
        }),
      ),
    ),
  ),
];

function prepareTeamAwardNotice(recipe: TeamAwardNoticeCase) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...recipe.drawProfile, drawId: 'd' }],
    nonRandom: recipe.nonRandom,
    setState: true,
  });
  if (recipe.lineUps)
    expect(
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
    ).toEqual(true);
  for (const step of recipe.setup)
    expect(
      tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: findTarget(step.target),
        outcome: step.outcome,
        ...step.params,
      }).success,
    ).toEqual(true);
  const first = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps?.find(
      (matchUp) =>
        !matchUp.collectionId &&
        matchUp.roundNumber === 1 &&
        matchUp.sides?.filter((side) => side.participantId).length === 2,
    );
  if (!first?.roundNumber) throw new Error('TEAM notice fixture has no populated source');
  const target = recipe.target ?? {
    structureName: first.structureName,
    roundNumber: first.roundNumber,
    roundPosition: first.roundPosition,
  };
  const outcome = recipe.entered === 'bare' ? { winningSide: 1 } : { matchUpStatus: recipe.entered, winningSide: 1 };
  const params = { propagateExitStatus: recipe.entered !== WALKOVER };
  if (recipe.occupied)
    expect(
      tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: findTarget(target), outcome, ...params }).success,
    ).toEqual(true);
  const scenario: Scenario = {
    drawProfile: recipe.drawProfile,
    nonRandom: recipe.nonRandom,
    steps: [{ target, outcome, params }],
  };
  return { scenario, prepared: structuredClone(tournamentEngine.getTournament().tournamentRecord) };
}

describe('C24N TEAM arrivals retain event identity at a standing awarded exit', () => {
  it.each(TEAM_AWARD_NOTICE_CASES)('$label', (recipe) => {
    const { scenario, prepared } = prepareTeamAwardNotice(recipe);
    const { v1 } = compareUndirectedWinner(scenario, recipe.owned, prepared);
    expect(v1.results[0].success).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    expect(v1.notices.length).toBeGreaterThan(0);
  });
});

const UNLINKED_AD_HOC_CALLS = ['SINGLES', 'DOUBLES'].flatMap((eventType) =>
  [1, 3].flatMap((roundsCount) =>
    [COMPLETED, WALKOVER, DEFAULTED, 'bare'].flatMap((status) =>
      ([1, 2] as const).map(
        (side) =>
          [
            `C22 AD_HOC ${eventType} ${roundsCount} rounds: ${status} side ${side}`,
            eventType,
            roundsCount,
            status,
            side,
          ] as const,
      ),
    ),
  ),
);
describe('C22 AD_HOC with no directions still owes its missing group frame', () => {
  it.each(UNLINKED_AD_HOC_CALLS)('%s', (_label, eventType, roundsCount, status, side) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventType, participantsProfile: { participantsCount: 8 } }],
      nonRandom: 1,
      setState: true,
    });
    const generated = tournamentEngine.generateDrawDefinition({
      eventId,
      drawId: 'd',
      drawType: AD_HOC,
      automated: true,
      roundsCount,
    });
    expect(tournamentEngine.addDrawDefinition({ eventId, drawDefinition: generated.drawDefinition }).success).toEqual(
      true,
    );
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const outcome = undirectedOutcome(status, side);
    const scenario: Scenario = {
      drawProfile: { drawType: AD_HOC, drawSize: 8, eventType, automated: true, roundsCount },
      steps: [{ target: { roundNumber: 1, nth: 1 }, outcome }],
    };
    // A multi-round AD_HOC call reaches the later tally wall; it is not claimed as a new owned write.
    expect(compareUndirectedWinner(scenario, roundsCount === 1, prepared).v1.results[0].success).toEqual(true);
  });
});

describe('C22 a bare TEAM winner with both teams present stays owned', () => {
  it.each(
    [SINGLE_ELIMINATION, FEED_IN_CHAMPIONSHIP].flatMap((type) =>
      ([1, 2] as const).map((side) => [type, side] as const),
    ),
  )('C22 TEAM %s bare winner side %s with two teams', (drawType, side) => {
    const drawProfile = { drawType, drawSize: 8, eventType: 'TEAM', tieFormatName: 'USTA_COLLEGE' };
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    setClock('2026-10-25T00:00:00.000Z');
    setSubscriptions({ subscriptions: {} });
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ ...drawProfile, drawId: 'd' }],
      nonRandom: 1,
      setState: true,
    });
    expect(
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
    ).toEqual(true);
    const prepared = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    const scenario: Scenario = { drawProfile, steps: [{ target: R1(1, 'Main'), outcome: { winningSide: side } }] };
    expect(compareUndirectedWinner(scenario, true, prepared).v1.results[0].success).toEqual(true);
  });
});

// C23: the winner's recorded arrival changes its origin label after an onward matchUp was played.
// DOUBLE_DEFAULT mirrors the origin onto side 2; the v1-first capture proves both orientations.
const REFRESHED_ARRIVAL_CASES = PENDING_WINNER_DRAWS.filter(([, size]) => size >= 8).flatMap(
  ([drawType, drawSize, structureName]) =>
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].flatMap((doubleExit) =>
      [false, true].flatMap((policyOff) =>
        [COMPLETED, WALKOVER, DEFAULTED, RETIRED].flatMap((status) =>
          ([1, 2] as const).flatMap((side) =>
            [false, true].map((carry) => {
              const arrival = doubleExit === DOUBLE_DEFAULT ? 2 : 1;
              const scenario: Scenario = {
                drawProfile: { drawType, drawSize },
                ...(policyOff ? { policyDefinitions: POLICY_OFF } : {}),
                setup: [
                  { target: R1(3 - arrival, structureName), outcome: { matchUpStatus: doubleExit } },
                  { target: R1(arrival, structureName), outcome: won(1) },
                  { target: R1(3, structureName), outcome: won(1) },
                  { target: R1(4, structureName), outcome: won(1) },
                  { target: { structureName, roundNumber: 2, roundPosition: 2 }, outcome: won(1) },
                  { target: { structureName, roundNumber: 3, roundPosition: 1 }, outcome: won(1) },
                ].map((step) => ({ ...step, params: { propagateExitStatus: false } })),
                steps: [
                  {
                    target: R1(arrival, structureName),
                    outcome: status === COMPLETED ? won(side) : exited(status, side),
                    params: { propagateExitStatus: carry, allowChangePropagation: true },
                  },
                ],
              };
              const owned = side === 1 && (!carry || status === COMPLETED || drawType === SINGLE_ELIMINATION);
              return [
                `C23 ${drawType} ${drawSize} origin ${arrival}: ${doubleExit}, policy off ${policyOff}, ${status} side ${side}, carry ${carry}`,
                scenario,
                owned,
                status,
              ] as const;
            }),
          ),
        ),
      ),
    ),
);

describe('C23 relabelled arrival origins retain exact records and notice identities', () => {
  it.each(REFRESHED_ARRIVAL_CASES)('%s', (_label, scenario, owned, status) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const before = getDifferentialTally()['shadow:applied']?.compared ?? 0;
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect((getDifferentialTally()['shadow:applied']?.compared ?? 0) - before).toEqual(Number(owned));
    const v2 = play(OUTCOME_PIPELINE_V2, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toBeGreaterThan(0);
    expect(v2.v1Writes === 0).toEqual(owned);
    for (const actual of [compared, v2]) {
      expect(actual.results).toEqual(v1.results);
      expect(actual.record).toEqual(v1.record);
      expect(actual.notices).toEqual(v1.notices);
    }
    if (owned && status !== COMPLETED)
      expect(v2.notices.some((notice) => notice.includes('"context":"refreshArrivals"'))).toEqual(true);
  });
});
