import { getLadderOrdering, getLadderPolicy } from '@Query/ladder/getLadderPolicy';
import { participantScaleItem } from '@Query/participant/participantScaleItem';
import { mirrorStandingToScale } from '@Mutate/ladder/mirrorStandingToScale';
import ratingsParameters from '@Fixtures/ratings/ratingsParameters';
import { isLadder } from '@Query/drawDefinition/isLadder';
import { isObject } from '@Tools/objects';

import { EXISTING_PARTICIPANT, INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DYNAMIC, RATING as RATING_SCALE } from '@Constants/scaleConstants';
import { BOTTOM, RANK } from '@Constants/ladderConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type AddArgs = {
  /** The instant of joining — the scaleDate of any positions this shifts. */
  addedAt: string;
  participantId: string;
  tournamentRecord?: any;
  drawDefinition: any;
  structureId?: string;
  event?: any;
};

function ratingOf({ participant, ratingType, dynamic, eventType }: any): number | undefined {
  const parameters = ratingsParameters[ratingType];
  const read = (scaleName: string) => {
    const result =
      participant &&
      participantScaleItem({
        scaleAttributes: { eventType: eventType ?? SINGLES_EVENT, scaleType: RATING_SCALE, scaleName },
        participant,
      });
    const scaleValue = result?.scaleItem?.scaleValue;
    return parameters?.accessor && isObject(scaleValue) ? scaleValue[parameters.accessor] : scaleValue;
  };
  return (dynamic ? read(`${ratingType}.${DYNAMIC}`) : undefined) ?? read(ratingType);
}

/**
 * Seats a participant on a ladder.
 *
 * `BOTTOM` is the default and the conservative choice: joining costs nobody anything, and the
 * newcomer earns their way up by challenging.
 *
 * `BY_RATING` seats them where their rating says they belong. Fairer to a strong newcomer, but on a
 * `RANK` ladder it is a real intervention — every position beneath them shifts down, and those
 * positions were earned by challenge. An unrated participant under `BY_RATING` goes to the bottom
 * rather than to the top, because absent is not "best".
 *
 * Under `RATING` ordering placement is moot: the standing derives from ratings, so the participant
 * is appended and `getLadderStanding` sorts them correctly on the next read.
 */
export function addLadderParticipant(params: AddArgs): ResultType & { drawPosition?: number } {
  const { participantId, addedAt, drawDefinition } = params;

  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) return { error: INVALID_VALUES, info: 'requires a LADDER drawType' };
  if (!participantId || !addedAt) return { error: INVALID_VALUES, info: 'participantId and addedAt are required' };

  const structureId = params.structureId ?? drawDefinition.structures?.[0]?.structureId;
  const structure = drawDefinition.structures?.find((s: any) => s.structureId === structureId);
  if (!structure) return { error: INVALID_VALUES, info: 'structure not found' };

  structure.positionAssignments ??= [];
  const assignments = structure.positionAssignments;
  if (assignments.some((a: any) => a.participantId === participantId)) return { error: EXISTING_PARTICIPANT };

  const bottom = assignments.length ? Math.max(...assignments.map((a: any) => a.drawPosition)) + 1 : 1;
  const policy = getLadderPolicy({ ...params, structure });
  const placement = policy.entryPlacement ?? BOTTOM;

  // A RATING-ordered standing is derived, so a position here is only a placeholder.
  if (getLadderOrdering({ ...params, structure }) !== RANK || placement === BOTTOM) {
    assignments.push({ drawPosition: bottom, participantId });
    return { ...SUCCESS, drawPosition: bottom };
  }

  // BY_RATING on a RANK ladder: find the first seat whose occupant this participant outranks.
  const ratingType = policy.ratingType;
  const parameters = ratingType ? ratingsParameters[ratingType] : undefined;
  const participants = params.tournamentRecord?.participants ?? [];
  const find = (id: string) => participants.find((p: any) => p.participantId === id);
  const value = parameters
    ? ratingOf({
        participant: find(participantId),
        ratingType,
        dynamic: policy.dynamicRating,
        eventType: params.event?.eventType,
      })
    : undefined;

  if (!parameters || typeof value !== 'number') {
    // No rating to place by — the bottom, not the top.
    assignments.push({ drawPosition: bottom, participantId });
    return { ...SUCCESS, drawPosition: bottom };
  }

  const ascending = !!parameters.ascending;
  const better = (a: number, b: number) => (ascending ? a < b : a > b);

  const ordered = [...assignments].sort((a: any, b: any) => a.drawPosition - b.drawPosition);
  let target = bottom;
  for (const assignment of ordered) {
    const occupantValue = ratingOf({
      participant: find(assignment.participantId),
      dynamic: policy.dynamicRating,
      eventType: params.event?.eventType,
      ratingType,
    });
    if (typeof occupantValue !== 'number') continue;
    if (better(value, occupantValue)) {
      target = assignment.drawPosition;
      break;
    }
  }

  const touched: any[] = [];
  for (const assignment of assignments) {
    if (assignment.drawPosition >= target) {
      assignment.drawPosition += 1;
      touched.push(assignment);
    }
  }
  assignments.push({ drawPosition: target, participantId });

  mirrorStandingToScale({ ...params, appliedAt: addedAt, touched });
  return { ...SUCCESS, drawPosition: target };
}
