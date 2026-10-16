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
};

type GetParticipantReachabilityArgs = {
  matchUpDependencies?: { [matchUpId: string]: { matchUpIds?: string[]; participantIds?: string[] } };
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
 * Daily limits read every potential (a participant can play a whole chain of rounds in a day). Recovery bookings read
 * only the NEAR potentials, those placed in a matchUp that feeds this one directly: booking every participant who could
 * ever reach a late round would hold every player in a draw against that round's time in every other draw.
 */
export function getParticipantReachability({
  matchUpDependencies,
  matchUps,
}: GetParticipantReachabilityArgs): ParticipantReachability {
  const matchUpsById = new Map(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const targets = new Map<string, string[]>();
  const sources = new Map<string, string[]>();

  for (const matchUp of matchUps) {
    const matchUpTargets = getTargetMatchUpIds(matchUp).filter((targetId) => matchUpsById.has(targetId));
    targets.set(matchUp.matchUpId, matchUpTargets);
    for (const targetId of matchUpTargets) {
      if (!sources.has(targetId)) sources.set(targetId, []);
      sources.get(targetId)?.push(matchUp.matchUpId);
    }
  }

  const nearArriving = new Map<string, Set<string>>();
  const reachable = new Map<string, Set<string>>();
  const upstream: ParticipantReachability['upstream'] = {};
  const reachability: ParticipantReachability['matchUps'] = {};

  for (const matchUpId of topologicalOrder({ matchUps, targets, sources })) {
    const matchUp = matchUpsById.get(matchUpId) as HydratedMatchUp;
    const { enteredIndividualParticipantIds, potentialIndividualParticipantIds } = getIndividualParticipantIds(matchUp);
    const certain = enteredIndividualParticipantIds.filter(Boolean);

    const arriving = reachable.get(matchUpId) ?? new Set<string>();
    const near = nearArriving.get(matchUpId) ?? new Set<string>();
    // hydrated potentials and dependency participants are one matchUp away, and cover links that are not winner/loser
    // edges (e.g. playoffs)
    const oneAway = [...potentialIndividualParticipantIds, ...(matchUpDependencies?.[matchUpId]?.participantIds ?? [])];
    oneAway.filter(Boolean).forEach((participantId) => {
      arriving.add(participantId);
      near.add(participantId);
    });

    const notCertain = (participantId: string) => !certain.includes(participantId);
    const potential = [...arriving].filter(notCertain);
    reachability[matchUpId] = { certain, potential, nearPotential: [...near].filter(notCertain) };

    const matchUpUpstream = new Set<string>(matchUpDependencies?.[matchUpId]?.matchUpIds ?? []);
    for (const sourceId of sources.get(matchUpId) ?? []) {
      matchUpUpstream.add(sourceId);
      upstream[sourceId]?.forEach((id) => matchUpUpstream.add(id));
    }
    upstream[matchUpId] = matchUpUpstream;

    if (isDecided(matchUp)) continue;

    for (const targetId of targets.get(matchUpId) ?? []) {
      if (!reachable.has(targetId)) reachable.set(targetId, new Set<string>());
      if (!nearArriving.has(targetId)) nearArriving.set(targetId, new Set<string>());
      const targetReachable = reachable.get(targetId) as Set<string>;
      const targetNear = nearArriving.get(targetId) as Set<string>;
      certain.forEach((participantId) => {
        targetReachable.add(participantId);
        targetNear.add(participantId);
      });
      potential.forEach((participantId) => targetReachable.add(participantId));
    }
  }

  return { matchUps: reachability, upstream };
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
