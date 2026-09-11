import { sumAgainstBound, describeAmount } from './comparePrizeMoney';
// Constants
import { MISSING_SANCTIONING_POLICY, MISSING_PROPOSAL } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { TournamentProposal, SanctioningPolicy } from '@Types/sanctioningTypes';

type GetEligibleTiersArgs = {
  proposal: TournamentProposal;
  sanctioningPolicy: SanctioningPolicy;
};

type TierEligibility = {
  tierName: string;
  tierLevel: number;
  eligible: boolean;
  reasons: string[];
};

export function getEligibleTiers({ proposal, sanctioningPolicy }: GetEligibleTiersArgs) {
  if (!proposal) return { error: MISSING_PROPOSAL };
  if (!sanctioningPolicy) return { error: MISSING_SANCTIONING_POLICY };

  const tierEligibilities: TierEligibility[] = sanctioningPolicy.tiers.map((tier) => {
    const reasons: string[] = [];

    // Prize money check. Only amounts denominated as the bound is are summed — the previous
    // implementation added across currencies and compared to a unitless number.
    if (tier.minimumPrizeMoney && proposal.totalPrizeMoney?.length) {
      const { comparable } = sumAgainstBound(proposal.totalPrizeMoney, tier.minimumPrizeMoney);
      if (comparable < tier.minimumPrizeMoney.amount) {
        reasons.push(`Prize money ${comparable} below minimum ${describeAmount(tier.minimumPrizeMoney)}`);
      }
    }

    if (tier.maximumPrizeMoney && proposal.totalPrizeMoney?.length) {
      const { comparable } = sumAgainstBound(proposal.totalPrizeMoney, tier.maximumPrizeMoney);
      if (comparable > tier.maximumPrizeMoney.amount) {
        reasons.push(`Prize money ${comparable} above maximum ${describeAmount(tier.maximumPrizeMoney)}`);
      }
    }

    // Courts check
    if (tier.minimumCourts !== undefined) {
      const totalCourts = proposal.venues?.reduce((s, v) => s + (v.numberOfCourts ?? 0), 0) ?? 0;
      if (totalCourts < tier.minimumCourts) {
        reasons.push(`Courts ${totalCourts} below minimum ${tier.minimumCourts}`);
      }
    }

    // Event types check
    if (tier.allowedEventTypes?.length) {
      const disallowed = proposal.events
        .filter((e) => !tier.allowedEventTypes!.includes(e.eventType))
        .map((e) => e.eventType);
      if (disallowed.length) {
        reasons.push(`Disallowed event types: ${[...new Set(disallowed)].join(', ')}`);
      }
    }

    // Draw sizes check
    if (tier.allowedDrawSizes?.length) {
      const invalid = proposal.events
        .filter((e) => e.drawSize && !tier.allowedDrawSizes!.includes(e.drawSize))
        .map((e) => e.drawSize);
      if (invalid.length) {
        reasons.push(`Disallowed draw sizes: ${[...new Set(invalid)].join(', ')}`);
      }
    }

    return {
      tierName: tier.tierName,
      tierLevel: tier.tierLevel,
      eligible: reasons.length === 0,
      reasons,
    };
  });

  const eligibleTiers = tierEligibilities.filter((t) => t.eligible);

  return { ...SUCCESS, tierEligibilities, eligibleTiers };
}
