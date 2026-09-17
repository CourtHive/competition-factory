import { isTournamentPublished } from '@Query/publishing/isTournamentPublished';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import tournamentEngine from '@Engines/syncEngine';
import { beforeEach, expect, it } from 'vitest';

// Fixtures
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

// types
import type { Applicant, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

/**
 * Activation carries public registration across (P23 option A, D6).
 *
 * A proposal whose registration was opened is already public on its registration page. Activating it
 * must not create a record that is dark: the information is published, scoped to exactly the events that
 * were open for registration. A proposal that never opened registration activates unpublished, as before.
 */

const applicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Tennis Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};

const proposal: TournamentProposal = {
  tournamentName: 'Registration Open 2027',
  proposedStartDate: '2027-06-01',
  proposedEndDate: '2027-06-07',
  events: [
    { eventName: "Men's Singles", eventType: 'SINGLES', gender: 'MALE' },
    { eventName: "Women's Singles", eventType: 'SINGLES', gender: 'FEMALE' },
  ],
};

const policy: SanctioningPolicy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };

function approve() {
  sanctioningEngine.executionQueue([
    { method: 'createSanctioningRecord', params: { governingBodyId: 'gov-001', applicant, proposal } },
    { method: 'submitApplication', params: { sanctioningPolicy: policy } },
    { method: 'reviewApplication', params: {} },
    { method: 'approveApplication', params: {} },
  ]);
}

beforeEach(() => {
  sanctioningEngine.reset();
});

it('publishes the information of a proposal whose registration was opened, scoped to its events', () => {
  approve();
  sanctioningEngine.openProposalRegistration({ registrationProfile: { entriesOpen: '2027-04-01' } });

  const activation: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: policy });
  expect(activation.success).toBe(true);
  const { tournamentRecord } = activation;
  const eventIds = tournamentRecord.events.map((event: any) => event.eventId);
  expect(eventIds).toHaveLength(2);

  expect(isTournamentPublished(tournamentRecord)).toBe(true);
  tournamentEngine.setState(tournamentRecord);
  const { publishState } = tournamentEngine.getPublishState();
  expect(publishState.tournament.info).toEqual({ published: true, eventIds });
  // registration window travels unchanged; publishing did not move it
  expect(tournamentRecord.registrationProfile.entriesOpen).toEqual('2027-04-01');

  const listed = tournamentEngine.getTournamentInfo({ usePublishState: true }).tournamentInfo.eventInfo;
  expect(listed.map((info: any) => info.eventId)).toEqual(eventIds);
});

it('activates a proposal that never opened registration unpublished', () => {
  approve();

  const activation: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: policy });
  expect(activation.success).toBe(true);

  expect(isTournamentPublished(activation.tournamentRecord)).toBe(false);
  expect(activation.tournamentRecord.timeItems).toEqual([]);
});
