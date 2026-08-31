import { getEffectiveRegistrationProfile } from '@Query/entries/getEffectiveRegistrationProfile';
import { getTournamentPublishStatus } from '@Query/tournaments/getTournamentPublishStatus';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import { getEntryFeeRange } from '@Query/entries/resolveEntryFee';
import { LINK_UNRESOLVED, resolvePersonLink } from './personRule';
import { findExtension } from '@Acquire/findExtension';

// types
import { UnifiedDrawID, UnifiedEventID, UnifiedTournamentID } from '@Types/tournamentTypes';
import {
  ReadModelTournamentDiscoveryRow,
  ReadModelTournamentRow,
  ReadModelCompetitorRow,
  ReadModelMatchUpRow,
  ReadModelCourtRow,
  ReadModelDrawRow,
  ReadModelEntryRow,
  ReadModelEventRow,
  ReadModelOrderOfPlayRow,
  ReadModelParticipantPublishRow,
  ReadModelSchedulingProfileRow,
  ReadModelSeedRow,
  ReadModelStructureRow,
  ReadModelVenueRow,
} from '@Types/readModelTypes';

const TEAM = 'TEAM';
const PAIR = 'PAIR';
const LEVEL_STANDARD = 'STANDARD';
const LEVEL_TIE = 'TIE';
const LEVEL_RUBBER = 'RUBBER';

export interface MatchUpRowContext {
  tournamentId: string;
  providerId: string | undefined;
  published: boolean;
  embargo: string | null;
  scheduleEmbargo?: string | null;
}

export interface MatchUpRowSet {
  matchUpRows: ReadModelMatchUpRow[];
  competitorRows: ReadModelCompetitorRow[];
}

// ── tournaments ────────────────────────────────────────────────────────────────

export function tournamentRow(record: any): ReadModelTournamentRow {
  // aggregate publish flag: the tournament is "published" when its order of play OR
  // its participant list is published (the same condition that drives UNPUBLISH_TOURNAMENT).
  const pubStatus: any = getTournamentPublishStatus({ tournamentRecord: record });
  const origin = tournamentOrigin(record);
  return {
    tournament_id: record?.tournamentId,
    tournament_name: record?.tournamentName ?? null,
    provider_id: record?.parentOrganisation?.organisationId ?? null,
    start_date: record?.startDate ?? null,
    end_date: record?.endDate ?? null,
    city: record?.tournamentContacts?.[0]?.city ?? record?.city ?? null,
    published: !!(pubStatus?.orderOfPlay?.published || pubStatus?.participants?.published),
    origin_organisation_id: origin?.organisationId ?? null,
    origin_tournament_id: origin?.tournamentId ?? null,
  };
}

/** Coordinates arrive as `string | number` in CODES. A read model that stores both cannot index. */
function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Sorted, de-duplicated, empties dropped — a facet list is a set, and a stable one. */
function facet(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
}

/**
 * One denormalised row per tournament, for faceted discovery.
 *
 * Aggregates over the tournament AND its events — see {@link ReadModelTournamentDiscoveryRow} for
 * why that makes it the first row of its kind here, and for why no `registration_state` is stored.
 *
 * Reuses `getEntryFeeRange` and `getEffectiveRegistrationProfile` rather than re-deriving them: a
 * second implementation of "which fees apply and can they be compared" would drift from the first,
 * and the first is the one with the unit rules in it.
 */
export function tournamentDiscoveryRow(record: any): ReadModelTournamentDiscoveryRow {
  const events: any[] = record?.events ?? [];
  const sanction: any = record?.sanction ?? {};
  const classification: any = sanction.classification ?? record?.tournamentTier ?? {};

  const primaryVenue: any = record?.venues?.find((v: any) => v?.isPrimary) ?? record?.venues?.[0];
  const address: any = primaryVenue?.addresses?.[0] ?? {};

  const registration: any = getEffectiveRegistrationProfile({ tournamentRecord: record });

  // Every fee the tournament states, event-level included. The range refuses to span
  // denominations, so a mixed-currency tournament reports no range rather than a wrong one.
  const allFees = [
    ...(registration?.entryFees ?? []),
    ...events.flatMap((e) => e?.registrationProfile?.entryFees ?? []),
  ];
  const range: any = getEntryFeeRange(allFees);
  const comparable = range && !range.incomparable?.length && !range.indeterminate?.length;

  return {
    tournament_id: record?.tournamentId,
    provider_id: record?.parentOrganisation?.organisationId ?? null,
    start_date: record?.startDate ?? null,
    end_date: record?.endDate ?? null,
    latitude: toNumber(address.latitude),
    longitude: toNumber(address.longitude),
    venue_name: primaryVenue?.venueName ?? null,
    city: address.city ?? record?.city ?? null,
    state: address.state ?? null,
    country_code: address.countryCode ?? record?.hostCountryCode ?? null,
    // Scope, not grade — see the row type. Never defaulted: an unstated level is unknown, and a
    // discovery facet that invented one would silently narrow every search that used it.
    tournament_level: record?.tournamentLevel ?? null,
    level_system: classification.system ?? null,
    level_value: classification.value ?? null,
    recognition: sanction.recognition ?? null,
    decision: sanction.decision ?? null,
    ranking_eligible: sanction.confers?.rankingEligible ?? null,
    entries_open: registration?.entriesOpen ?? null,
    entries_close: registration?.entriesClose ?? null,
    fee_min: comparable ? range.min.amount : null,
    fee_max: comparable ? range.max.amount : null,
    fee_currency: comparable ? range.min.currencyCode : null,
    fee_unit: comparable ? range.min.unit : null,
    event_count: events.length,
    category_types: facet(events.map((e) => e?.category?.categoryType)),
    genders: facet(events.map((e) => e?.gender)),
    age_codes: facet(events.map((e) => e?.category?.ageCategoryCode)),
    rating_types: facet(events.map((e) => e?.category?.ratingType)),
    cancelled_at: record?.cancelledAt ?? null,
  };
}

/**
 * The `tournamentOtherIds[]` entry flagged `isOrigin` — the system the whole RECORD was
 * acquired from (an ingest source, or a sanctioning body that handed the record over).
 *
 * Independent of {@link eventOrigin} one grain down: a record acquired wholesale from one
 * organisation can still carry events sanctioned by others, so neither can be inferred
 * from the other. Tolerant of a malformed record for the same reason `eventOrigin` is —
 * see the note there.
 */
export function tournamentOrigin(record: any): UnifiedTournamentID | undefined {
  return (record?.tournamentOtherIds ?? []).find((otherId: UnifiedTournamentID) => otherId?.isOrigin);
}

// ── participant-list publication state ──────────────────────────────────────────

/** The tournament-level participant-list PUBLICATION state (from the PUBLIC
 *  `participants` publish status): published + optional embargo. */
export function participantPublishRow(tournamentId: string, participants: any): ReadModelParticipantPublishRow {
  return {
    tournament_id: tournamentId,
    published: !!participants?.published,
    embargo: participants?.embargo ?? null,
  };
}

// ── events ──────────────────────────────────────────────────────────────────────

/**
 * One row per event. `providerId` and the event-level `published` flag are passed
 * in (resolved by the caller from the record's parentOrganisation + the event's
 * PUBLISH.STATUS) so this builder stays pure — mirroring `matchUpResultRow`. The
 * category falls back categoryName → ageCategoryCode; TEAM events commonly have no
 * `matchUpFormat` (it lives in the tieFormat) → `match_up_format` resolves to null.
 */
export function eventRow(
  event: any,
  tournamentId: string,
  providerId: string | undefined,
  published: boolean,
): ReadModelEventRow {
  const origin = eventOrigin(event);
  return {
    event_id: event?.eventId,
    tournament_id: tournamentId,
    provider_id: providerId ?? null,
    event_name: event?.eventName ?? null,
    event_type: event?.eventType ?? null,
    gender: event?.gender ?? null,
    category_name: event?.category?.categoryName ?? event?.category?.ageCategoryCode ?? null,
    match_up_format: event?.matchUpFormat ?? null,
    start_date: event?.startDate ?? null,
    end_date: event?.endDate ?? null,
    published,
    origin_organisation_id: origin?.organisationId ?? null,
    origin_tournament_id: origin?.tournamentId ?? null,
    origin_event_id: origin?.eventId ?? null,
  };
}

/**
 * The `eventOtherIds[]` entry flagged `isOrigin` — the sanctioning source the event came
 * from. Returns undefined when the event declares no origin (the ordinary single-sanction
 * case), so every origin_* column projects null rather than picking an arbitrary entry.
 *
 * `find` rather than `filter`+index: at most one entry should carry the flag. If more than
 * one does the record is malformed; taking the first is stable (array order is preserved
 * through storage) and keeps the projection deterministic rather than throwing on a read.
 */
export function eventOrigin(event: any): UnifiedEventID | undefined {
  return (event?.eventOtherIds ?? []).find((otherId: UnifiedEventID) => otherId?.isOrigin);
}

// ── draws + structures ──────────────────────────────────────────────────────────

/** One row per drawDefinition. */
export function drawRow(
  draw: any,
  tournamentId: string,
  eventId: string | null,
  providerId: string | undefined,
): ReadModelDrawRow {
  const origin = drawOrigin(draw);
  return {
    draw_id: draw?.drawId,
    tournament_id: tournamentId,
    event_id: eventId ?? null,
    provider_id: providerId ?? null,
    draw_name: draw?.drawName ?? null,
    draw_type: draw?.drawType ?? null,
    match_up_format: draw?.matchUpFormat ?? null,
    origin_organisation_id: origin?.organisationId ?? null,
    origin_tournament_id: origin?.tournamentId ?? null,
    origin_event_id: origin?.eventId ?? null,
    origin_draw_id: origin?.drawId ?? null,
  };
}

/**
 * The `drawOtherIds[]` entry flagged `isOrigin` — the system this draw came from.
 *
 * All four projected columns are independently nullable because an origin system supplies
 * only the grains it actually models: a UTR flight yields `origin_tournament_id` (UTR's
 * event id) and `origin_draw_id` (the flight GUID) with `origin_event_id` NULL, since UTR
 * has no event-grain object.
 */
export function drawOrigin(draw: any): UnifiedDrawID | undefined {
  return (draw?.drawOtherIds ?? []).find((otherId: UnifiedDrawID) => otherId?.isOrigin);
}

export interface StructureRowContext {
  tournamentId: string;
  eventId: string | null;
  drawId: string;
  providerId: string | undefined;
  // the owning CONTAINER structure when this is a nested round-robin group; omitted for top-level.
  parentStructureId?: string | null;
}

/**
 * One row per structure of a draw — top-level structures AND their nested
 * round-robin group sub-structures (each carries `parent_structure_id` = its
 * CONTAINER, so a matchUp's `structure_id` always resolves to a structures row).
 */
export function structureRow(structure: any, ctx: StructureRowContext): ReadModelStructureRow {
  return {
    structure_id: structure?.structureId,
    draw_id: ctx.drawId,
    tournament_id: ctx.tournamentId,
    event_id: ctx.eventId ?? null,
    provider_id: ctx.providerId ?? null,
    structure_name: structure?.structureName ?? null,
    stage: structure?.stage ?? null,
    stage_sequence: structure?.stageSequence ?? null,
    structure_type: structure?.structureType ?? null,
    structure_order: structure?.structureOrder ?? null,
    match_up_format: structure?.matchUpFormat ?? null,
    parent_structure_id: ctx.parentStructureId ?? null,
  };
}

// ── order of play + scheduling profile (the schedule PLAN + its publication) ────

/**
 * The tournament-level order-of-play PUBLICATION state (distinct from per-matchUp
 * scheduling): from the PUBLIC `orderOfPlay` publish status. `scheduled_dates` /
 * `event_ids` are null when the publish did not scope them (= "all").
 */
export function orderOfPlayRow(tournamentId: string, orderOfPlay: any): ReadModelOrderOfPlayRow {
  return {
    tournament_id: tournamentId,
    published: !!orderOfPlay?.published,
    scheduled_dates: orderOfPlay?.scheduledDates ?? null,
    event_ids: orderOfPlay?.eventIds ?? null,
    embargo: orderOfPlay?.embargo ?? null,
  };
}

/**
 * The stored scheduling PLAN for a tournament: first-class `scheduling.profile`
 * (NATIVE writeMode), else the `SCHEDULING_PROFILE` extension (LEGACY/imported
 * records). The single source both `cast()` and the CFS rebuild read, so a LEGACY
 * record projects identically either way (the rebuild used to read NATIVE only and
 * silently wiped the table for extension-backed profiles).
 */
export function resolveSchedulingProfile(record: any): any[] {
  return (
    record?.scheduling?.profile ?? findExtension({ element: record, name: SCHEDULING_PROFILE })?.extension?.value ?? []
  );
}

/**
 * Flatten the scheduling PLAN (`scheduling.profile`: per-date, per-venue ordered
 * rounds) into one row per (date, venue, round position). This is the admin plan
 * that drives auto-scheduling — NOT the resulting per-matchUp schedule.
 */
export function schedulingProfileRows(tournamentId: string, schedulingProfile: any[]): ReadModelSchedulingProfileRow[] {
  const rows: ReadModelSchedulingProfileRow[] = [];
  for (const dateProfile of schedulingProfile ?? []) {
    const scheduleDate = dateProfile?.scheduleDate;
    if (!scheduleDate) continue;
    for (const venue of dateProfile?.venues ?? []) {
      const venueId = venue?.venueId;
      if (!venueId) continue;
      (venue?.rounds ?? []).forEach((round: any, roundOrder: number) => {
        rows.push({
          tournament_id: tournamentId,
          schedule_date: scheduleDate,
          venue_id: venueId,
          round_order: roundOrder,
          event_id: round?.eventId ?? null,
          draw_id: round?.drawId ?? null,
          structure_id: round?.structureId ?? null,
          round_number: round?.roundNumber ?? null,
          round_segment_number: round?.roundSegment?.segmentNumber ?? null,
          round_segments_count: round?.roundSegment?.segmentsCount ?? null,
          winner_finishing_position_range: round?.winnerFinishingPositionRange ?? null,
        });
      });
    }
  }
  return rows;
}

// ── seeds ─────────────────────────────────────────────────────────────────────

export interface SeedRowContext {
  tournamentId: string;
  eventId: string | null;
  drawId: string | null;
  structureId: string;
  providerId: string | undefined;
}

/**
 * One row per seed ASSIGNMENT that has a participant. `seedValue` is a display
 * value that may be a range ("3-4"), so it is stringified. Caller supplies the
 * structure's event/draw/provider context (cast from its loop; the CFS producer
 * from a structureId lookup) so the builder stays pure.
 */
export function seedRow(assignment: any, ctx: SeedRowContext): ReadModelSeedRow {
  return {
    structure_id: ctx.structureId,
    seed_number: assignment?.seedNumber,
    tournament_id: ctx.tournamentId,
    event_id: ctx.eventId ?? null,
    draw_id: ctx.drawId ?? null,
    seed_value: assignment?.seedValue != null ? String(assignment.seedValue) : null,
    participant_id: assignment?.participantId,
    provider_id: ctx.providerId ?? null,
  };
}

// ── venues ──────────────────────────────────────────────────────────────────────

export function venueRow(venue: any): ReadModelVenueRow {
  const address = venue?.addresses?.[0];
  const addressText = address
    ? [address.addressLine1, address.city, address.postalCode].filter(Boolean).join(', ')
    : null;
  return {
    venue_id: venue?.venueId,
    venue_name: venue?.venueName ?? venue?.venueAbbreviation ?? null,
    // facilityId is a canonical first-class attribute that defaults to venueId —
    // most venues are their own facility; it diverges only when several record
    // venues dedupe to one physical facility (courthive-facilities).
    facility_id: venue?.facilityId ?? venue?.venueId ?? null,
    address: addressText,
  };
}

export interface CourtRowContext {
  venueId: string;
  tournamentId: string;
  providerId: string | undefined;
}

/** One row per court of a placed venue. */
export function courtRow(court: any, ctx: CourtRowContext): ReadModelCourtRow {
  return {
    court_id: court?.courtId,
    venue_id: ctx.venueId,
    tournament_id: ctx.tournamentId,
    provider_id: ctx.providerId ?? null,
    court_name: court?.courtName ?? null,
    indoor_outdoor: court?.indoorOutdoor ?? null,
    surface_category: court?.surfaceCategory ?? null,
    surface_type: court?.surfaceType ?? null,
    latitude: court?.latitude ?? null,
    longitude: court?.longitude ?? null,
  };
}

// ── tie_value (rubber weight from the tieFormat) ─────────────────────────────────

/** Nominal weight a rubber contributes to its tie, from the parent tie's
 *  tieFormat collectionDefinition: explicit `matchUpValue`, else a per-position
 *  profile value, else the collection value split across its matchUps. */
export function rubberTieValue(tieFormat: any, collectionId?: string, collectionPosition?: number): number | null {
  const definition = tieFormat?.collectionDefinitions?.find((d: any) => d?.collectionId === collectionId);
  if (!definition) return null;
  if (typeof definition.matchUpValue === 'number') return definition.matchUpValue;
  const profile = definition.collectionValueProfiles?.find((p: any) => p?.collectionPosition === collectionPosition);
  if (profile && typeof profile.matchUpValue === 'number') return profile.matchUpValue;
  if (typeof definition.collectionValue === 'number' && definition.matchUpCount) {
    return definition.collectionValue / definition.matchUpCount;
  }
  return null;
}

// ── match_ups + match_up_competitors ─────────────────────────────────────────────

function winnerPerspectiveScore(matchUp: any): string | null {
  const score = matchUp?.score;
  if (!score) return null;
  if (matchUp?.winningSide === 2) return score.scoreStringSide2 ?? score.scoreStringSide1 ?? null;
  return score.scoreStringSide1 ?? score.scoreStringSide2 ?? null;
}

function matchUpScheduledDate(matchUp: any): string | null {
  const schedule = matchUp?.schedule;
  if (schedule?.scheduledDate) return schedule.scheduledDate;
  // A scheduledTime stored as a full ISO datetime carries the date; the inContext
  // flatten derives scheduledDate from it. Mirror that so the slim MODIFY_MATCHUP
  // result row (which sees the raw matchUp) does not clobber a flattened
  // scheduled_date to null for a scheduledTime-only matchUp.
  const isoDate = /^(\d{4}-\d{2}-\d{2})T/.exec(schedule?.scheduledTime ?? '');
  if (isoDate) return isoDate[1];
  return matchUp?.scheduledDate ?? null;
}

function matchUpVenueId(matchUp: any): string | null {
  return matchUp?.schedule?.venueId ?? matchUp?.venueId ?? null;
}

/** One `match_ups` row from a hydrated matchUp. `level` distinguishes a normal
 *  matchUp (STANDARD) from a TEAM/dual container (TIE) and its nested rubbers
 *  (RUBBER); `parentMatchUpId` is set only for rubbers. */
function matchUpRow(
  matchUp: any,
  level: string,
  parentMatchUpId: string | null,
  ctx: MatchUpRowContext,
  tieValue: number | null,
  scoreSource: string | null = null,
): ReadModelMatchUpRow {
  return {
    match_up_id: matchUp?.matchUpId,
    tournament_id: ctx.tournamentId,
    provider_id: ctx.providerId ?? null,
    parent_match_up_id: parentMatchUpId,
    collection_id: matchUp?.collectionId ?? null,
    collection_position: matchUp?.collectionPosition ?? null,
    match_up_level: level,
    draw_id: matchUp?.drawId ?? null,
    event_id: matchUp?.eventId ?? null,
    structure_id: matchUp?.structureId ?? null,
    venue_id: matchUpVenueId(matchUp),
    event_type: matchUp?.matchUpType ?? null,
    round_name: matchUp?.roundName ?? null,
    round_number: matchUp?.roundNumber ?? null,
    // Position WITHIN the round — the second half of a matchUp's bracket coordinate.
    // `round_number` alone cannot order or place a matchUp in a bracket; with this the
    // read model can render one and sort a round deterministically. Optional on the
    // stored matchUp: adHoc and round-robin matchUps have no round position.
    round_position: matchUp?.roundPosition ?? null,
    // Draw-progression edges. These are first-class STORED fields on the drawDefinition
    // matchUp (verified identical stored vs inContext), not query-time derivations, so
    // projecting them is a copy. They are the only faithful representation of a
    // non-standard topology: winner/loser targets cannot be re-derived from round
    // coordinates once consolation feeds, playoff attachment or qualifying→main are in
    // play. `winnerMatchUpId` is absent on a terminal matchUp; `loserMatchUpId` is absent
    // wherever no loser feed exists (every matchUp of a plain single-elimination draw).
    winner_match_up_id: matchUp?.winnerMatchUpId ?? null,
    loser_match_up_id: matchUp?.loserMatchUpId ?? null,
    match_up_status: matchUp?.matchUpStatus ?? null,
    winning_side: matchUp?.winningSide ?? null,
    score_string: winnerPerspectiveScore(matchUp),
    tie_value: tieValue,
    // TIE rows only: REPORTED marks a tie whose lines are unpopulated by design, so a consumer can
    // render "no line detail published" rather than an empty scorecard awaiting entry.
    score_source: scoreSource,
    // a per-matchUp scoring-format override (e.g. a best-of-5 final in a best-of-3
    // draw); null falls back to the draw/structure default at read time.
    match_up_format: matchUp?.matchUpFormat ?? null,
    scheduled_date: matchUpScheduledDate(matchUp),
    published: ctx.published,
    embargo: ctx.embargo,
    schedule_embargo: ctx.scheduleEmbargo ?? null,
  };
}

function pairCompetitorRows(
  participant: any,
  sideParticipantId: string,
  sideNumber: number | null,
  matchUpId: string,
  ctx: MatchUpRowContext,
  teamIdOverride: string | null,
): ReadModelCompetitorRow[] {
  return participant.individualParticipants.map((individual: any, index: number) => {
    const link = resolvePersonLink(individual?.participantId, individual?.person?.personId);
    return {
      match_up_id: matchUpId,
      tournament_id: ctx.tournamentId,
      side_number: sideNumber,
      competitor_index: index,
      participant_type: PAIR,
      side_participant_id: sideParticipantId,
      individual_participant_id: individual?.participantId ?? null,
      person_id: link.personId,
      link_source: link.linkSource,
      team_id: teamIdOverride,
      provider_id: ctx.providerId ?? null,
      participant_name: individual?.participantName ?? null,
    };
  });
}

/** Competitor rows for ONE side of a matchUp — per-INDIVIDUAL grain. Sides with
 *  no resolved participant (BYE/WALKOVER) yield no rows. `teamIdOverride` stamps
 *  a rubber player's competitor row with the team_id of its dual. */
function sideCompetitorRows(
  side: any,
  matchUpId: string,
  ctx: MatchUpRowContext,
  teamIdOverride: string | null,
): ReadModelCompetitorRow[] {
  const participant = side?.participant;
  const participantId = participant?.participantId ?? side?.participantId;
  if (!participantId) return [];

  const sideNumber = side?.sideNumber ?? null;
  const participantType = participant?.participantType ?? null;

  if (participantType === PAIR && Array.isArray(participant?.individualParticipants)) {
    return pairCompetitorRows(participant, participantId, sideNumber, matchUpId, ctx, teamIdOverride);
  }

  const isTeam = participantType === TEAM;
  const teamId = isTeam ? (participant?.teamId ?? participantId) : teamIdOverride;
  const link = isTeam
    ? { personId: null, linkSource: LINK_UNRESOLVED }
    : resolvePersonLink(participantId, participant?.person?.personId);
  return [
    {
      match_up_id: matchUpId,
      tournament_id: ctx.tournamentId,
      side_number: sideNumber,
      competitor_index: 0,
      participant_type: participantType,
      side_participant_id: participantId,
      individual_participant_id: isTeam ? null : participantId,
      person_id: link.personId,
      link_source: link.linkSource,
      team_id: teamId,
      provider_id: ctx.providerId ?? null,
      participant_name: participant?.participantName ?? null,
    },
  ];
}

function teamIdForSide(parentMatchUp: any, sideNumber: number | null): string | null {
  const side = (parentMatchUp?.sides ?? []).find((s: any) => s?.sideNumber === sideNumber);
  const participant = side?.participant;
  if (!participant) return null;
  return participant.teamId ?? participant.participantId ?? null;
}

/** Flatten ONE hydrated matchUp into its match_ups + match_up_competitors rows.
 *  A TEAM matchUp descends into its `tieMatchUps` as RUBBER rows whose
 *  competitors carry the dual's team_id. */
export function matchUpRowSet(matchUp: any, ctx: MatchUpRowContext): MatchUpRowSet {
  const matchUpRows: ReadModelMatchUpRow[] = [];
  const competitorRows: ReadModelCompetitorRow[] = [];
  const matchUpId = matchUp?.matchUpId;
  if (!matchUpId) return { matchUpRows, competitorRows };

  const isTeam = matchUp?.matchUpType === TEAM || Array.isArray(matchUp?.tieMatchUps);
  const scoreSource = (isTeam && matchUp?.tieFormat?.scoreSource) || null;
  matchUpRows.push(matchUpRow(matchUp, isTeam ? LEVEL_TIE : LEVEL_STANDARD, null, ctx, null, scoreSource));
  for (const side of matchUp?.sides ?? []) {
    competitorRows.push(...sideCompetitorRows(side, matchUpId, ctx, null));
  }

  if (isTeam) {
    const tieFormat = matchUp?.tieFormat;
    for (const rubber of matchUp?.tieMatchUps ?? []) {
      const rubberId = rubber?.matchUpId;
      if (!rubberId) continue;
      const tieValue = rubberTieValue(tieFormat, rubber?.collectionId, rubber?.collectionPosition);
      matchUpRows.push(matchUpRow(rubber, LEVEL_RUBBER, matchUpId, ctx, tieValue));
      for (const side of rubber?.sides ?? []) {
        competitorRows.push(
          ...sideCompetitorRows(side, rubberId, ctx, teamIdForSide(matchUp, side?.sideNumber ?? null)),
        );
      }
    }
  }

  return { matchUpRows, competitorRows };
}

// ── slim result update (incremental MODIFY_MATCHUP path) ─────────────────────────

/** Partial `match_ups` row for a result-only update (no flatten): the result
 *  fields plus the NOT-NULL `tournament_id` so a first insert still satisfies the
 *  schema. Used by the incremental producer's MODIFY_MATCHUP path; `cast()` (full
 *  rebuild) does not need it. Publish/embargo/tie_value are left to a full flatten. */
export function matchUpResultRow(
  matchUp: any,
  tournamentId: string,
  providerId: string | undefined,
): Record<string, any> {
  return {
    match_up_id: matchUp?.matchUpId,
    tournament_id: tournamentId,
    provider_id: providerId ?? null,
    match_up_status: matchUp?.matchUpStatus ?? null,
    winning_side: matchUp?.winningSide ?? null,
    score_string: winnerPerspectiveScore(matchUp),
    scheduled_date: matchUpScheduledDate(matchUp),
    // Progression edges ride the slim row too. Without them a MODIFY_MATCHUP that
    // REWIRES a matchUp (removeStructure stripping a loser feed) would update status and
    // score but silently leave a dangling `loser_match_up_id` pointing at a deleted row —
    // the incremental path would never converge to cast(). `?? null` is deliberate and
    // load-bearing: clearing an edge has to WRITE null, and since modifyMatchUpNotice
    // always carries the full stored matchUp, absence genuinely means "no edge" rather
    // than "not included in this payload".
    winner_match_up_id: matchUp?.winnerMatchUpId ?? null,
    loser_match_up_id: matchUp?.loserMatchUpId ?? null,
  };
}

// ── entries ──────────────────────────────────────────────────────────────────────

// participantId → personId map for entry person resolution. Includes INDIVIDUAL
// participants (the humans); PAIR/TEAM entries resolve to their own id (no
// person, correctly left unresolved by the person rule).
function buildPersonIndex(participants: any[]): Map<string, string | undefined> {
  const index = new Map<string, string | undefined>();
  for (const participant of participants) {
    if (participant?.participantId) index.set(participant.participantId, participant?.person?.personId);
  }
  return index;
}

/** Project the entries fact for one tournament: every event entry (accepted,
 *  alternate, withdrawn, un-drawn) → an `entries` row, person resolved per the
 *  person rule. */
export function entryRows(record: any): ReadModelEntryRow[] {
  const tournamentId = record?.tournamentId;
  const providerId = record?.parentOrganisation?.organisationId ?? null;
  if (!tournamentId) return [];

  const personByParticipantId = buildPersonIndex(record?.participants ?? []);
  const rows: ReadModelEntryRow[] = [];
  for (const event of record?.events ?? []) {
    for (const entry of event?.entries ?? []) {
      const participantId = entry?.participantId;
      if (!participantId) continue;
      const link = resolvePersonLink(participantId, personByParticipantId.get(participantId));
      rows.push({
        tournament_id: tournamentId,
        event_id: event?.eventId ?? null,
        participant_id: participantId,
        person_id: link.personId,
        provider_id: providerId,
        entry_status: entry?.entryStatus ?? null,
      });
    }
  }
  return rows;
}
