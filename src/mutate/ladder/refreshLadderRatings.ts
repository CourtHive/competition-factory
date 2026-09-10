import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { getLadderOrdering, getLadderPolicy } from '@Query/ladder/getLadderPolicy';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { isLadder } from '@Query/drawDefinition/isLadder';

import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { RATING as RATING_ORDERING } from '@Constants/ladderConstants';
import { RATING as RATING_SCALE } from '@Constants/scaleConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type RefreshArgs = {
  /** `{ participantId: ratingValue }` — supplied by the caller, not fetched here. */
  ratings: Record<string, number>;
  /** The instant these values were true, which becomes their `scaleDate`. */
  refreshedAt: string;
  tournamentRecord: any;
  drawDefinition: any;
  structure?: any;
  event?: any;
};

/**
 * Writes externally-sourced ratings for the participants on a ladder.
 *
 * THE FACTORY DOES NOT FETCH RATINGS. UTR, WTN and DUPR are other people's systems with their own
 * credentials and terms; retrieving values is an operator's job and belongs in an ingest adapter,
 * not in a competition engine. This takes the values it is handed and records them.
 *
 * On an externally-rated ladder the standing holds still between refreshes. Play is NOT blocked
 * meanwhile — a participant awaiting a refresh may challenge and be challenged as normal; only
 * their POSITION is unaffected until new values land, at which point the whole standing re-derives.
 *
 * Participants absent from `ratings` are left exactly as they were rather than cleared: a partial
 * refresh is the normal case, because a provider will not have a value for everyone.
 */
export function refreshLadderRatings(params: RefreshArgs): ResultType & { updated?: number; skipped?: string[] } {
  const { ratings, refreshedAt, tournamentRecord, drawDefinition } = params;

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) return { error: INVALID_VALUES, info: 'requires a LADDER drawType' };
  if (!refreshedAt) return { error: INVALID_VALUES, info: 'refreshedAt is required' };
  if (!ratings || typeof ratings !== 'object') return { error: INVALID_VALUES, info: 'ratings map is required' };

  const structure = params.structure ?? drawDefinition.structures?.[0];
  if (getLadderOrdering({ ...params, structure }) !== RATING_ORDERING) {
    return { error: INVALID_VALUES, info: 'refreshLadderRatings applies only to a RATING-ordered ladder' };
  }

  const policy = getLadderPolicy({ ...params, structure });
  const ratingType = policy.ratingType;
  if (!ratingType || !ratingsParameters[ratingType]) {
    return { error: INVALID_VALUES, info: `policy.ratingType is missing or unknown: ${ratingType}` };
  }

  const seated = new Set((structure?.positionAssignments ?? []).map((a: any) => a.participantId).filter(Boolean));

  let updated = 0;
  const skipped: string[] = [];
  for (const [participantId, scaleValue] of Object.entries(ratings)) {
    // Only participants on THIS ladder. A rating for someone else is a caller error worth naming,
    // not something to write quietly into the tournament record.
    if (!seated.has(participantId)) {
      skipped.push(participantId);
      continue;
    }
    if (typeof scaleValue !== 'number') {
      skipped.push(participantId);
      continue;
    }
    const result = setParticipantScaleItem({
      scaleItem: {
        eventType: params.event?.eventType ?? SINGLES_EVENT,
        scaleType: RATING_SCALE,
        scaleName: ratingType,
        scaleDate: refreshedAt,
        scaleValue,
      },
      participantId,
      tournamentRecord,
    });
    if (result.error) return result;
    updated += 1;
  }

  return { ...SUCCESS, updated, ...(skipped.length ? { skipped } : {}) };
}
