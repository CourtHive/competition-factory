import { pairingHash } from '../drawMatic/generateCandidate';
import { getEncounters } from '../drawMatic/getEncounters';
import { computeScoreGroups } from './computeScoreGroups';

// Types
import type { ScoreGroup, SwissParticipantRecord } from '@Types/swissTypes';
import type { MatchUp } from '@Types/tournamentTypes';

type SwissPairingArgs = {
  adHocRatings?: { [key: string]: number };
  participantIds: string[];
  matchUps: MatchUp[];
  allowDraws?: boolean;
};

type SwissPairingResult = {
  participantIdPairings: { participantIds: [string, string] }[];
  scoreGroups: ScoreGroup[];
  records: Map<string, SwissParticipantRecord>;
  byeParticipantId?: string;
};

export function generateSwissPairings({
  participantIds,
  adHocRatings,
  allowDraws,
  matchUps,
}: SwissPairingArgs): SwissPairingResult {
  const completedMatchUps = matchUps.filter((m) => m.winningSide);
  const { scoreGroups, records } = computeScoreGroups({
    matchUps: completedMatchUps,
    participantIds,
    allowDraws,
  });

  const { encounters } = getEncounters({ matchUps: [...matchUps] });
  const encounterSet = new Set<string>(encounters);

  const isFirstRound = completedMatchUps.length === 0;
  let byeParticipantId: string | undefined;

  // handle odd participant count — give bye to lowest-ranked in lowest score group
  const activePids = [...participantIds];
  if (activePids.length % 2 !== 0) {
    byeParticipantId = selectByeParticipant({ scoreGroups, records, adHocRatings });
    const idx = activePids.indexOf(byeParticipantId);
    if (idx >= 0) activePids.splice(idx, 1);

    // remove from score groups
    for (const group of scoreGroups) {
      const gi = group.participantIds.indexOf(byeParticipantId);
      if (gi >= 0) {
        group.participantIds.splice(gi, 1);
        break;
      }
    }
  }

  const pairings: { participantIds: [string, string] }[] = [];
  const paired = new Set<string>();

  if (isFirstRound) {
    // round 1: pair by seed/rating — top half vs bottom half
    const sorted = sortByRating(activePids, adHocRatings);
    const half = Math.floor(sorted.length / 2);
    for (let i = 0; i < half; i++) {
      pairings.push({ participantIds: [sorted[i], sorted[half + i]] });
      paired.add(sorted[i]);
      paired.add(sorted[half + i]);
    }
  } else {
    // subsequent rounds: pair within score groups, float overflow to adjacent
    const groupPids: string[][] = scoreGroups.map((g) => [...g.participantIds]);

    for (let gi = 0; gi < groupPids.length; gi++) {
      const group = groupPids[gi].filter((pid) => !paired.has(pid));

      // if odd group size, float last participant to next group
      if (group.length % 2 !== 0 && gi < groupPids.length - 1) {
        const floater = selectFloater({ group, adHocRatings });
        const fi = group.indexOf(floater);
        group.splice(fi, 1);
        groupPids[gi + 1].push(floater);
      }

      const groupPairings = pairWithinGroup({
        participantIds: group,
        encounterSet,
        adHocRatings,
      });

      for (const pairing of groupPairings) {
        pairings.push(pairing);
        paired.add(pairing.participantIds[0]);
        paired.add(pairing.participantIds[1]);
      }
    }

    // catch any unpaired participants (shouldn't happen with correct floating)
    const unpaired = activePids.filter((pid) => !paired.has(pid));
    for (let i = 0; i < unpaired.length - 1; i += 2) {
      pairings.push({ participantIds: [unpaired[i], unpaired[i + 1]] });
    }
  }

  return { participantIdPairings: pairings, scoreGroups, records, byeParticipantId };
}

function sortByRating(participantIds: string[], adHocRatings?: { [key: string]: number }): string[] {
  return [...participantIds].sort((a, b) => {
    const ra = adHocRatings?.[a] ?? 0;
    const rb = adHocRatings?.[b] ?? 0;
    return rb - ra;
  });
}

function selectByeParticipant({
  scoreGroups,
  records,
  adHocRatings,
}: {
  scoreGroups: ScoreGroup[];
  records: Map<string, SwissParticipantRecord>;
  adHocRatings?: { [key: string]: number };
}): string {
  // select from the lowest score group, the participant with fewest points (then lowest rating)
  const lowestGroup = scoreGroups.at(-1);
  if (!lowestGroup) return '';
  const sorted = [...lowestGroup.participantIds].sort((a, b) => {
    const ra = records.get(a);
    const rb = records.get(b);
    const pointsDiff = (ra?.points ?? 0) - (rb?.points ?? 0);
    if (pointsDiff !== 0) return pointsDiff;
    return (adHocRatings?.[a] ?? 0) - (adHocRatings?.[b] ?? 0);
  });
  return sorted[0];
}

function selectFloater({ group, adHocRatings }: { group: string[]; adHocRatings?: { [key: string]: number } }): string {
  // float the lowest-rated participant in the group down
  const sorted = [...group].sort((a, b) => {
    const ra = adHocRatings?.[a] ?? 0;
    const rb = adHocRatings?.[b] ?? 0;
    return ra - rb;
  });
  return sorted[0];
}

function pairWithinGroup({
  participantIds,
  encounterSet,
  adHocRatings,
}: {
  participantIds: string[];
  encounterSet: Set<string>;
  adHocRatings?: { [key: string]: number };
}): { participantIds: [string, string] }[] {
  if (participantIds.length < 2) return [];

  // sort by rating descending and pair top half vs bottom half (FIDE-style)
  const sorted = sortByRating(participantIds, adHocRatings);
  const half = Math.floor(sorted.length / 2);
  const topHalf = sorted.slice(0, half);
  const bottomHalf = sorted.slice(half);

  const pairings: { participantIds: [string, string] }[] = [];
  const usedBottom = new Set<number>();

  for (const topPid of topHalf) {
    let bestIdx = -1;
    let bestRatingDiff = Infinity;

    for (let j = 0; j < bottomHalf.length; j++) {
      if (usedBottom.has(j)) continue;
      const bottomPid = bottomHalf[j];
      const hash = pairingHash(topPid, bottomPid);

      // prefer opponents not yet encountered
      if (encounterSet.has(hash)) continue;

      const diff = Math.abs((adHocRatings?.[topPid] ?? 0) - (adHocRatings?.[bottomPid] ?? 0));
      if (diff < bestRatingDiff) {
        bestRatingDiff = diff;
        bestIdx = j;
      }
    }

    // if all bottom-half options are repeats, take closest available
    if (bestIdx === -1) {
      for (let j = 0; j < bottomHalf.length; j++) {
        if (!usedBottom.has(j)) {
          bestIdx = j;
          break;
        }
      }
    }

    if (bestIdx >= 0) {
      usedBottom.add(bestIdx);
      pairings.push({ participantIds: [topPid, bottomHalf[bestIdx]] });
    }
  }

  return pairings;
}
