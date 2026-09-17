import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_ELIMINATION, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A participant advancing THROUGH a BYE into a pending walkover resolves it — also when that walkover
 * was produced by a double exit and so carries no winningSide yet.
 *
 * A double walkover in a consolation feed round produces a WALKOVER in the next round that records
 * only which side exited (`sideExitProvenance`): there is nobody yet to award it to. When the other
 * side's participant then arrives through a BYE, `advanceWinner` resolved the walkover only if it
 * already had a winningSide, so this one was overwritten TO_BE_PLAYED — a decided matchUp silently
 * undecided (MONOTONIC_DECISION, census 9000223 flag ON, shrunk to three steps and the harness's
 * relational double-walkover probe). A position holding NOBODY arriving the same way resolves nothing
 * and must leave the walkover pending — it was cleared the same way.
 */
const setup = () => {
  const drawId = 'bye-into-pending-double-exit';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 16, participantsCount: 11, drawId }],
    nonRandom: 9000223,
    setState: true,
  });
  const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
  const matchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
  const find = (k: string) => matchUps().find((m: any) => key(m) === k);
  const submit = (k: string, outcome: any) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: find(k).matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: false,
      outcome,
      drawId,
    }) as any;
  const decided = () =>
    new Set(
      matchUps()
        .filter((m: any) => m.winningSide || m.matchUpStatus === WALKOVER)
        .map((m: any) => m.matchUpId),
    );

  expect(submit('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }).error).toBeUndefined();
  expect(submit('Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }).error).toBeUndefined();
  expect(submit('Consolation|2|2', { matchUpStatus: DOUBLE_WALKOVER }).error).toBeUndefined();

  // control: the double exit produced a pending walkover with no winner yet
  const pending = matchUps().find(
    (m: any) => m.structureName === 'Consolation' && m.roundNumber === 3 && m.matchUpStatus === WALKOVER,
  );
  expect(pending, 'no pending consolation walkover').toBeDefined();
  expect(pending.winningSide).toBeUndefined();

  return { drawId, key, find, submit, decided, pending };
};

it('a participant arriving through a BYE wins the pending walkover a consolation double exit produced', () => {
  const { drawId, key, find, submit, decided, pending } = setup();
  // P2's first-round result is recorded, so the loser is in the consolation opposite a BYE…
  expect(submit('Main|1|2', { winningSide: 2 }).error).toBeUndefined();
  const before = decided();
  // …and Main r2p1's double exit feeds a BYE opposite them, so they advance into the pending walkover
  expect(submit('Main|2|1', { matchUpStatus: DOUBLE_WALKOVER }).error).toBeUndefined();

  const resolved = find(key(pending));
  expect(resolved.matchUpStatus).toEqual(WALKOVER);
  const winner = resolved.sides.find((side: any) => side.sideNumber === resolved.winningSide);
  expect(winner?.participantId).toBeDefined();
  expect(winner.sideNumber).not.toEqual(Number(Object.keys(resolved.sideExitProvenance ?? {})[0]));

  expect([...before].filter((id) => !decided().has(id))).toEqual([]);
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});

it('a position holding nobody arriving through a BYE leaves the pending walkover pending', () => {
  const { drawId, key, find, submit, decided, pending } = setup();
  const before = decided();
  // Main r1p2's double exit feeds NOBODY to the consolation, and that empty position advances
  expect(submit('Main|1|2', { matchUpStatus: DOUBLE_WALKOVER }).error).toBeUndefined();

  const after = find(key(pending));
  expect(after.matchUpStatus).toEqual(WALKOVER);
  expect(after.winningSide).toBeUndefined();
  expect([...before].filter((id) => !decided().has(id))).toEqual([]);
  expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? []).toEqual([]);
});

/**
 * The arriving side is STRUCTURAL, not the array index. A lone arrival is built as `[position,
 * undefined]` whatever side it belongs on; reading the index put the exiting side's own participant on
 * side 1 and made them the winner of their own walkover, and the real opponent was later refused.
 * DE window seed 9303412, flag ON, shrunk.
 */
it('the exiting side arriving through a BYE leaves the walkover pending for the other side', () => {
  const drawId = 'bye-exiting-side-arrives';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, participantsCount: 6, drawId }],
    nonRandom: 9303412,
    setState: true,
  });
  const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
  const find = (k: string) =>
    tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.find((m: any) => key(m) === k);
  const steps: [string, any][] = [
    ['Main|1|3', { winningSide: 2 }],
    ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ['Main|2|2', { matchUpStatus: DOUBLE_WALKOVER }],
    ['Main|2|1', { winningSide: 2 }],
    ['Backdraw|2|1', { winningSide: 2 }],
  ];
  for (const [k, outcome] of steps) {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(k).matchUpId,
      allowChangePropagation: true,
      propagateExitStatus: true,
      outcome,
      drawId,
    });
    expect(result.error, k).toBeUndefined();
    expect(tournamentEngine.getDrawInconsistencies({ drawId }).inconsistencies ?? [], k).toEqual([]);
  }
  // the Backdraw semifinal walkover went to whoever arrived on the non-exiting side, and they advanced
  const semi = find('Backdraw|3|1');
  const winner = semi.sides.find((side: any) => side.sideNumber === semi.winningSide);
  expect(winner?.participantId).toBeDefined();
  expect(winner.sideNumber).not.toEqual(Number(Object.keys(semi.sideExitProvenance ?? {})[0]));
});
