import type { DayMatchUp, IndividualParticipantProfiles } from './checkParticipantProfileInitialization';
import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';
import { checkParticipantProfileInitialization } from './checkParticipantProfileInitialization';

// constants
import { TOTAL } from '@Constants/scheduleConstants';

/**
 * The most matchUps a participant can actually play on the day being scheduled.
 *
 * Every matchUp the participant is CERTAIN for counts. Of the matchUps they are only POTENTIAL for, they can play
 * one chain: a run of matchUps each of which can feed the next. Two potential matchUps in the same draw where neither
 * feeds the other are alternatives (a winner path and a loser path), so only the longest chain counts. Draws are
 * independent, so their loads add.
 */
export function getDayLoad({
  reachability,
  dayMatchUps,
  matchUpType,
}: {
  reachability: ParticipantReachability;
  dayMatchUps: DayMatchUp[];
  matchUpType?: string;
}): number {
  const relevant = matchUpType
    ? dayMatchUps.filter((dayMatchUp) => dayMatchUp.matchUpType === matchUpType)
    : dayMatchUps;
  const drawIds = [...new Set(relevant.map(({ drawId }) => drawId))];

  return drawIds.reduce((load, drawId) => {
    const drawMatchUps = relevant.filter((dayMatchUp) => dayMatchUp.drawId === drawId);
    const certainCount = drawMatchUps.filter(({ certain }) => certain).length;
    const potentialIds = drawMatchUps.filter(({ certain }) => !certain).map(({ matchUpId }) => matchUpId);
    return load + certainCount + longestChain(potentialIds, reachability.upstream);
  }, 0);
}

/** the participant's load by matchUpType and in total, with an optional matchUp added */
export function getParticipantDayLoads({
  individualParticipantProfiles,
  reachability,
  participantId,
  addingMatchUp,
}: {
  individualParticipantProfiles: IndividualParticipantProfiles;
  reachability: ParticipantReachability;
  participantId: string;
  addingMatchUp?: DayMatchUp;
}) {
  checkParticipantProfileInitialization({ individualParticipantProfiles, participantId });
  const profile = individualParticipantProfiles[participantId];
  const dayMatchUps: DayMatchUp[] = addingMatchUp
    ? [...profile.dayMatchUps.filter(({ matchUpId }) => matchUpId !== addingMatchUp.matchUpId), addingMatchUp]
    : profile.dayMatchUps;

  const matchUpTypes = [...new Set(dayMatchUps.map(({ matchUpType }) => matchUpType).filter(Boolean))] as string[];
  const loads: { [key: string]: number } = { [TOTAL]: getDayLoad({ reachability, dayMatchUps }) };
  for (const matchUpType of matchUpTypes) {
    loads[matchUpType] = getDayLoad({ reachability, dayMatchUps, matchUpType });
  }
  return loads;
}

/**
 * Adds (value 1) or removes (value -1) a matchUp from the day of every participant who can play it, and refreshes
 * each participant's `counters` (their day load by matchUpType and TOTAL), which over-limit details report.
 */
export function modifyParticipantDayMatchUps({
  individualParticipantProfiles,
  reachability,
  matchUp,
  value,
}: {
  individualParticipantProfiles: IndividualParticipantProfiles;
  reachability: ParticipantReachability;
  matchUp: { matchUpId: string; drawId: string; matchUpType?: string };
  value: 1 | -1;
}) {
  const { matchUpId, drawId, matchUpType } = matchUp;
  const { certain, all } = getReachableParticipantIds(reachability, matchUpId);

  for (const participantId of all) {
    checkParticipantProfileInitialization({ individualParticipantProfiles, participantId });
    const profile = individualParticipantProfiles[participantId];
    profile.dayMatchUps = profile.dayMatchUps.filter((dayMatchUp) => dayMatchUp.matchUpId !== matchUpId);
    if (value > 0) {
      profile.dayMatchUps.push({ matchUpId, drawId, matchUpType, certain: certain.includes(participantId) });
    }
    profile.counters = getParticipantDayLoads({ individualParticipantProfiles, reachability, participantId });
  }
}

function longestChain(matchUpIds: string[], upstream: ParticipantReachability['upstream']): number {
  if (!matchUpIds.length) return 0;
  // a matchUp has strictly more upstream matchUps than any matchUp upstream of it, so this order is topological
  const ordered = [...matchUpIds].sort((a, b) => (upstream[a]?.size ?? 0) - (upstream[b]?.size ?? 0));
  const chainLengths: number[] = [];
  ordered.forEach((matchUpId, index) => {
    let longest = 0;
    for (let prior = 0; prior < index; prior++) {
      if (upstream[matchUpId]?.has(ordered[prior])) longest = Math.max(longest, chainLengths[prior]);
    }
    chainLengths[index] = longest + 1;
  });
  return Math.max(...chainLengths);
}
