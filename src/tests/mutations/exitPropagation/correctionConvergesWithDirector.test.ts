import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPASS, CURTIS_CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * The `allowChangePropagation` correction must reach the state the DIRECTOR'S SEQUENCE reaches.
 *
 * There were two implementations of "change a winner and carry it downstream". Without the flag the
 * change is refused with `CANNOT_CHANGE_WINNING_SIDE` and a director clears the downstream result,
 * enters the correction, and re-enters what they cleared — the normal machinery
 * (`removeDirectedParticipants` -> `directParticipants` -> `directLoser`/`directWinner`). With the
 * flag, `resolveAndApplyOutcome` short-circuited to `swapWinnerLoser`, which hand-edited
 * `drawPositions` and `positionAssignments` in what it believed were the affected structures.
 *
 * `swapWinnerLoser` built its structure set from `stageSequence`: same-stage structures with a
 * GREATER `stageSequence`, this matchUp's own target structures, and structures in that target's
 * stage with a greater `stageSequence`. Every structure fed by a DIFFERENT ROUND of the same source
 * structure sits at the SAME `stageSequence`, so it was never visited and its assignments were never
 * corrected — leaving the participant who no longer lost that round holding the back-draw place and
 * the one who now lost absent from it.
 *
 * The cases below are the reproductions from
 * `Mentat/planning/SWAP_WINNER_LOSER_TWO_ROUTES.md`. Each asserts POSITION ASSIGNMENTS rather than
 * the flipped matchUp: the flipped matchUp was always correct, and the whole defect lived one hop
 * further out.
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

const CLEAR_OUTCOME = {
  score: { scoreStringSide1: '', scoreStringSide2: '' },
  matchUpStatus: TO_BE_PLAYED,
  winningSide: undefined,
};

function build(drawId: string, drawType: string, drawSize: number) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize, drawId }],
    nonRandom: 7001,
    setState: true,
  });
  setSubscriptions({});
}

function matchUps(drawId: string): any[] {
  return tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
}

function apply(drawId: string, coordinate: string, outcome: any, allowChangePropagation?: boolean) {
  const target = matchUps(drawId).find((matchUp: any) => coordinates(matchUp) === coordinate);
  // a step that matched nothing would make every assertion below vacuous
  expect(target, `no matchUp at ${coordinate}`).toBeDefined();
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: target.matchUpId,
    outcome,
    drawId,
    ...(allowChangePropagation ? { allowChangePropagation: true } : {}),
  });
  return result?.error?.code;
}

/** Play the whole draw, side 1 winning every time, and return the schedule in dependency order. */
function playFully(drawId: string): string[] {
  const schedule: string[] = [];
  for (let guard = 0; guard < 400; guard++) {
    const next = matchUps(drawId)
      .filter(
        (matchUp: any) =>
          !matchUp.winningSide &&
          matchUp.roundPosition &&
          // a BYE matchUp is not playable; attempting one errors and truncates the schedule, which
          // silently shrinks the draw under test to whatever had been played before it
          !matchUp.matchUpStatus?.includes('BYE') &&
          (matchUp.sides ?? []).every((side: any) => side.participantId || side.bye) &&
          (matchUp.sides ?? []).some((side: any) => side.participantId),
      )
      .toSorted((a: any, b: any) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));
    if (!next[0]) break;
    const coordinate = coordinates(next[0]);
    if (apply(drawId, coordinate, { winningSide: 1 })) break;
    schedule.push(coordinate);
  }
  return schedule;
}

/** Every structure's assignments, keyed by `structureName|drawPosition` — ids are stable per seed. */
function assignments(drawId: string): Record<string, string> {
  const drawDefinition: any = tournamentEngine.getEvent({ drawId })?.drawDefinition;
  const snapshot: Record<string, string> = {};
  for (const structure of drawDefinition?.structures ?? []) {
    for (const assignment of structure.positionAssignments ?? []) {
      snapshot[`${structure.structureName}|${assignment.drawPosition}`] =
        `${assignment.participantId ?? '-'}${assignment.bye ? ' BYE' : ''}`;
    }
  }
  return snapshot;
}

it.each([
  { drawType: COMPASS, drawSize: 16, flip: 'East|1|4', watch: 'Northeast|1' },
  // `Main|1|3`, not the plan's `Main|1|4`: the plan's reproduction used a different set of results,
  // and under the schedule here (side 1 wins everything) `Main|1|4` does not diverge. Proven RED
  // against the pre-fix tree rather than carried over on the plan's word.
  { drawType: CURTIS_CONSOLATION, drawSize: 16, flip: 'Main|1|3', watch: 'Play Off|1' },
])(
  '$drawType: correcting $flip reaches the same state as the director clearing and re-entering',
  ({ drawType, drawSize, flip, watch }) => {
    // ---- the director's sequence: clear the downstream suffix, correct, re-enter --------------
    const director = `director-${drawType}`;
    build(director, drawType, drawSize);
    const schedule = playFully(director);
    // CONTROL: an unplayed draw has no decided matchUp to correct, and every assertion below would
    // compare two untouched draws and pass.
    expect(schedule.length, `${drawType}: nothing was played`).toBeGreaterThan(0);
    expect(schedule, `${drawType}: ${flip} was never played`).toContain(flip);

    const suffix = schedule.slice(schedule.indexOf(flip) + 1);
    for (const coordinate of suffix.toReversed()) apply(director, coordinate, CLEAR_OUTCOME);
    expect(apply(director, flip, { winningSide: 2 })).toBeUndefined();
    for (const coordinate of suffix) apply(director, coordinate, { winningSide: 1 });

    // captured BEFORE the next scenario: `setState: true` REPLACES the tournament record
    const directorAssignments = assignments(director);
    const directorInconsistencies =
      tournamentEngine.getDrawInconsistencies({ drawId: director })?.inconsistencies ?? [];

    // CONTROL: the back-draw position the defect lived in must actually hold somebody, or the
    // comparison below is between two absent values.
    expect(directorAssignments[watch], `${drawType}: ${watch} holds nobody`).toBeDefined();
    expect(directorAssignments[watch]).not.toEqual('-');

    // ---- the override: allowChangePropagation, which clears nothing itself --------------------
    const override = `override-${drawType}`;
    build(override, drawType, drawSize);
    const overrideSchedule = playFully(override);
    expect(overrideSchedule).toEqual(schedule);
    expect(apply(override, flip, { winningSide: 2 }, true)).toBeUndefined();

    // The whole draw, not the flipped matchUp: `swapWinnerLoser` always got the flipped matchUp
    // right and the structures one hop out wrong.
    expect(assignments(override)).toEqual(directorAssignments);
    expect(tournamentEngine.getDrawInconsistencies({ drawId: override })?.inconsistencies ?? []).toEqual(
      directorInconsistencies,
    );
  },
);

/**
 * Gap 3 — a correction that BYEs a consolation position must also reconcile the matchUp standing on
 * it. `swapWinnerLoser` edited the assignment and left `Consolation|2|3` reading `COMPLETED ws=1`
 * with a BYE on the winning side, then advanced that BYE onward. `getDrawInconsistencies` rates it
 * CLEAN, so this has to be asserted directly rather than trusted to the integrity scan.
 */
it('a BYE left by a correction is never recorded as having won', () => {
  const drawId = 'gap-three';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 13, drawId }],
    nonRandom: 7001,
    setState: true,
  });
  setSubscriptions({});

  const schedule = playFully(drawId);
  expect(schedule.length).toBeGreaterThan(0);
  expect(schedule).toContain('Main|2|3');

  expect(apply(drawId, 'Main|2|3', { winningSide: 2 }, true)).toBeUndefined();

  const byeWinners = matchUps(drawId).filter((matchUp: any) => {
    if (!matchUp.winningSide) return false;
    const winner = (matchUp.sides ?? []).find((side: any) => side.sideNumber === matchUp.winningSide);
    return !!winner?.bye;
  });

  expect(
    byeWinners.map((matchUp: any) => `${coordinates(matchUp)} ${matchUp.matchUpStatus} ws=${matchUp.winningSide}`),
  ).toEqual([]);
});
