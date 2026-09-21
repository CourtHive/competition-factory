import { attributeFilter } from '@Tools/attributeFilter';

// constants and types
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';

/**
 * The `participant` attribute template of a supplied participant privacy policy, or `undefined` when
 * no policy was supplied. `undefined` means "no filtering was requested" — never "filter everything".
 */
export function getParticipantPrivacyTemplate(policyDefinitions?: PolicyDefinitions): any {
  return policyDefinitions?.[POLICY_TYPE_PARTICIPANT]?.participant;
}

/**
 * Apply a participant privacy template at an EMISSION BOUNDARY — the point where participants leave
 * the engine — rather than at hydration.
 *
 * Hydration deliberately keeps participants whole: `getScaleValues` reads `timeItems`, `findParticipant`
 * resolves by `personId`, and gender enforcement reads `person.sex`. A policy that denies any of those
 * would silently break context assembly if the filter were applied upstream, so the filter is applied
 * to the copy that is returned and to nothing else.
 *
 * Returns a new array; the input participants are not mutated. Filtering ATTRIBUTES never removes a
 * participant — the returned array has the same length and the same entities as the input, whatever
 * the policy denies.
 */
export function applyParticipantPrivacy<T = any>(params: { participants?: T[]; template?: any }): T[] | undefined {
  const { participants, template } = params;
  if (!template || !participants?.length) return participants;
  return participants.map((source) => attributeFilter({ source, template }));
}

/**
 * `groupInfo` is a `{ participantId, participantName }` lookup for the TEAM / GROUP / PAIR entities an
 * individual belongs to. It is participant data under a different shape, so a policy that denies
 * `participantName` must deny it here too — the entry survives (an entity is never removed), stripped
 * to what the policy permits.
 */
export function applyParticipantPrivacyToGroupInfo(params: { groupInfo?: any; template?: any }): any {
  const { groupInfo, template } = params;
  if (!template || !groupInfo) return groupInfo;

  const filtered = {};
  for (const [participantId, group] of Object.entries<any>(groupInfo)) {
    filtered[participantId] = attributeFilter({ source: group, template });
  }
  return filtered;
}

/**
 * The same boundary treatment for a `participantMap`, whose entries hold the participant alongside
 * per-participant aggregations (matchUps, events, draws, opponents, scheduleItems).
 *
 * Only the `participant` is replaced — the aggregations are keyed by id and carry no participant
 * attributes of their own. A new map is built so the caller's working copy, which the engine still
 * reads from, is left intact.
 */
export function applyParticipantPrivacyToMap(params: { participantMap?: any; template?: any }): any {
  const { participantMap, template } = params;
  if (!template || !participantMap) return participantMap;

  const filtered = {};
  for (const [participantId, entry] of Object.entries<any>(participantMap)) {
    filtered[participantId] = entry?.participant
      ? { ...entry, participant: attributeFilter({ source: entry.participant, template }) }
      : entry;
  }
  return filtered;
}

/**
 * Remove the ATTESTER from every presence log on a participant, unconditionally.
 *
 * `attributedTo` is the one participant attribute that is not policy-optional. A `DECLARED`
 * attribution carries a name, telephone and email for somebody who is **not in the record at all** —
 * a minor's parent at the desk — so it is governed by nothing `person.contacts` is governed by, and
 * it has no `isPublic` flag to respect.
 *
 * Stripping it here rather than adding it to the privacy policy is deliberate and is the decision
 * recorded as D-PRIV. Policy-based protection fails open: `getParticipants` returns the source
 * unfiltered when no template is supplied, and the CFS public participants route supplies none. A
 * protection that depends on every public caller remembering a flag is a protection that gets missed
 * once, and once is enough for a phone number.
 *
 * The rest of the attestation survives — who was present, when, and whether they left are the facts
 * the surface exists to report. `notes` survives too, being an operator annotation of the same kind
 * as `participant.notes`, which no boundary strips either.
 *
 * Read attribution deliberately, through `getParticipantPresenceHistory`, which a caller has to ask
 * for by name and a server can gate on permissions.
 */
export function stripPresenceAttribution<T = any>(participants?: T[]): T[] | undefined {
  if (!participants?.length) return participants;
  return participants.map((participant: any) => strippedParticipant(participant));
}

/**
 * `individualParticipants` is a SECOND emission of the same people, nested inside a PAIR/TEAM and
 * sourced from the unfiltered map. Stripping only the top level would leave every doubles player's
 * attester intact — the same "a second emission of the same people" shape that already caused a
 * published-attribute leak through `participantMap`.
 */
export function strippedParticipant(participant: any): any {
  if (!participant) return participant;

  const presence = Array.isArray(participant.presence) ? participant.presence.map(withoutAttribution) : undefined;
  const individualParticipants = Array.isArray(participant.individualParticipants)
    ? participant.individualParticipants.map(strippedParticipant)
    : undefined;

  if (!presence && !individualParticipants) return participant;

  return {
    ...participant,
    ...(presence ? { presence } : {}),
    ...(individualParticipants ? { individualParticipants } : {}),
  };
}

/** The matchUp-scoped counterpart — `matchUp.checkIns` carries the same attester. */
export function stripCheckInAttribution<T = any>(matchUps?: T[]): T[] | undefined {
  if (!matchUps?.length) return matchUps;
  return matchUps.map((matchUp: any) => {
    if (!Array.isArray(matchUp?.checkIns)) return matchUp;
    return { ...matchUp, checkIns: matchUp.checkIns.map(withoutAttribution) };
  });
}

function withoutAttribution(attestation: any): any {
  if (!attestation?.attributedTo) return attestation;
  const { attributedTo: _attributedTo, ...rest } = attestation;
  return rest;
}

/** The participantMap counterpart of {@link stripPresenceAttribution}. */
export function stripPresenceAttributionFromMap(participantMap?: any): any {
  if (!participantMap) return participantMap;

  const stripped = {};
  for (const [participantId, entry] of Object.entries<any>(participantMap)) {
    stripped[participantId] = entry?.participant
      ? { ...entry, participant: strippedParticipant(entry.participant) }
      : entry;
  }
  return stripped;
}
