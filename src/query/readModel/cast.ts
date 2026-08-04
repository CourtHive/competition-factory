import {
  courtRow,
  drawRow,
  entryRows,
  eventRow,
  matchUpRowSet,
  orderOfPlayRow,
  participantPublishRow,
  schedulingProfileRows,
  seedRow,
  structureRow,
  tournamentRow,
  venueRow,
  MatchUpRowContext,
} from './readModelRows';
import { getTournamentPublishStatus } from '@Query/tournaments/getTournamentPublishStatus';
import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { findExtension } from '@Acquire/findExtension';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
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
    // A TEAM draw's flatten returns each rubber BOTH nested under its TEAM matchUp
    // (as `tieMatchUps`) AND as a top-level sibling (carrying a `collectionId`).
    // Skip the top-level rubber — it is projected as a RUBBER row via its TEAM
    // parent in `matchUpRowSet`; processing it here too would double-project it.
    if (matchUp.collectionId) continue;
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

  // one row per event; `published` = the event carries a PUBLISH.STATUS.PUBLIC object
  // (the same map used for the per-matchUp publish cascade above).
  const events = (tournamentRecord.events ?? [])
    .filter((event: any) => event?.eventId)
    .map((event: any) => eventRow(event, tournamentId, providerId, !!publishStatusByEventId.get(event.eventId)));

  const { draws, structures, seeds } = buildDrawEntityRows(tournamentRecord, tournamentId, providerId);

  const courts: ReadModelRows['courts'] = [];
  for (const venue of placedVenues) {
    for (const court of venue.courts ?? []) {
      if (!court?.courtId) continue;
      courts.push(courtRow(court, { venueId: venue.venueId, tournamentId, providerId }));
    }
  }

  // order-of-play + participant-list PUBLICATION state (one row each when published)
  const publishStatus: any = getTournamentPublishStatus({ tournamentRecord });
  const orderOfPlay = publishStatus?.orderOfPlay;
  const order_of_play: ReadModelRows['order_of_play'] = orderOfPlay?.published
    ? [orderOfPlayRow(tournamentId, orderOfPlay)]
    : [];
  const participants = publishStatus?.participants;
  const participant_publish: ReadModelRows['participant_publish'] = participants?.published
    ? [participantPublishRow(tournamentId, participants)]
    : [];

  // scheduling PLAN (first-class `scheduling.profile` in NATIVE mode, else the
  // SCHEDULING_PROFILE extension in LEGACY mode)
  const profile =
    (tournamentRecord as any).scheduling?.profile ??
    findExtension({ element: tournamentRecord, name: SCHEDULING_PROFILE })?.extension?.value ??
    [];
  const scheduling_profile = schedulingProfileRows(tournamentId, profile);

  return {
    ...SUCCESS,
    rows: {
      tournaments: [tournamentRow(tournamentRecord)],
      events,
      draws,
      structures,
      seeds,
      courts,
      order_of_play,
      scheduling_profile,
      participant_publish,
      match_ups,
      match_up_competitors,
      entries: entryRows(tournamentRecord),
      venues: placedVenues.map(venueRow),
      tournament_venues: placedVenues.map((venue: any) => ({ tournament_id: tournamentId, venue_id: venue.venueId })),
    },
  };
}

// One row per draw, per top-level structure, and per participant-holding seed
// assignment (walked together since they share the events → draws → structures
// nesting). Extracted from cast() to keep its cognitive complexity within bounds.
function buildDrawEntityRows(
  tournamentRecord: any,
  tournamentId: string,
  providerId: string | undefined,
): { draws: ReadModelRows['draws']; structures: ReadModelRows['structures']; seeds: ReadModelRows['seeds'] } {
  const draws: ReadModelRows['draws'] = [];
  const structures: ReadModelRows['structures'] = [];
  const seeds: ReadModelRows['seeds'] = [];
  for (const event of tournamentRecord.events ?? []) {
    for (const draw of event.drawDefinitions ?? []) {
      if (!draw?.drawId) continue;
      draws.push(drawRow(draw, tournamentId, event.eventId, providerId));
      for (const structure of draw.structures ?? []) {
        if (!structure?.structureId) continue;
        const sctx = { tournamentId, eventId: event.eventId, drawId: draw.drawId, providerId };
        structures.push(structureRow(structure, sctx));
        for (const assignment of structure.seedAssignments ?? []) {
          if (!assignment?.participantId) continue;
          seeds.push(seedRow(assignment, { ...sctx, structureId: structure.structureId }));
        }
      }
    }
  }
  return { draws, structures, seeds };
}
