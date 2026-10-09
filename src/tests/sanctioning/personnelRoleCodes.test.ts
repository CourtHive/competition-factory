import { validateProposal } from '@Validators/sanctioning/validateProposal';
import { describe, expect, it } from 'vitest';

// Fixtures
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';
import { POLICY_SANCTIONING_ITF } from '@Fixtures/policies/POLICY_SANCTIONING_ITF';

// types
import type { PersonnelRole, SanctioningPolicy, TournamentProposal } from '@Types/sanctioningTypes';

const baseProposal: TournamentProposal = {
  tournamentName: 'Personnel Open 2027',
  proposedStartDate: '2027-06-01',
  proposedEndDate: '2027-06-07',
  events: [],
  tournamentDirector: { personName: 'Alice Director' },
  referee: { personName: 'Bob Referee' },
};

function policyWith(roles: PersonnelRole[]): SanctioningPolicy {
  return { ...POLICY_SANCTIONING_GENERIC, tiers: [], personnelRules: { roles } };
}

function personnelErrors(proposal: Partial<TournamentProposal>, sanctioningPolicy: SanctioningPolicy) {
  const result: any = validateProposal({ proposal: { ...baseProposal, ...proposal }, sanctioningPolicy });
  return result.errors.filter((issue: any) => issue.field.startsWith('personnel.'));
}

describe('personnelRules resolve by exact role code', () => {
  it('a DEPUTY_REFEREE rule is not satisfied by the tournament referee', () => {
    const errors = personnelErrors({}, policyWith([{ roleName: 'DEPUTY_REFEREE', required: true }]));
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toEqual('personnel.DEPUTY_REFEREE');
    expect(errors[0].message).toEqual('Required role not filled: DEPUTY_REFEREE');
  });

  it('a DEPUTY_REFEREE rule is satisfied by an official with that role', () => {
    const errors = personnelErrors(
      { officials: [{ role: 'DEPUTY_REFEREE', personName: 'Dana Deputy' }] },
      policyWith([{ roleName: 'DEPUTY_REFEREE', required: true }]),
    );
    expect(errors).toHaveLength(0);
  });

  it('a REFEREE rule is not satisfied by a DEPUTY_REFEREE among the officials', () => {
    const errors = personnelErrors(
      { referee: undefined, officials: [{ role: 'DEPUTY_REFEREE', personName: 'Dana Deputy' }] },
      policyWith([{ roleName: 'REFEREE', required: true }]),
    );
    expect(errors.map((issue: any) => issue.field)).toEqual(['personnel.REFEREE']);
  });

  it('a REFEREE listed among the officials fills the REFEREE rule', () => {
    const errors = personnelErrors(
      { referee: undefined, officials: [{ role: 'REFEREE', personName: 'Rita Referee' }] },
      policyWith([{ roleName: 'REFEREE', required: true }]),
    );
    expect(errors).toHaveLength(0);
  });

  it('a legacy display-string roleName fails closed rather than matching by substring', () => {
    const legacyRole = { roleName: 'Referee', required: true } as unknown as PersonnelRole;
    const errors = personnelErrors({}, policyWith([legacyRole]));
    expect(errors.map((issue: any) => issue.field)).toEqual(['personnel.Referee']);
  });
});

describe('personnelRules enforce minimumCount', () => {
  it('ITF requires two chair umpires; one is reported as a shortfall', () => {
    const errors = personnelErrors(
      {
        referee: { personName: 'Bob Referee', certificationLevel: 'White Badge' },
        officials: [{ role: 'CHAIR_UMPIRE', personName: 'Carol Umpire' }],
      },
      POLICY_SANCTIONING_ITF,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toEqual('personnel.CHAIR_UMPIRE');
    expect(errors[0].message).toEqual('Required role not filled: CHAIR_UMPIRE (1 of 2)');
  });

  it('two chair umpires satisfy the ITF rule', () => {
    const errors = personnelErrors(
      {
        referee: { personName: 'Bob Referee', certificationLevel: 'White Badge' },
        officials: [
          { role: 'CHAIR_UMPIRE', personName: 'Carol Umpire' },
          { role: 'CHAIR_UMPIRE', personName: 'Dave Umpire' },
        ],
      },
      POLICY_SANCTIONING_ITF,
    );
    expect(errors).toHaveLength(0);
  });

  it('one person named in the referee slot and again among the officials counts once', () => {
    const errors = personnelErrors(
      { officials: [{ role: 'REFEREE', personName: ' bob referee ' }] },
      policyWith([{ roleName: 'REFEREE', required: true, minimumCount: 2 }]),
    );
    expect(errors.map((issue: any) => issue.message)).toEqual(['Required role not filled: REFEREE (1 of 2)']);
  });

  it('an official with no name is not counted', () => {
    const errors = personnelErrors(
      { officials: [{ role: 'CHAIR_UMPIRE', personName: '  ' }] },
      policyWith([{ roleName: 'CHAIR_UMPIRE', required: true }]),
    );
    expect(errors.map((issue: any) => issue.field)).toEqual(['personnel.CHAIR_UMPIRE']);
  });

  it('certification is required of every person counted, not only the first', () => {
    const errors = personnelErrors(
      {
        officials: [
          { role: 'CHAIR_UMPIRE', personName: 'Carol Umpire', certificationLevel: 'Gold Badge' },
          { role: 'CHAIR_UMPIRE', personName: 'Dave Umpire', certificationLevel: 'White Badge' },
        ],
      },
      policyWith([
        { roleName: 'CHAIR_UMPIRE', required: true, minimumCount: 2, certificationRequired: 'Bronze Badge' },
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toEqual('personnel.CHAIR_UMPIRE.certification');
    expect(errors[0].message).toContain('White Badge');
  });
});
