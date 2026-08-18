import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Constants
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

import { Applicant, TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

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
        sanctioningTier: { system: 'GENERIC', value: 'Level 2' },
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
  });

  // Inverted in phase 4. 6.24.0 wrote a `sanctioningTier` extension alongside the native
  // `tournamentTier` for exactly one release, so anything reading it had a transition window.
  // Nothing was: no reader existed in the ecosystem and no production tournament carried it.
  // The tier's only home is now the native field — a canonical value with a native home must not
  // also arrive as a CODES escape-hatch extension.
  it('no longer writes a redundant sanctioningTier extension', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    const tr = result.tournamentRecord;

    expect(tr.extensions.find((e: any) => e.name === 'sanctioningTier')).toBeUndefined();
    // ...while the tier itself is still present, natively
    expect(tr.tournamentTier).toEqual({ system: 'GENERIC', value: 'Level 2' });
    // sanctioningId is the ONLY extension activation writes
    expect(tr.extensions.map((e: any) => e.name)).toEqual(['sanctioningId']);
  });

  // The regression this suite previously had no coverage for: the sanctioned tier used to reach the
  // tournament ONLY as a name/value extension, so a tournament born from sanctioning
  // had no `tournamentTier` and `getEventRankingPoints` resolved no level for it — even when the
  // applicant had explicitly chosen a tier.
  it('sets NATIVE tournamentTier from the sanctioning record', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    const tr = result.tournamentRecord;

    expect(tr.tournamentTier).toEqual({ system: 'GENERIC', value: 'Level 2' });
  });

  // Sanctioning stores { system, value } only. A sanctioning policy's `tierLevel` runs OPPOSITE to
  // `numericRank` ("lower = more prestigious"), so deriving one from the other would invert prestige
  // in getEventRankingPoints and getTierMovement. Absent is correct — both callers handle it.
  it('does not invent a numericRank on the activated tournamentTier', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });

    expect(result.tournamentRecord.tournamentTier.numericRank).toBeUndefined();
  });

  it('copies the tier rather than aliasing the sanctioning record', () => {
    createApprovedRecord();
    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    result.tournamentRecord.tournamentTier.value = 'MUTATED';

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    expect(recordResult.sanctioningRecord.sanctioningTier.value).toEqual('Level 2');
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

describe('Activation — pre-assigned tournamentId (registration before the record)', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('reuses the proposal.tournamentId assigned at open-registration', () => {
    const preassigned = 'pre-assigned-tid-123';
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: testApplicant,
          proposal: { ...testProposal, tournamentId: preassigned },
          sanctioningTier: { system: 'GENERIC', value: 'Level 2' },
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);

    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    expect(result.success).toBe(true);
    expect(result.tournamentRecord.tournamentId).toEqual(preassigned);
  });

  it('mints a fresh tournamentId when the proposal has none (back-compat)', () => {
    createApprovedRecord(); // testProposal carries no tournamentId
    let result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    expect(result.success).toBe(true);
    expect(result.tournamentRecord.tournamentId).toBeDefined();
    expect(result.tournamentRecord.tournamentId).not.toEqual('pre-assigned-tid-123');
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
          sanctioningTier: { system: 'GENERIC', value: 'Level 2' },
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

// The sanctioned tournamentId/eventId must survive activation as the event's ORIGIN, so an
// integration layer can address results back to the body that sanctioned them. See
// Mentat planning/SANCTIONING_ACTIVATION_AND_EVENTID_THREADING.md Part 3d.
describe('Activation — event sanctioning origin (eventOtherIds)', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('stamps the governing body as the origin when the proposal names none', () => {
    createApprovedRecord();
    const result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    const tr = result.tournamentRecord;

    for (const event of tr.events) {
      const origin = event.eventOtherIds?.find((otherId: any) => otherId.isOrigin);
      expect(origin).toBeDefined();
      expect(origin.organisationId).toEqual('gov-001');
      // the ORIGIN's eventId is this event's id, and its tournamentId is the SANCTIONED one
      expect(origin.eventId).toEqual(event.eventId);
      expect(Object.hasOwn(origin, 'tournamentId')).toBe(true);
    }
  });

  it('preserves a FOREIGN origin supplied on the proposal instead of overwriting it', () => {
    const foreignOrigin = {
      organisationId: 'ITA',
      uniqueOrganisationName: 'Intercollegiate Tennis Association',
      tournamentId: 'ita-4471',
      eventId: 'ita-ev-9',
      isOrigin: true,
    };
    const foreignProposal: TournamentProposal = {
      ...testProposal,
      events: [{ ...testProposal.events[0], eventOtherIds: [foreignOrigin] }],
    };

    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: { governingBodyId: 'gov-001', applicant: testApplicant, proposal: foreignProposal },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);

    const result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    const event = result.tournamentRecord.events[0];

    // exactly one origin, and it is THEIRS — not overwritten by the sanctioning body
    const origins = event.eventOtherIds.filter((otherId: any) => otherId.isOrigin);
    expect(origins).toHaveLength(1);
    expect(origins[0]).toEqual(foreignOrigin);
    // the foreign tournamentId is NOT the carrying record's — that independence is the point
    expect(origins[0].tournamentId).not.toEqual(result.tournamentRecord.tournamentId);
  });

  it('keeps non-origin entries and appends the stamp alongside them', () => {
    const copyBack = { organisationId: 'USTA', tournamentId: 'usta-88', eventId: 'usta-ev-2' };
    const proposal: TournamentProposal = {
      ...testProposal,
      events: [{ ...testProposal.events[0], eventOtherIds: [copyBack] }],
    };

    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: { governingBodyId: 'gov-001', applicant: testApplicant, proposal },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: testPolicy } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);

    const result: any = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: testPolicy });
    const event = result.tournamentRecord.events[0];

    expect(event.eventOtherIds).toHaveLength(2);
    expect(event.eventOtherIds.filter((o: any) => o.isOrigin)).toHaveLength(1);
    expect(event.eventOtherIds).toContainEqual(copyBack); // the USTA entry survives untouched
  });
});
