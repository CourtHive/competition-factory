import { activateFromSanctioning } from '@Mutate/sanctioning/activateFromSanctioning';
import { expect, it, describe } from 'vitest';

// constants
import { APPROVED } from '@Constants/sanctioningConstants';
import { SanctionDecisionEnum, RecognitionEnum, CurrencyUnitEnum } from '@Types/tournamentTypes';
import type { SanctionFee } from '@Types/tournamentTypes';

/**
 * `Tournament.sanction` — the sanction INSTANCE model.
 *
 * `SanctioningRecord` models BECOMING sanctioned; it is AMS-held and discarded once decided.
 * `TournamentSanction` models BEING sanctioned — the decision as an attribute that travels with the
 * tournamentRecord. Before it existed, activation projected the entire application down to
 * `processCodes: ['SANCTIONED']`, throwing away who approved it, when, under which rulebook
 * edition, the approval chain, and what the sanction confers.
 *
 * The three axes exist because real federation data conflates them and a boolean cannot carry any
 * of them: a USTA tournament is simultaneously `sanctionStatus: APPROVED` and `level: Unsanctioned`
 * — approved to run by the district, conferring no ranking status.
 */

const baseRecord = (overrides: any = {}) =>
  ({
    sanctioningId: 's-1',
    status: APPROVED,
    governingBodyId: 'gb-1',
    governingBody: {
      organisationId: 'gb-1',
      organisationName: 'Georgia',
      organisationAbbreviation: 'GA',
    },
    approvedAt: '2026-03-14T10:00:00.000Z',
    reviewer: { reviewerId: 'rev-1', reviewerName: 'Yannick Yoshizawa' },
    sanctioningPolicy: 'POLICY_SANCTIONING_USTA',
    policyVersion: '2026.1',
    proposal: {
      tournamentName: 'Peachtree Summer Open',
      proposedStartDate: '2026-09-01',
      proposedEndDate: '2026-09-05',
      events: [{ eventName: 'Mens Singles', eventType: 'SINGLES' }],
    },
    statusHistory: [],
    ...overrides,
  }) as any;

const activate = (record: any) => activateFromSanctioning({ sanctioningRecord: record });

describe('Tournament.sanction on activation', () => {
  it('projects the decision, recognition and authority onto the tournamentRecord', () => {
    const result: any = activate(baseRecord());
    const { sanction } = result.tournamentRecord;

    expect(result.success).toEqual(true);
    expect(sanction.decision).toEqual(SanctionDecisionEnum.APPROVED);
    // Activation means this body ran the competition under its own rules.
    expect(sanction.recognition).toEqual(RecognitionEnum.SANCTIONED);
    expect(sanction.authority.organisationId).toEqual('gb-1');
    expect(sanction.authority.organisationName).toEqual('Georgia');
    expect(sanction.authority.organisationAbbreviation).toEqual('GA');
    expect(sanction.sanctioningId).toEqual('s-1');
  });

  /**
   * The whole point of the instance model: the decision's provenance survives activation. USTA
   * carries exactly this (`lastSanctionStatusChange`) and — notably — its own TODS export drops it,
   * so it is recoverable only from the public record.
   */
  it('preserves who decided and when', () => {
    const { sanction } = (activate(baseRecord()) as any).tournamentRecord;

    expect(sanction.decisionRecord.decidedAt).toEqual('2026-03-14T10:00:00.000Z');
    expect(sanction.decisionRecord.decidedByName).toEqual('Yannick Yoshizawa');
    expect(sanction.decisionRecord.decidedByPersonId).toEqual('rev-1');
  });

  /**
   * Rulebook editions are annual. A sanction granted under one edition must not silently
   * re-validate against the next, so the edition is pinned at the moment of decision.
   */
  it('pins the ruleset edition the decision was made under', () => {
    const { sanction } = (activate(baseRecord()) as any).tournamentRecord;

    expect(sanction.ruleset.rulesetId).toEqual('POLICY_SANCTIONING_USTA');
    expect(sanction.ruleset.edition).toEqual('2026.1');
  });

  it('carries the sanctioned tier through as the conferred classification', () => {
    const record = baseRecord({ sanctioningTier: { system: 'USTA', value: 'Level 5', numericRank: 3 } });
    const { sanction, tournamentTier } = (activate(record) as any).tournamentRecord;

    expect(sanction.classification).toEqual({ system: 'USTA', value: 'Level 5', numericRank: 3 });
    // tournamentTier keeps its existing meaning; classification is not a replacement for it
    expect(tournamentTier).toEqual({ system: 'USTA', value: 'Level 5', numericRank: 3 });
  });

  describe('approvalChain', () => {
    /**
     * `endorsementLevel` is the REQUIRED ORDER (1 = first), which is not necessarily the order the
     * endorsements happen to sit in the array — so the chain sorts by it.
     */
    it('orders the chain by endorsementLevel, not array position', () => {
      const record = baseRecord({
        endorsements: [
          { status: 'ENDORSED', endorserId: 'district', endorserName: 'Georgia', endorsementLevel: 3 },
          { status: 'ENDORSED', endorserId: 'national', endorserName: 'National', endorsementLevel: 1 },
          { status: 'ENDORSED', endorserId: 'section', endorserName: 'Southern', endorsementLevel: 2 },
        ],
      });
      const { sanction } = (activate(record) as any).tournamentRecord;

      expect(sanction.approvalChain.map((a: any) => a.organisationId)).toEqual(['national', 'section', 'district']);
      expect(sanction.approvalChain[1].organisationName).toEqual('Southern');
    });

    it('excludes endorsers that did not endorse', () => {
      const record = baseRecord({
        endorsements: [
          { status: 'ENDORSED', endorserId: 'national', endorsementLevel: 1 },
          { status: 'PENDING', endorserId: 'section', endorsementLevel: 2 },
          { status: 'DECLINED', endorserId: 'district', endorsementLevel: 3 },
        ],
      });
      const { sanction } = (activate(record) as any).tournamentRecord;

      expect(sanction.approvalChain).toHaveLength(1);
      expect(sanction.approvalChain[0].organisationId).toEqual('national');
    });

    /** An endorsement with no level sorts last rather than being dropped. */
    it('keeps unlevelled endorsements, ordering them after levelled ones', () => {
      const record = baseRecord({
        endorsements: [
          { status: 'ENDORSED', endorserId: 'unlevelled' },
          { status: 'ENDORSED', endorserId: 'first', endorsementLevel: 1 },
        ],
      });
      const { sanction } = (activate(record) as any).tournamentRecord;

      expect(sanction.approvalChain.map((a: any) => a.organisationId)).toEqual(['first', 'unlevelled']);
    });

    it('omits the chain entirely when nothing endorsed', () => {
      const { sanction } = (activate(baseRecord()) as any).tournamentRecord;
      expect(sanction.approvalChain).toBeUndefined();
    });
  });

  /**
   * `processCodes` is retained so existing consumers keep working — the instance model adds
   * expressiveness rather than removing the marker out from under them.
   */
  it('still stamps the legacy processCodes marker', () => {
    const { processCodes } = (activate(baseRecord()) as any).tournamentRecord;
    expect(processCodes).toEqual(['SANCTIONED']);
  });

  it('omits optional groups rather than emitting empty shells', () => {
    const record = baseRecord({
      approvedAt: undefined,
      reviewer: undefined,
      sanctioningPolicy: undefined,
      policyVersion: undefined,
      governingBody: undefined,
    });
    const { sanction } = (activate(record) as any).tournamentRecord;

    expect(sanction.decisionRecord).toBeUndefined();
    expect(sanction.ruleset).toBeUndefined();
    expect(sanction.classification).toBeUndefined();
    // governingBodyId alone is still enough to name an authority
    expect(sanction.authority).toEqual({ organisationId: 'gb-1' });
  });
});

/**
 * A federation reporting a sanction fee of 4000 means 40.00 USD. A reader assuming whole units is
 * off by 100× with nothing in the record to signal it, so the unit is carried explicitly and
 * travels with the amount rather than being an optional sibling that can go missing.
 */
describe('SanctionFee monetary units', () => {
  it('states amount, currency and unit together so a fee cannot be misread', () => {
    const fee: SanctionFee = {
      feeKind: 'SANCTION',
      fee: { amount: 4000, currencyCode: 'USD', unit: CurrencyUnitEnum.MINOR },
    };

    expect(fee.fee?.unit).toEqual('MINOR');
    // 4000 minor units of a 2-exponent currency is 40.00 — resolvable only because the
    // currency is present alongside the unit
    expect(fee.fee?.amount).toEqual(4000);
    expect(fee.fee?.currencyCode).toEqual('USD');
  });

  it('expresses a per-entry fee with a cap as two complete amounts', () => {
    const fee: SanctionFee = {
      feeKind: 'HEAD_TAX',
      perParticipant: true,
      fee: { amount: 400, currencyCode: 'USD', unit: CurrencyUnitEnum.MINOR },
      maximum: { amount: 10000, currencyCode: 'USD', unit: CurrencyUnitEnum.MINOR },
    };

    // $4.00 per entrant, capped at $100.00 — neither figure can be read at the wrong scale
    expect(fee.fee?.amount).toEqual(400);
    expect(fee.maximum?.amount).toEqual(10000);
    expect(fee.maximum?.unit).toEqual(fee.fee?.unit);
  });
});
