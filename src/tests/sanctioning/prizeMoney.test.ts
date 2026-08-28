import { sumAgainstBound, describeAmount } from '@Query/sanctioning/comparePrizeMoney';
import { activateFromSanctioning } from '@Mutate/sanctioning/activateFromSanctioning';
import { validateProposal } from '@Validators/sanctioning/validateProposal';
import { expect, it, describe } from 'vitest';

// constants and types
import type { PrizeMoneyAward, Tournament, Event } from '@Types/tournamentTypes';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { APPROVED } from '@Constants/sanctioningConstants';

// Fixtures
import { POLICY_RANKING_POINTS_ATP } from '@Fixtures/policies/POLICY_RANKING_POINTS_ATP';

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

/**
 * Prize money BY FINISHING POSITION.
 *
 * `PrizeMoney` states a total. `PrizeMoneyAward` states the ladder — what each finishing position
 * was actually worth — which is how competitions commonly award it and which CODES previously
 * dropped.
 *
 * The ladders below follow the Grand Slam model of per-round payouts, in the form such ladders are
 * published: comma-formatted strings keyed by round code. Realistic shapes rather than convenient
 * ones, so the traps this type exists to prevent are actually exercised.
 */
describe('prizeMoneyAwards', () => {
  /** A Grand Slam singles main draw: drawSize 128, eight rungs. */
  const mainDrawLadder = [
    { roundCode: '1', roundName: 'Round 1', money: '140,000' },
    { roundCode: '2', roundName: 'Round 2', money: '190,000' },
    { roundCode: '3', roundName: 'Round 3', money: '290,000' },
    { roundCode: '4', roundName: 'Round 4', money: '480,000' },
    { roundCode: 'Q', roundName: 'Quarter-Finals', money: '780,000' },
    { roundCode: 'S', roundName: 'Semi-Finals', money: '1,450,000' },
    { roundCode: 'F', roundName: 'Final', money: '2,800,000' },
    { roundCode: 'W', roundName: 'Winner', money: '5,500,000' },
  ];

  /** A small event in the same tournament: drawSize 16, five rungs, the SAME `roundCode` values. */
  const smallDrawLadder = [
    { roundCode: '1', roundName: 'Round 1', money: '40,000' },
    { roundCode: 'Q', roundName: 'Quarter-Finals', money: '120,000' },
    { roundCode: 'S', roundName: 'Semi-Finals', money: '250,000' },
    { roundCode: 'F', roundName: 'Final', money: '500,000' },
    { roundCode: 'W', roundName: 'Winner', money: '1,000,000' },
  ];

  /** A qualifying draw: drawSize 128, three rungs, and none for the players who come through. */
  const qualifyingLadder = [
    { roundCode: '1', roundName: 'Round 1', money: '32,000' },
    { roundCode: '2', roundName: 'Round 2', money: '48,000' },
    { roundCode: '3', roundName: 'Round 3', money: '66,000' },
  ];

  /**
   * What an adapter has to do, reduced to its two decisions — because both are places the data
   * lies about itself:
   *
   *   1. `"1,450,000"` is a comma-formatted STRING. `Number('1,450,000')` is `NaN`, and a silent
   *      `NaN` in a money field is the worst available outcome.
   *   2. A row keyed 'Round 1' is what a first-round LOSER got, which is the LAST finishing
   *      position — and which position that is depends on the DRAW SIZE, not on the round.
   */
  const toAwards = (rows: typeof mainDrawLadder, drawSize: number): PrizeMoneyAward[] => {
    const finalRounds: Record<string, number> = { W: 1, F: 2, S: 4, Q: 8 };
    return rows.map((row) => {
      const roundNumber = Number.parseInt(row.roundCode, 10);
      const finishingPosition = finalRounds[row.roundCode] ?? drawSize / 2 ** (roundNumber - 1);
      const amount = Number(row.money.replaceAll(',', ''));
      return {
        amount,
        currencyCode: 'USD',
        unit: 'MAJOR' as const,
        finishingPosition,
        roundName: row.roundName,
        roundCode: row.roundCode,
      };
    });
  };

  it('parses the published string rather than Number()-ing it into NaN', () => {
    expect(Number('1,450,000')).toBeNaN();
    expect(toAwards(mainDrawLadder, 128).find((a) => a.roundCode === 'S')?.amount).toEqual(1450000);
  });

  it('maps the eight published rows onto the eight finishing positions of a 128 draw', () => {
    const awards = toAwards(mainDrawLadder, 128);

    expect(awards.map((a) => a.finishingPosition)).toEqual([128, 64, 32, 16, 8, 4, 2, 1]);
    expect(awards.map((a) => a.amount)).toEqual([140000, 190000, 290000, 480000, 780000, 1450000, 2800000, 5500000]);
    // the authority's own vocabulary survives beside the position, so the mapping stays auditable
    expect(awards.at(-1)).toEqual({
      amount: 5500000,
      currencyCode: 'USD',
      unit: 'MAJOR',
      finishingPosition: 1,
      roundName: 'Winner',
      roundCode: 'W',
    });
  });

  /**
   * The trap the type exists to name. Same tournament, same `roundCode: '1'` — and a round-keyed
   * model cannot tell these two apart.
   */
  it('resolves the SAME roundCode to different positions at different draw sizes', () => {
    const large = toAwards(mainDrawLadder, 128).find((a) => a.roundCode === '1');
    const small = toAwards(smallDrawLadder, 16).find((a) => a.roundCode === '1');

    expect(large?.finishingPosition).toEqual(128);
    expect(small?.finishingPosition).toEqual(16);
    expect(small?.finishingPosition).not.toEqual(large?.finishingPosition);
  });

  /** A qualifying ladder's top rung is NOT position 1 — the qualifiers are paid from the main draw. */
  it('does not invent a winner rung for a qualifying ladder', () => {
    const awards = toAwards(qualifyingLadder, 128);

    expect(awards.map((a) => a.finishingPosition)).toEqual([128, 64, 32]);
    expect(awards.some((a) => a.finishingPosition === 1)).toEqual(false);
  });

  /**
   * The reason for reusing the key: the ranking-points policy already describes these same eight
   * outcomes, so points and money become one join rather than two vocabularies. If this ever
   * fails, the two models have diverged and the join is silently wrong.
   */
  it('uses the same keys the ATP ranking-points policy uses for a Grand Slam', () => {
    const profiles = POLICY_RANKING_POINTS_ATP[POLICY_TYPE_RANKING_POINTS].awardProfiles;
    const grandSlamSingles: any = profiles.find((p: any) => p.profileName === 'Grand Slam Singles');
    const pointKeys = Object.keys(grandSlamSingles.finishingPositionRanges).map(Number);
    const moneyKeys = toAwards(mainDrawLadder, 128).map((a) => a.finishingPosition);

    expect([...pointKeys].toSorted((a, b) => a - b)).toEqual([...moneyKeys].toSorted((a, b) => a - b));
    // "R16 was worth 200 points and $480,000" — expressible because the key is shared
    expect(grandSlamSingles.finishingPositionRanges[16]).toEqual(200);
    expect(moneyKeys.indexOf(16)).toBeGreaterThan(-1);
  });

  /**
   * A ladder is not a list of totals. Each rung is what ONE competitor received, so the outlay is
   * `amount × competitors finishing in that range` — and the naive sum understates the purse by
   * more than threefold. This is why awards are a separate field from
   * `prizeMoney` and why `sumAgainstBound` must never be handed one.
   */
  it('must not be summed as if each rung were a total', () => {
    const awards = toAwards(mainDrawLadder, 128);
    // positions 65-128 all won the same 140,000; position 2 is one player; position 1 is one player
    const competitorsAt = (finishingPosition: number) => (finishingPosition <= 2 ? 1 : finishingPosition / 2);
    const outlay = awards.reduce((total, a) => total + a.amount * competitorsAt(a.finishingPosition), 0);
    const naive = awards.reduce((total, a) => total + a.amount, 0);

    expect(outlay).toEqual(37840000);
    expect(naive).toEqual(11630000);
    expect(naive).not.toEqual(outlay);

    // the existing total-comparison helper produces exactly that wrong figure, correctly
    // denominated — which is what makes it dangerous rather than obviously broken. The compiler
    // now refuses the call outright (`PrizeMoney.finishingPosition?: never`); before that
    // discriminant existed, structural typing accepted a ladder here in silence.
    // @ts-expect-error — a ladder is not a list of totals and may not be summed as one
    expect(sumAgainstBound(awards, USD(0)).comparable).toEqual(naive);
  });

  it('hangs the ladder off the event, which is the grain it is published at', () => {
    const event: Event = {
      eventId: 'e-ms',
      prizeMoneyAwards: toAwards(mainDrawLadder, 128),
      prizeMoney: [USD(37840000)],
    };

    expect(event.prizeMoneyAwards).toHaveLength(8);
    // one tournament, several ladders — none derivable from another
    const qualifying: Event = { eventId: 'e-mq', prizeMoneyAwards: toAwards(qualifyingLadder, 128) };
    expect(qualifying.prizeMoneyAwards).toHaveLength(3);
  });

  it('also sits at tournament grain, beside the total it explains', () => {
    // 2,800,000 is DERIVED from the ladder (8x40k + 4x120k + 2x250k + 500k + 1000k) rather than
    // asserted — the same `amount × competitors` arithmetic as above, checked a second time at a
    // different draw size.
    const tournament: Tournament = {
      tournamentId: 't-uso',
      totalPrizeMoney: [USD(2800000)],
      prizeMoneyAwards: toAwards(smallDrawLadder, 16),
    };
    const competitorsAt = (finishingPosition: number) => (finishingPosition <= 2 ? 1 : finishingPosition / 2);
    const outlay = (tournament.prizeMoneyAwards ?? []).reduce(
      (total, a) => total + a.amount * competitorsAt(a.finishingPosition),
      0,
    );

    expect(tournament.prizeMoneyAwards?.map((a) => a.finishingPosition)).toEqual([16, 8, 4, 2, 1]);
    expect(outlay).toEqual(tournament.totalPrizeMoney?.[0].amount);
  });

  /**
   * `unit` is required, and this is the assertion that keeps it that way. Publishers disagree on
   * scale — whole units and minor units both occur — so an award without a declared one is off by
   * 100x with nothing to signal it.
   */
  it('will not type-check an award that omits its unit', () => {
    // @ts-expect-error — `unit` is required by MonetaryAmount and must stay required here
    const missingUnit: PrizeMoneyAward = { amount: 140000, currencyCode: 'USD', finishingPosition: 128 };
    expect(missingUnit.amount).toEqual(140000);

    // @ts-expect-error — `finishingPosition` is what makes this an award rather than a total
    const missingPosition: PrizeMoneyAward = { amount: 140000, currencyCode: 'USD', unit: 'MAJOR' };
    expect(missingPosition.amount).toEqual(140000);
  });
});
