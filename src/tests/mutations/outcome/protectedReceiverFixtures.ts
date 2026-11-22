import { prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, randomConfig, type ScenarioConfig } from '@Tests/testHarness/exitPropagation/sweep';
import engine from '@Engines/syncEngine';
import { expect } from 'vitest';

// constants and types
import { COMPASS, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

type Step = [at: string, outcome: { winningSide?: number; matchUpStatus?: MatchUpStatusUnion }];

function beforeLast(config: ScenarioConfig, drawId: string, steps: Step[]) {
  return prepareCall(() => {
    expect(prepareDraw(config, drawId)).toBe(true);
    const params = ([at, outcome]: Step) => {
      const match = getDrawMatchUps(drawId).find(
        (m) => [m.structureName, m.roundNumber, m.roundPosition].join('|') === at,
      );
      expect(match, at).toBeDefined();
      return { drawId, matchUpId: match.matchUpId, propagateExitStatus: config.propagateExitStatus, outcome };
    };
    for (const step of steps.slice(0, -1)) expect(engine.setMatchUpStatus(params(step)).success, step[0]).toBe(true);
    return params(steps[steps.length - 1]);
  });
}

// Published forecast control 0148c068: the arriving loser wins a foreign default beyond a structural BYE.
export function oneReceiver() {
  return beforeLast(randomConfig(9700086), 'early-census-9700086', [
    ['Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 2 }],
    ['Main|1|3', { winningSide: 2 }],
  ]);
}

// b632530f from anArrivalTellsTheTruthAfterAFlipOrAPendingExit: two independent produced exits on the winner's path.
export function twoReceivers() {
  return beforeLast(
    { drawType: SINGLE_ELIMINATION, drawSize: 16, participantsCount: 16, seed: 9000221, propagateExitStatus: true },
    'arrival-beside-a-pending-exit',
    [
      ['Main|1|1', { winningSide: 1 }],
      ['Main|1|2', { winningSide: 1 }],
      ['Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }],
      ['Main|1|4', { winningSide: 1 }],
    ],
  );
}

// Both occurrences of the same public site (6c230f21). Entering East 1/13 first leaves a propagated BYE on the footprint.
export function compassArrival(convergenceFirst: boolean) {
  const drawId = 'aCarrierWhoWentOnOnlyAsACarrierIsReleasedWithTheCarry';
  const steps: Step[] = [
    ['East|1|11', { matchUpStatus: DOUBLE_WALKOVER }],
    ['East|1|9', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|10', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|15', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|14', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['East|1|6', { matchUpStatus: DOUBLE_WALKOVER }],
    ['East|1|8', { winningSide: 1 }],
    ['East|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['East|1|3', { winningSide: 1 }],
    ['East|1|4', { winningSide: 2 }],
    ['West|1|2', { winningSide: 1 }],
  ];
  if (convergenceFirst) steps.unshift(['East|1|13', { matchUpStatus: DOUBLE_WALKOVER }]);
  return beforeLast(
    { drawType: COMPASS, participantsCount: 27, drawSize: 32, propagateExitStatus: true, seed: 21155795 },
    convergenceFirst ? drawId + '-convergenceFirst' : drawId,
    steps,
  );
}
