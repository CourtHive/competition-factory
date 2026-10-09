import { sumAgainstBound, describeAmount } from '@Query/sanctioning/comparePrizeMoney';
import { isDisciplineAllowed } from '@Helpers/coercedDiscipline';
import { coercedGender } from '@Helpers/coercedGender';
import { now as clockNow } from '@Tools/clock';

// constants
import { MISSING_SANCTIONING_POLICY, MISSING_PROPOSAL } from '@Constants/sanctioningConstants';
import { OfficialRoleSubtypeEnum } from '@Types/officiatingTypes';
import { DIRECTOR } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';

// types
import { TierClassification } from '@Types/tournamentTypes';
import {
  TournamentProposal,
  SanctioningPolicy,
  SanctioningTier,
  PersonnelRole,
  PersonnelRoleCode,
  PersonReference,
} from '@Types/sanctioningTypes';

export type ValidationIssue = {
  field: string;
  message: string;
  severity: 'error' | 'warning';
};

type ValidateProposalArgs = {
  proposal: TournamentProposal;
  sanctioningPolicy: SanctioningPolicy;
  /**
   * The tier being applied for. Normally defaulted from the sanctioning record by the engine, so a
   * caller holding only a `sanctioningId` still gets the tier-specific rules — see the engine's
   * `validateProposal` wiring.
   */
  sanctioningTier?: TierClassification;
};

export function validateProposal({ proposal, sanctioningPolicy, sanctioningTier }: ValidateProposalArgs) {
  if (!proposal) return { error: MISSING_PROPOSAL };
  if (!sanctioningPolicy) return { error: MISSING_SANCTIONING_POLICY };

  const issues: ValidationIssue[] = [];
  // A policy's tiers are named rungs on one federation's ladder, so the tier's `value` is what
  // identifies the rung; `system` says whose ladder it is.
  const tier = sanctioningTier?.value
    ? sanctioningPolicy.tiers.find((t) => t.tierName === sanctioningTier.value)
    : undefined;

  // --- Global policy requirements ---
  if (sanctioningPolicy.requireInsurance && !proposal.insuranceCertificate) {
    issues.push({ field: 'insuranceCertificate', message: 'Insurance certificate required', severity: 'error' });
  }
  if (sanctioningPolicy.requireSafetyPlan && !proposal.safetyPlan) {
    issues.push({ field: 'safetyPlan', message: 'Safety plan required', severity: 'error' });
  }
  if (sanctioningPolicy.requireMedicalPlan && !proposal.medicalPlan) {
    issues.push({ field: 'medicalPlan', message: 'Medical plan required', severity: 'error' });
  }
  if (sanctioningPolicy.requireAntiCorruption && !proposal.antiCorruptionCompliance) {
    issues.push({
      field: 'antiCorruptionCompliance',
      message: 'Anti-corruption compliance required',
      severity: 'error',
    });
  }
  if (sanctioningPolicy.requireSafeguarding && !proposal.safeguardingCompliance) {
    issues.push({ field: 'safeguardingCompliance', message: 'Safeguarding compliance required', severity: 'error' });
  }

  // --- Lead time ---
  if (sanctioningPolicy.minimumLeadWeeks || tier?.minimumLeadWeeks) {
    const minWeeks = tier?.minimumLeadWeeks ?? sanctioningPolicy.minimumLeadWeeks ?? 0;
    const startDate = new Date(proposal.proposedStartDate);
    const now = clockNow();
    const weeksUntil = (startDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000);
    if (weeksUntil < minWeeks) {
      issues.push({
        field: 'proposedStartDate',
        message: `Minimum ${minWeeks} weeks lead time required; ${Math.floor(weeksUntil)} weeks remaining`,
        severity: 'error',
      });
    }
  }

  // --- Tier-specific validation ---
  if (tier) {
    validateTierConstraints({ proposal, tier, issues });
  }

  // --- Personnel ---
  validatePersonnel({ proposal, sanctioningPolicy, issues });

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const valid = errors.length === 0;

  return { ...SUCCESS, valid, issues, errors, warnings };
}

function validateTierConstraints({
  proposal,
  tier,
  issues,
}: {
  proposal: TournamentProposal;
  tier: SanctioningTier;
  issues: ValidationIssue[];
}) {
  validatePrizeMoney(proposal, tier, issues);
  validateCourts(proposal, tier, issues);

  for (let i = 0; i < proposal.events.length; i++) {
    validateEventConstraints(proposal.events[i], i, tier, issues);
  }
}

function validatePrizeMoney(proposal: TournamentProposal, tier: SanctioningTier, issues: ValidationIssue[]) {
  if (!proposal.totalPrizeMoney?.length) return;

  const bound = tier.minimumPrizeMoney ?? tier.maximumPrizeMoney;
  if (!bound) return;

  // Only amounts denominated as the bound is are summed. Prize money in another currency is
  // surfaced rather than folded into the total or quietly ignored: the tier rule genuinely cannot
  // be evaluated against it, and staying silent would read as "the rule passed".
  const { incomparable } = sumAgainstBound(proposal.totalPrizeMoney, bound);
  if (incomparable.length) {
    issues.push({
      field: 'totalPrizeMoney',
      message: `Prize money in ${incomparable.join(', ')} cannot be compared against ${tier.tierName} bounds in ${bound.currencyCode} (${bound.unit})`,
      severity: 'error',
    });
  }

  if (tier.minimumPrizeMoney) {
    const { comparable } = sumAgainstBound(proposal.totalPrizeMoney, tier.minimumPrizeMoney);
    if (comparable < tier.minimumPrizeMoney.amount) {
      issues.push({
        field: 'totalPrizeMoney',
        message: `Minimum prize money for ${tier.tierName}: ${describeAmount(tier.minimumPrizeMoney)}; proposed: ${comparable}`,
        severity: 'error',
      });
    }
  }
  if (tier.maximumPrizeMoney) {
    const { comparable } = sumAgainstBound(proposal.totalPrizeMoney, tier.maximumPrizeMoney);
    if (comparable > tier.maximumPrizeMoney.amount) {
      issues.push({
        field: 'totalPrizeMoney',
        message: `Maximum prize money for ${tier.tierName}: ${describeAmount(tier.maximumPrizeMoney)}; proposed: ${comparable}`,
        severity: 'error',
      });
    }
  }
}

function validateCourts(proposal: TournamentProposal, tier: SanctioningTier, issues: ValidationIssue[]) {
  if (tier.minimumCourts === undefined) return;
  const totalCourts = proposal.venues?.reduce((sum, v) => sum + (v.numberOfCourts ?? 0), 0) ?? 0;
  if (totalCourts < tier.minimumCourts) {
    issues.push({
      field: 'venues',
      message: `Minimum ${tier.minimumCourts} courts required; proposed: ${totalCourts}`,
      severity: 'error',
    });
  }
}

function validateEventConstraints(event, index: number, tier: SanctioningTier, issues: ValidationIssue[]) {
  const prefix = `events[${index}]`;
  const tierName = tier.tierName;

  if (tier.allowedEventTypes?.length && !tier.allowedEventTypes.includes(event.eventType)) {
    issues.push({
      field: `${prefix}.eventType`,
      message: `Event type '${event.eventType}' not allowed for tier ${tierName}`,
      severity: 'error',
    });
  }
  if (tier.allowedDrawTypes?.length && event.drawType && !tier.allowedDrawTypes.includes(event.drawType)) {
    issues.push({
      field: `${prefix}.drawType`,
      message: `Draw type '${event.drawType}' not allowed for tier ${tierName}`,
      severity: 'error',
    });
  }
  if (tier.allowedDrawSizes?.length && event.drawSize && !tier.allowedDrawSizes.includes(event.drawSize)) {
    issues.push({
      field: `${prefix}.drawSize`,
      message: `Draw size ${event.drawSize} not allowed for tier ${tierName}; allowed: ${tier.allowedDrawSizes.join(', ')}`,
      severity: 'error',
    });
  }
  if (
    tier.allowedMatchUpFormats?.length &&
    event.matchUpFormat &&
    !tier.allowedMatchUpFormats.includes(event.matchUpFormat)
  ) {
    issues.push({
      field: `${prefix}.matchUpFormat`,
      message: `Match format '${event.matchUpFormat}' not allowed for tier ${tierName}`,
      severity: 'error',
    });
  }
  if (
    tier.allowedGenders?.length &&
    event.gender &&
    !new Set(tier.allowedGenders.map(coercedGender)).has(coercedGender(event.gender))
  ) {
    issues.push({
      field: `${prefix}.gender`,
      message: `Gender '${event.gender}' not allowed for tier ${tierName}`,
      severity: 'error',
    });
  }
  if (
    tier.allowedDisciplines?.length &&
    event.discipline &&
    !isDisciplineAllowed(event.discipline, tier.allowedDisciplines)
  ) {
    issues.push({
      field: `${prefix}.discipline`,
      message: `Discipline '${event.discipline}' not allowed for tier ${tierName}`,
      severity: 'error',
    });
  }

  validateQualifyingConstraints(event, prefix, tier, issues);
}

function validateQualifyingConstraints(event, prefix: string, tier: SanctioningTier, issues: ValidationIssue[]) {
  if (!event.qualifyingDrawSize) return;
  if (tier.qualifyingAllowed === false) {
    issues.push({
      field: `${prefix}.qualifyingDrawSize`,
      message: `Qualifying not allowed for tier ${tier.tierName}`,
      severity: 'error',
    });
  } else if (tier.maxQualifyingDrawSize && event.qualifyingDrawSize > tier.maxQualifyingDrawSize) {
    issues.push({
      field: `${prefix}.qualifyingDrawSize`,
      message: `Qualifying draw size ${event.qualifyingDrawSize} exceeds maximum ${tier.maxQualifyingDrawSize}`,
      severity: 'error',
    });
  }
}

// Default certification hierarchy — higher index = higher level.
// Policies can override this via a certificationHierarchy field in the future.
const DEFAULT_CERTIFICATION_HIERARCHY = [
  'White Badge',
  'Bronze Badge',
  'Silver Badge',
  'Gold Badge',
  'Sectional',
  'National',
  'International',
];

function certificationMeetsRequirement(actual?: string, required?: string): boolean {
  if (!required) return true;
  if (!actual) return false;
  const hierarchy = DEFAULT_CERTIFICATION_HIERARCHY;
  const actualIdx = hierarchy.findIndex((h) => h.toLowerCase() === actual.toLowerCase());
  const requiredIdx = hierarchy.findIndex((h) => h.toLowerCase() === required.toLowerCase());
  // If either is not in the hierarchy, fall back to exact match
  if (actualIdx < 0 || requiredIdx < 0) return actual.toLowerCase() === required.toLowerCase();
  return actualIdx >= requiredIdx;
}

function validatePersonnel({
  proposal,
  sanctioningPolicy,
  issues,
}: {
  proposal: TournamentProposal;
  sanctioningPolicy: SanctioningPolicy;
  issues: ValidationIssue[];
}) {
  for (const role of sanctioningPolicy.personnelRules?.roles ?? []) {
    if (!role.required) continue;
    const personnelCheck = checkPersonnel(proposal, role);
    if (!personnelCheck.found) {
      const { foundCount, minimumCount } = personnelCheck;
      const shortfall = minimumCount > 1 ? ` (${foundCount} of ${minimumCount})` : '';
      issues.push({
        field: `personnel.${role.roleName}`,
        message: `Required role not filled: ${role.roleName}${shortfall}`,
        severity: 'error',
      });
    } else if (personnelCheck.certificationIssue) {
      issues.push({
        field: `personnel.${role.roleName}.certification`,
        message: personnelCheck.certificationIssue,
        severity: 'error',
      });
    }
  }
}

/**
 * The proposal fields that hold a role in their own right. Every other role is read from `officials`,
 * and so are these two, so an organiser who lists the referee among the officials is still counted.
 */
const DEDICATED_SLOTS: Partial<Record<PersonnelRoleCode, 'tournamentDirector' | 'referee'>> = {
  [DIRECTOR]: 'tournamentDirector',
  [OfficialRoleSubtypeEnum.REFEREE]: 'referee',
};

/**
 * Every named person the proposal puts in `roleName`, by exact code. A substring match here let a
 * `DEPUTY_REFEREE` rule be satisfied by the tournament referee. One person named in a slot and again
 * among the officials is counted once.
 */
function findPersons(proposal: TournamentProposal, roleName: PersonnelRoleCode): PersonReference[] {
  const slot = DEDICATED_SLOTS[roleName];
  const candidates: PersonReference[] = [
    ...(slot && proposal[slot] ? [proposal[slot]] : []),
    ...(proposal.officials ?? [])
      .filter((official) => official.role === roleName)
      .map(({ personName, certificationLevel }) => ({ personName, certificationLevel })),
  ];

  const seen = new Set<string>();
  return candidates.filter(({ personName }) => {
    const key = personName?.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function checkPersonnel(
  proposal: TournamentProposal,
  role: PersonnelRole,
): { found: boolean; foundCount: number; minimumCount: number; certificationIssue?: string } {
  const persons = findPersons(proposal, role.roleName);
  const minimumCount = role.minimumCount ?? 1;
  const foundCount = persons.length;

  if (foundCount < minimumCount) return { found: false, foundCount, minimumCount };

  if (role.certificationRequired) {
    for (const person of persons) {
      if (!person.certificationLevel) {
        return {
          found: true,
          foundCount,
          minimumCount,
          certificationIssue: `${role.roleName} requires '${role.certificationRequired}' certification but none specified`,
        };
      }
      if (!certificationMeetsRequirement(person.certificationLevel, role.certificationRequired)) {
        return {
          found: true,
          foundCount,
          minimumCount,
          certificationIssue: `${role.roleName} has '${person.certificationLevel}' but '${role.certificationRequired}' or higher is required`,
        };
      }
    }
  }

  return { found: true, foundCount, minimumCount };
}
