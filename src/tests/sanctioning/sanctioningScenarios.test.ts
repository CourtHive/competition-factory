/**
 * Real-world sanctioning scenarios based on research of ITF, USTA, BWF, USATF,
 * USA Swimming, PDGA, and PSA governing body workflows.
 *
 * Each scenario exercises the engine end-to-end, probing for edge cases
 * identified in code review.
 */
import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Fixtures
import { POLICY_SANCTIONING_ITF } from '@Fixtures/policies/POLICY_SANCTIONING_ITF';
import { POLICY_SANCTIONING_USTA } from '@Fixtures/policies/POLICY_SANCTIONING_USTA';
import { POLICY_SANCTIONING_GENERIC } from '@Fixtures/policies/POLICY_SANCTIONING_GENERIC';

// Types
import type { Applicant, TournamentProposal } from '@Types/sanctioningTypes';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const itfApplicant: Applicant = {
  organisationId: 'nat-fed-brazil',
  organisationName: 'Confederacao Brasileira de Tenis',
  contactName: 'Maria Silva',
  contactEmail: 'maria@cbt.org.br',
  credentials: [{ credentialType: 'SafeSport', verified: true }],
};

const ustaApplicant: Applicant = {
  organisationId: 'cary-tennis-park',
  organisationName: 'Cary Tennis Park',
  contactName: 'Bob Smith',
  contactEmail: 'bob@carytennis.com',
  credentials: [{ credentialType: 'SafeSport', verified: true }],
};

// ---------------------------------------------------------------------------
// Scenario 1: ITF W50 — Full lifecycle (Brazil, clay, endorsement required)
// ---------------------------------------------------------------------------
describe('Scenario: ITF W50 Full Lifecycle (Brazil)', () => {
  beforeEach(() => sanctioningEngine.reset());

  const w50Proposal: TournamentProposal = {
    tournamentName: 'W50 Florianopolis',
    formalName: 'ITF World Tennis Tour W50 Florianopolis',
    proposedStartDate: '2028-03-11',
    proposedEndDate: '2028-03-17',
    hostCountryCode: 'BRA',
    surfaceCategory: 'CLAY',
    indoorOutdoor: 'OUTDOOR',
    localTimeZone: 'America/Sao_Paulo',
    totalPrizeMoney: [{ amount: 50000, currencyCode: 'USD' }],
    venues: [{ venueName: 'Jurerê Tennis Club', numberOfCourts: 8, surfaceCategory: 'CLAY' }],
    tournamentDirector: { personName: 'Carlos Mendes', role: 'Tournament Director' },
    referee: { personName: 'Ana Souza', role: 'Referee', certificationLevel: 'Bronze Badge' },
    officials: [
      { role: 'Chair Umpire', personName: 'Pedro Lima' },
      { role: 'Chair Umpire', personName: 'Julia Costa' },
    ],
    insuranceCertificate: { documentType: 'liability_insurance', verified: true },
    safetyPlan: { documentType: 'safety_plan' },
    medicalPlan: { documentType: 'medical_plan' },
    antiCorruptionCompliance: true,
    safeguardingCompliance: true,
    events: [
      {
        eventName: "Women's Singles",
        eventType: 'SINGLES',
        gender: 'FEMALE',
        drawSize: 32,
        drawType: 'SINGLE_ELIMINATION',
        matchUpFormat: 'SET3-S:6/TB7',
        qualifyingDrawSize: 16,
      },
      {
        eventName: "Women's Doubles",
        eventType: 'DOUBLES',
        gender: 'FEMALE',
        drawSize: 32,
        drawType: 'SINGLE_ELIMINATION',
      },
    ],
  };

  it('completes full lifecycle: create → endorse → submit → review → approve → activate → post-event → close', () => {
    // 1. Create
    let result: any = sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: itfApplicant,
      proposal: w50Proposal,
      sanctioningLevel: 'W50',
    });
    expect(result.success).toBe(true);

    // 2. Check completeness before endorsement
    let completeness: any = sanctioningEngine.getCompleteness({ sanctioningPolicy: POLICY_SANCTIONING_ITF });
    expect(completeness.completeness.score).toBeGreaterThan(70);

    // 3. Validate proposal
    let validation: any = sanctioningEngine.validateProposal({
      sanctioningPolicy: POLICY_SANCTIONING_ITF,
      sanctioningTier: 'W50',
    });
    expect(validation.valid).toBe(true);

    // 4. Check eligible tiers
    let tiers: any = sanctioningEngine.getEligibleTiers({ sanctioningPolicy: POLICY_SANCTIONING_ITF });
    const w50Tier = tiers.eligibleTiers.find((t: any) => t.tierName === 'W50');
    expect(w50Tier).toBeDefined();

    // 5. Endorse (national federation required by ITF policy)
    sanctioningEngine.requestEndorsement({ endorserId: 'cbt', endorserName: 'CBT' });
    sanctioningEngine.endorseApplication({ endorserNotes: 'Facilities approved by CBT inspection' });

    // 6. Submit with policy
    result = sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_ITF });
    expect(result.success).toBe(true);

    // Verify policy snapshot
    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.policySnapshot.policyName).toContain('ITF');

    // 7. Review
    result = sanctioningEngine.reviewApplication({
      reviewer: { reviewerId: 'itf-reviewer-1', reviewerName: 'ITF South America Desk' },
    });
    expect(result.success).toBe(true);

    // 8. Add review note
    sanctioningEngine.addReviewNote({ note: 'Clay court specifications verified', reviewerName: 'ITF Desk' });

    // 9. Approve
    result = sanctioningEngine.approveApplication({ approvedBy: 'ITF South America Desk' });
    expect(result.success).toBe(true);

    // 10. Activate — generates tournament
    result = sanctioningEngine.activateFromSanctioning({ sanctioningPolicy: POLICY_SANCTIONING_ITF });
    expect(result.success).toBe(true);
    expect(result.tournamentRecord.tournamentName).toEqual('W50 Florianopolis');
    expect(result.tournamentRecord.events).toHaveLength(2);
    expect(result.tournamentRecord.surfaceCategory).toEqual('CLAY');
    expect(result.tournamentRecord.processCodes).toContain('SANCTIONED');

    // 11. Post-event
    result = sanctioningEngine.transitionToPostEvent({});
    expect(result.success).toBe(true);

    // 12. Submit compliance items
    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    const complianceItems = record.compliance.items.filter((i: any) => i.required);
    expect(complianceItems.length).toBeGreaterThan(0);

    for (const item of complianceItems) {
      sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
      sanctioningEngine.verifyComplianceItem({ itemId: item.itemId });
    }

    // 13. Close
    result = sanctioningEngine.closeApplication({ closedBy: 'ITF Admin' });
    expect(result.success).toBe(true);

    // 14. Verify full status history
    let history: any = sanctioningEngine.getStatusHistory();
    const statuses = history.statusHistory.map((h: any) => h.toStatus);
    expect(statuses).toContain('DRAFT');
    expect(statuses).toContain('SUBMITTED');
    expect(statuses).toContain('UNDER_REVIEW');
    expect(statuses).toContain('APPROVED');
    expect(statuses).toContain('ACTIVE');
    expect(statuses).toContain('POST_EVENT');
    expect(statuses).toContain('CLOSED');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: USTA Level 3 — Modification request cycle
// ---------------------------------------------------------------------------
describe('Scenario: USTA Level 3 with Modification Request', () => {
  beforeEach(() => sanctioningEngine.reset());

  const ustaProposal: TournamentProposal = {
    tournamentName: 'USTA Carolina Open',
    proposedStartDate: '2028-07-15',
    proposedEndDate: '2028-07-21',
    hostCountryCode: 'USA',
    surfaceCategory: 'HARD',
    indoorOutdoor: 'OUTDOOR',
    venues: [{ venueName: 'Cary Tennis Park', numberOfCourts: 12 }],
    tournamentDirector: { personName: 'Bob Smith', role: 'Tournament Director' },
    referee: { personName: 'Carol Jones', role: 'Referee', certificationLevel: 'National' },
    safeguardingCompliance: true,
    events: [
      { eventName: 'Open Singles', eventType: 'SINGLES', drawSize: 64, drawType: 'SINGLE_ELIMINATION' },
      { eventName: 'Open Doubles', eventType: 'DOUBLES', drawSize: 32, drawType: 'SINGLE_ELIMINATION' },
    ],
  };

  it('handles modification request → edit → resubmit → approve cycle', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'usta',
      applicant: ustaApplicant,
      proposal: ustaProposal,
      sanctioningLevel: 'Level 3',
    });

    // Endorse
    sanctioningEngine.requestEndorsement({ endorserId: 'usta-southern', endorserName: 'USTA Southern' });
    sanctioningEngine.endorseApplication({});

    // Submit
    sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_USTA });

    // Review
    sanctioningEngine.reviewApplication({ reviewer: { reviewerId: 'usta-nat-1' } });

    // Reviewer requests modifications
    let result: any = sanctioningEngine.requestModification({
      requestedBy: 'USTA National',
      note: 'Draw size 64 requires minimum 100 participants; please confirm participant count or reduce draw size',
    });
    expect(result.success).toBe(true);

    // Verify proposal is editable again
    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('MODIFICATION_REQUESTED');

    // Applicant modifies draw size
    result = sanctioningEngine.updateEventProposal({
      eventProposalId: record.proposal.events[0].eventProposalId,
      updates: { drawSize: 32 },
    });
    expect(result.success).toBe(true);

    // Add a note explaining
    sanctioningEngine.addReviewNote({
      note: 'Reduced draw to 32 based on projected entries',
      reviewerName: 'Bob Smith',
    });

    // Resubmit
    result = sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_USTA });
    expect(result.success).toBe(true);

    // Re-review and approve
    sanctioningEngine.reviewApplication({});
    result = sanctioningEngine.approveApplication({});
    expect(result.success).toBe(true);

    // Verify version incremented through cycle
    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.version).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Conditional approval with conditions (BWF-style)
// ---------------------------------------------------------------------------
describe('Scenario: Conditional Approval — BWF Prize Money Confirmation', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('conditionally approves, meets conditions, then activates', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'bwf',
      applicant: {
        organisationName: 'Jakarta Badminton Association',
        contactName: 'Siti Nurhaliza',
        contactEmail: 'siti@jba.or.id',
      },
      proposal: {
        tournamentName: 'Jakarta International Challenge',
        proposedStartDate: '2028-09-01',
        proposedEndDate: '2028-09-07',
        hostCountryCode: 'IDN',
        totalPrizeMoney: [{ amount: 25000, currencyCode: 'USD' }],
        events: [
          { eventName: "Men's Singles", eventType: 'SINGLES', gender: 'MALE', drawSize: 32 },
          { eventName: "Women's Singles", eventType: 'SINGLES', gender: 'FEMALE', drawSize: 32 },
          { eventName: "Men's Doubles", eventType: 'DOUBLES', gender: 'MALE', drawSize: 16 },
          { eventName: "Women's Doubles", eventType: 'DOUBLES', gender: 'FEMALE', drawSize: 16 },
          { eventName: 'Mixed Doubles', eventType: 'DOUBLES', gender: 'MIXED', drawSize: 16 },
        ],
      },
    });

    sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_GENERIC });
    sanctioningEngine.reviewApplication({});

    // Conditionally approve with BWF-style requirements
    let result: any = sanctioningEngine.conditionallyApprove({
      conditions: [
        { description: 'Confirm total prize fund deposit to BWF escrow account' },
        { description: 'Submit proof of liability insurance naming BWF' },
        { description: 'Confirm venue meets BWF court specifications' },
      ],
      approvedBy: 'BWF Events Dept',
    });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.conditions).toHaveLength(3);

    // Meet conditions one at a time
    const [cond1, cond2, cond3] = record.conditions;

    result = sanctioningEngine.meetCondition({
      conditionId: cond1.conditionId,
      metNotes: 'USD 25,000 deposited to BWF account #4421',
    });
    expect(result.allConditionsMet).toBe(false);

    result = sanctioningEngine.meetCondition({ conditionId: cond2.conditionId });
    expect(result.allConditionsMet).toBe(false);

    result = sanctioningEngine.meetCondition({
      conditionId: cond3.conditionId,
      metNotes: 'BWF Technical Delegate confirmed venue specs',
    });
    expect(result.allConditionsMet).toBe(true);

    // Now fully approve
    result = sanctioningEngine.approveApplication({ approvedBy: 'BWF Events Dept' });
    expect(result.success).toBe(true);

    // Activate with 5 events
    result = sanctioningEngine.activateFromSanctioning({});
    expect(result.success).toBe(true);
    expect(result.tournamentRecord.events).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Rejection and no further transitions (terminal state)
// ---------------------------------------------------------------------------
describe('Scenario: Application Rejection — Terminal State', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('rejects application and prevents any further transitions', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: itfApplicant,
      proposal: {
        tournamentName: 'Rejected Event',
        proposedStartDate: '2028-06-01',
        proposedEndDate: '2028-06-07',
        events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 8 }],
      },
    });

    sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_GENERIC });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.rejectApplication({ reason: 'Venue does not meet safety standards' });

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('REJECTED');

    // All transitions should fail
    let result: any = sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_GENERIC });
    expect(result.error).toBeDefined();

    result = sanctioningEngine.approveApplication({});
    expect(result.error).toBeDefined();

    result = sanctioningEngine.withdrawApplication({});
    expect(result.error).toBeDefined();

    result = sanctioningEngine.reviewApplication({});
    expect(result.error).toBeDefined();

    let transitions: any = sanctioningEngine.getAvailableTransitions();
    expect(transitions.availableTransitions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Amendment edge cases (path traversal, severity, timeline)
// ---------------------------------------------------------------------------
describe('Scenario: Amendment Security & Edge Cases', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'gov-001',
          applicant: ustaApplicant,
          proposal: {
            tournamentName: 'Amendment Test',
            proposedStartDate: '2029-06-01',
            proposedEndDate: '2029-06-07',
            events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32, drawType: 'SINGLE_ELIMINATION' }],
          },
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: POLICY_SANCTIONING_GENERIC } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
    ]);
  });

  it('blocks amendment to internal state fields (path traversal attack)', () => {
    let result: any = sanctioningEngine.proposeAmendment({
      changes: [
        { field: 'statusHistory[0].fromStatus', previousValue: 'DRAFT', proposedValue: 'FAKE', changeType: 'MODIFIED' },
      ],
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    // Should auto-approve (MINOR since field is not in substantial list) but NOT modify statusHistory
    // because statusHistory is not in the AMENDABLE_FIELD_PREFIXES whitelist
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    // statusHistory should be untouched
    expect(record.statusHistory[0].fromStatus).toEqual('DRAFT');
  });

  it('blocks amendment to out-of-bounds array index', () => {
    sanctioningEngine.proposeAmendment({
      changes: [{ field: 'events[999].drawSize', previousValue: 32, proposedValue: 256, changeType: 'MODIFIED' }],
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });

    let result: any = sanctioningEngine.getSanctioningRecord();
    let record = result.sanctioningRecord;
    // Should NOT create sparse array
    expect(record.proposal.events).toHaveLength(1);
    expect(record.proposal.events[0].drawSize).toEqual(32);
  });

  it('correctly classifies event-level draw type change as substantial', () => {
    let result: any = sanctioningEngine.proposeAmendment({
      changes: [
        {
          field: 'events[0].drawType',
          previousValue: 'SINGLE_ELIMINATION',
          proposedValue: 'ROUND_ROBIN',
          changeType: 'MODIFIED',
        },
      ],
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    expect(result.severity).toEqual('SUBSTANTIAL');
    expect(result.autoApproved).toBe(false);
  });

  it('auto-approves minor tournament name change', () => {
    let result: any = sanctioningEngine.proposeAmendment({
      changes: [
        {
          field: 'tournamentName',
          previousValue: 'Amendment Test',
          proposedValue: 'Amendment Test Championship',
          changeType: 'MODIFIED',
        },
      ],
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });
    expect(result.severity).toEqual('MINOR');
    expect(result.autoApproved).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.proposal.tournamentName).toEqual('Amendment Test Championship');
  });

  it('tracks multiple amendments with different severities', () => {
    // Minor — auto-approved
    sanctioningEngine.proposeAmendment({
      changes: [{ field: 'surfaceCategory', previousValue: 'HARD', proposedValue: 'CLAY', changeType: 'MODIFIED' }],
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });

    // Substantial — needs review
    sanctioningEngine.proposeAmendment({
      changes: [
        {
          field: 'proposedStartDate',
          previousValue: '2029-06-01',
          proposedValue: '2029-07-01',
          changeType: 'MODIFIED',
        },
      ],
      sanctioningPolicy: POLICY_SANCTIONING_GENERIC,
    });

    let result: any = sanctioningEngine.getSanctioningRecord();
    let record = result.sanctioningRecord;
    expect(record.amendments).toHaveLength(2);
    expect(record.amendments[0].severity).toEqual('MINOR');
    expect(record.amendments[0].status).toEqual('APPROVED');
    expect(record.amendments[1].severity).toEqual('SUBSTANTIAL');
    expect(record.amendments[1].status).toEqual('PROPOSED');
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Calendar conflicts — geographic and temporal
// ---------------------------------------------------------------------------
describe('Scenario: Calendar Conflict Detection — Real-World Patterns', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('detects overlapping ITF events in same region', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: itfApplicant,
      proposal: {
        tournamentName: 'W25 Sao Paulo',
        proposedStartDate: '2028-03-11',
        proposedEndDate: '2028-03-17',
        calendarSection: 'South America',
        events: [{ eventName: 'Singles', eventType: 'SINGLES', drawSize: 32 }],
      },
      sanctioningLevel: 'W25',
    });

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents: [
          {
            tournamentName: 'W25 Buenos Aires',
            startDate: '2028-03-14',
            endDate: '2028-03-20',
            sanctioningTier: 'W25',
            calendarSection: 'South America',
          },
        ],
        calendarRules: { proximityWeeks: 1 },
      },
    });

    expect(result.hasConflicts).toBe(true);
    expect(result.errors.some((c: any) => c.type === 'SAME_WEEK')).toBe(true);
  });

  it('allows same-week events in different regions', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: itfApplicant,
      proposal: {
        tournamentName: 'W25 Tokyo',
        proposedStartDate: '2028-03-11',
        proposedEndDate: '2028-03-17',
        calendarSection: 'Asia',
        events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      },
      sanctioningLevel: 'W25',
    });

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents: [
          {
            tournamentName: 'W25 Madrid',
            startDate: '2028-03-11',
            endDate: '2028-03-17',
            sanctioningTier: 'W25',
            calendarSection: 'Europe',
          },
        ],
        calendarRules: { proximityWeeks: 1 },
      },
    });

    expect(result.hasConflicts).toBe(false);
  });

  it('detects proximity (within 2 weeks) even without overlap', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: itfApplicant,
      proposal: {
        tournamentName: 'W50 Event A',
        proposedStartDate: '2028-06-01',
        proposedEndDate: '2028-06-07',
        calendarSection: 'North America',
        events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      },
      sanctioningLevel: 'W50',
    });

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents: [
          {
            tournamentName: 'W50 Event B',
            startDate: '2028-06-10',
            endDate: '2028-06-16',
            sanctioningTier: 'W50',
            calendarSection: 'North America',
          },
        ],
        calendarRules: { proximityWeeks: 2 },
      },
    });

    expect(result.hasConflicts).toBe(true);
    expect(result.warnings.some((c: any) => c.type === 'PROXIMITY')).toBe(true);
  });

  it('allows different-tier events in same week and region', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: itfApplicant,
      proposal: {
        tournamentName: 'W15 Local',
        proposedStartDate: '2028-03-11',
        proposedEndDate: '2028-03-17',
        calendarSection: 'North America',
        events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      },
      sanctioningLevel: 'W15',
    });

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents: [
          {
            tournamentName: 'W100 Big Event',
            startDate: '2028-03-11',
            endDate: '2028-03-17',
            sanctioningTier: 'W100',
            calendarSection: 'North America',
          },
        ],
        calendarRules: { proximityWeeks: 1 },
      },
    });

    expect(result.hasConflicts).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Compliance overdue and issues flagged (USATF pattern)
// ---------------------------------------------------------------------------
describe('Scenario: Post-Event Compliance Issues (USATF pattern)', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('flags issues when compliance items become overdue', () => {
    // Fast-track to ACTIVE
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'generic',
          applicant: ustaApplicant,
          proposal: {
            tournamentName: 'Compliance Test',
            proposedStartDate: '2027-01-01',
            proposedEndDate: '2027-01-07',
            events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
          },
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: POLICY_SANCTIONING_GENERIC } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
      { method: 'activateFromSanctioning', params: { sanctioningPolicy: POLICY_SANCTIONING_GENERIC } },
      { method: 'transitionToPostEvent', params: {} },
    ]);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.compliance.items.length).toBeGreaterThan(0);

    // Submit only one item, leave others pending
    const firstItem = record.compliance.items[0];
    sanctioningEngine.submitComplianceItem({ itemId: firstItem.itemId });
    sanctioningEngine.verifyComplianceItem({ itemId: firstItem.itemId });

    // Flag issues for remaining
    let result: any = sanctioningEngine.flagComplianceIssues({
      reason: 'Financial reconciliation not submitted within 30-day deadline',
    });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.status).toEqual('ISSUES_FLAGGED');

    // Can still close from ISSUES_FLAGGED
    result = sanctioningEngine.closeApplication({ reason: 'Issues resolved after late submission' });
    expect(result.success).toBe(true);
  });

  it('prevents resubmission of already-verified compliance item', () => {
    sanctioningEngine.executionQueue([
      {
        method: 'createSanctioningRecord',
        params: {
          governingBodyId: 'generic',
          applicant: ustaApplicant,
          proposal: {
            tournamentName: 'Resubmit Test',
            proposedStartDate: '2027-01-01',
            proposedEndDate: '2027-01-07',
            events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
          },
          sanctioningLevel: 'Level 2',
        },
      },
      { method: 'submitApplication', params: { sanctioningPolicy: POLICY_SANCTIONING_GENERIC } },
      { method: 'reviewApplication', params: {} },
      { method: 'approveApplication', params: {} },
      { method: 'activateFromSanctioning', params: { sanctioningPolicy: POLICY_SANCTIONING_GENERIC } },
      { method: 'transitionToPostEvent', params: {} },
    ]);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    const item = record.compliance.items[0];

    sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
    sanctioningEngine.verifyComplianceItem({ itemId: item.itemId });

    // Try to resubmit — should fail
    let result: any = sanctioningEngine.submitComplianceItem({ itemId: item.itemId });
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Multi-event tournament with category validation (USTA Junior)
// ---------------------------------------------------------------------------
describe('Scenario: Multi-Category Tournament Validation', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('validates mixed age-group events against tier constraints', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'usta',
      applicant: ustaApplicant,
      proposal: {
        tournamentName: 'USTA Junior Championships',
        proposedStartDate: '2028-07-01',
        proposedEndDate: '2028-07-07',
        venues: [{ venueName: 'Tennis Center', numberOfCourts: 16 }],
        totalPrizeMoney: [],
        events: [
          {
            eventName: 'Boys 18 Singles',
            eventType: 'SINGLES',
            gender: 'MALE',
            drawSize: 64,
            category: { categoryName: 'U18', type: 'AGE', ageMax: 18 },
          },
          {
            eventName: 'Girls 18 Singles',
            eventType: 'SINGLES',
            gender: 'FEMALE',
            drawSize: 64,
            category: { categoryName: 'U18', type: 'AGE', ageMax: 18 },
          },
          {
            eventName: 'Boys 16 Singles',
            eventType: 'SINGLES',
            gender: 'MALE',
            drawSize: 32,
            category: { categoryName: 'U16', type: 'AGE', ageMax: 16 },
          },
          {
            eventName: 'Boys 14 Singles',
            eventType: 'SINGLES',
            gender: 'MALE',
            drawSize: 32,
            category: { categoryName: 'U14', type: 'AGE', ageMax: 14 },
          },
        ],
      },
      sanctioningLevel: 'Level 3',
    });

    // Should be eligible for USTA tiers that support these draw sizes
    let result: any = sanctioningEngine.getEligibleTiers({
      sanctioningPolicy: POLICY_SANCTIONING_USTA,
    });
    expect(result.success).toBe(true);

    // Level 5 allows 16/32/64 draw sizes — should be eligible
    const level5 = result.tierEligibilities.find((t: any) => t.tierName === 'Level 5');
    expect(level5.eligible).toBe(true);

    // Activation should deduplicate categories
    sanctioningEngine.submitApplication({ sanctioningPolicy: POLICY_SANCTIONING_GENERIC });
    sanctioningEngine.reviewApplication({});
    sanctioningEngine.approveApplication({});
    let activateResult: any = sanctioningEngine.activateFromSanctioning({});
    expect(activateResult.tournamentRecord.tournamentCategories).toHaveLength(3); // U18, U16, U14
    expect(activateResult.tournamentRecord.events).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Scenario 9: Endorsement declined → modify → re-request → submit
// ---------------------------------------------------------------------------
describe('Scenario: Endorsement Declined and Re-requested', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('handles endorsement decline, proposal modification, re-endorsement, and submission', () => {
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'itf',
      applicant: itfApplicant,
      proposal: {
        tournamentName: 'W25 Recife',
        proposedStartDate: '2028-05-01',
        proposedEndDate: '2028-05-07',
        venues: [{ venueName: 'Small Club', numberOfCourts: 2 }],
        events: [{ eventName: 'Singles', eventType: 'SINGLES', gender: 'FEMALE', drawSize: 32 }],
      },
    });

    // Request endorsement
    sanctioningEngine.requestEndorsement({ endorserId: 'cbt', endorserName: 'CBT' });

    // Federation declines due to insufficient courts
    let result: any = sanctioningEngine.declineEndorsement({
      declineReason: 'Minimum 5 courts required for ITF events; venue has only 2',
    });
    expect(result.success).toBe(true);

    let recordResult: any = sanctioningEngine.getSanctioningRecord();
    let record = recordResult.sanctioningRecord;
    expect(record.endorsement.status).toEqual('DECLINED');

    // Applicant finds a better venue
    sanctioningEngine.updateProposal({
      updates: {
        venues: [{ venueName: 'Recife Tennis Academy', numberOfCourts: 8 }],
      },
    });

    // Re-request endorsement (resets endorsement state)
    result = sanctioningEngine.requestEndorsement({ endorserId: 'cbt', endorserName: 'CBT' });
    expect(result.success).toBe(true);

    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.endorsement.status).toEqual('PENDING');

    // Now endorsed
    sanctioningEngine.endorseApplication({ endorserNotes: 'New venue approved' });
    recordResult = sanctioningEngine.getSanctioningRecord();
    record = recordResult.sanctioningRecord;
    expect(record.endorsement.status).toEqual('ENDORSED');

    // Can now submit
    result = sanctioningEngine.submitApplication({
      sanctioningPolicy: { ...POLICY_SANCTIONING_ITF, requireEndorsement: true } as any,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 10: Execution queue rollback on mid-sequence failure
// ---------------------------------------------------------------------------
describe('Scenario: Execution Queue Rollback Integrity', () => {
  beforeEach(() => sanctioningEngine.reset());

  it('rolls back all changes when mid-sequence method fails', () => {
    sanctioningEngine.createSanctioningRecord({
      sanctioningId: 'rollback-integrity',
      governingBodyId: 'gov-001',
      applicant: ustaApplicant,
      proposal: {
        tournamentName: 'Rollback Test',
        proposedStartDate: '2028-06-01',
        proposedEndDate: '2028-06-07',
        events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      },
    });

    // Execute a queue that will fail midway (approve from DRAFT is invalid)
    let result: any = sanctioningEngine.executionQueue(
      [
        {
          method: 'updateProposal',
          params: { sanctioningId: 'rollback-integrity', updates: { tournamentName: 'Should Not Persist' } },
        },
        {
          method: 'approveApplication',
          params: { sanctioningId: 'rollback-integrity' },
        },
      ],
      true,
    );

    expect(result.error).toBeDefined();
    expect(result.rolledBack).toBe(true);

    // Verify name was NOT changed (rolled back)
    let recordResult: any = sanctioningEngine.getSanctioningRecord({ sanctioningId: 'rollback-integrity' });
    let record = recordResult.sanctioningRecord;
    expect(record.proposal.tournamentName).toEqual('Rollback Test');
  });
});
