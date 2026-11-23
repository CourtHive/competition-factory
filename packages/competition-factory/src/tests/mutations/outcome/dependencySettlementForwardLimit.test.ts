import { planForward, winnerArrival } from '@Mutate/matchUps/outcome/settlement/forwardLimit';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { COMPLETED, WALKOVER, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// One ordinary bracket supplies 128 independent first-round sources in pass order.
// The last open seat can be the opposite side of the target the preceding action just filled.
function fixture(count: number, pendingExitOnLastTarget = false) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 256, drawId: 'forward' }],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const stored = drawDefinition.structures[0].matchUps;
  const decided = stored.filter((match) => match.roundNumber === 1).slice(0, count);
  for (const match of decided) Object.assign(match, { matchUpStatus: COMPLETED, winningSide: 1 });
  if (pendingExitOnLastTarget) {
    const target = stored.find((match) => match.matchUpId === decided.at(-1).winnerMatchUpId);
    target.matchUpStatus = WALKOVER;
  }
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps: inContextDrawMatchUps = [] } = getAllDrawMatchUps({
    drawDefinition,
    matchUpsMap,
    tournamentRecord,
    inContext: true,
    event,
  });
  const working = createWorkingView({
    inContextDrawMatchUps,
    matchUpsMap,
    drawDefinition,
    event,
    tournamentRecord,
    clockFree: true,
  });
  const request = { flags: { propagateRetirementAsExit: false } };
  const run = () => planForward({ working, request, tournamentRecord, event });
  const owed = inContextDrawMatchUps.filter((match) => match.roundNumber === 1 && match.winningSide);
  const placements = () =>
    working.inContextDrawMatchUps
      .filter((match) => match.roundNumber === 2)
      .flatMap((match) => (match.sides ?? []).flatMap((s) => (s.participantId ? [s.drawPosition] : [])))
      .sort((a, b) => a - b);
  return { owed, run, placements, tournamentRecord, drawDefinition, working, request };
}

it.each([64, 65])(
  'reads the first outstanding holder after exactly 64 of %i winner placements',
  (count) => {
    const f = fixture(count);
    const before = JSON.stringify(f.tournamentRecord);
    const seats = f.owed.map((match) => match.sides!.find((s) => s.sideNumber === match.winningSide)!.drawPosition);
    expect(f.placements()).toEqual([]);
    const first = f.run();
    expect(first.reasons).toEqual([]);
    expect(first.ops.filter((op) => op.op === 'setMatchUpDrawPositions').map((op) => op.matchUpId)).toEqual(
      f.owed.slice(0, 64).map((match) => match.winnerMatchUpId),
    );
    expect(f.placements()).toEqual(seats.slice(0, 64).sort((a, b) => a - b));
    expect(first.exhausted).toBe(f.owed[64]?.matchUpId);
    expect(first.ops.slice(1, 4)).toEqual([
      { op: 'stampUpdatedAt', entity: 'drawDefinition', id: f.drawDefinition.drawId },
      { op: 'stampUpdatedAt', entity: 'structure', id: f.drawDefinition.structures[0].structureId },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: f.owed[0].winnerMatchUpId },
    ]);

    const resumed = f.run();
    expect(resumed.reasons).toEqual([]);
    expect(resumed.exhausted).toBeUndefined();
    expect(resumed.ops.filter((op) => op.op === 'setMatchUpDrawPositions').map((op) => op.matchUpId)).toEqual(
      f.owed.slice(64).map((match) => match.winnerMatchUpId),
    );
    expect(f.placements()).toEqual(seats.sort((a, b) => a - b));
    expect(f.run()).toEqual({ ops: [], reasons: [] });
    expect(JSON.stringify(f.tournamentRecord)).toBe(before);
  },
  30_000,
);

it('reports an outstanding holder at 65 even when its arrival needs another rule on resume', () => {
  const f = fixture(65, true);
  const first = f.run();
  expect(first.reasons).toEqual([]);
  expect(first.exhausted).toBe(f.owed[64].matchUpId);
  const placed = f.placements();
  expect(placed).toHaveLength(64);
  expect(f.run()).toEqual({ ops: [], reasons: [`forward:winner:${first.exhausted}`] });
  expect(f.placements()).toEqual(placed);
});

it('keeps other owed actions separate from an ordinary winner placement', () => {
  const { working, owed } = fixture(1);
  const first = owed[0];
  const debt = {
    kind: 'winner' as const,
    matchUpId: first.matchUpId,
    drawPosition: first.sides![0].drawPosition!,
    key: 'test',
  };
  expect(winnerArrival(working, debt)?.[0]).toMatchObject({
    op: 'setMatchUpDrawPositions',
    matchUpId: first.winnerMatchUpId,
  });
  for (const kind of ['loser', 'reservation', 'emptyWinner'] as const)
    expect(winnerArrival(working, { ...debt, kind })).toBeUndefined();
  // A stale debt naming the championship cannot advance a winner any further.
  const final = working.inContextDrawMatchUps.find((m) => !m.winnerMatchUpId)!;
  expect(winnerArrival(working, { ...debt, matchUpId: final.matchUpId })).toBeUndefined();
  const [placed] = winnerArrival(working, debt)!;
  expect(working.apply([placed])).toEqual({});
  expect(winnerArrival(working, debt)).toBeUndefined();
});

it('leaves an ordinary arrival open when the paired feeder produced a double exit', () => {
  const { working, owed, run, placements } = fixture(1);
  const first = owed[0];
  const sibling = working.inContextDrawMatchUps.find(
    (m) => m.matchUpId !== first.matchUpId && m.winnerMatchUpId === first.winnerMatchUpId,
  )!;
  expect(
    working.apply([{ op: 'setMatchUpResult', matchUpId: sibling.matchUpId, matchUpStatus: DOUBLE_WALKOVER }]),
  ).toEqual({});
  expect(run()).toEqual({ ops: [], reasons: [`forward:winner:${first.matchUpId}`] });
  expect(placements()).toEqual([]);
});

it('returns a cursor refusal before accounting for the outstanding placement', () => {
  const { working, request, placements } = fixture(1);
  expect(planForward({ working: { ...working, temporal: undefined }, request })).toEqual({
    ops: [],
    reasons: ['forward:requires clock-free working view'],
  });
  const failing = { ...working, apply: () => ({ error: 'unavailable receiver' }) };
  expect(planForward({ working: failing, request })).toEqual({ ops: [], reasons: ['unavailable receiver'] });
  expect(placements()).toEqual([]);
});
