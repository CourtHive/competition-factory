import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { TALLY } from '@Constants/extensionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Tests/testHarness/outcomeModes';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A SINGLES MATCHUP STORED WITH AN EMPTY `tieMatchUps` IS NOT A DUAL (record soak 2026-11-18, class D2).
 *
 * A record written by a serialiser that materialises every array holds `tieMatchUps: []` on its SINGLES matchUps.
 * Hydration drops an empty array (`addMatchUpContext`'s `onlyDefined`), so v1's tally reads each as the matchUp it is
 * and counts its sets. The structural index dropped the stored array too, then put an empty one back as the dual's
 * lines, and the tally read a dual with no lines: no sets counted, and a three-way tie on matchUps won ordered another
 * way (`groupOrder` 3 and 4 exchanged, 40 calls of one USTA draw, consistent as loaded).
 *
 * The group below ties three participants on two wins each, under a tally policy that reads sets and games as shares of
 * the group's totals (the totals a dual with no lines empties) before head to head. Each result is entered, then one is
 * entered again over itself, on the draw as generated and on the same draw with the empty arrays stored: the tallies
 * are the same on both, in every pipeline mode.
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

// [drawPosition, drawPosition, points, points]: 1, 2 and 4 win two each; 3 wins three; 5 wins one
const RESULTS: [number, number, number, number][] = [
  [1, 2, 14, 30],
  [3, 4, 28, 19],
  [1, 3, 24, 23],
  [4, 5, 25, 24],
  [1, 4, 20, 26],
  [2, 5, 15, 31],
  [2, 3, 22, 27],
  [1, 5, 37, 25],
  [2, 4, 36, 11],
  [3, 5, 33, 20],
];

// sets and games as shares of the group's totals, then head to head: the totals are what a dual with no lines empties
const GROUP_TOTALS = {
  [POLICY_TYPE_ROUND_ROBIN_TALLY]: {
    tallyDirectives: [
      { attribute: 'matchUpsPct', idsFilter: false },
      { attribute: 'setsPct', idsFilter: false, groupTotals: true },
      { attribute: 'gamesPct', idsFilter: false, groupTotals: true },
      { attribute: 'matchUpsPct', idsFilter: true },
    ],
  },
};

const timed = (side1Score: number, side2Score: number) => {
  const winningSide = side1Score > side2Score ? 1 : 2;
  return {
    score: {
      sets: [{ setNumber: 1, side1Score, side2Score, winningSide }],
      scoreStringSide1: `${side1Score}-${side2Score}`,
      scoreStringSide2: `${side2Score}-${side1Score}`,
    },
    matchUpStatus: COMPLETED,
    winningSide,
  };
};

function playGroup(emptyArrays: boolean) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: ROUND_ROBIN, drawSize: 5, structureOptions: { groupSize: 5 }, matchUpFormat: 'SET1-S:T20' },
    ],
  });
  const group = tournamentRecord.events[0].drawDefinitions[0].structures[0].structures[0];
  if (emptyArrays) for (const matchUp of group.matchUps) Object.assign(matchUp, { tieMatchUps: [] });
  tournamentEngine.setState(tournamentRecord);
  expect(tournamentEngine.attachPolicies({ policyDefinitions: GROUP_TOTALS }).success).toEqual(true);

  const between = (a: number, b: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find(({ drawPositions }) => drawPositions.includes(a) && drawPositions.includes(b));
  const enter = ([a, b, pointsA, pointsB]: [number, number, number, number]) => {
    const matchUp = between(a, b);
    const outcome = matchUp.drawPositions[0] === a ? timed(pointsA, pointsB) : timed(pointsB, pointsA);
    return tournamentEngine.setMatchUpStatus({ drawId, matchUpId: matchUp.matchUpId, outcome });
  };
  const orders = () =>
    Object.fromEntries(
      tournamentEngine
        .getEvent({ drawId })
        .drawDefinition.structures[0].structures[0].positionAssignments.map((assignment) => [
          assignment.drawPosition,
          (assignment.tally ?? assignment.extensions?.find(({ name }) => name === TALLY)?.value)?.groupOrder,
        ]),
    );

  for (const result of RESULTS) expect(enter(result).success).toEqual(true);
  const entered = orders();
  expect(enter(RESULTS[0]).success).toEqual(true);
  return { entered, reentered: orders() };
}

describe.each(MODES)('pipeline %s', (mode) => {
  it('tallies a group whose SINGLES matchUps store an empty tieMatchUps as it tallies one that stores none', () => {
    setOutcomePipeline(mode);
    const plain = playGroup(false);
    const stored = playGroup(true);
    // the tie is three-way, and is broken: every participant holds an order of their own
    expect(Object.values(plain.entered).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(plain.reentered).toEqual(plain.entered);
    expect(stored.entered).toEqual(plain.entered);
    expect(stored.reentered).toEqual(plain.entered);
  });
});
