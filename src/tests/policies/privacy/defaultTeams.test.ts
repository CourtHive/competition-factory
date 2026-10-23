/**
 * POLICY_PRIVACY_DEFAULT publishes the teams an individual belongs to, limited to identity and names.
 *
 * Draw displays with participant detail TEAM read `individualParticipant.teams[0].participantName`. A public
 * reader running under the default used to get a blank line there, because the default had no `teams` key
 * and the attribute filter dropped it. A school or team name is not private; the team's contacts, online
 * resources, members and role responsibilities are, and the element template keeps them out.
 */

import { generatePrivacyFixture } from '@Tests/testHarness/privacyFixture';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import POLICY_PRIVACY_DEFAULT from '@Fixtures/policies/POLICY_PRIVACY_DEFAULT';
import { POLICY_TYPE_PARTICIPANT } from '@Constants/policyConstants';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';

const ALLOWED_TEAM_KEYS = ['participantId', 'participantName', 'participantOtherName', 'participantType'];

const fixture = generatePrivacyFixture();

const teamNameOf = (participantId: string) =>
  fixture.participants.find(
    (participant: any) =>
      participant.participantType === TEAM && participant.individualParticipantIds?.includes(participantId),
  )?.participantName;

const filtered = () =>
  tournamentEngine.getParticipants({
    policyDefinitions: POLICY_PRIVACY_DEFAULT,
    withIndividualParticipants: true,
    withGroupings: true,
  }).participants;

describe('POLICY_PRIVACY_DEFAULT publishes teams', () => {
  it('names the same limited team shape in both participant blocks', () => {
    const template: any = POLICY_PRIVACY_DEFAULT[POLICY_TYPE_PARTICIPANT].participant;
    for (const block of [template, template.individualParticipants]) {
      expect(Object.keys(block.teams).sort((a, b) => a.localeCompare(b, 'en'))).toEqual(ALLOWED_TEAM_KEYS);
    }
    // groups stay unnamed: a GROUP is a relationship primitive, not a public affiliation
    expect(template.groups).toBeUndefined();
    expect(template.individualParticipants.groups).toBeUndefined();
  });

  it("every team member carries its team's name at the top level", () => {
    const members = filtered().filter(
      (participant: any) => participant.participantType === INDIVIDUAL && teamNameOf(participant.participantId),
    );
    // control: the fixture's team event really put individuals on teams
    expect(members.length).toBeGreaterThan(0);
    for (const member of members) {
      expect(member.teams?.[0]?.participantName).toEqual(teamNameOf(member.participantId));
    }
  });

  it('nested individualParticipants carry it too', () => {
    const nested = filtered()
      .filter((participant: any) => participant.participantType === TEAM)
      .flatMap((team: any) => team.individualParticipants ?? []);
    expect(nested.length).toBeGreaterThan(0);
    for (const member of nested) {
      expect(member.teams?.[0]?.participantName).toEqual(teamNameOf(member.participantId));
    }
  });

  it('each team entry holds only identity and names, never the team record behind it', () => {
    const team = fixture.participants.find((participant: any) => participant.participantType === TEAM);
    // control: the saturated fixture gives the team data that must not travel with its name
    expect(team.contacts?.length ?? team.participantRoleResponsibilities?.length).toBeGreaterThan(0);

    const entries = [
      ...filtered().flatMap((participant: any) => participant.teams ?? []),
      ...filtered().flatMap((participant: any) =>
        (participant.individualParticipants ?? []).flatMap((member: any) => member.teams ?? []),
      ),
    ];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(Object.keys(entry).filter((key) => !ALLOWED_TEAM_KEYS.includes(key))).toEqual([]);
    }
  });
});
