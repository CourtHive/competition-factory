import { positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { findStructure } from '@Acquire/findStructure';
import { buildDependencies, readGrant, slotKey } from './dependencies';
import { swapOps } from '../plan/directionOps';
import { chooseRoute } from '../route';
import { planWrite } from '../write';

import type { DrawDefinition } from '@Types/tournamentTypes';
import type { OutcomeRequest, OutcomeView } from '../types';
import type { PolicyDefinitions } from '@Types/factoryTypes';
import type { OutcomeOp } from '../ops';

type AssignmentReader = {
  structureId: string;
  drawPosition: number;
  before: string;
  after: string;
  matchUpIds: string[];
};

type RoleSeed = {
  role: 'winner' | 'loser';
  previousParticipantId: string;
  nextParticipantId: string;
  receiver?: { matchUpId: string; lost: string; acquired: string };
};

type SwapSeeds = {
  ops: OutcomeOp[];
  roles: RoleSeed[];
  assignmentReaders: AssignmentReader[];
  reasons: string[];
};

function unsupported(reason: string): SwapSeeds {
  return { ops: [], roles: [], assignmentReaders: [], reasons: [reason] };
}

function occupant(drawDefinition: DrawDefinition, structureId: string, position?: number) {
  const { structure } = findStructure({ drawDefinition, structureId });
  const seats = positionAssignmentsOf(structure)?.filter((a) => a.drawPosition === position);
  return seats?.length === 1 && !seats[0].bye ? seats[0].participantId : undefined;
}

function relabelReaders(
  drawDefinition: DrawDefinition,
  sourceId: string,
  relabels: NonNullable<OutcomeView['targets']['swap']>['relabels'],
  readers: Map<string, Set<string>>,
  winner: string,
  loser: string,
): AssignmentReader[] | undefined {
  const assignmentReaders: AssignmentReader[] = [];
  for (const { structureId, drawPosition, participantId } of relabels ?? []) {
    const before = occupant(drawDefinition, structureId, drawPosition);
    if (
      structureId === sourceId ||
      !before ||
      !((before === winner && participantId === loser) || (before === loser && participantId === winner))
    )
      return undefined;
    assignmentReaders.push({
      structureId,
      drawPosition,
      before,
      after: participantId,
      matchUpIds: [...(readers.get(slotKey(structureId, drawPosition)) ?? [])],
    });
  }

  return assignmentReaders;
}

/** A swap changes two role bindings at once. Certify the exchange against the current
 * assignments before handing its ops to the worklist. Subsequent carry/exit settlement,
 * the root result, notices and clock consumption belong to their respective phases. */
export function planSwapSeeds({
  drawDefinition,
  request,
  view,
  policies,
}: {
  drawDefinition: DrawDefinition;
  request: OutcomeRequest;
  view: OutcomeView;
  policies?: PolicyDefinitions;
}): SwapSeeds {
  const swap = view.targets.swap;
  if (chooseRoute(request, view) !== 'swap' || !swap) return unsupported('no-swap-topology');
  if (view.swapMeetsActivePosition || view.heldSeat) return unsupported('held-swap-seat');
  if (swap.linkedOut && !swap.relabels) return unsupported('unresolved-swap-links');
  const matches = view.inContextDrawMatchUps;
  const source = matches?.find((m) => m.matchUpId === request.matchUpId);
  if (!matches || !source?.structureId || source.structureId !== view.targets.source.structureId)
    return unsupported('unresolved-swap-source');
  const frame = { drawDefinition, inContextDrawMatchUps: matches };
  const previousSide = source.winningSide;
  if ((previousSide !== 1 && previousSide !== 2) || request.winningSide !== 3 - previousSide)
    return unsupported('unresolved-swap-roles');
  const write = planWrite(request, view, 'swap');
  if (!write?.matchUpStatus || write.winningSide !== request.winningSide) return unsupported('unresolved-swap-result');

  const winner = occupant(drawDefinition, source.structureId, swap.positionA);
  const loser = swap.positionB && occupant(drawDefinition, source.structureId, swap.positionB);
  const at = (number: number) => source.sides?.find((s) => s.sideNumber === number);
  if (
    !winner ||
    !loser ||
    winner === loser ||
    at(previousSide)?.drawPosition !== swap.positionA ||
    at(previousSide)?.participantId !== winner ||
    at(3 - previousSide)?.drawPosition !== swap.positionB ||
    at(3 - previousSide)?.participantId !== loser
  )
    return unsupported('unverified-swap-occupants');

  const deps = buildDependencies(frame);
  if (deps.errors.has(source.matchUpId)) return unsupported('unresolved-swap-target');
  const assignmentReaders = relabelReaders(
    drawDefinition,
    source.structureId,
    swap.relabels,
    deps.readers,
    winner,
    loser,
  );
  if (!assignmentReaders) return unsupported('unverified-swap-relabel');

  const projected = { ...source, matchUpStatus: write.matchUpStatus, winningSide: write.winningSide };
  const bindRole = (role: RoleSeed['role']): RoleSeed | string => {
    const previousParticipantId = role === 'winner' ? winner : loser;
    const nextParticipantId = role === 'winner' ? loser : winner;
    const seed: RoleSeed = { role, previousParticipantId, nextParticipantId };
    const edge = deps.outgoing.get(source.matchUpId)?.find((e) => e.role === role);
    if (view.targets[`${role}MatchUpId`] !== edge?.receiver) return 'unverified-swap-role-target';
    if (edge) {
      const target = matches.find((m) => m.matchUpId === edge.receiver);
      if (!target) return 'unresolved-swap-target';
      const old = readGrant(frame, source, target, edge, request.flags, policies);
      const next = readGrant(frame, projected, target, edge, request.flags, policies);
      if (old.participant !== previousParticipantId || next.participant !== nextParticipantId)
        return 'unverified-swap-grant';
      const held =
        source.structureId === target.structureId
          ? !!old.sourcePosition &&
            target.drawPositions?.includes(old.sourcePosition) &&
            swap.pathMatchUpIds.includes(target.matchUpId)
          : assignmentReaders.some(
              (a) =>
                a.structureId === target.structureId &&
                a.drawPosition === edge.position &&
                a.before === old.participant &&
                a.after === next.participant &&
                a.matchUpIds.includes(target.matchUpId),
            );
      if (!held) return 'unverified-swap-grant-seat';
      seed.receiver = { matchUpId: target.matchUpId, lost: old.participant, acquired: next.participant };
    }
    return seed;
  };
  const roles: RoleSeed[] = [];
  for (const role of ['winner', 'loser'] as const) {
    const seed = bindRole(role);
    if (typeof seed === 'string') return unsupported(seed);
    roles.push(seed);
  }
  return { ops: swapOps(view, 'swap'), roles, assignmentReaders, reasons: [] };
}
