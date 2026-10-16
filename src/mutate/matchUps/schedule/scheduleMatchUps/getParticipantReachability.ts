import { getIndividualParticipantIds } from '@Query/matchUp/getIndividualParticipantIds';

// constants and types
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

export type MatchUpReachability = {
  // individual participantIds already placed in the matchUp's sides: they will play it
  certain: string[];
  // individual participantIds who could still reach the matchUp but are not yet placed in it, however many rounds away
  potential: string[];
  // the potentials one undecided matchUp away: placed in a matchUp that feeds this one directly
  nearPotential: string[];
};

export type ParticipantReachability = {
  matchUps: { [matchUpId: string]: MatchUpReachability };
  // every matchUp whose result can decide a participant of the keyed matchUp
  upstream: { [matchUpId: string]: Set<string> };
  // the matchUps the keyed matchUp feeds through a link rather than a winner/loser edge (a qualifying round's
  // qualifier positions, a round robin group's playoff): they cannot start before it has ended
  linkedTargets: { [matchUpId: string]: string[] };
};

type GetParticipantReachabilityArgs = {
  matchUpDependencies?: { [matchUpId: string]: { matchUpIds?: string[] } };
  matchUps: HydratedMatchUp[];
};

/**
 * Who can play each matchUp, derived from the draw rather than from the schedule.
 *
 * A participant is CERTAIN for a matchUp when its sides hold them. Every other participant who can still reach it is
 * POTENTIAL, however many rounds away and whatever date the matchUps between are scheduled on. A matchUp that is
 * complete, or is a BYE, has already sent its participants on, so nobody reaches a target through it as a potential;
 * an undecided matchUp sends every participant who could play it to both its winner and its loser target.
 *
 * Links that are not winner/loser edges are read from matchUpDependencies (`matchUpIds`): a round robin group feeding a
 * playoff, a qualifying round feeding qualifier positions (see arriveFromLinkedSources). The dependencies' own
 * `participantIds` are not read: they include participants already eliminated upstream.
 *
 * Daily limits read every potential (a participant can play a whole chain of rounds in a day). Recovery bookings read
 * only the NEAR potentials, those placed in a matchUp that feeds this one directly: booking every participant who could
 * ever reach a late round would hold every player in a draw against that round's time in every other draw.
 */
export function getParticipantReachability({
  matchUpDependencies,
  matchUps,
}: GetParticipantReachabilityArgs): ParticipantReachability {
  const matchUpsById = new Map(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const edgeSources = new Map<string, string[]>();
  const targets = new Map<string, string[]>();
  const sources = new Map<string, string[]>();
  const addEdge = (sourceId: string, targetId: string) => {
    if (!targets.has(sourceId)) targets.set(sourceId, []);
    if (!sources.has(targetId)) sources.set(targetId, []);
    targets.get(sourceId)?.push(targetId);
    sources.get(targetId)?.push(sourceId);
  };

  for (const matchUp of matchUps) {
    for (const targetId of getTargetMatchUpIds(matchUp).filter((id) => matchUpsById.has(id))) {
      addEdge(matchUp.matchUpId, targetId);
      if (!edgeSources.has(targetId)) edgeSources.set(targetId, []);
      edgeSources.get(targetId)?.push(matchUp.matchUpId);
    }
  }

  // matchUps that feed another through a link rather than a winner/loser edge: a round robin group feeding a playoff,
  // a qualifying round feeding qualifier positions
  const linkedSources = getLinkedSources({ matchUps, matchUpsById, matchUpDependencies, edgeSources });
  const linkedTargets: ParticipantReachability['linkedTargets'] = {};
  for (const [targetId, linkedIds] of linkedSources) {
    for (const sourceId of linkedIds) {
      addEdge(sourceId, targetId);
      (linkedTargets[sourceId] ??= []).push(targetId);
    }
  }

  const certainByStructure = new Map<string, Set<string>>();
  for (const matchUp of matchUps) {
    const structureCertain = certainByStructure.get(matchUp.structureId) ?? new Set<string>();
    getIndividualParticipantIds(matchUp).enteredIndividualParticipantIds.forEach(
      (id) => id && structureCertain.add(id),
    );
    certainByStructure.set(matchUp.structureId, structureCertain);
  }

  const nearArriving = new Map<string, Set<string>>();
  const reachable = new Map<string, Set<string>>();
  const upstream: ParticipantReachability['upstream'] = {};
  const reachability: ParticipantReachability['matchUps'] = {};
  const arrive = (matchUpId: string, participantIds: string[], isNear: boolean) => {
    if (!reachable.has(matchUpId)) reachable.set(matchUpId, new Set<string>());
    if (!nearArriving.has(matchUpId)) nearArriving.set(matchUpId, new Set<string>());
    participantIds.filter(Boolean).forEach((participantId) => {
      reachable.get(matchUpId)?.add(participantId);
      if (isNear) nearArriving.get(matchUpId)?.add(participantId);
    });
  };

  for (const matchUpId of topologicalOrder({ matchUps, targets, sources })) {
    const matchUp = matchUpsById.get(matchUpId) as HydratedMatchUp;
    const { enteredIndividualParticipantIds, potentialIndividualParticipantIds } = getIndividualParticipantIds(matchUp);
    const certain = enteredIndividualParticipantIds.filter(Boolean);

    // hydrated potentials are one matchUp away
    arrive(matchUpId, potentialIndividualParticipantIds, true);
    arriveFromLinkedSources({
      placedInStructure: certainByStructure.get(matchUp.structureId) ?? new Set<string>(),
      linkedSourceIds: linkedSources.get(matchUpId) ?? [],
      reachability,
      matchUpsById,
      matchUpId,
      arrive,
    });

    const notCertain = (participantId: string) => !certain.includes(participantId);
    const potential = [...(reachable.get(matchUpId) ?? [])].filter(notCertain);
    const nearPotential = [...(nearArriving.get(matchUpId) ?? [])].filter(notCertain);
    reachability[matchUpId] = { certain, potential, nearPotential };

    const matchUpUpstream = new Set<string>(matchUpDependencies?.[matchUpId]?.matchUpIds ?? []);
    for (const sourceId of sources.get(matchUpId) ?? []) {
      matchUpUpstream.add(sourceId);
      upstream[sourceId]?.forEach((id) => matchUpUpstream.add(id));
    }
    upstream[matchUpId] = matchUpUpstream;

    if (isDecided(matchUp)) continue;

    for (const targetId of edgeTargets(matchUpId, targets, linkedSources)) {
      arrive(targetId, certain, true);
      arrive(targetId, potential, false);
    }
  }

  return { matchUps: reachability, upstream, linkedTargets };
}

function edgeTargets(matchUpId: string, targets: Map<string, string[]>, linkedSources: Map<string, string[]>) {
  return (targets.get(matchUpId) ?? []).filter((targetId) => !linkedSources.get(targetId)?.includes(matchUpId));
}

/**
 * The direct linked sources of each matchUp: matchUps it depends on (matchUpDependencies) that no winner/loser edge
 * reaches, less those that only feed it through another linked source.
 */
type GetLinkedSourcesArgs = {
  matchUpDependencies: GetParticipantReachabilityArgs['matchUpDependencies'];
  matchUpsById: Map<string, HydratedMatchUp>;
  edgeSources: Map<string, string[]>;
  matchUps: HydratedMatchUp[];
};

function getLinkedSources({ matchUps, matchUpsById, matchUpDependencies, edgeSources }: GetLinkedSourcesArgs) {
  const linkedSources = new Map<string, string[]>();
  if (!matchUpDependencies) return linkedSources;
  const dependencyIds = (id: string): string[] => matchUpDependencies[id]?.matchUpIds ?? [];

  for (const { matchUpId } of matchUps) {
    const edgeReached = new Set<string>();
    for (const sourceId of edgeSources.get(matchUpId) ?? []) {
      edgeReached.add(sourceId);
      dependencyIds(sourceId).forEach((id) => edgeReached.add(id));
    }
    const remaining = [...new Set(dependencyIds(matchUpId))].filter(
      (id) => !edgeReached.has(id) && matchUpsById.has(id),
    );
    const fedThroughOthers = new Set(remaining.flatMap((id) => dependencyIds(id)));
    const direct = remaining.filter((id) => !fedThroughOthers.has(id));
    if (direct.length) linkedSources.set(matchUpId, direct);
  }
  return linkedSources;
}

/**
 * A round robin group sends every member who is not yet placed in the target structure while any of its matchUps is
 * undecided; once the group is decided its finishers have been placed. A qualifying matchUp sends everyone who can play
 * it while undecided, and its winner (until placed) once decided.
 */
type ArriveFromLinkedSourcesArgs = {
  arrive: (matchUpId: string, participantIds: string[], isNear: boolean) => void;
  reachability: ParticipantReachability['matchUps'];
  matchUpsById: Map<string, HydratedMatchUp>;
  placedInStructure: Set<string>;
  linkedSourceIds: string[];
  matchUpId: string;
};

function arriveFromLinkedSources({
  linkedSourceIds,
  placedInStructure,
  reachability,
  matchUpsById,
  matchUpId,
  arrive,
}: ArriveFromLinkedSourcesArgs) {
  const notPlaced = (participantId: string) => !placedInStructure.has(participantId);
  const linkedMatchUps = linkedSourceIds
    .map((id) => matchUpsById.get(id))
    .filter((linked): linked is HydratedMatchUp => !!linked);
  const roundRobin = linkedMatchUps.filter(isRoundRobinMatchUp);
  if (roundRobin.some((sourceMatchUp) => !isDecided(sourceMatchUp))) {
    for (const sourceMatchUp of roundRobin) {
      arrive(matchUpId, (reachability[sourceMatchUp.matchUpId]?.certain ?? []).filter(notPlaced), true);
    }
  }
  for (const sourceMatchUp of linkedMatchUps.filter((linked) => !isRoundRobinMatchUp(linked))) {
    const sourceReach = reachability[sourceMatchUp.matchUpId];
    if (isDecided(sourceMatchUp)) {
      arrive(matchUpId, getWinnerIndividualParticipantIds(sourceMatchUp).filter(notPlaced), true);
    } else {
      arrive(matchUpId, (sourceReach?.certain ?? []).filter(notPlaced), true);
      arrive(matchUpId, (sourceReach?.potential ?? []).filter(notPlaced), false);
    }
  }
}

function isRoundRobinMatchUp(matchUp: HydratedMatchUp) {
  return !!matchUp.containerStructureId || !matchUp.roundPosition;
}

function getWinnerIndividualParticipantIds(matchUp: HydratedMatchUp): string[] {
  const side = matchUp.sides?.find(({ sideNumber }) => sideNumber === matchUp.winningSide);
  if (!side) return [];
  return getIndividualParticipantIds({ ...matchUp, sides: [side] }).enteredIndividualParticipantIds.filter(Boolean);
}

/**
 * The participants a matchUp involves: `all` is certain followed by every potential (for daily limits); `near` is
 * certain followed by the near potentials (for recovery bookings).
 */
export function getReachableParticipantIds(reachability: ParticipantReachability, matchUpId: string) {
  const { certain = [], potential = [], nearPotential = [] } = reachability.matchUps[matchUpId] ?? {};
  return { certain, potential, all: [...certain, ...potential], near: [...certain, ...nearPotential] };
}

function isDecided(matchUp: HydratedMatchUp) {
  const { matchUpStatus, winningSide } = matchUp;
  return (
    !!winningSide || matchUpStatus === BYE || (!!matchUpStatus && completedMatchUpStatuses.includes(matchUpStatus))
  );
}

// a round robin's `sidesTo` names each side's NEXT matchUp in the group, where that side is already placed: it carries
// nobody new and is not an edge here
function getTargetMatchUpIds(matchUp: HydratedMatchUp): string[] {
  const winnerMatchUpId = matchUp.winnerTo?.matchUpId ?? matchUp.winnerMatchUpId;
  const loserMatchUpId = matchUp.loserTo?.matchUpId ?? matchUp.loserMatchUpId;
  return [winnerMatchUpId, loserMatchUpId].filter(
    (matchUpId, index, matchUpIds): matchUpId is string => !!matchUpId && matchUpIds.indexOf(matchUpId) === index,
  );
}

// Kahn's algorithm over winner/loser edges; a matchUp caught in a cycle (malformed links) is appended last
function topologicalOrder({ matchUps, targets, sources }) {
  const inDegree = new Map<string, number>(
    matchUps.map((matchUp) => [matchUp.matchUpId, (sources.get(matchUp.matchUpId) ?? []).length]),
  );
  const queue = matchUps.map(({ matchUpId }) => matchUpId).filter((matchUpId) => !inDegree.get(matchUpId));
  const ordered: string[] = [];

  while (queue.length) {
    const matchUpId = queue.shift() as string;
    ordered.push(matchUpId);
    for (const targetId of targets.get(matchUpId) ?? []) {
      const remaining = (inDegree.get(targetId) ?? 0) - 1;
      inDegree.set(targetId, remaining);
      if (remaining === 0) queue.push(targetId);
    }
  }

  const placed = new Set(ordered);
  return ordered.concat(matchUps.map(({ matchUpId }) => matchUpId).filter((matchUpId) => !placed.has(matchUpId)));
}
