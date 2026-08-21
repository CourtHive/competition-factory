/**
 * Saturate a tournament record's participants with a value for every attribute a participant privacy
 * policy can filter.
 *
 * Why this exists: "the response does not contain `birthDate`" proves nothing if no participant in
 * the fixture ever had a `birthDate`. mocksEngine emits a deliberately sparse person (personId,
 * addresses, standard names, nationalityCode, sex), so most of what `POLICY_PRIVACY_DEFAULT` marks
 * `false` has no value to leak and every assertion about it is vacuous.
 *
 * Values are derived from the participantId so each is unique to its participant. That matters for
 * the value-matching detector in `privacyConformance.ts`: a shared literal would collide across
 * participants and turn a precise "this person's native family name reached the response" into a
 * guess.
 *
 * `assertSaturationCovers` is the control. It fails if the policy names an attribute `false` that
 * saturation left empty — so extending the policy without extending the fixture is caught here
 * rather than silently degrading every downstream assertion to vacuity.
 */

import { isObject } from '@Tools/objects';

import type { AttributeTemplate } from './privacyConformance';

/** Attributes saturated on every participant, whatever its participantType. */
function participantSaturation(participantId: string) {
  return {
    contacts: [
      { firstName: 'Emergency', lastName: `Contact-${participantId}`, email: `${participantId}@example.test` },
    ],
    onlineResources: [
      { name: 'website', identifier: `https://example.test/participant/${participantId}`, resourceType: 'URL' },
    ],
    penalties: [
      { penaltyId: `penalty-${participantId}`, penaltyType: 'BALL_ABUSE', notes: `penalty-${participantId}` },
    ],
    participantRoleResponsibilities: [`RESPONSIBILITY-${participantId}`],
    participantOtherName: `OtherName-${participantId}`,
    participantStatus: 'ACTIVE',
    representing: `REP-${participantId}`,
  };
}

/** Attributes saturated on every `person`. */
function personSaturation(participantId: string) {
  return {
    biographicalInformation: [{ bioType: 'NOTE', value: `bio-${participantId}` }],
    contacts: [{ firstName: 'Person', lastName: `Contact-${participantId}` }],
    onlineResources: [
      { name: 'social', identifier: `https://example.test/person/${participantId}`, resourceType: 'URL' },
    ],
    personOtherIds: [{ organisationId: `org-${participantId}`, personId: `other-${participantId}` }],
    previousNames: [{ standardFamilyName: `Previous-${participantId}` }],
    otherNames: [{ standardGivenName: `Alias-${participantId}` }],
    parentOrganisationId: `parentOrg-${participantId}`,
    passportFamilyName: `Passport-${participantId}`,
    passportGivenName: `Given-${participantId}`,
    nativeFamilyName: `Native-${participantId}`,
    nativeGivenName: `NativeGiven-${participantId}`,
    tennisId: `tennisId-${participantId}`,
    birthDate: '1999-09-09',
    status: 'ACTIVE',
    wheelchair: false,
  };
}

/** Mutates `tournamentRecord.participants` in place. Call BEFORE `setState`. */
export function saturateParticipants({ tournamentRecord }: { tournamentRecord: any }): { saturatedCount: number } {
  let saturatedCount = 0;
  for (const participant of tournamentRecord?.participants ?? []) {
    if (!isObject(participant)) continue;
    Object.assign(participant, participantSaturation(participant.participantId));
    if (isObject(participant.person)) Object.assign(participant.person, personSaturation(participant.participantId));
    saturatedCount += 1;
  }
  return { saturatedCount };
}

/** Dotted paths of every attribute the template marks `false`, at any depth. */
export function templateDeniedPaths(template?: AttributeTemplate): string[] {
  const denied: string[] = [];
  collect(template, '');
  return denied;

  function collect(node: any, path: string) {
    if (!isObject(node)) return;
    for (const [attribute, value] of Object.entries(node)) {
      const attributePath = path ? `${path}.${attribute}` : attribute;
      if (value === false) denied.push(attributePath);
      else if (isObject(value)) collect(value, attributePath);
    }
  }
}

/**
 * The control: every attribute the policy denies must actually hold a value on the record, or the
 * assertion that it is absent from a response is vacuous.
 *
 * Returns the denied paths that saturation did NOT cover. An empty array is the passing case.
 */
export function uncoveredDeniedPaths(params: { participants?: any[]; template?: AttributeTemplate }): string[] {
  const { participants, template } = params;
  return templateDeniedPaths(template).filter((deniedPath) => !participants?.some((p) => holdsValue(p, deniedPath)));

  function holdsValue(participant: any, deniedPath: string): boolean {
    // `individualParticipants` is hydrated from `individualParticipantIds`, so that is where the
    // record holds the value a policy denying it would have to remove.
    if (deniedPath === 'individualParticipants') return !!participant?.individualParticipantIds?.length;
    // Elsewhere `individualParticipants` is a policy sub-template, not a record attribute: individual
    // participants live in the flat `participants` array and are covered by their own entries.
    const segments = deniedPath.replace('individualParticipants.', '').split('.');
    let node = participant;
    for (const segment of segments) {
      if (Array.isArray(node)) node = node[0];
      if (!isObject(node)) return false;
      node = node[segment];
    }
    if (node === undefined || node === null) return false;
    if (Array.isArray(node)) return node.length > 0;
    // An empty object is not a value: `{ }` under `ratings` would let a denied attribute count as
    // covered while having nothing to leak, which is the vacuity this control exists to catch.
    if (typeof node === 'object') return Object.keys(node).length > 0;
    return true;
  }
}
