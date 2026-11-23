import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';

/**
 * A PRODUCED EXIT SUPERSEDES A STALE RELAY ON ITS OWN SIDE (census run 18 DRAW_INCONSISTENCY, FEED_IN_CHAMPIONSHIP_TO_SF
 * 16/13, default progression policy, seed 20733977).
 *
 * `Consolation|1|3`'s double default produces a default that is relayed past `Consolation|2|3`'s BYE and waits in
 * `Consolation|3|2` on side 1, a target holding no position yet. Then `Main|2|2`'s defaulted loser takes the BYE's seat
 * in `2|3`, meets the produced exit there, and `2|3` becomes a double default that produces its own default along the
 * same path, onto the same side of `3|2`. The relay standing there came the same way: this exit supersedes it. Read as
 * the OTHER side's exit, it was taken for a convergence: `3|2` became a DOUBLE_DEFAULT and produced onward into `4|2`,
 * and when a participant later reached `3|2` they advanced from an undecided matchUp (ADVANCED_FROM_UNDECIDED).
 *
 * A target holding no position whose only standing exit is on the arrival side is superseded, not converged; the
 * draw then matches forward play, where `Main|2|2`'s default is entered before `Consolation|1|3`'s double default.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
  propagateExitStatus: true,
  participantsCount: 13,
  drawSize: 16,
  seed: 20733977,
};
const RELAYED = at('Consolation|1|3', { matchUpStatus: DOUBLE_DEFAULT });
const SUPERSEDING = at('Main|2|2', { matchUpStatus: DEFAULTED, winningSide: 1 });
const BEFORE = [
  at('Main|1|4', { winningSide: 2 }),
  at('Main|1|5', { winningSide: 2 }),
  at('Main|1|6', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('Main|1|7', { winningSide: 1 }),
  at('Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
];
const AFTER = [
  at('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
];
const SCHEDULE = [...BEFORE, RELAYED, SUPERSEDING, ...AFTER];
const FORWARD = [...BEFORE, SUPERSEDING, RELAYED, ...AFTER];

function play(drawId: string, schedule: Step[], afterEach?: (step: Step, find: (key: string) => any) => void) {
  prepareDraw(CONFIG, drawId);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  for (const step of schedule) {
    const result = observeMutation({
      matchUpId: find(coordinate(step)).matchUpId,
      propagateExitStatus: true,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
    afterEach?.(step, find);
  }
  return find;
}

// the whole draw keyed by coordinate: ids differ per drawId, so provenance sources are read as coordinates too
function snapshot(drawId: string) {
  const matchUps = getDrawMatchUps(drawId);
  const byId = new Map(matchUps.map((matchUp: any) => [matchUp.matchUpId, coordinate(matchUp)]));
  return Object.fromEntries(
    matchUps.map((matchUp: any) => [
      coordinate(matchUp),
      {
        matchUpStatus: matchUp.matchUpStatus,
        winningSide: matchUp.winningSide,
        drawPositions: [...(matchUp.drawPositions ?? [])].filter(Boolean).sort((a: number, b: number) => a - b),
        participants: (matchUp.sides ?? []).map((side: any) => side.participantId).filter(Boolean),
        provenance: Object.fromEntries(
          Object.entries(matchUp.sideExitProvenance ?? {}).map(([side, entry]: any) => [
            side,
            entry && { ...entry, sourceMatchUpId: byId.get(entry.sourceMatchUpId) },
          ]),
        ),
      },
    ]),
  );
}

it('the census finds nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'supersede-own-side')).toBeNull();
});

it('the produced exit replaces the relay it supersedes, and nothing is produced beyond it', () => {
  setSubscriptions({});
  play('supersede-own-side-steps', SCHEDULE, (step, find) => {
    if (step !== SUPERSEDING) return;
    const target = find('Consolation|3|2');
    expect(target.matchUpStatus).toEqual(DEFAULTED);
    expect(target.sideExitProvenance?.[1]?.sourceMatchUpId).toEqual(find('Consolation|2|3').matchUpId);
    expect(target.sideExitProvenance?.[2]).toBeUndefined();
    expect(find('Consolation|4|2').sideExitProvenance ?? {}).toEqual({});
  });
});

it('the draw equals forward play, where the superseding default is entered first', () => {
  setSubscriptions({});
  play('supersede-own-side-late', SCHEDULE);
  const late = snapshot('supersede-own-side-late');
  play('supersede-own-side-forward', FORWARD);
  expect(late).toEqual(snapshot('supersede-own-side-forward'));
});
