import { getLadderPolicy, getLadderOrdering } from '@Query/ladder/getLadderPolicy';
import { participantScaleItem } from '@Query/participant/participantScaleItem';
import { resolveLadderStructure } from '@Query/ladder/resolveLadderContext';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { isObject } from '@Tools/objects';

import { DYNAMIC, RATING as RATING_SCALE } from '@Constants/scaleConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RANK, RATING } from '@Constants/ladderConstants';

type StandingArgs = {
  tournamentRecord?: any;
  drawDefinition: any;
  /** Optional: resolved from `drawDefinition` when absent, so an engine caller can pass `drawId`. */
  structure?: any;
  structureId?: string;
  event?: any;
};

export type LadderStanding = { position: number; participantId: string; ratingValue?: number }[];

function readScale({ participant, scaleName, scaleAccessor, eventType }: any) {
  const result =
    participant &&
    participantScaleItem({
      scaleAttributes: { eventType: eventType ?? SINGLES_EVENT, scaleType: RATING_SCALE, scaleName },
      participant,
    });
  const scaleValue = result?.scaleItem?.scaleValue;
  return scaleAccessor && isObject(scaleValue) ? scaleValue[scaleAccessor] : scaleValue;
}

/**
 * The ladder standing, ordered by whichever mechanism the policy declares.
 *
 * Under `RANK` this is `positionAssignments` as stored — the movement rules maintain it.
 *
 * Under `RATING` it is DERIVED from each participant's rating, and `positionAssignments` is a
 * projection of this rather than the source of truth. Nothing is mutated by asking.
 *
 * DIRECTION IS READ, NEVER ASSUMED. `ratingsParameters[ratingType].ascending` decides: WTN, BWF and
 * USAR are lower-is-better; UTR, ELO, DUPR, PSA and the squash ratings are higher-is-better.
 * Hardcoding "higher wins" would silently invert a WTN ladder — every position wrong, no error.
 *
 * With `dynamicRating`, a factory-maintained `<ratingType>.DYNAMIC` value is preferred and the
 * published rating is the STARTING position — the pattern DrawMatic already uses, so a club can run
 * a rating-ordered ladder without every member holding a current published rating.
 */
export function getLadderStanding(params: StandingArgs): LadderStanding {
  const { tournamentRecord } = params;
  const structure = resolveLadderStructure(params);
  const assignments = (structure?.positionAssignments ?? []).filter((a: any) => a.participantId);

  if (getLadderOrdering(params) !== RATING) {
    return assignments
      .slice()
      .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
      .map((a: any) => ({ position: a.drawPosition, participantId: a.participantId }));
  }

  const policy = getLadderPolicy(params);
  const ratingType = policy.ratingType;
  const parameters = ratingType ? ratingsParameters[ratingType] : undefined;
  // An unknown rating type cannot be ordered. Falling back to stored positions would present a
  // misconfiguration as a working ladder, so the stored order is returned unchanged and the caller
  // sees no ratingValue — the tell that nothing was derived.
  if (!ratingType || !parameters) {
    return assignments
      .slice()
      .sort((a: any, b: any) => a.drawPosition - b.drawPosition)
      .map((a: any) => ({ position: a.drawPosition, participantId: a.participantId }));
  }

  const participants = tournamentRecord?.participants ?? [];
  const rated = assignments.map((assignment: any) => {
    const participant = participants.find((p: any) => p.participantId === assignment.participantId);
    const scaleAccessor = parameters.accessor;
    const dynamicValue = policy.dynamicRating
      ? readScale({
          participant,
          scaleName: `${ratingType}.${DYNAMIC}`,
          scaleAccessor,
          eventType: params.event?.eventType,
        })
      : undefined;
    const ratingValue =
      dynamicValue ??
      readScale({ participant, scaleName: ratingType, scaleAccessor, eventType: params.event?.eventType });
    return { participantId: assignment.participantId, ratingValue, storedPosition: assignment.drawPosition };
  });

  const ascending = !!parameters.ascending;
  rated.sort((a: any, b: any) => {
    const aHas = typeof a.ratingValue === 'number';
    const bHas = typeof b.ratingValue === 'number';
    // An unrated participant sorts last rather than to the top: absent is not "best".
    if (!aHas && !bHas) return a.storedPosition - b.storedPosition;
    if (!aHas) return 1;
    if (!bHas) return -1;
    if (a.ratingValue === b.ratingValue) return a.storedPosition - b.storedPosition;
    return ascending ? a.ratingValue - b.ratingValue : b.ratingValue - a.ratingValue;
  });

  return rated.map((entry: any, index: number) => ({
    position: index + 1,
    participantId: entry.participantId,
    ratingValue: entry.ratingValue,
  }));
}

/** The ordering in force, re-exported so callers need not import two modules to ask one question. */
export { RANK, RATING };
