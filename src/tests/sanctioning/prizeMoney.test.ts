import { sumAgainstBound, describeAmount } from '@Query/sanctioning/comparePrizeMoney';
import { activateFromSanctioning } from '@Mutate/sanctioning/activateFromSanctioning';
import { validateProposal } from '@Validators/sanctioning/validateProposal';
import { expect, it, describe } from 'vitest';

// constants
import { APPROVED } from '@Constants/sanctioningConstants';

/**
 * Prize money.
 *
 * Three defects are locked out here, all of which produced confident wrong answers rather than
 * errors:
 *
 *   1. `PrizeMoney` had no unit, so `{ amount: 4000, currencyCode: 'USD' }` was $40.00 or $4,000.
 *   2. Both comparison sites summed `amount` ACROSS CURRENCIES, so USD 1000 + EUR 1000 became 2000.
 *   3. `Event` had no prize-money field at all, so `EventProposal.prizeMoney` was silently dropped
 *      on activation.
 */

const USD = (amount: number) => ({ amount, currencyCode: 'USD', unit: 'MAJOR' as const });
const EUR = (amount: number) => ({ amount, currencyCode: 'EUR', unit: 'MAJOR' as const });

describe('sumAgainstBound', () => {
  it('sums only the entries denominated as the bound is', () => {
    const result = sumAgainstBound([USD(1000), USD(500)], USD(0));
    expect(result.comparable).toEqual(1500);
    expect(result.incomparable).toEqual([]);
  });

  /** The headline bug: adding across currencies produces a figure denominated in nothing. */
  it('refuses to add a different currency into the total', () => {
    const result = sumAgainstBound([USD(1000), EUR(1000)], USD(0));

    expect(result.comparable).toEqual(1000);
    expect(result.incomparable).toEqual(['EUR/MAJOR']);
  });

  it('treats a different unit in the same currency as incomparable', () => {
    const result = sumAgainstBound([{ amount: 400000, currencyCode: 'USD', unit: 'MINOR' }], USD(0));

    // 400000 minor USD IS $4,000 — but converting requires the currency's exponent, so it is
    // reported rather than assumed. Silently adding it as 400000 would be off by 100x.
    expect(result.comparable).toEqual(0);
    expect(result.incomparable).toEqual(['USD/MINOR']);
  });

  /** A record predating the unit field must not be assumed into a scale. */
  it('treats an absent unit as incomparable rather than guessing', () => {
    const result = sumAgainstBound([{ amount: 1000, currencyCode: 'USD' } as any], USD(0));

    expect(result.comparable).toEqual(0);
    expect(result.incomparable).toEqual(['USD/UNSPECIFIED']);
  });

  it('describes an amount with its currency and unit', () => {
    expect(describeAmount(USD(15000))).toEqual('15000 USD (MAJOR)');
  });
});

describe('validateProposal prize money', () => {
  const policy: any = {
    policyName: 'test',
    governingBodyId: 'gb',
    tiers: [{ tierName: 'Band', tierLevel: 1, minimumPrizeMoney: USD(10000), maximumPrizeMoney: USD(50000) }],
  };
  const proposal = (totalPrizeMoney: any) => ({
    tournamentName: 'T',
    proposedStartDate: '2026-09-01',
    proposedEndDate: '2026-09-05',
    tournamentLevel: 'NATIONAL',
    events: [{ eventName: 'MS', eventType: 'SINGLES' }],
    totalPrizeMoney,
  });

  const errorsFor = (totalPrizeMoney: any) => {
    const result: any = validateProposal({
      proposal: proposal(totalPrizeMoney) as any,
      sanctioningPolicy: policy,
      // the tier is identified by a TierClassification, not a bare name
      sanctioningTier: { system: 'TEST', value: 'Band' },
    });
    return (result.errors ?? []).filter((i: any) => i.field === 'totalPrizeMoney');
  };

  it('accepts an amount inside the band', () => {
    expect(errorsFor([USD(20000)])).toEqual([]);
  });

  it('flags an amount below the minimum, naming the bound with its unit', () => {
    const issues = errorsFor([USD(500)]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('10000 USD (MAJOR)');
  });

  /**
   * Previously USD 6000 + EUR 6000 summed to 12000 and passed the minimum. Now the EUR is reported
   * as incomparable AND the USD alone fails the floor — the rule is evaluated on what it can
   * actually be evaluated against.
   */
  it('does not let a foreign currency make up a shortfall', () => {
    const issues = errorsFor([USD(6000), EUR(6000)]);
    const messages = issues.map((i: any) => i.message).join(' | ');

    expect(messages).toContain('EUR/MAJOR');
    expect(messages).toContain('cannot be compared');
    expect(messages).toContain('Minimum prize money');
  });
});

describe('event prize money reaches the activated event', () => {
  const record = (prizeMoney?: any) =>
    ({
      sanctioningId: 's-1',
      status: APPROVED,
      governingBodyId: 'gb-1',
      proposal: {
        tournamentName: 'T',
        proposedStartDate: '2026-09-01',
        proposedEndDate: '2026-09-05',
        events: [{ eventName: 'MS', eventType: 'SINGLES', ...(prizeMoney ? { prizeMoney } : {}) }],
      },
      statusHistory: [],
    }) as any;

  it('carries EventProposal.prizeMoney onto Event.prizeMoney', () => {
    const result: any = activateFromSanctioning({ sanctioningRecord: record([USD(5000)]) });
    const event = result.tournamentRecord.events[0];

    expect(event.prizeMoney).toEqual([USD(5000)]);
  });

  it('copies rather than aliasing the proposal array', () => {
    const source = record([USD(5000)]);
    const result: any = activateFromSanctioning({ sanctioningRecord: source });

    expect(result.tournamentRecord.events[0].prizeMoney[0]).not.toBe(source.proposal.events[0].prizeMoney[0]);
  });

  it('leaves the field absent when the proposal named none', () => {
    const result: any = activateFromSanctioning({ sanctioningRecord: record() });
    expect(result.tournamentRecord.events[0].prizeMoney).toBeUndefined();
  });
});
