import { validateTieFormat } from '@Validators/validateTieFormat';
import { takeUUID } from '@Tools/UUID';

// constants

import { INSUFFICIENT_UUIDS } from '@Constants/errorConditionConstants';

// types
import { TieFormat } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type CheckTieFormatArgs = {
  tieFormat: TieFormat;
  uuids?: string[];
};
/**
 * Mint any missing `collectionId`s, in place.
 *
 * Published on the tieFormat governor as `mintCollectionIds`. A `collectionId` identifies a
 * collection INSTANCE within a record, so a published `fixtures.tieFormats.*` object cannot carry
 * one — and since 7.0.0 `validateTieFormat` enforces their presence by default. A caller holding a
 * hand-written or published tieFormat mints here before validating or passing it to an API that
 * validates at the door.
 *
 * Validates with `checkCollectionIds: false` on purpose: this runs BEFORE the ids exist.
 *
 * PASS `uuids` WHEN THE CALL RUNS ON BOTH SIDES. TMX executes every mutation twice — the server
 * applies it and acknowledges, then the client applies the same methods locally — so a mint that
 * calls `UUID()` on each side produces two different collectionIds for the same collection and the
 * two copies of the record diverge silently. Generate the pool once with `tools.UUIDS(count)`, send
 * it in the mutation params, and both sides mint identically. `takeUUID` returns
 * `INSUFFICIENT_UUIDS` rather than minting a fresh one when a supplied pool runs out, so the
 * mismatch surfaces as a conflict instead of becoming permanent.
 */
export function checkTieFormat({ tieFormat, uuids }: CheckTieFormatArgs): ResultType & { tieFormat?: TieFormat } {
  const result = validateTieFormat({
    checkCollectionIds: false,
    tieFormat,
  });
  if (result.error) return result;

  for (const collectionDefinition of tieFormat.collectionDefinitions) {
    if (collectionDefinition.collectionId) continue;
    const { uuid, error } = takeUUID({ uuids });
    if (error || !uuid) return { error: error ?? INSUFFICIENT_UUIDS };
    collectionDefinition.collectionId = uuid;
  }

  return { tieFormat };
}
