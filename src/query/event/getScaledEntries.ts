import { resolveScaleValueNumber, hasScaleValueNumber } from '@Query/scales/resolveScaleValue';
import { getParticipantScaleItem } from '@Query/participant/getParticipantScaleItem';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { Entry, Event, Tournament } from '@Types/tournamentTypes';
import { ScaleAttributes } from '@Types/factoryTypes';

type GetScaledEntriesArgs = {
  scaleAttributes: ScaleAttributes;
  tournamentRecord: Tournament;
  sortDescending?: boolean;
  stageSequence?: number;
  scaleSortMethod?: any;
  entries?: Entry[];
  stage?: string;
  event?: Event;
};
export function getScaledEntries({
  sortDescending = false,
  tournamentRecord,
  scaleAttributes,
  scaleSortMethod,
  stageSequence,
  entries,
  event,
  stage,
}: GetScaledEntriesArgs): { error?: ErrorType; scaledEntries?: any[] } {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  entries = entries ?? event?.entries ?? [];

  const stageEntries = entries.filter(
    (entry: any) =>
      (!stage || !entry.entryStage || entry.entryStage === stage) &&
      (!stageSequence || !entry.entryStageSequence || entry.entryStageSequence === stageSequence) &&
      STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus),
  );

  // create a copy of the scaleAttributes to enable use of contextual attributes
  // this allows clients to use 'hydrated' scaleAttributes without typescript errors
  const processingAttributes: any = { ...scaleAttributes };

  const scaledEntries = stageEntries
    .map((entry) => {
      const { participantId } = entry;
      const { scaleItem } = getParticipantScaleItem({
        tournamentRecord,
        scaleAttributes,
        participantId,
      });
      // return a new object so original entry is untouched
      return { ...entry, ...scaleItem };
    })
    .filter((scaledEntry) => {
      const scaleValue = scaledEntry.scaleValue;
      if (scaleSortMethod) return scaleValue;
      // Was: `Number.isNaN(scaleValue) || !Number.parseFloat(scaleValue)`.
      // Two defects. `!Number.parseFloat(v)` is a TRUTHINESS test, so a
      // legitimate 0 was dropped — and PSA / SQUASH_LEVELS / ITTF / BWF all
      // declare 0 inside their valid range, so a player on zero points could
      // never be seeded. And an object-valued scaleValue (the shape returned
      // when no accessor is supplied) parsed to NaN, silently emptying the
      // whole result rather than reporting anything.
      return hasScaleValueNumber(scaleValue, {
        accessor: processingAttributes?.accessor,
        scaleName: processingAttributes?.scaleName,
      });
    })
    .sort(
      scaleSortMethod ||
        (sortDescending || processingAttributes?.ascending === false
          ? defaultScaleValueSortDescending
          : defaultScaleValueSortAscending),
    );

  return { scaledEntries };

  function defaultScaleValueSortAscending(a, b) {
    return scaleItemValue(a) - scaleItemValue(b);
  }

  function defaultScaleValueSortDescending(a, b) {
    return scaleItemValue(b) - scaleItemValue(a);
  }

  function scaleItemValue(scaleItem) {
    // `scaleItem.scaleValue || fallback` would map a legitimate 0 to the
    // fallback and sort that player to the wrong end; resolve first, then
    // apply the fallback only when there is genuinely no value.
    const resolved = resolveScaleValueNumber(scaleItem?.scaleValue, {
      accessor: processingAttributes?.accessor,
      scaleName: processingAttributes?.scaleName,
    });
    return resolved ?? (sortDescending ? -1 : 1e5);
  }
}
