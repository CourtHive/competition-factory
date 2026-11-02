import { getHomeParticipantId } from '@Query/matchUp/getHomeParticipantId';
import { findCourt } from '@Query/venues/findCourt';
import { findMatchUp } from '@Acquire/findMatchUp';

// constants and types
import { ErrorType, MISSING_MATCHUP, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Participant, Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import { EXPLICIT, HomeParticipantBasis, HOST_ORGANISATION, NONE, VENUE } from '@Constants/homeParticipantConstants';

type ResolveHomeParticipantIdArgs = {
  /** A hydrated matchUp ({ inContext: true }); when absent it is found from `matchUpId`. */
  matchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUpId?: string;
  event?: Event;
};

export type ResolvedHomeParticipant = {
  /** Absent when `basis` is NONE: there is no home participant, and no side is assumed. */
  homeParticipantId?: string;
  basis: HomeParticipantBasis;
};

type SideParticipant = Participant | HydratedParticipant;

/**
 * Which side of a matchUp is at home, and on what basis. Read-only: it infers at read time and NEVER writes, so
 * `setMatchUpHomeParticipantId` stays the only stored fact.
 *
 * Precedence; a signal counts only when it singles out EXACTLY ONE side:
 * 1. EXPLICIT: `matchUp.schedule.homeParticipantId` (or its legacy timeItem), when it names one of the sides.
 * 2. VENUE: the matchUp's venue (`schedule.venueId`, else the venue of `schedule.courtId`) is in one side's
 *    `homeVenueIds`.
 * 3. HOST_ORGANISATION: the tournament owner (`parentOrganisation.organisationId`) issued an id to one side, i.e. it
 *    appears as `organisationId` on an entry of that side's `participantOtherIds` that carries a `participantId`.
 *    Team identity is matched on `participantOtherIds`, never on the tournament-local participantId.
 *    `tournamentRecord.parentOrganisationId` is not used: it names a governing body, not the host.
 * 4. NONE: no signal, or a signal matches both sides (same school, shared venue). No side is assumed; in
 *    particular side 1 is NOT the home side.
 *
 * Who is viewing is not a signal: the answer is a fact of the record.
 */
export function resolveHomeParticipantId(
  params: ResolveHomeParticipantIdArgs,
): (ResolvedHomeParticipant & { success: boolean }) | { error: ErrorType } {
  const { matchUp, error } = params.matchUp?.hasContext
    ? { matchUp: params.matchUp, error: undefined }
    : resolve(params);
  if (error || !matchUp) return { error: error ?? MISSING_MATCHUP };

  const { tournamentRecord } = params;
  const sideParticipantIds = (matchUp.sides ?? [])
    .map((side) => side?.participantId)
    .filter((participantId): participantId is string => !!participantId);

  const explicit = getHomeParticipantId({ matchUp }) as { homeParticipantId?: string };
  if (explicit.homeParticipantId && sideParticipantIds.includes(explicit.homeParticipantId))
    return { homeParticipantId: explicit.homeParticipantId, basis: EXPLICIT, ...SUCCESS };

  // the record's own participant is preferred: a hydrated side may have been filtered by a participantsProfile
  const recordParticipants = new Map(
    (tournamentRecord?.participants ?? []).map((participant) => [participant.participantId, participant]),
  );
  const sides: { participantId: string; participant?: SideParticipant }[] = sideParticipantIds.map((participantId) => ({
    participant:
      recordParticipants.get(participantId) ??
      matchUp.sides?.find((side) => side?.participantId === participantId)?.participant,
    participantId,
  }));

  const venueId = getMatchUpVenueId({ matchUp, tournamentRecord });
  const venueHome = venueId && exactlyOne(sides, ({ participant }) => !!participant?.homeVenueIds?.includes(venueId));
  if (venueHome) return { homeParticipantId: venueHome, basis: VENUE, ...SUCCESS };

  const hostOrganisationId = tournamentRecord?.parentOrganisation?.organisationId;
  const hostHome =
    hostOrganisationId &&
    exactlyOne(
      sides,
      ({ participant }) =>
        !!participant?.participantOtherIds?.some(
          (issued) => issued?.organisationId === hostOrganisationId && !!issued?.participantId,
        ),
    );
  if (hostHome) return { homeParticipantId: hostHome, basis: HOST_ORGANISATION, ...SUCCESS };

  return { basis: NONE, ...SUCCESS };
}

function exactlyOne(
  sides: { participantId: string; participant?: SideParticipant }[],
  matches: (side: { participantId: string; participant?: SideParticipant }) => boolean,
): string | undefined {
  const matching = sides.filter(matches);
  return matching.length === 1 ? matching[0].participantId : undefined;
}

function getMatchUpVenueId({
  matchUp,
  tournamentRecord,
}: {
  matchUp: HydratedMatchUp;
  tournamentRecord?: Tournament;
}): string | undefined {
  const { venueId, courtId } = matchUp.schedule ?? {};
  if (venueId) return venueId;
  if (!courtId || !tournamentRecord) return undefined;
  return findCourt({ tournamentRecord, courtId }).venue?.venueId;
}

function resolve(params: ResolveHomeParticipantIdArgs): { matchUp?: HydratedMatchUp; error?: ErrorType } {
  const { tournamentRecord, drawDefinition, event } = params;
  const matchUpId = params.matchUpId ?? params.matchUp?.matchUpId;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP };
  return findMatchUp({ tournamentRecord, drawDefinition, matchUpId, event, inContext: true });
}
