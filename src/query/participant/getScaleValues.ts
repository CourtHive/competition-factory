import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { unique } from '@Tools/arrays';

// constants and types
import { DOUBLES_EVENT, SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { RANKING, RATING, SCALE, SEEDING } from '@Constants/scaleConstants';
import { PARTICIPANT } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

export type ScaleType = {
  scaleName: string;
  scaleDate: string;
  scaleValue: any;
};

/**
 * Scale entries for one participant, grouped by event type.
 *
 * **Each event type holds an ARRAY with one entry per distinct `scaleName`** —
 * a participant may carry WTN and UTR and NTRP simultaneously. Within a single
 * `scaleName` the entry is the latest value (see `latestScaleItem` below), so
 * "current" is resolved for you; across scale names nothing is.
 *
 * **The array has no canonical order, and never will.** The set of rating and
 * ranking scales is open — any number of scales, from any number of bodies,
 * including ones not yet invented — so there is no position to assign. Entries
 * land in first-appearance order across the participant's `timeItems`, which is
 * an artefact of iteration and not a contract.
 *
 * So **address entries by `scaleName`, never by position**:
 *
 * ```ts
 * // WRONG — [0] is only WTN while WTN is the sole scale present
 * const wtn = ratings.SINGLES[0].scaleValue.wtnRating;
 *
 * // RIGHT — see getDetailsWTN for this pattern in use
 * const entry = ratings.SINGLES?.find(({ scaleName }) => scaleName === WTN);
 * ```
 *
 * Note that `scaleName` may carry a modifier suffix (`WTN.<modifier>`), built
 * below from the `itemType` segments — match accordingly where modifiers are in
 * play.
 *
 * This type previously declared a single `ScaleType` per event type while the
 * implementation built arrays, so anything typed against it read `undefined`.
 */
export type ScalesType = {
  [SINGLES_EVENT]?: ScaleType[];
  [DOUBLES_EVENT]?: ScaleType[];
  [TEAM_EVENT]?: ScaleType[];
};

type ScaleTypes = {
  seedings: ScalesType;
  rankings: ScalesType;
  ratings: ScalesType;
  success?: boolean;
};

export function getScaleValues(params): ResultType & {
  seedings?: ScalesType;
  rankings?: ScalesType;
  ratings?: ScalesType;
} {
  const paramCheck = checkRequiredParameters(params, [{ [PARTICIPANT]: true }]);
  if (paramCheck.error) return paramCheck;

  const scaleItems = params.participant.timeItems?.filter(
    ({ itemType }) => itemType?.startsWith(SCALE) && [RANKING, RATING, SEEDING].includes(itemType.split('.')[1]),
  );
  const scales: ScaleTypes = { ratings: {}, rankings: {}, seedings: {} };

  if (scaleItems?.length) {
    const latestScaleItem = (scaleType) =>
      scaleItems
        .filter((timeItem) => timeItem?.itemType === scaleType)
        .sort((a, b) => new Date(a.createdAt || undefined).getTime() - new Date(b.createdAt || undefined).getTime())
        .pop();

    const itemTypes = unique(scaleItems.map(({ itemType }) => itemType));

    for (const itemType of itemTypes) {
      const scaleItem = latestScaleItem(itemType);
      if (scaleItem) {
        const [, type, format, scaleName, modifier] = scaleItem.itemType.split('.');

        const namedScale = modifier ? `${scaleName}.${modifier}` : scaleName;

        const scaleType = (type === SEEDING && 'seedings') || (type === RANKING && 'rankings') || 'ratings';

        if (!scales[scaleType][format]) scales[scaleType][format] = [];
        scales[scaleType][format].push({
          scaleValue: scaleItem.itemValue,
          scaleDate: scaleItem.itemDate,
          scaleName: namedScale,
        });
      }
    }
  }

  return { ...SUCCESS, ...scales };
}
