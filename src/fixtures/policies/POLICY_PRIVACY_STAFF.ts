import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';

/**
 * Contact fields published for tournament staff.
 *
 * `tournamentContacts` previously carried names and roles with **no way to contact anyone** — this
 * policy stripped `contacts` at both the participant and person level, so a field literally named
 * "contacts" published none. The point of the list is that a competitor, a visiting official or a
 * parent can reach the people running the event.
 *
 * Which contacts appear is decided BEFORE this template runs, by `getTournamentInfo` selecting on
 * `Contact.isPublic === true`. That selection cannot live here: a template array acts as an allow-list
 * (`attributeFilter.ts:49-51`) but is only evaluated for keys the source object actually has, so a
 * contact with no `isPublic` would pass unexamined — fail-open, and every contact in existence lacks the
 * flag today because nothing writes it.
 */
const PUBLISHED_CONTACT_FIELDS = {
  emailAddress: true,
  mobileTelephone: true,
  name: true,
  telephone: true,
  // `isPublic` must survive the filter, because the predicate that consumes it runs AFTER the policy —
  // the policy is applied inside `getParticipants`, and `getTournamentInfo` selects on the result. Strip
  // it here and every contact arrives flagless, which reads as "not opted in" and publishes nothing.
  // Emitting the flag alongside the contact is also honest: it states the basis on which it was shared.
  isPublic: true,
};

export const POLICY_PRIVACY_STAFF = {
  [POLICY_TYPE_PARTICIPANT]: {
    policyName: 'Staff Privacy Policy',
    participant: {
      // Participant-level `contacts` stays denied. A staff member is an INDIVIDUAL and their contact
      // details live on `person.contacts`; widening both would publish a second surface for no gain.
      contacts: false,
      individualParticipants: false,
      individualParticipantIds: false,
      onlineResources: false,
      participantName: true,
      participantOtherName: true,
      participantId: true,
      participantRole: true,
      participantRoleResponsibilities: true,
      participantStatus: true,
      penalties: false,
      representing: true,
      participantType: true,
      person: {
        addresses: false,
        biographicalInformation: false,
        birthDate: false,
        contacts: PUBLISHED_CONTACT_FIELDS,
        nationalityCode: true,
        nativeFamilyName: false,
        nativeGivenName: false,
        onlineResources: false,
        otherNames: true,
        parentOrganisationId: false,
        passportFamilyName: false,
        passportGivenName: false,
        personId: false,
        personOtherIds: false,
        previousNames: false,
        sex: false,
        standardFamilyName: true,
        standardGivenName: true,
        status: false,
        tennisId: false,
        wheelchair: true,
      },
    },
  },
};

export default POLICY_PRIVACY_STAFF;
