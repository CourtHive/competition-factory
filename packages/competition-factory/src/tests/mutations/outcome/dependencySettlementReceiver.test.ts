import { reconcileReceiver, type Input } from '@Mutate/matchUps/outcome/settlement/receiver';
import { BYE, COMPLETED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, PositionAssignment, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { expect, it } from 'vitest';

function receiving(seat: PositionAssignment) {
  const ids = { drawId: 'draw', eventId: 'event', tournamentId: 'tournament' };
  const target = {
    ...ids,
    matchUpId: 'next',
    structureId: 'receiver',
    matchUpStatus: seat.bye ? BYE : TO_BE_PLAYED,
    drawPositions: [1],
    sides: [{ sideNumber: 1, ...seat }],
  } as HydratedMatchUp;
  const source = {
    ...ids,
    matchUpId: 'donor',
    structureId: 'donor-bracket',
    matchUpStatus: COMPLETED,
    sides: [{ sideNumber: 2, drawPosition: 7, participantId: 'arrival' }],
    winningSide: 1,
  } as HydratedMatchUp;
  const frame = {
    drawDefinition: { structures: [{ structureId: 'receiver', positionAssignments: [seat] }] } as DrawDefinition,
    inContextDrawMatchUps: [target, source],
  };
  const empty: Input = {
    source,
    grant: {},
    edge: { source: 'donor', receiver: 'next', role: 'loser', position: 1, shared: false },
  };
  const reservation: Input = { ...empty, grant: { reserved: true } };
  const entrant: Input = { ...empty, grant: { participant: 'arrival', sourcePosition: 7 } };
  const reconcile = (old: Input, next: Input) => reconcileReceiver(frame, target, [old], [next], false);
  return { target, frame, empty, reservation, entrant, reconcile };
}

it('withdraws the last propagated reservation before admitting its replacement at the same seat', () => {
  const { target, reconcile, reservation, entrant } = receiving({
    drawPosition: 1,
    bye: true,
    byeFromPropagation: true,
  });
  expect(reconcile(reservation, entrant)).toEqual({
    reasons: [],
    ops: [
      { op: 'withdrawBye', structureId: target.structureId, drawPosition: 1 },
      { op: 'clearMatchUpBye', matchUpId: target.matchUpId, drawPosition: 1 },
      { op: 'assignPosition', structureId: target.structureId, drawPosition: 1, participantId: 'arrival' },
    ],
  });
});

it('keeps a structural BYE, a reservation shared by another feeder, and an occupied competing seat', () => {
  const structural = receiving({ drawPosition: 1, bye: true });
  expect(structural.reconcile(structural.reservation, structural.empty)).toEqual({ ops: [], reasons: [] });
  const { target, frame, reservation, empty } = receiving({ drawPosition: 1, bye: true, byeFromPropagation: true });
  const peer = {
    ...reservation,
    edge: { ...reservation.edge, source: 'other' },
    source: { ...reservation.source, matchUpId: 'other' },
  };
  expect(reconcileReceiver(frame, target, [peer, reservation], [peer, empty], false)).toEqual({ ops: [], reasons: [] });
  const occupied = receiving({ drawPosition: 1, participantId: 'incumbent' });
  expect(occupied.reconcile(occupied.empty, occupied.entrant)).toEqual({ ops: [], reasons: ['held-linked-arrival'] });
  expect(occupied.reconcile(occupied.empty, occupied.reservation)).toEqual({
    ops: [],
    reasons: ['occupied-reservation'],
  });
});

it('checks the mapped structure slot and the actual losing entrant before writing an arrival', () => {
  const { reconcile, empty, entrant, reservation } = receiving({ drawPosition: 1 });
  expect(reconcile(empty, entrant).ops).toEqual([
    { op: 'assignPosition', structureId: 'receiver', drawPosition: 1, participantId: 'arrival' },
  ]);
  expect(reconcile(empty, { ...entrant, edge: { ...entrant.edge, position: undefined } }).reasons).toEqual([
    'unmapped-arrival',
  ]);
  expect(reconcile(empty, { ...reservation, edge: { ...reservation.edge, position: undefined } }).reasons).toEqual([
    'unmapped-reservation',
  ]);
  expect(reconcile(empty, { ...reservation, edge: { ...reservation.edge, position: 3 } }).reasons).toEqual([
    'missing-reservation-slot',
  ]);
  expect(reconcile(empty, { ...reservation, edge: { ...reservation.edge, shared: true } }).reasons).toEqual([
    'shared-final-placement',
  ]);
});

it('refuses to clear an independent score when the old entrant really holds the linked slot', () => {
  const { target, reconcile, entrant, empty } = receiving({ drawPosition: 1, participantId: 'arrival' });
  target.score = { sets: [{ side1Score: 6, side2Score: 2 }] };
  expect(reconcile(entrant, empty)).toEqual({ ops: [], reasons: ['independent-score'] });
});

it('withdraws an old losing-side carry while preserving the opposite ordinary arrival', () => {
  const { target, reconcile, entrant } = receiving({ drawPosition: 1, participantId: 'arrival' });
  const mark: SideExitProvenanceEntry = {
    sourceMatchUpId: entrant.source.matchUpId,
    previousMatchUpStatus: WALKOVER,
    matchUpStatus: WALKOVER,
  };
  const other: SideExitProvenanceEntry = { sourceMatchUpId: 'another', previousMatchUpStatus: COMPLETED };
  target.matchUpStatus = WALKOVER;
  target.sideExitProvenance = { 1: mark, 2: other };
  const old: Input = {
    ...entrant,
    source: { ...entrant.source, matchUpStatus: WALKOVER },
    grant: { ...entrant.grant, mark },
  };
  const answer = reconcile(old, entrant);
  expect(answer.reasons).toEqual([]);
  expect(answer.ops).toContainEqual(expect.objectContaining({ op: 'setMatchUpResult', matchUpStatus: TO_BE_PLAYED }));
  expect(answer.ops.at(-1)).toEqual({ op: 'setSideExitProvenance', matchUpId: 'next', provenance: { 2: other } });
  expect(reconcile({ ...old, source: { ...old.source, matchUpStatus: COMPLETED } }, entrant)).toEqual({
    ops: [],
    reasons: ['stale-source-marker'],
  });
});
