import { checkUnifiedIds, upsertUnifiedId } from '@Mutate/base/unifiedIds';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { UnifiedTournamentID } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Upsert a `UnifiedTournamentID` entry into `tournamentRecord.tournamentOtherIds[]` — the
 * tournament-grain sibling of {@link addParticipantOtherId} and {@link addPersonOtherId}.
 *
 * `organisationId` is the upsert key: an existing entry for that organisation has its
 * `tournamentId` replaced; otherwise a new entry is appended with a `createdAt` timestamp.
 * Idempotent — re-applying the same `(organisationId, tournamentId)` is a no-op and fires
 * no notice.
 *
 * **Why this exists.** `tournamentOtherIds` was declared on the `Tournament` type and had
 * no write path, no reader, and no read-model column, while the event grain
 * (`eventOtherIds`) had all three. A record acquired wholesale from an outside system —
 * every `courthive-ingest` adapter produces exactly that — could therefore only record
 * where it came from by convention (prefixing its `tournamentId` with `utr-`, `cts-`, …),
 * which is not queryable and does not survive a re-id.
 *
 * `otherTournamentId` is named distinctly from the record's own `tournamentId` for the
 * same reason `addParticipantOtherId` names `otherParticipantId` that way: both are
 * tournament ids, and silently transposing them would stamp a record with its own id and
 * still look like it worked.
 *
 * Setting `isOrigin` is refused when a different organisation already holds it — see
 * {@link upsertUnifiedId}.
 */
export function addTournamentOtherId({
  uniqueOrganisationName,
  otherTournamentId,
  tournamentRecord,
  organisationId,
  isOrigin,
}: {
  uniqueOrganisationName?: string;
  // the OTHER organisation's id for this tournament — NOT the carrying record's
  otherTournamentId: string;
  tournamentRecord: any;
  organisationId: string;
  isOrigin?: boolean;
}) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  if (!organisationId) return { error: MISSING_VALUE, info: 'Missing organisationId' };
  if (!otherTournamentId) return { error: MISSING_VALUE, info: 'Missing otherTournamentId' };

  tournamentRecord.tournamentOtherIds ??= [];

  const result = upsertUnifiedId({
    entries: tournamentRecord.tournamentOtherIds,
    values: { tournamentId: otherTournamentId },
    uniqueOrganisationName,
    organisationId,
    isOrigin,
  });
  if (result.error) return result;

  if (result.changed) notifyTournamentOtherIds(tournamentRecord);

  return { ...SUCCESS };
}

/**
 * Replace `tournamentRecord.tournamentOtherIds[]` wholesale — the tournament-grain
 * equivalent of passing `eventOtherIds` through `modifyEvent`.
 *
 * Wholesale is the natural grain for reconciliation: a caller diffing against a
 * sanctioning body or an ingest source holds the full list. It is also the only way to
 * RE-POINT `isOrigin` at a different organisation, which {@link addTournamentOtherId}
 * deliberately refuses to do implicitly.
 *
 * Pass `null` to clear.
 *
 * Unlike `modifyEvent`'s `eventOtherIds` handling, this validates: an array carrying two
 * `isOrigin` entries, or an entry with no `organisationId`, is rejected rather than
 * stored. The readers stay tolerant either way.
 */
export function setTournamentOtherIds({
  tournamentOtherIds,
  tournamentRecord,
}: {
  tournamentOtherIds: UnifiedTournamentID[] | null;
  tournamentRecord: any;
}) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  if (tournamentOtherIds === null) {
    if (tournamentRecord.tournamentOtherIds === undefined) return { ...SUCCESS };
    delete tournamentRecord.tournamentOtherIds;
    notifyTournamentOtherIds(tournamentRecord);
    return { ...SUCCESS };
  }

  const check = checkUnifiedIds(tournamentOtherIds as any[]);
  if (check?.error) return check;

  tournamentRecord.tournamentOtherIds = tournamentOtherIds;
  notifyTournamentOtherIds(tournamentRecord);

  return { ...SUCCESS };
}

function notifyTournamentOtherIds(tournamentRecord: any) {
  addNotice({
    topic: MODIFY_TOURNAMENT_DETAIL,
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentOtherIds: tournamentRecord.tournamentOtherIds ?? [],
      tournamentId: tournamentRecord.tournamentId,
    },
  });
}
