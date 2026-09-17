import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * A stored `drawPositions` array is never nothing but holes.
 *
 * ## The rule, and the distinction it turns on
 *
 * A hole is load-bearing ONLY BESIDE A SURVIVOR. `drawPositions` is positional — the three reader
 * idioms that derive a side from its order are catalogued under the "DO NOT CHANGE" banner in
 * `getOrderedDrawPositions` — so `[undefined, 5]` must keep its hole: compacting it to `[5]` moves
 * 5 from side 2 to side 1 and every one of those readers then resolves the wrong participant.
 *
 * An array of nothing BUT holes holds no side open, because there is no survivor for it to hold the
 * side open beside. It carries no information at all, and it is not a shape the engine writes
 * anywhere else: generation emits `[]` for a matchUp nobody has reached yet. `normalizeDrawPositions`
 * is where the two cases are separated, and every removal/substitution writer routes through it.
 *
 * ## What this test measures, and why it checks after EVERY step
 *
 * The state is TRANSIENT. An end-of-replay assertion reproduced 1 of 5 known-bad seeds in this
 * workstream's history, because later steps overwrite the damage — the census checks after every
 * mutation and so does this.
 *
 * Measured over both frozen 600-seed census windows on both propagation arms — 2,400 seed-runs,
 * 72,000 steps, scanning STORED state after every mutation:
 *
 * | writer                             | all-holes writes | distinct seeds |
 * |---|---:|---:|
 * | `positionClear`                    | 2,437 | 410 |
 * | `releaseAdvancedDrawPosition`      |   458 | 234 |
 * | `swapWinnerLoser`                  |     1 |   1 |
 * | `removeSubsequentRoundsParticipant`|     0 |   0 | (its `.filter(Boolean)` already precludes it)
 *
 * 865 of the 2,400 seed-runs (36%) carried one; after the fix, 0. The five scenarios below are
 * delta-debugged minima: one per writer, a second `positionClear` case on the
 * `propagateExitStatus: false` arm (the USTA/ITA production case), and an ISOLATED
 * `releaseAdvancedDrawPosition` case.
 *
 * That last one exists because coverage was checked by reverting each writer ON ITS OWN. Every
 * other scenario here is also normalised by `positionClear` downstream, so reverting
 * `releaseAdvancedDrawPosition` alone left them all green — the file had no behavioural cover at
 * all, only the static bypass guard. Re-running both census windows on both arms with just that
 * writer reverted surfaced 43 / 34 / 48 / 40 offending seeds per arm; 9100006 is the shortest,
 * shrunk to four steps. **Check coverage one file at a time, or a sibling writer will hide the
 * gap.**
 *
 * ## The control matters as much as the assertion
 *
 * "No all-holes arrays" is satisfied trivially by a replay that takes no position out of any
 * matchUp. Each scenario therefore also counts the positions actually REMOVED — a truthy
 * drawPosition present on a matchUp before a step and absent after it — and requires that count to
 * be non-zero. That is the mechanism under test, whichever of the three writers performed it, and
 * it would read zero against a tree where they were deleted outright.
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

function collectStructures(structures: any[], collected: any[] = []): any[] {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
  return collected;
}

/** every stored matchUp's drawPositions, keyed by matchUpId and anchored by structural coordinates */
function storedDrawPositions(drawId: string): Map<string, { anchor: string; drawPositions: any[] }> {
  const stored = new Map<string, { anchor: string; drawPositions: any[] }>();
  const drawDefinition = tournamentEngine.getEvent({ drawId })?.drawDefinition;
  for (const structure of collectStructures(drawDefinition?.structures ?? [])) {
    for (const matchUp of structure.matchUps ?? []) {
      stored.set(matchUp.matchUpId, {
        anchor: coordinates({ ...matchUp, structureName: structure.structureName }),
        drawPositions: Array.isArray(matchUp.drawPositions) ? matchUp.drawPositions : [],
      });
    }
  }
  return stored;
}

type Scenario = {
  allowChangePropagation?: boolean;
  propagateExitStatus: boolean;
  participantsCount: number;
  writer: string;
  drawType: string;
  drawSize: number;
  seed: number;
  steps: any[];
};

const TBP = { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' };
const RETIRED_6_3 = {
  score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
  matchUpStatus: 'RETIRED',
  winningSide: 1,
};

const scenarios: Scenario[] = [
  {
    // releaseAdvancedDrawPosition: the released position was the matchUp's only one, so `[6]` -> `[undefined]`
    writer: 'releaseAdvancedDrawPosition',
    drawType: 'CURTIS_CONSOLATION',
    propagateExitStatus: true,
    participantsCount: 29,
    drawSize: 32,
    seed: 9000414,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 6, outcome: { matchUpStatus: 'DOUBLE_DEFAULT' } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 11, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 12, outcome: { winningSide: 2 } },
      { structureName: 'Consolation 1', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 6, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: TBP },
    ],
  },
  {
    // releaseAdvancedDrawPosition, ISOLATED. Every other scenario here is also normalised by
    // `positionClear` downstream, so reverting `releaseAdvancedDrawPosition` alone leaves them
    // green — this seed was chosen by re-running the census windows with ONLY that writer reverted
    // (43/34/48/40 seeds offend per arm) and delta-debugging the shortest. Flag-OFF, the
    // Tournament Desk production case.
    writer: 'releaseAdvancedDrawPosition (isolated)',
    drawType: 'FEED_IN_CHAMPIONSHIP_TO_SF',
    propagateExitStatus: false,
    participantsCount: 6,
    drawSize: 8,
    seed: 9100006,
    steps: [
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 2,
        outcome: { matchUpStatus: 'DEFAULTED', winningSide: 1 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: TBP },
    ],
  },
  {
    // positionClear: a double exit entered then cleared, emptying both sides of a downstream feed target
    writer: 'positionClear',
    drawType: 'FEED_IN_CHAMPIONSHIP_TO_SF',
    propagateExitStatus: true,
    participantsCount: 27,
    drawSize: 32,
    seed: 9000408,
    steps: [
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: TBP },
    ],
  },
  {
    // positionClear on the propagateExitStatus:false arm — the Tournament Desk production case
    writer: 'positionClear',
    drawType: 'DOUBLE_ELIMINATION',
    propagateExitStatus: false,
    participantsCount: 7,
    drawSize: 8,
    seed: 9000360,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: RETIRED_6_3 },
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { winningSide: 2 } },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 2,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
      { structureName: 'Backdraw', roundNumber: 1, roundPosition: 1, outcome: { winningSide: 2 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { matchUpStatus: 'DOUBLE_WALKOVER' } },
      {
        structureName: 'Main',
        roundNumber: 2,
        roundPosition: 1,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
    ],
  },
  {
    // swapWinnerLoser: a SUBSTITUTION, not a removal — the flipped loser had no drawPosition, so the
    // downstream `[n]` became `[undefined]`. Reachable only through `allowChangePropagation`.
    writer: 'swapWinnerLoser',
    drawType: 'FEED_IN_CHAMPIONSHIP_TO_SF',
    allowChangePropagation: true,
    propagateExitStatus: true,
    participantsCount: 15,
    drawSize: 16,
    seed: 9100016,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 2 } },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 7,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      {
        structureName: 'Main',
        roundNumber: 1,
        roundPosition: 8,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 1, outcome: { winningSide: 2 } },
      {
        structureName: 'Consolation',
        roundNumber: 2,
        roundPosition: 4,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 2 },
      },
    ],
  },
];

it.each(scenarios)(
  'seed $seed ($drawType $drawSize/$participantsCount) leaves no all-holes drawPositions — $writer',
  (scenario: Scenario) => {
    const drawId = `all-holes-${scenario.seed}`;
    const { drawIds } = mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          participantsCount: scenario.participantsCount,
          drawType: scenario.drawType,
          drawSize: scenario.drawSize,
          drawId,
        },
      ],
      nonRandom: scenario.seed,
      setState: true,
    });
    expect(drawIds).toContain(drawId);
    setSubscriptions({});

    const offences: string[] = [];
    let positionsRemoved = 0;
    let applied = 0;

    for (const [index, step] of scenario.steps.entries()) {
      const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
      const target = matchUps.find((matchUp: any) => coordinates(matchUp) === coordinates(step));
      if (!target) continue;

      const before = storedDrawPositions(drawId);

      tournamentEngine.setMatchUpStatus({
        ...(scenario.allowChangePropagation ? { allowChangePropagation: true } : {}),
        propagateExitStatus: scenario.propagateExitStatus,
        matchUpId: target.matchUpId,
        outcome: step.outcome,
        drawId,
      });
      applied++;

      // After EVERY step, not only at the end: the shape is transient.
      const after = storedDrawPositions(drawId);
      for (const [matchUpId, entry] of after) {
        const { anchor, drawPositions } = entry;
        if (drawPositions.length && !drawPositions.some(Boolean)) {
          offences.push(`step ${index + 1}: ${anchor} ${JSON.stringify(drawPositions)}`);
        }
        const previous = before.get(matchUpId)?.drawPositions ?? [];
        for (const drawPosition of previous) {
          if (drawPosition && !drawPositions.includes(drawPosition)) positionsRemoved++;
        }
      }
    }

    // controls: the schedule ran, and it exercised the removal/substitution mechanism under test
    expect(applied).toEqual(scenario.steps.length);
    expect(positionsRemoved).toBeGreaterThan(0);

    expect(offences).toEqual([]);
  },
);
