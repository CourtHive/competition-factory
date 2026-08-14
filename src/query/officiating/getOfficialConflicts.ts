// Constants
import {
  CONFLICT_DECLARED_RELATIONSHIP,
  MISSING_CONFLICT_PARTICIPANTS,
  CONFLICT_ORGANISATION,
  MISSING_OFFICIAL_RECORD,
  CONFLICT_NATIONALITY,
  CONFLICT_SAME_PERSON,
  CONFLICT_BLOCK,
} from '@Constants/officiatingConstants';
import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type {
  OfficialConflictDeclaration,
  ConflictOfInterestPolicy,
  ConflictSeverity,
  OfficialConflict,
  OfficialRecord,
  ConflictType,
} from '@Types/officiatingTypes';
import type { Participant } from '@Types/tournamentTypes';

type GetOfficialConflictsArgs = {
  officialRecord: OfficialRecord;
  participants?: Participant[];
  /** The official's own nationality — required for the NATIONALITY rule, which
   *  cannot be derived from the OfficialRecord (it carries no person detail). */
  nationalityCode?: string;
  /** Organisations the official is affiliated with, beyond any declared ones. */
  organisationIds?: string[];
  policyDefinitions?: { [key: string]: any };
};

type GetOfficialConflictsResult = {
  error?: any;
  success?: boolean;
  conflicts?: OfficialConflict[];
  /** True when at least one conflict carries BLOCK severity. */
  blocked?: boolean;
};

/** The participant attributes every rule is evaluated against. */
type ParticipantContext = {
  participantOrganisationId?: string;
  participantNationality?: string;
  participantPersonId?: string;
  participantName?: string;
  participantId?: string;
};

type RuleContext = ParticipantContext & {
  declarations: OfficialConflictDeclaration[];
  declaredOrganisationIds: Set<string>;
  officialPersonId: string;
  nationalityCode?: string;
};

function participantContext(participant: Participant): ParticipantContext {
  return {
    // personId is carried both on the participant and on its hydrated person;
    // which one is populated depends on whether participants were hydrated.
    participantPersonId: participant?.person?.personId ?? participant?.personId,
    // `representing` is the country a participant competes for, which may differ
    // from the person's nationality; either match is a conflict.
    participantNationality: participant?.person?.nationalityCode ?? participant?.representing,
    participantOrganisationId: participant?.person?.parentOrganisationId,
    participantName: participant?.participantName,
    participantId: participant?.participantId,
  };
}

function samePersonConflicts(severity: ConflictSeverity, context: RuleContext): OfficialConflict[] {
  const { participantPersonId, participantName, participantId, officialPersonId } = context;
  if (!participantPersonId || participantPersonId !== officialPersonId) return [];

  return [
    {
      conflictType: CONFLICT_SAME_PERSON,
      severity,
      personId: participantPersonId,
      participantId,
      participantName,
      reason: 'Official is entered in this tournament as a participant',
    },
  ];
}

function declaredRelationshipConflicts(severity: ConflictSeverity, context: RuleContext): OfficialConflict[] {
  const { participantPersonId, participantName, participantId, declarations } = context;

  return declarations
    .filter((declaration) => {
      const personMatch = declaration.personId && declaration.personId === participantPersonId;
      const participantMatch = declaration.participantId && declaration.participantId === participantId;
      return Boolean(personMatch || participantMatch);
    })
    .map((declaration) => ({
      conflictType: CONFLICT_DECLARED_RELATIONSHIP,
      severity,
      personId: participantPersonId,
      participantId,
      participantName,
      relationship: declaration.relationship,
      declarationId: declaration.declarationId,
      reason: declaration.relationship
        ? `Official has declared a ${declaration.relationship} relationship with this participant`
        : 'Official has declared a relationship with this participant',
    }));
}

function nationalityConflicts(severity: ConflictSeverity, context: RuleContext): OfficialConflict[] {
  const { participantNationality, participantPersonId, participantName, participantId, nationalityCode } = context;
  if (!nationalityCode || participantNationality !== nationalityCode) return [];

  return [
    {
      conflictType: CONFLICT_NATIONALITY,
      severity,
      personId: participantPersonId,
      participantId,
      participantName,
      nationalityCode,
      reason: `Official shares nationality ${nationalityCode} with this participant`,
    },
  ];
}

function organisationConflicts(severity: ConflictSeverity, context: RuleContext): OfficialConflict[] {
  const { participantOrganisationId, participantPersonId, participantName, participantId, declaredOrganisationIds } =
    context;
  if (!participantOrganisationId || !declaredOrganisationIds.has(participantOrganisationId)) return [];

  return [
    {
      conflictType: CONFLICT_ORGANISATION,
      severity,
      personId: participantPersonId,
      participantId,
      participantName,
      organisationId: participantOrganisationId,
      reason: 'Official is affiliated with this participant’s organisation',
    },
  ];
}

const CONFLICT_EVALUATORS: Record<
  ConflictType,
  (severity: ConflictSeverity, context: RuleContext) => OfficialConflict[]
> = {
  [CONFLICT_SAME_PERSON]: samePersonConflicts,
  [CONFLICT_DECLARED_RELATIONSHIP]: declaredRelationshipConflicts,
  [CONFLICT_NATIONALITY]: nationalityConflicts,
  [CONFLICT_ORGANISATION]: organisationConflicts,
};

/** Rules absent from the policy, or present with `enabled: false`, are not
 *  evaluated at all — a policy is an allow-list of checks, never a silent
 *  partial application. */
function enabledRules(policy: ConflictOfInterestPolicy): [ConflictType, ConflictSeverity][] {
  return Object.entries(policy.conflictRules ?? {})
    .filter(([conflictType, rule]) => rule?.enabled && conflictType in CONFLICT_EVALUATORS)
    .map(([conflictType, rule]) => [conflictType as ConflictType, rule!.severity]);
}

/**
 * Evaluate an official against a tournament's entered participants and return
 * every conflict of interest the supplied policy declares interest in.
 *
 * Pure and side-effect free: the caller supplies the participants, so this makes
 * no assumption about where the tournament record lives.
 *
 * Returns an error rather than an empty result when a policy is supplied with no
 * participants to check: "no conflicts" and "nothing was checked" must not look
 * the same to a caller that is about to make an assignment decision.
 */
export function getOfficialConflicts({
  officialRecord,
  participants,
  nationalityCode,
  organisationIds,
  policyDefinitions,
}: GetOfficialConflictsArgs): GetOfficialConflictsResult {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  const policy: ConflictOfInterestPolicy | undefined = policyDefinitions?.[POLICY_TYPE_OFFICIATING_CONFLICT];
  if (!policy) return { ...SUCCESS, conflicts: [], blocked: false };
  if (!Array.isArray(participants)) return { error: MISSING_CONFLICT_PARTICIPANTS };

  const declarations = officialRecord.conflictDeclarations ?? [];
  const declaredOrganisationIds = new Set(
    [...declarations.map((declaration) => declaration.organisationId), ...(organisationIds ?? [])].filter(
      (organisationId): organisationId is string => Boolean(organisationId),
    ),
  );

  const rules = enabledRules(policy);

  const conflicts = participants.flatMap((participant) => {
    const context: RuleContext = {
      ...participantContext(participant),
      officialPersonId: officialRecord.personId,
      declaredOrganisationIds,
      nationalityCode,
      declarations,
    };
    return rules.flatMap(([conflictType, severity]) => CONFLICT_EVALUATORS[conflictType](severity, context));
  });

  const blocked = conflicts.some((conflict) => conflict.severity === CONFLICT_BLOCK);

  return { ...SUCCESS, conflicts, blocked };
}
