import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { DOUBLE_ELIMINATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
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

type Target = { structureName?: string; roundNumber: number; roundPosition: number };
type Step = { target: Target; outcome: Record<string, unknown> };
type Scenario = { drawProfile: Record<string, unknown>; steps: Step[] };

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
    'DOUBLE_ELIMINATION: a Main first-round result sends the winner on and the loser into the Backdraw',
    { drawProfile: { drawSize: 8, drawType: DOUBLE_ELIMINATION }, steps: [{ target: R1(1, 'Main'), outcome: won(1) }] },
  ],
];

function findTarget(target: Target): string {
  const matchUps = tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps;
  const found = matchUps.find(
    (matchUp: any) =>
      matchUp.roundNumber === target.roundNumber &&
      matchUp.roundPosition === target.roundPosition &&
      (!target.structureName || matchUp.structureName === target.structureName),
  );
  return found.matchUpId;
}

/** the steps from a fresh record, every topic subscribed and the clock fixed */
function play(mode: OutcomePipelineMode, { drawProfile, steps }: Scenario) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-25T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
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
  const results = steps.map(({ outcome }, i) => {
    setClock(`2026-10-25T00:0${i + 1}:00.000Z`);
    return tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: matchUpIds[i], outcome });
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
    // CONTROL: v1 wrote through its own writer, and each step succeeded
    expect(v1.v1Writes).toEqual(scenario.steps.length);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);

    expect(v2.v1Writes).toEqual(0);
    expect(v2.results).toEqual(v1.results);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
  });
});
