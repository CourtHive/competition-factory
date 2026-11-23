import { feederSendsNobody, seatShowsBye } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { producedExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { buildTargetIndex } from '@Query/matchUp/targetIndex';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';
import { isDoubleExit, isExit } from '@Validators/isExit';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { BYE, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';

import type { DrawDefinition, DrawLink, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import type { PolicyDefinitions } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeFlags } from '../types';

export type Edge = {
  source: string;
  receiver: string;
  role: 'winner' | 'loser';
  position?: number;
  link?: DrawLink;
  shared: boolean;
};
export type Grant = {
  participant?: string;
  sourcePosition?: number;
  mark?: SideExitProvenanceEntry;
  reserved?: true;
};
export type Frame = { drawDefinition: DrawDefinition; inContextDrawMatchUps: HydratedMatchUp[] };

export const slotKey = (structure: string, position: number) => JSON.stringify([structure, position]);

function add<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

/** Match dependencies and assignment dependencies are different. A changed assignment may change the
 * outgoing result of a match that no changed donor directly targets. Positions are refreshed after each fold. */
export function buildDependencies(frame: Frame) {
  const incoming = new Map<string, Edge[]>();
  const outgoing = new Map<string, Edge[]>();
  const readers = new Map<string, Set<string>>();
  const positions = new Map<string, string[]>();
  const markReaders = new Map<string, Set<string>>();
  const markedSources = new Map<string, string[]>();
  const index = buildTargetIndex(frame.inContextDrawMatchUps);
  const rank = new Map<string, number>();
  const errors = new Map<string, string>();
  function indexReaders(m: HydratedMatchUp) {
    for (const source of markedSources.get(m.matchUpId) ?? []) markReaders.get(source)?.delete(m.matchUpId);
    const sources = Object.values(m.sideExitProvenance ?? {}).flatMap((mark) =>
      mark.sourceMatchUpId ? [mark.sourceMatchUpId] : [],
    );
    markedSources.set(m.matchUpId, sources);
    for (const id of sources) {
      if (!markReaders.has(id)) markReaders.set(id, new Set());
      markReaders.get(id)!.add(m.matchUpId);
    }
    for (const key of positions.get(m.matchUpId) ?? []) readers.get(key)?.delete(m.matchUpId);
    const keys = (m.drawPositions ?? []).filter(Boolean).map((p) => slotKey(m.structureId, p));
    positions.set(m.matchUpId, keys);
    for (const key of keys) {
      if (!readers.has(key)) readers.set(key, new Set());
      readers.get(key)!.add(m.matchUpId);
    }
  }
  for (const [order, m] of frame.inContextDrawMatchUps.entries()) {
    rank.set(m.matchUpId, order);
    indexReaders(m);
    if (m.collectionId) continue;
    const routes = positionTargets({
      ...frame,
      inContextMatchUp: m,
      matchUpId: m.matchUpId,
      targetIndex: index,
      asReferences: true,
    });
    if (!routes.targetMatchUps) {
      errors.set(m.matchUpId, 'unresolved-target');
      continue;
    }
    const targets = routes.targetMatchUps;
    for (const role of ['winner', 'loser'] as const) {
      const target = targets[`${role}MatchUp`];
      if (!target) continue;
      const edge: Edge = {
        source: m.matchUpId,
        receiver: target.matchUpId,
        role,
        link: routes.targetLinks[`${role}TargetLink`],
        position: targets[`${role}TargetDrawPosition`],
        shared: targets.winnerMatchUp?.matchUpId === targets.loserMatchUp?.matchUpId,
      };
      add(outgoing, m.matchUpId, edge);
      add(incoming, target.matchUpId, edge);
    }
  }
  // FIRST_MATCHUP loss eligibility reads earlier scored wins for the positions its feeder holds.
  // Undoing an earlier result changes that receiver's grant even if the later feeder did not move.
  function eligibilityTargets(changed: HydratedMatchUp, oldPositions: (number | undefined)[] = []) {
    const targets = new Set<string>();
    for (const position of [...oldPositions, ...(changed.drawPositions ?? [])]) {
      if (!position) continue;
      for (const id of readers.get(slotKey(changed.structureId, position)) ?? []) {
        const feeder = frame.inContextDrawMatchUps[rank.get(id)!];
        if ((feeder.roundNumber ?? 0) <= (changed.roundNumber ?? 0)) continue;
        for (const edge of outgoing.get(id) ?? [])
          if (edge.role === 'loser' && edge.link?.linkCondition === FIRST_MATCHUP) targets.add(edge.receiver);
      }
    }
    return targets;
  }
  return { incoming, outgoing, readers, indexReaders, eligibilityTargets, markReaders, rank, errors };
}

export type Dependencies = ReturnType<typeof buildDependencies>;

function carriedStatus(status: HydratedMatchUp['matchUpStatus']) {
  return status === RETIRED ? WALKOVER : status;
}

export function readGrant(
  frame: Frame,
  source: HydratedMatchUp,
  receiver: HydratedMatchUp,
  edge: Edge,
  flags: OutcomeFlags,
  policies?: PolicyDefinitions,
): Grant {
  const sides = source.sides ?? [];
  const cross = source.structureId !== receiver.structureId;
  const side = sides.find(
    (s) =>
      source.winningSide && s.sideNumber === (edge.role === 'winner' ? source.winningSide : 3 - source.winningSide),
  );
  const entrant =
    !side &&
    edge.role === 'winner' &&
    source.matchUpStatus === BYE &&
    sides.some((s) => s.bye) &&
    sides.filter((s) => s.participantId).length === 1
      ? sides.find((s) => s.participantId)
      : side;
  const grant: Grant = {};
  if (edge.role === 'loser' && cross && !edge.shared) {
    const reason = feederSendsNobody({ ...frame, feeder: source, loserTargetLink: edge.link });
    if (seatShowsBye({ reason, appliedPolicies: policies, seatMatchUp: receiver })) return { reserved: true };
  }
  const earlier = () =>
    frame.inContextDrawMatchUps.filter(
      (m) => m.structureId === source.structureId && (m.roundNumber ?? 0) < (source.roundNumber ?? 0),
    );
  if (
    entrant?.drawPosition &&
    entrant.participantId &&
    (!edge.link ||
      edge.role === 'winner' ||
      isFedLoserEligible({
        loserTargetLink: edge.link,
        loserDrawPosition: entrant.drawPosition,
        sourceMatchUps: earlier(),
      }))
  ) {
    grant.participant = entrant.participantId;
    grant.sourcePosition = entrant.drawPosition;
  }
  const status = source.matchUpStatus;
  // Lucky advancement selects entrants at the round boundary. Withdrawing a previous winner
  // still removes its position, but a double exit supplies no replacement award on that edge.
  const produced =
    edge.role === 'winner' && !cross && isDoubleExit(status) && !isLuckyBasedDraw(frame.drawDefinition.drawType);
  const carried =
    edge.role === 'loser' &&
    grant.participant &&
    flags.propagateExitStatus &&
    isExit(status) &&
    (status !== RETIRED || flags.propagateRetirementAsExit);
  if (produced || carried)
    grant.mark = {
      sourceMatchUpId: source.matchUpId,
      previousMatchUpStatus: status,
      matchUpStatus: produced ? producedExitStatus(status) : carriedStatus(status),
    };
  return grant;
}
