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
