// Constants
import { MISSING_SANCTIONING_POLICY, MISSING_PROPOSAL } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type {
  TournamentProposal,
  SanctioningPolicy,
  SanctioningTier,
  PersonnelRole,
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
  sanctioningTier?: string;
};

export function validateProposal({ proposal, sanctioningPolicy, sanctioningTier }: ValidateProposalArgs) {
  if (!proposal) return { error: MISSING_PROPOSAL };
  if (!sanctioningPolicy) return { error: MISSING_SANCTIONING_POLICY };

  const issues: ValidationIssue[] = [];
  const tier = sanctioningTier ? sanctioningPolicy.tiers.find((t) => t.tierName === sanctioningTier) : undefined;

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
    const now = new Date();
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
  if (sanctioningPolicy.personnelRules) {
    for (const role of sanctioningPolicy.personnelRules.roles) {
      if (!role.required) continue;
      const personnelCheck = checkPersonnel(proposal, role);
      if (!personnelCheck.found) {
        issues.push({
          field: `personnel.${role.roleName}`,
          message: `Required role not filled: ${role.roleName}`,
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
  const totalAmount = proposal.totalPrizeMoney.reduce((sum, pm) => sum + pm.amount, 0);

  if (tier.minimumPrizeMoney !== undefined && totalAmount < tier.minimumPrizeMoney) {
    issues.push({
      field: 'totalPrizeMoney',
      message: `Minimum prize money for ${tier.tierName}: ${tier.minimumPrizeMoney}; proposed: ${totalAmount}`,
      severity: 'error',
    });
  }
  if (tier.maximumPrizeMoney !== undefined && totalAmount > tier.maximumPrizeMoney) {
    issues.push({
      field: 'totalPrizeMoney',
      message: `Maximum prize money for ${tier.tierName}: ${tier.maximumPrizeMoney}; proposed: ${totalAmount}`,
      severity: 'error',
    });
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
    issues.push({ field: `${prefix}.eventType`, message: `Event type '${event.eventType}' not allowed for tier ${tierName}`, severity: 'error' });
  }
  if (tier.allowedDrawTypes?.length && event.drawType && !tier.allowedDrawTypes.includes(event.drawType)) {
    issues.push({ field: `${prefix}.drawType`, message: `Draw type '${event.drawType}' not allowed for tier ${tierName}`, severity: 'error' });
  }
  if (tier.allowedDrawSizes?.length && event.drawSize && !tier.allowedDrawSizes.includes(event.drawSize)) {
    issues.push({ field: `${prefix}.drawSize`, message: `Draw size ${event.drawSize} not allowed for tier ${tierName}; allowed: ${tier.allowedDrawSizes.join(', ')}`, severity: 'error' });
  }
  if (tier.allowedMatchUpFormats?.length && event.matchUpFormat && !tier.allowedMatchUpFormats.includes(event.matchUpFormat)) {
    issues.push({ field: `${prefix}.matchUpFormat`, message: `Match format '${event.matchUpFormat}' not allowed for tier ${tierName}`, severity: 'error' });
  }
  if (tier.allowedGenders?.length && event.gender && !tier.allowedGenders.includes(event.gender)) {
    issues.push({ field: `${prefix}.gender`, message: `Gender '${event.gender}' not allowed for tier ${tierName}`, severity: 'error' });
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

function findPerson(proposal: TournamentProposal, lowerRole: string): PersonReference | undefined {
  if (lowerRole.includes('director') && proposal.tournamentDirector?.personName) {
    return proposal.tournamentDirector;
  }
  if (lowerRole.includes('referee') && proposal.referee?.personName) {
    return proposal.referee;
  }
  const official = proposal.officials?.find((o) => o.role.toLowerCase().includes(lowerRole));
  if (official) {
    return { personName: official.personName, certificationLevel: official.certificationLevel };
  }
  return undefined;
}

function checkPersonnel(
  proposal: TournamentProposal,
  role: PersonnelRole,
): { found: boolean; certificationIssue?: string } {
  const lowerRole = role.roleName.toLowerCase();
  const person = findPerson(proposal, lowerRole);

  if (!person?.personName?.trim()) return { found: false };

  if (role.certificationRequired) {
    if (!person.certificationLevel) {
      return {
        found: true,
        certificationIssue: `${role.roleName} requires '${role.certificationRequired}' certification but none specified`,
      };
    }
    if (!certificationMeetsRequirement(person.certificationLevel, role.certificationRequired)) {
      return {
        found: true,
        certificationIssue: `${role.roleName} has '${person.certificationLevel}' but '${role.certificationRequired}' or higher is required`,
      };
    }
  }

  return { found: true };
}
