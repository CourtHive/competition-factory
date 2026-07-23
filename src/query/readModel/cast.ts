import { entryRows, matchUpRowSet, tournamentRow, venueRow, MatchUpRowContext } from './readModelRows';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { resolveMatchUpPublishState } from './readModelPublish';
import { decorateResult } from '@Functions/global/decorateResult';

// constants and types
import { ReadModelCompetitorRow, ReadModelMatchUpRow, ReadModelRows } from '@Types/readModelTypes';
import { MISSING_TOURNAMENT_RECORD, ErrorType } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type CastArgs = {
  tournamentRecord?: Tournament;
};

/**
 * `cast()` — the single, factory-pure transform from ONE `tournamentRecord` into
 * the flattened read-model row set (CQRS read-side). It is the D1 canonical
 * source shared by the CFS incremental producer and the courthive-query rebuild
 * pipeline, so the two paths stay byte-identical (plan:
 * COURTHIVE_INGEST_SEPARATION_AND_PIPELINE §8).
 *
 * Pure: no I/O, no globalState. Derives every row from the factory flattener
 * (`allTournamentMatchUps`, hydrated in-context) with `usePublishState: false`
 * (ALL matchUps projected). Each matchUp carries `published` (publish INTENT,
 * resolved through the structure/stage/draw cascade) + `embargo` (the effective
 * release timestamp) so visibility is a READ-time gate (`published AND (embargo
 * IS NULL OR embargo <= now())`), never a stale stored boolean. Rows are keyed by
 * LOGICAL table name; the consumer maps logical → physical `query_<name>`.
 * person_id follows the person rule (populated only for a real non-UUID provider
 * personId); RUBBER rows carry `tie_value` from the tieFormat.
 */
export function cast(params?: CastArgs): { error?: ErrorType; success?: boolean; rows?: ReadModelRows } {
  const tournamentRecord = params?.tournamentRecord;
  if (!tournamentRecord) {
    return decorateResult({ result: { error: MISSING_TOURNAMENT_RECORD }, stack: 'cast' });
  }

  const tournamentId = tournamentRecord.tournamentId;
  const providerId = tournamentRecord.parentOrganisation?.organisationId;

  const publishStatusByEventId = new Map<string, any>();
  for (const event of tournamentRecord.events ?? []) {
    if (event?.eventId) publishStatusByEventId.set(event.eventId, getEventPublishStatus({ event }));
  }

  const { matchUps = [] } = allTournamentMatchUps({ tournamentRecord, inContext: true, usePublishState: false });

  const match_ups: ReadModelMatchUpRow[] = [];
  const match_up_competitors: ReadModelCompetitorRow[] = [];
  for (const matchUp of matchUps) {
    const status = matchUp.eventId ? publishStatusByEventId.get(matchUp.eventId) : undefined;
    const { published, embargo } = resolveMatchUpPublishState(
      status,
      matchUp.drawId,
      matchUp.structureId,
      matchUp.stage,
    );
    const ctx: MatchUpRowContext = { tournamentId, providerId, published, embargo };
    const { matchUpRows, competitorRows } = matchUpRowSet(matchUp, ctx);
    match_ups.push(...matchUpRows);
    match_up_competitors.push(...competitorRows);
  }

  const placedVenues = (tournamentRecord.venues ?? []).filter((venue: any) => venue?.venueId);

  return {
    ...SUCCESS,
    rows: {
      tournaments: [tournamentRow(tournamentRecord)],
      match_ups,
      match_up_competitors,
      entries: entryRows(tournamentRecord),
      venues: placedVenues.map(venueRow),
      tournament_venues: placedVenues.map((venue: any) => ({ tournament_id: tournamentId, venue_id: venue.venueId })),
    },
  };
}
