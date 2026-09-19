import { getTournamentTimeZone } from '@Query/tournaments/getTournamentTimeZone';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { getParticipantPresence } from '@Acquire/presenceAttestations';
import { requireParams } from '@Helpers/parameters/requireParams';
import { utcToWallClock } from '@Tools/timeZone';

// constants and types
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import type { PresenceAttestation } from '@Types/presenceTypes';
import { SIGNED_IN } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

/**
 * Where the zone used to resolve a calendar day came from.
 *
 * `none` means the instants were read in **UTC** because the record names no zone and the caller
 * supplied none. It is reported rather than hidden: a UTC day boundary is wrong for any venue west of
 * UTC in the evening, and a surface that can be wrong should be the surface that says so. TMX's
 * `venueTimeFrame` makes the same call for the same reason — the difference being that a browser has a
 * zone to fall back on and the factory does not.
 */
export type ZoneSource = 'supplied' | 'tournament' | 'venue' | 'none';

type PresenceHistoryArgs = { tournamentRecord: Tournament; participantId: string };

/**
 * The participant's presence history, oldest first — frame-free, on purpose.
 *
 * Returns instants and leaves the calendar-day question to the caller. A client that owns a venue time
 * frame (TMX does) should use this and apply its own framing rather than accept the factory's, because
 * only the client knows what to fall back to when the record names no zone.
 */
export function getParticipantPresenceHistory(params: PresenceHistoryArgs): {
  presence?: PresenceAttestation[];
  success?: boolean;
  error?: any;
} {
  const paramsCheck = requireParams(params, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  const { participant } = findTournamentParticipant({
    tournamentRecord: params.tournamentRecord,
    participantId: params.participantId,
  });
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  return { ...SUCCESS, presence: getParticipantPresence(participant) };
}

function resolveZone(tournamentRecord: Tournament, supplied?: string): { timeZone?: string; source: ZoneSource } {
  if (supplied) return { timeZone: supplied, source: 'supplied' };

  const resolved = getTournamentTimeZone({ tournamentRecord });
  // A conflicting-zone record resolves to nothing rather than to one of the candidates — picking would
  // be a guess presented as a fact.
  if (resolved.error || !resolved.timeZone) return { source: 'none' };

  return { timeZone: resolved.timeZone, source: resolved.inferred ? 'venue' : 'tournament' };
}

/** The calendar day an instant falls on, in the given zone. UTC when no zone resolves. */
function calendarDay(occurredAt: string, timeZone?: string): string {
  if (!timeZone) return String(occurredAt).slice(0, 10);
  const wallClock = utcToWallClock(occurredAt, timeZone);
  if ('error' in wallClock) return String(occurredAt).slice(0, 10);
  return wallClock.date;
}

type SignedInOnDateArgs = {
  tournamentRecord: Tournament;
  participantId: string;
  /** `YYYY-MM-DD` in the resolved zone */
  date: string;
  timeZone?: string;
};

/**
 * Was this person present on a given day?
 *
 * **Not "did they sign in at any point".** Somebody who signed in at 09:00 and out at 17:00 was not
 * present at 18:00, and the end-of-day close depends on that distinction holding.
 *
 * **A day with no entry is `false`, deliberately.** It means "not signed in on this date", never
 * "signed out" — no absence was ever recorded, and rendering an inference as a record is the trap this
 * whole surface exists to avoid. Callers should phrase it accordingly.
 *
 * Existing readers (`getParticipantSignInStatus`, the hydrated `participant.signedIn`) take the LATEST
 * value and cannot answer this: nothing signs anybody out at the end of a day, so a volunteer who
 * signed in on Thursday still reads SIGNED_IN on Sunday. The history is faithful; it is a history of a
 * thing whose end nobody records.
 */
export function getParticipantSignedInOnDate(params: SignedInOnDateArgs): {
  entries?: PresenceAttestation[];
  zoneSource?: ZoneSource;
  timeZone?: string;
  signedIn?: boolean;
  success?: boolean;
  error?: any;
} {
  const paramsCheck = requireParams(params, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  const history = getParticipantPresenceHistory(params);
  if (history.error) return history;

  const { timeZone, source } = resolveZone(params.tournamentRecord, params.timeZone);

  const entries = (history.presence ?? []).filter(
    (attestation) => attestation.occurredAt && calendarDay(attestation.occurredAt, timeZone) === params.date,
  );

  // `presence` is ordered by occurredAt, so the last entry on the day is this person's final recorded
  // action on it.
  const latest = entries.at(-1);

  return {
    signedIn: latest?.state === SIGNED_IN,
    zoneSource: source,
    ...SUCCESS,
    timeZone,
    entries,
  };
}

type StillSignedInArgs = { tournamentRecord: Tournament; date: string; timeZone?: string };

/**
 * Everyone still marked present on this date — the set an end-of-day action closes out.
 *
 * **Role-agnostic on purpose**, and this is the load-bearing difference from `signOutUnapproved`. That
 * action is COMPETITOR-scoped precisely because "signed in with no events" is the *definition* of an
 * official, a coach or a volunteer, so without its filter it would sign out the whole personnel roster.
 * Closing the day is the opposite intent: everybody still marked present should stop being, because the
 * day is over. The two must never be merged.
 */
export function getParticipantsStillSignedInOnDate(params: StillSignedInArgs) {
  const paramsCheck = requireParams(params, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;

  const { timeZone, source } = resolveZone(params.tournamentRecord, params.timeZone);

  const participantIds = (params.tournamentRecord.participants ?? [])
    .filter((participant) => {
      const entries = getParticipantPresence(participant).filter(
        (attestation) => attestation.occurredAt && calendarDay(attestation.occurredAt, timeZone) === params.date,
      );
      return entries.at(-1)?.state === SIGNED_IN;
    })
    .map((participant) => participant.participantId)
    .filter(Boolean);

  return { ...SUCCESS, participantIds, timeZone, zoneSource: source };
}
