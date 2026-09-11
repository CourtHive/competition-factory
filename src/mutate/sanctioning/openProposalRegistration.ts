import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_SANCTIONING_RECORD, MISSING_PROPOSAL, TERMINAL_STATUSES } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord } from '@Types/sanctioningTypes';
import type { RegistrationProfile } from '@Types/tournamentTypes';

type OpenProposalRegistrationArgs = {
  sanctioningRecord: SanctioningRecord;
  tournamentId?: string;
  registrationProfile?: Partial<RegistrationProfile>;
};

/**
 * Open (or adjust) public registration on a sanctioning proposal, BEFORE the
 * tournamentRecord exists. Assigns a `tournamentId` to the proposal (generating
 * one if absent) so courthive-public can render a registration page and people
 * can register against a proposal that has not yet been activated;
 * `activateFromSanctioning` later reuses this same id. Merges any supplied
 * `registrationProfile` fields and ensures `entriesOpen` is set (opening now if
 * no explicit value is provided/present).
 *
 * Gated only against terminal statuses (REJECTED / WITHDRAWN / CLOSED); the
 * consuming service (AMS) enforces any stricter workflow/policy. See
 * planning/PUBLIC_REGISTRATION_AND_ONBOARDING.md.
 */
export function openProposalRegistration({
  sanctioningRecord,
  tournamentId,
  registrationProfile,
}: OpenProposalRegistrationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };
  if (!sanctioningRecord.proposal) return { error: MISSING_PROPOSAL };
  if (TERMINAL_STATUSES.includes(sanctioningRecord.status)) {
    return {
      error: INVALID_VALUES,
      context: { message: `Cannot open registration from status: ${sanctioningRecord.status}` },
    };
  }

  const { proposal } = sanctioningRecord;
  const now = new Date().toISOString();

  proposal.tournamentId = tournamentId ?? proposal.tournamentId ?? UUID();

  // Assign a stable eventId to each proposed event (idempotent — reuse any already assigned).
  // activateFromSanctioning reuses these, so registrations reference events by a durable id.
  for (const eventProposal of proposal.events ?? []) {
    eventProposal.eventId ??= UUID();
  }

  proposal.registrationProfile = {
    ...(proposal.registrationProfile ?? {}),
    ...(registrationProfile ?? {}),
  };
  if (!proposal.registrationProfile.entriesOpen) {
    proposal.registrationProfile.entriesOpen = now;
  }

  sanctioningRecord.updatedAt = now;
  sanctioningRecord.version += 1;

  return { ...SUCCESS, tournamentId: proposal.tournamentId, registrationProfile: proposal.registrationProfile };
}
