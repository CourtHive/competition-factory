import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import tournamentEngine from '@Engines/syncEngine';
import { beforeEach, expect, it } from 'vitest';

// types and constants
import type { Applicant, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { MALE } from '@Constants/genderConstants';

/*
 * A sanctioning body states transit between the places played at, keyed by facilityId (CA 2026-10-25): a proposal's own
 * venueIds do not survive activation, since the canonical venues replace them. Activation states it for every pair of
 * the two facilities' venues, as a sanctioned floor a director may not undercut; a facility no venue carries is
 * reported, not dropped.
 */

const applicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Tennis Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};

const policy: SanctioningPolicy = { ...POLICY_SANCTIONING_GENERIC, requireEndorsement: false };

const venues: any[] = [
  { venueId: 'north-1', facilityId: 'north', venueName: 'North A', courts: [] },
  { venueId: 'north-2', facilityId: 'north', venueName: 'North B', courts: [] },
  { venueId: 'river-1', facilityId: 'river', venueName: 'Riverside', courts: [] },
];

function activate(venueTransits: TournamentProposal['venueTransits']) {
  const proposal: TournamentProposal = {
    tournamentName: 'Transit 2027',
    proposedStartDate: '2027-06-01',
    proposedEndDate: '2027-06-07',
    events: [{ eventName: "Men's Singles", eventType: SINGLES_EVENT, gender: MALE }],
    venueTransits,
  };
  sanctioningEngine.executionQueue([
    { method: 'createSanctioningRecord', params: { governingBodyId: 'gov-001', applicant, proposal } },
    { method: 'submitApplication', params: { sanctioningPolicy: policy } },
    { method: 'reviewApplication', params: {} },
    { method: 'approveApplication', params: {} },
  ]);
  return sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: policy, venues }) as any;
}

beforeEach(() => {
  sanctioningEngine.reset();
});

it('states a facility pair for every pair of their venues, as a sanctioned floor', () => {
  const activation = activate([{ facilityIds: ['north', 'river'], minutes: 40 }]);
  expect(activation.success).toEqual(true);
  const { venueTransits } = activation.tournamentRecord.scheduling;
  const { sanctioningId } = (sanctioningEngine.getSanctioningRecord() as any).sanctioningRecord;
  expect(typeof sanctioningId).toEqual('string');
  expect(venueTransits).toEqual([
    { venueIds: ['north-1', 'river-1'], minutes: 40, sanctioned: { minutes: 40, sanctioningId } },
    { venueIds: ['north-2', 'river-1'], minutes: 40, sanctioned: { minutes: 40, sanctioningId } },
  ]);
  expect(activation.unresolvedTransits).toBeUndefined();

  // the floor holds in the activated tournament: a director may raise it, never lower it
  tournamentEngine.setState(activation.tournamentRecord);
  expect(tournamentEngine.setVenueTransit({ venueIds: ['north-1', 'river-1'], minutes: 30 }).error).toEqual(
    INVALID_VALUES,
  );
  expect(tournamentEngine.setVenueTransit({ venueIds: ['north-1', 'river-1'], minutes: 50 }).success).toEqual(true);
  expect(tournamentEngine.getVenueTransits().transitPairs['river-1']['north-1']).toEqual(50);
});

it('keeps a one-way transit one way', () => {
  const activation = activate([{ facilityIds: ['river', 'north'], minutes: 25, oneWay: true }]);
  tournamentEngine.setState(activation.tournamentRecord);
  expect(tournamentEngine.getVenueTransits().transitPairs).toEqual({
    'river-1': { 'north-1': 25, 'north-2': 25 },
  });
});

it('reports a facility no activated venue carries, and a malformed transit, instead of dropping them', () => {
  const unknown = { facilityIds: ['north', 'elsewhere'], minutes: 30 };
  const sameFacility = { facilityIds: ['north', 'north'], minutes: 30 };
  const fractional = { facilityIds: ['north', 'river'], minutes: 12.5 };
  const activation = activate([unknown, sameFacility, fractional] as any);
  expect(activation.success).toEqual(true);
  expect(activation.tournamentRecord.scheduling).toBeUndefined();
  expect(activation.unresolvedTransits).toEqual([unknown, sameFacility, fractional]);
});
