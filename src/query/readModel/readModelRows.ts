import { LINK_UNRESOLVED, resolvePersonLink } from './personRule';

// types
import {
  ReadModelTournamentRow,
  ReadModelCompetitorRow,
  ReadModelMatchUpRow,
  ReadModelEntryRow,
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
}

export interface MatchUpRowSet {
  matchUpRows: ReadModelMatchUpRow[];
  competitorRows: ReadModelCompetitorRow[];
}

// ── tournaments ────────────────────────────────────────────────────────────────

export function tournamentRow(record: any): ReadModelTournamentRow {
  return {
    tournament_id: record?.tournamentId,
    tournament_name: record?.tournamentName ?? null,
    provider_id: record?.parentOrganisation?.organisationId ?? null,
    start_date: record?.startDate ?? null,
    end_date: record?.endDate ?? null,
    city: record?.tournamentContacts?.[0]?.city ?? record?.city ?? null,
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
  return matchUp?.schedule?.scheduledDate ?? matchUp?.scheduledDate ?? null;
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
    match_up_status: matchUp?.matchUpStatus ?? null,
    winning_side: matchUp?.winningSide ?? null,
    score_string: winnerPerspectiveScore(matchUp),
    tie_value: tieValue,
    scheduled_date: matchUpScheduledDate(matchUp),
    published: ctx.published,
    embargo: ctx.embargo,
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
  matchUpRows.push(matchUpRow(matchUp, isTeam ? LEVEL_TIE : LEVEL_STANDARD, null, ctx, null));
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
