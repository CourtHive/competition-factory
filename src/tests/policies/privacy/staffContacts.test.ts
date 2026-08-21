/**
 * `tournamentContacts` is the one participant population the caller's policy does NOT govern.
 *
 * `getTournamentInfo` filters it with `POLICY_PRIVACY_STAFF` and accepts no `policyDefinitions` of its
 * own, so a caller supplying a strict competitor policy still receives contacts shaped by the staff
 * policy. That is deliberate — a contact stripped of `participantRoleResponsibilities` is not a
 * contact — and it is the reason the general suite excludes the subtree rather than judging it by the
 * wrong rules.
 *
 * Excluding it is only defensible if it is asserted here instead, which is what this file does: the
 * staff policy is honoured on the staff population, and the personal attributes both policies deny are
 * absent either way. If the design changes so that the caller's policy caps the staff policy, this
 * file is where that becomes visible.
 */

import { analysePolicyConformance, describeViolations } from '@Tests/testHarness/privacyConformance';
import { generatePrivacyFixture, STAFF_PARTICIPANT_ID } from '@Tests/testHarness/privacyFixture';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

import POLICY_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import POLICY_PRIVACY_STAFF from '@Fixtures/policies/POLICY_PRIVACY_STAFF';

const fixture = generatePrivacyFixture();

const contacts = () => tournamentEngine.getTournamentInfo().tournamentInfo.tournamentContacts;

describe('tournamentContacts', () => {
  it('exists — the control, without which every assertion below is vacuous', () => {
    const tournamentContacts = contacts();
    expect(tournamentContacts.length).toBeGreaterThan(0);
    expect(tournamentContacts.some((contact: any) => contact.participantId === STAFF_PARTICIPANT_ID)).toEqual(true);
    // the staff participant on the record really does carry the attributes asserted absent below
    const record = fixture.participants.find((p: any) => p.participantId === STAFF_PARTICIPANT_ID);
    expect(record.person.sex).toBeDefined();
    expect(record.person.personId).toBeDefined();
    expect(record.participantRoleResponsibilities?.length).toBeGreaterThan(0);
  });

  it('honours POLICY_PRIVACY_STAFF in full', () => {
    const analysis = analysePolicyConformance({
      participants: fixture.participants,
      policyDefinitions: POLICY_PRIVACY_STAFF,
      node: contacts(),
    });
    expect(analysis.unpermitted.participantsScanned).toBeGreaterThan(0);
    expect(analysis.forbidden.length).toBeGreaterThan(0);
    expect(describeViolations(analysis)).toEqual([]);
  });

  it('carries participantRoleResponsibilities, which the competitor policy denies and the staff policy permits', () => {
    // The single, deliberate divergence between the two policies on this surface. Naming it here means
    // a future change that removes it fails a test rather than passing silently.
    const withResponsibilities = contacts().filter((c: any) => c.participantRoleResponsibilities !== undefined);
    expect(withResponsibilities.length).toBeGreaterThan(0);

    const analysis = analysePolicyConformance({
      participants: fixture.participants,
      policyDefinitions: POLICY_PRIVACY_DEFAULT,
      node: contacts(),
    });
    expect(new Set(describeViolations(analysis).map((violation) => violation.split(' @ ')[0]))).toEqual(
      new Set(['participantRoleResponsibilities']),
    );
  });

  it('denies the personal attributes both policies deny', () => {
    for (const contact of contacts()) {
      expect(contact.person?.sex).toBeUndefined();
      expect(contact.person?.personId).toBeUndefined();
      expect(contact.person?.birthDate).toBeUndefined();
      expect(contact.person?.addresses).toBeUndefined();
      expect(contact.contacts).toBeUndefined();
      expect(contact.penalties).toBeUndefined();
    }
  });
});
