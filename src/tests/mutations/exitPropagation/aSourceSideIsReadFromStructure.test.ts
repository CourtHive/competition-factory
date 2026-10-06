import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { isDoubleExit } from '@Validators/isExit';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * AN ORIGIN LEARNED FROM A SOURCE IS RECORDED ONLY ON THE MATCHUP THAT SOURCE FEEDS, ON THE SIDE ITS SEAT IS ON.
 *
 * `recordSourceSideProvenance` stamps where a side came from. factory-a7's probe (2026-10-06) found 33 of its stamps on
 * the wrong side over the frozen census, two classes:
 *
 *  - a stamp on a matchUp the source does not feed. `removeSubsequentRoundsParticipant` walks every later round holding
 *    the removed position and stamped each one with the same source (census w1 9000041, SE 8/7: `Main|3|1` "from"
 *    `Main|1|4`);
 *  - a side computed from roundPosition order. Two positions sort ascending, so where the next round carries larger,
 *    fed-in positions the source's participant can sit on side 2 although its matchUp has the lower roundPosition
 *    (census de 9304301, DE 16/11: `Backdraw|3|1` side 1 "from" `Backdraw|2|1`, whose participant sits on side 2).
 *
 * Each case is the census seed shrunk to its fewest steps. The check is the probe's, applied to what the draw stores
 * after every step: an origin naming a source in the same structure sits on that source's winner matchUp, and on the
 * side holding the source's position whenever one is held.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const retired = {
  score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
  matchUpStatus: RETIRED,
  winningSide: 1,
};

const CASES = [
  {
    name: 'SE 8/7 w1 9000041 (a matchUp the source does not feed)',
    config: {
      drawType: SINGLE_ELIMINATION,
      drawSize: 8,
      participantsCount: 7,
      seed: 9000041,
      propagateExitStatus: false,
    },
    steps: [
      at('Main|1|2', { winningSide: 1 }),
      at('Main|2|1', { matchUpStatus: DOUBLE_DEFAULT }),
      at('Main|1|4', { winningSide: 2 }),
      at('Main|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|1|4', retired),
    ],
  },
  {
    name: 'DE 16/11 de 9304301 (the side its seat is on)',
    config: {
      drawType: DOUBLE_ELIMINATION,
      drawSize: 16,
      participantsCount: 11,
      seed: 9304301,
      propagateExitStatus: true,
    },
    steps: [
      at('Main|1|2', { winningSide: 2 }),
      at('Main|1|7', { winningSide: 2 }),
      at('Main|1|4', { matchUpStatus: DOUBLE_WALKOVER }),
      at('Main|2|1', { matchUpStatus: DEFAULTED, winningSide: 1 }),
    ],
  },
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function misplacedOrigins(drawId: string): string[] {
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const byId = new Map(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const misplaced: string[] = [];
  for (const matchUp of matchUps) {
    for (const sideNumber of [1, 2]) {
      const entry = matchUp.sideExitProvenance?.[sideNumber];
      const source: any = entry?.sourceMatchUpId && byId.get(entry.sourceMatchUpId);
      // a double exit's product, and its relay past BYEs, are written by other paths
      if (!source || source.structureId !== matchUp.structureId || isDoubleExit(entry.previousMatchUpStatus)) continue;
      const target = positionTargets({ inContextDrawMatchUps: matchUps, matchUpId: source.matchUpId, drawDefinition })
        .targetMatchUps?.winnerMatchUp;
      if (target?.matchUpId !== matchUp.matchUpId) {
        misplaced.push(`${key(matchUp)}|${sideNumber} from ${key(source)}: not its target`);
        continue;
      }
      const seat = matchUp.sides?.find(
        (side: any) => side.drawPosition && source.drawPositions?.includes(side.drawPosition),
      );
      if (seat && seat.sideNumber !== sideNumber) {
        misplaced.push(`${key(matchUp)}|${sideNumber} from ${key(source)}: its seat is side ${seat.sideNumber}`);
      }
    }
  }
  return misplaced;
}

it.each(CASES)('$name: the census replay holds every property', ({ config, steps }) => {
  setSubscriptions({});
  expect(replay(config, steps, 'source-side-replay')).toBeNull();
});

it.each(CASES)('$name: every origin sits on its source target, on its seat', ({ config, steps }) => {
  const drawId = 'source-side';
  setSubscriptions({});
  prepareDraw(config, drawId);
  let origins = 0;
  for (const step of steps) {
    const target: any = (tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? []).find(
      (matchUp: any) => key(matchUp) === key(step),
    );
    const result: any = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: config.propagateExitStatus,
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(misplacedOrigins(drawId)).toEqual([]);
    origins += (tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? []).filter(
      (matchUp: any) => Object.keys(matchUp.sideExitProvenance ?? {}).length,
    ).length;
  }
  // CONTROL: origins were recorded, so there was something to place
  expect(origins).toBeGreaterThan(0);
});
