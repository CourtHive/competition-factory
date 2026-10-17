import { getDrawDefinition, getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A SEAT EMPTIED FOR THE SOURCE'S WINNER HOLDS NO CARRY (census S8, off arm, DRAW_INCONSISTENCY WINNER_NOT_ADVANCED:
 * FEED_IN_CHAMPIONSHIP 16/11 20532286 and COMPASS 32/27 20585407).
 *
 * A played win is re-entered as a walkover (or default) the other way. The old winner is taken out of the rounds they
 * reached, and the removal stamps the seat it empties with the source's new status. That seat holds nobody yet, so
 * "does it hold the source's winner?" answered no, and the entry was recorded as a decided exit: the new LOSER's own
 * walkover, on the side the new winner was about to take. The matchUp there is a BYE, which admits no arrival entry,
 * so the stale record stood beside the new winner and was carried past the BYE with them into the next round, where
 * a carried exit already waited. Before #5444 the two converged into a double exit nobody had entered; since #5444
 * the copy is withdrawn as a carry stranded from its carrier, and the withdrawal took the new winner's advancement
 * back with it. Both seeds passed before 388355c131 (#5444) and fail from it.
 *
 * The seat a removal empties in the source's own structure is the one the source's winner takes next. Only a double
 * exit, which sends nobody, decides anything for it.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const retired = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

const CASES = [
  {
    config: {
      drawType: FEED_IN_CHAMPIONSHIP,
      propagateExitStatus: true,
      participantsCount: 11,
      drawSize: 16,
      seed: 20532286,
    },
    schedule: [
      at('Main|1|4', { winningSide: 1 }),
      at('Main|1|5', retired),
      at('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|2|2', retired),
      at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|2|3', { winningSide: 2 }),
      at('Main|3|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
      at('Consolation|2|3', { winningSide: 1 }),
      at('Consolation|2|3', { matchUpStatus: WALKOVER, winningSide: 2 }),
    ],
    corrected: [7],
    // the relabelled matchUp, and the two its new winner reaches past the BYE in `Consolation|3|2`
    relabelled: 'Consolation|2|3',
    reached: ['Consolation|3|2', 'Consolation|4|2'],
  },
  {
    config: {
      drawType: COMPASS,
      propagateExitStatus: true,
      participantsCount: 27,
      drawSize: 32,
      seed: 20585407,
    },
    schedule: [
      at('East|1|3', { winningSide: 2 }),
      at('East|1|4', { winningSide: 2 }),
      at('West|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|2', { matchUpStatus: DOUBLE_DEFAULT }),
      at('East|1|8', { winningSide: 1 }),
      at('East|1|7', { winningSide: 2 }),
      at('East|1|6', { matchUpStatus: DOUBLE_WALKOVER }),
      at('West|1|4', { winningSide: 2 }),
      at('West|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    ],
    corrected: [7],
    relabelled: 'West|1|4',
    reached: ['West|2|2', 'West|3|1'],
  },
];

function play(config: any, steps: Step[], drawId: string) {
  setSubscriptions({});
  prepareDraw(config, drawId);
  for (const step of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === coordinate(step));
    const result: any = observeMutation({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    expect(result.thrown).toBeUndefined();
  }
}

function drawAfter(config: any, steps: Step[], drawId: string) {
  play(config, steps, drawId);
  return Object.fromEntries(
    getDrawMatchUps(drawId).map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        occupants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
      },
    ]),
  );
}

it.each(CASES)('$config.seed: the corrected schedule leaves a consistent draw', ({ config, schedule }) => {
  setSubscriptions({});
  expect(replay(config, schedule, `winner-seat-${config.seed}`)).toBeNull();
});

it.each(CASES)(
  '$config.seed: the correction reaches the draw the results entered directly reach',
  ({ config, schedule, corrected }) => {
    const viaCorrection = drawAfter(config, schedule, `winner-seat-corrected-${config.seed}`);
    const direct = drawAfter(
      config,
      schedule.filter((_, index) => !corrected.includes(index)),
      `winner-seat-direct-${config.seed}`,
    );
    expect(viaCorrection).toEqual(direct);
  },
);

it.each(CASES)(
  '$config.seed: no matchUp the new winner reaches records the exit they won as their own',
  ({ config, schedule, relabelled, reached }) => {
    const drawId = `winner-seat-provenance-${config.seed}`;
    play(config, schedule, drawId);
    const matchUps = getDrawMatchUps(drawId);
    const sourceMatchUpId = matchUps.find((matchUp: any) => coordinate(matchUp) === relabelled)?.matchUpId;
    const stored = new Map<string, any>();
    for (const structure of getDrawDefinition(drawId).structures ?? []) {
      for (const matchUp of structure.matchUps ?? []) stored.set(matchUp.matchUpId, matchUp);
    }
    for (const key of reached) {
      const matchUpId = matchUps.find((matchUp: any) => coordinate(matchUp) === key)?.matchUpId;
      const entries: any[] = Object.values(stored.get(matchUpId)?.sideExitProvenance ?? {});
      const carried = entries.filter((entry) => entry?.sourceMatchUpId === sourceMatchUpId && entry?.matchUpStatus);
      expect(carried).toEqual([]);
    }
  },
);
