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

    // Prize money check
    if (tier.minimumPrizeMoney !== undefined && proposal.totalPrizeMoney?.length) {
      const total = proposal.totalPrizeMoney.reduce((s, pm) => s + pm.amount, 0);
      if (total < tier.minimumPrizeMoney) {
        reasons.push(`Prize money ${total} below minimum ${tier.minimumPrizeMoney}`);
      }
    }

    if (tier.maximumPrizeMoney !== undefined && proposal.totalPrizeMoney?.length) {
      const total = proposal.totalPrizeMoney.reduce((s, pm) => s + pm.amount, 0);
      if (total > tier.maximumPrizeMoney) {
        reasons.push(`Prize money ${total} above maximum ${tier.maximumPrizeMoney}`);
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
