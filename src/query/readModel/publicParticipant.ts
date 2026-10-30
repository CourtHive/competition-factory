import { getParticipantPrivacyTemplate } from '@Query/participants/participantPrivacy';
import { getParticipants } from '@Query/participants/getParticipants';

// constants and types
import { MISSING_POLICY_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import type { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import type { Tournament } from '@Types/tournamentTypes';
import type { HydratedParticipant } from '@Types/hydrated';
import { COMPETITOR } from '@Constants/participantRoleValues';

/** Every attribute optional, all the way down: a privacy template may deny any of them. */
type Redacted<T> = T extends (infer U)[] ? Redacted<U>[] : T extends object ? { [K in keyof T]?: Redacted<T[K]> } : T;

export type PublicParticipant = Redacted<Omit<HydratedParticipant, 'individualParticipants'>>;

/**
 * One public participant document: keyed by `participantId` (kept outside the body, since
 * a template may deny it), with the hash of the policy that produced it.
 */
export type PublicParticipantDocument = {
  participant: PublicParticipant;
  participantId: string;
  policyHash: string;
};

// Bumped whenever the canonical form below changes, so a stored hash from an older
// form can never compare equal to a new one by accident.
const POLICY_HASH_VERSION = 'pp1';

/**
 * A stable fingerprint of the participant attribute template a privacy policy carries.
 * Stored beside every public participant document, so a reader can tell which policy
 * produced it. Only the template is hashed: renaming a policy changes nothing a reader
 * sees, so it must not change the hash. Key order does not matter; every value does.
 */
export function participantPolicyHash(policyDefinitions?: PolicyDefinitions): string | undefined {
  const template = getParticipantPrivacyTemplate(policyDefinitions);
  if (!template) return undefined;
  return `${POLICY_HASH_VERSION}:${cyrb53(canonical(template))}`;
}

type PublicParticipantDocumentsArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
};

/**
 * The public participant documents of a tournament, under a privacy policy passed
 * explicitly.
 *
 * Built on `getParticipants`, the engine's participant emission boundary, so a document
 * holds exactly what that boundary emits under the same policy (scale values included)
 * and the privacy rules are not restated here. Documents are flat: a PAIR or TEAM
 * carries `individualParticipantIds`, and each individual is its own document. Only
 * competitors are public; GROUPs and non-competitor roles are not.
 *
 * The policy is never read from the record here. A producer that keeps a tournament's
 * policy on the record reads it out and passes it in, so the engine's internal reads
 * (eligibility gates read `person.sex`) never see a filter. Fails closed: without a
 * participant template the result is an error, never an unfiltered document.
 */
export function publicParticipantDocuments({
  policyDefinitions,
  tournamentRecord,
}: PublicParticipantDocumentsArgs): ResultType & { documents?: PublicParticipantDocument[]; policyHash?: string } {
  if (!getParticipantPrivacyTemplate(policyDefinitions)) return { error: MISSING_POLICY_DEFINITION };
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { participants, error } = getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL, PAIR, TEAM] },
    withScaleValues: true,
    policyDefinitions,
    tournamentRecord,
  });
  if (error) return { error };

  const policyHash = participantPolicyHash(policyDefinitions) as string;
  const documents = (participants ?? [])
    .filter((participant) => !participant.participantRole || participant.participantRole === COMPETITOR)
    .map((participant) => ({
      participantId: participant.participantId,
      participant: participant as PublicParticipant,
      policyHash,
    }));

  return { documents, policyHash };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : 1));
    const entries = keys.map((key) => JSON.stringify(key) + ':' + canonical(record[key]));
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// 53-bit string hash (cyrb53). Pure and dependency-free: the factory runs in browsers too.
function cyrb53(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
