import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Constants
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

import type { Applicant, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Tennis Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};

const testProposal: TournamentProposal = {
  tournamentName: 'Test Open 2027',
  formalName: 'The Official Test Open',
  proposedStartDate: '2027-06-01',
  proposedEndDate: '2027-06-07',
  hostCountryCode: 'USA',
  surfaceCategory: 'HARD',
  indoorOutdoor: 'OUTDOOR',
  localTimeZone: 'America/New_York',
  totalPrizeMoney: [{ amount: 25000, currencyCode: 'USD' }],
  events: [
    {
      eventName: "Men's Singles",
      eventType: 'SINGLES',
      gender: 'MALE',
      drawSize: 32,
      drawType: 'SINGLE_ELIMINATION',
      matchUpFormat: 'SET3-S:6/TB7',
      category: { categoryName: 'Open', type: 'AGE' },
    },
    {
      eventName: "Women's Singles",
      eventType: 'SINGLES',
      gender: 'FEMALE',
      drawSize: 32,
      drawType: 'SINGLE_ELIMINATION',
      allowedDrawTypes: ['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP'],
      matchUpFormat: 'SET3-S:6/TB7',
    },
  ],
};

const testPolicy: SanctioningPolicy = {
  ...POLICY_SANCTIONING_GENERIC,
  requireEndorsement: false,
};

function createApprovedRecord() {
  sanctioningEngine.executionQueue([
    {
      method: 'createSanctioningRecord',
      params: {
        governingBodyId: 'gov-001',
        applicant: testApplicant,
        proposal: testProposal,
        sanctioningLevel: 'Level 2',
      },
    },
    { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
    { method: 'reviewApplication', params: {} },
    { method: 'approveApplication', params: {} },
  ]);
}

describe('Activation — Tournament Generation', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('generates a tournamentRecord from an approved sanctioning', () => {
    createApprovedRecord();

    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    expect(result.success).toBe(true);
    expect(result.tournamentRecord).toBeDefined();

    const tr = result.tournamentRecord;
    expect(tr.tournamentId).toBeDefined();
    expect(tr.tournamentName).toEqual('Test Open 2027');
    expect(tr.formalName).toEqual('The Official Test Open');
    expect(tr.startDate).toEqual('2027-06-01');
    expect(tr.endDate).toEqual('2027-06-07');
    expect(tr.hostCountryCode).toEqual('USA');
    expect(tr.surfaceCategory).toEqual('HARD');
    expect(tr.indoorOutdoor).toEqual('OUTDOOR');
    expect(tr.localTimeZone).toEqual('America/New_York');
    expect(tr.tournamentStatus).toEqual('ACTIVE');
    expect(tr.processCodes).toContain('SANCTIONED');
    expect(tr.parentOrganisationId).toEqual('gov-001');
  });

  it('generates events with correct properties', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    const tr = result.tournamentRecord;

    expect(tr.events).toHaveLength(2);

    const mensSingles = tr.events.find((e: any) => e.eventName === "Men's Singles");
    expect(mensSingles).toBeDefined();
    expect(mensSingles.eventType).toEqual('SINGLES');
    expect(mensSingles.gender).toEqual('MALE');
    expect(mensSingles.matchUpFormat).toEqual('SET3-S:6/TB7');
    expect(mensSingles.allowedDrawTypes).toEqual(['SINGLE_ELIMINATION']);
    expect(mensSingles.category?.categoryName).toEqual('Open');

    const womensSingles = tr.events.find((e: any) => e.eventName === "Women's Singles");
    expect(womensSingles.allowedDrawTypes).toEqual(['SINGLE_ELIMINATION', 'FEED_IN_CHAMPIONSHIP']);
  });

  it('stores sanctioning reference as extension', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    const tr = result.tournamentRecord;

    const sanctioningExt = tr.extensions.find((e: any) => e.name === 'sanctioningId');
    expect(sanctioningExt).toBeDefined();
    expect(sanctioningExt.value).toBeDefined();

    const tierExt = tr.extensions.find((e: any) => e.name === 'sanctioningTier');
    expect(tierExt).toBeDefined();
    expect(tierExt.value).toEqual('Level 2');
  });

  it('transitions sanctioning record to ACTIVE status', () => {
    createApprovedRecord();
    sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });

    let result: any = sanctioningEngine.getSanctioningRecord();
    let record = result.sanctioningRecord;
    expect(record.status).toEqual('ACTIVE');
  });

  it('generates compliance checklist from policy', () => {
    createApprovedRecord();
    sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });

    let result: any = sanctioningEngine.getSanctioningRecord();
    let record = result.sanctioningRecord;
    expect(record.compliance).toBeDefined();
    expect(record.compliance.status).toEqual('PENDING');
    expect(record.compliance.items.length).toBeGreaterThan(0);

    const resultsItem = record.compliance.items.find((i: any) => i.itemType === 'RESULTS_SUBMISSION');
    expect(resultsItem).toBeDefined();
    expect(resultsItem.required).toBe(true);
    expect(resultsItem.status).toEqual('PENDING');
    expect(resultsItem.deadline).toBeDefined();
    // Deadline should be proposedEndDate + deadlineDays
    expect(new Date(resultsItem.deadline) > new Date('2027-06-07')).toBe(true);
  });

  it('rejects activation from non-APPROVED status', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: testProposal,
    });

    let result: any = sanctioningEngine.activateFromSanctioning({});
    expect(result.error).toBeDefined();
  });

  it('deduplicates tournament categories', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      proposal: {
        ...testProposal,
        events: [
          {
            eventName: 'U18 Singles',
            eventType: 'SINGLES',
            category: { categoryName: 'U18', type: 'AGE', ageMax: 18 },
          },
          {
            eventName: 'U18 Doubles',
            eventType: 'DOUBLES',
            category: { categoryName: 'U18', type: 'AGE', ageMax: 18 },
          },
        ],
      },
    });
    sanctioningEngine.submitApplication({ sanctioningPolicy: testPolicy });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});

    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    expect(result.tournamentRecord.tournamentCategories).toHaveLength(1);
    expect(result.tournamentRecord.tournamentCategories[0].categoryName).toEqual('U18');
  });
});

describe('Full Lifecycle — End-to-End', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('runs complete lifecycle via executionQueue', () => {
    let result: any = sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: testProposal,
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
      { method: 'reviewApplication', params: { reviewer: { reviewerId: 'rev-1' } } },
      { method: 'approveApplication', params: { approvedBy: 'rev-1' } },
      { method: 'activateFromSanctioning', params: { sanctioningPolicy: testPolicy } },
    ]);
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(5);

    // Last result should contain the tournament record
    const activationResult = result.results[4];
    expect(activationResult.tournamentRecord).toBeDefined();
    expect(activationResult.tournamentRecord.tournamentName).toEqual('Test Open 2027');

    // Sanctioning record should be ACTIVE with compliance
    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('ACTIVE');
    expect(record.compliance).toBeDefined();

    // Status history should show full chain
    let history: any = sanctioningEngine.getStatusHistory();
    expect(history.statusHistory.length).toBeGreaterThanOrEqual(5);
  });
});
