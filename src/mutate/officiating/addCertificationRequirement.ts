import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, CertificationRequirement, RequirementItem } from '@Types/officiatingTypes';

type AddCertificationRequirementArgs = {
  officialRecord: OfficialRecord;
  requirementId?: string;
  certificationFamily: string;
  certificationLevel: string;
  organisationId: string;
  description?: string;
  requirements: RequirementItem[];
  prerequisiteLevels?: string[];
  minimumAssignments?: number;
  minimumEvaluationScore?: number;
  validityPeriodMonths?: number;
  extensions?: any[];
};

export function addCertificationRequirement({
  officialRecord,
  requirementId,
  certificationFamily,
  certificationLevel,
  organisationId,
  description,
  requirements,
  prerequisiteLevels,
  minimumAssignments,
  minimumEvaluationScore,
  validityPeriodMonths,
  extensions,
}: AddCertificationRequirementArgs): {
  error?: any;
  certificationRequirement?: CertificationRequirement;
  success?: boolean;
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!certificationFamily)
    return { error: INVALID_VALUES, context: { message: 'Missing certificationFamily' } } as any;
  if (!certificationLevel)
    return { error: INVALID_VALUES, context: { message: 'Missing certificationLevel' } } as any;
  if (!organisationId) return { error: INVALID_VALUES, context: { message: 'Missing organisationId' } } as any;
  if (!Array.isArray(requirements) || requirements.length === 0)
    return { error: INVALID_VALUES, context: { message: 'Requirements must be a non-empty array' } } as any;

  const certificationRequirement: CertificationRequirement = {
    requirementId: requirementId || UUID(),
    certificationFamily,
    certificationLevel,
    organisationId,
    description,
    requirements: requirements.map((r) => ({
      ...r,
      itemId: r.itemId || UUID(),
    })),
    prerequisiteLevels,
    minimumAssignments,
    minimumEvaluationScore,
    validityPeriodMonths,
    extensions: extensions ?? [],
  };

  officialRecord.certificationRequirements.push(certificationRequirement);
  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS, certificationRequirement };
}
