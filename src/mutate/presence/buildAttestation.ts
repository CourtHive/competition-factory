import { UUID } from '@Tools/UUID';

// types
import type { Attribution, PresenceAttestation, PresenceStateUnion } from '@Types/presenceTypes';

type BuildAttestationArgs = {
  /** caller-supplied so a mutation replayed after a disconnected sync is recognisable as the same fact */
  attestationId?: string;
  attributedTo?: Attribution;
  participantId: string;
  state: PresenceStateUnion;
  /** ISO — when the presence HAPPENED. Defaults to now, so existing callers are unaffected */
  occurredAt?: string;
  notes?: string;
};

/**
 * Mint one {@link PresenceAttestation}.
 *
 * `occurredAt` and `recordedAt` are separate and both are set here, because the whole point of the
 * promotion is that they can differ: a desk records an arrival at 09:05 on a tablet that syncs at
 * 14:00. `occurredAt` resolves presence and orders the log; `recordedAt` is audit only. Before the
 * promotion a timeItem's `createdAt` was both, so a late sync silently re-dated the fact AND changed
 * what "latest" resolved to.
 */
export function buildAttestation({
  attestationId,
  participantId,
  attributedTo,
  occurredAt,
  state,
  notes,
}: BuildAttestationArgs): PresenceAttestation {
  const now = new Date().toISOString();
  const attestation: PresenceAttestation = {
    attestationId: attestationId ?? UUID(),
    occurredAt: occurredAt ?? now,
    recordedAt: now,
    participantId,
    state,
  };
  if (attributedTo) attestation.attributedTo = attributedTo;
  if (notes) attestation.notes = notes;
  return attestation;
}
