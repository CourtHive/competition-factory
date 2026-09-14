import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, COMPASS } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * `assignDrawPositionBye` asked "is this BYE propagation-produced?" in three places and got two
 * different answers.
 *
 * `byeFromPropagation` is the caller's DECLARATION — `advanceByeToLoserMatchUp` sets it precisely
 * because, in its own words, the cascade "is placing the BYE, so it says so rather than leaving
 * assignDrawPositionBye to infer it from upstream statuses it cannot classify".
 * `hasPropagatedStatus` is that inference, and it tests upstream statuses with `isExit` — which
 * EXCLUDES `DOUBLE_WALKOVER` and `DOUBLE_DEFAULT`, so it is false in exactly the double-exit case
 * that produces these BYEs. The file's own type doc already recorded the consequence: *"every BYE
 * placed by a COMPASS double-walkover cascade arrived with `hasPropagatedStatus === false`."*
 *
 * The marker written onto the assignment preferred the declaration ("authoritative when present").
 * The two error guards and the participant clear did not. The three now resolve one value.
 *
 * Measured over two independent 600-seed frozen-schedule census windows: **50 failing seeds → 32,
 * 18 closed and 0 opened**, every one of the 18 also closing under per-seed isolation.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

function play({
  participantsCount,
  propagateExitStatus,
  drawSize,
  drawType,
  steps,
  seed,
}: {
  participantsCount: number;
  propagateExitStatus: boolean;
  drawSize: number;
  drawType: string;
  steps: Step[];
  seed: number;
}) {
  setSubscriptions({});
  const drawId = `bye-declaration-${seed}`;
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
    nonRandom: seed,
    setState: true,
  });
  expect(drawIds).toContain(drawId);

  const byePositionsWithParticipant: any[] = [];
  const errorsOverMutatedDraw: any[] = [];
  const errors: any[] = [];
  let applied = 0;

  /**
   * `createdAt`/`updatedAt` excluded: a refused call that bumped only a timestamp is not the defect
   * under test, and asserting on it would fire on a difference nobody can act on.
   */
  const drawState = () => {
    const strip = (value: any): any => {
      if (Array.isArray(value)) return value.map(strip);
      if (value && typeof value === 'object') {
        const result: any = {};
        for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
          if (key === 'createdAt' || key === 'updatedAt') continue;
          result[key] = strip(value[key]);
        }
        return result;
      }
      return value;
    };
    return JSON.stringify(strip(tournamentEngine.getEvent({ drawId })?.drawDefinition ?? null));
  };

  const collectViolations = () => {
    const walk = (structure: any) => {
      for (const assignment of structure.positionAssignments ?? []) {
        if (assignment.bye && assignment.participantId) {
          byePositionsWithParticipant.push({
            structureName: structure.structureName,
            drawPosition: assignment.drawPosition,
          });
        }
      }
      for (const child of structure.structures ?? []) walk(child);
    };
    for (const structure of tournamentEngine.getEvent({ drawId })?.drawDefinition?.structures ?? []) walk(structure);
  };

  for (const step of steps) {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const target = matchUps.find((matchUp: any) => coordinates(matchUp) === coordinates(step));
    if (!target) continue;
    applied++;

    const before = drawState();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      propagateExitStatus,
      drawId,
    });
    if (result?.error) {
      errors.push({ step: coordinates(step), error: result.error.code });
      if (before !== drawState()) {
        errorsOverMutatedDraw.push({ step: coordinates(step), error: result.error.code });
      }
    }

    // checked after EVERY step: a later step can clear the violation, so an end-state check alone
    // reports nothing and reads as good news
    collectViolations();
  }

  // The control: a scenario whose steps never matched a matchUp would assert nothing at all.
  expect(applied).toEqual(steps.length);

  return { errors, errorsOverMutatedDraw, byePositionsWithParticipant };
}

it('a cascade that DECLARES it is placing the BYE is not refused by the inference that cannot see it', () => {
  // Shrunk by delta debugging from the 30-step schedule of census seed 9000059. Without the
  // declaration being honoured, the final DOUBLE_WALKOVER is refused with ERR_ACTIVE_DRAW_POSITION —
  // after the cascade has already flipped the source matchUp, emptied its score and drawPositions,
  // and left a positionAssignment with no participantId.
  const { errors, errorsOverMutatedDraw } = play({
    seed: 9000059,
    drawType: DOUBLE_ELIMINATION,
    drawSize: 8,
    participantsCount: 7,
    propagateExitStatus: true,
    steps: [
      { structureName: 'Main', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 2, outcome: { winningSide: 1 } },
      { structureName: 'Main', roundNumber: 1, roundPosition: 4, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { winningSide: 2 } },
      {
        structureName: 'Backdraw',
        roundNumber: 2,
        roundPosition: 2,
        outcome: {
          matchUpStatus: RETIRED,
          winningSide: 1,
          score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
        },
      },
      { structureName: 'Main', roundNumber: 2, roundPosition: 2, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ],
  });

  // The defect was ERR_ACTIVE_DRAW_POSITION raised by a topology scan that could not see the
  // cascade's declaration — and raised over a draw the same call had already damaged.
  expect(errors.map((entry: any) => entry.error)).not.toContain('ERR_ACTIVE_DRAW_POSITION');

  // UPDATED 2026-09-14, deliberately, and the reason matters. This scenario's final step is now
  // refused with ERR_INCOMPATIBLE_MATCHUP_STATUS, by `checkDownstreamCompatibility` — the guard that
  // refuses a non-directing status while something downstream is active. It began firing when
  // `isActiveDownstream` stopped treating a PLAYED consolation exit as an inert propagated one, and
  // it runs BEFORE anything is written. So the assertion this test needs is not "no error" — the
  // engine is entitled to refuse — it is that a refusal never lands on a half-changed draw.
  expect(errorsOverMutatedDraw).toEqual([]);
});

it('a BYE the cascade places clears the participant it displaces', () => {
  // Two steps, shrunk from census seed 9000074. This is the OTHER half of the same question, and it
  // is not interchangeable with the case above: honouring the declaration in the guards alone lets
  // the cascade place its BYE while the participant clear still consults the inference, so the
  // drawPosition ends up BOTH a BYE and assigned. Measured as `BYE_POSITION_WITH_PARTICIPANT` on 6
  // seeds of one census window and 4 of the other — a draw nothing reports as wrong, which is worse
  // than the refusal it replaced.
  const { byePositionsWithParticipant } = play({
    seed: 9000074,
    drawType: COMPASS,
    drawSize: 16,
    participantsCount: 16,
    propagateExitStatus: true,
    steps: [
      { structureName: 'East', roundNumber: 1, roundPosition: 1, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } },
      { structureName: 'East', roundNumber: 1, roundPosition: 3, outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    ],
  });

  expect(byePositionsWithParticipant).toEqual([]);
});
