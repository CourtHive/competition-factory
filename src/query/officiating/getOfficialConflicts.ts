// Constants
import {
  CONFLICT_DECLARED_RELATIONSHIP,
  MISSING_CONFLICT_PARTICIPANTS,
  CONFLICT_SHARED_GROUPING,
  MISSING_CONFLICT_SOURCE,
  CONFLICT_ORGANISATION,
  CONFLICT_NATIONALITY,
  CONFLICT_SAME_PERSON,
  CONFLICT_BLOCK,
} from '@Constants/officiatingConstants';
import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import {
  OfficialConflictDeclaration,
  ConflictOfInterestPolicy,
  ConflictSeverity,
  ConflictRule,
  OfficialConflict,
  OfficialRecord,
  ConflictType,
} from '@Types/officiatingTypes';
import { Participant } from '@Types/tournamentTypes';

type GetOfficialConflictsArgs = {
  /** Durable registry declarations. OPTIONAL — a tournament-scoped check needs no registry record. */
  officialRecord?: OfficialRecord;
  participants?: Participant[];
  /** The official's participantId in THIS tournament — required for the SHARED_GROUPING rule. */
  officialParticipantId?: string;
  /** GROUP participants of the tournament, used to detect a shared grouping. */
  groupParticipants?: Participant[];
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
  /** GROUP participants containing the official, keyed for membership lookup. */
  officialGroupings: Participant[];
  officialParticipantId?: string;
  officialPersonId?: string;
  nationalityCode?: string;
  rule?: ConflictRule;
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

function sharedGroupingConflicts(severity: ConflictSeverity, context: RuleContext): OfficialConflict[] {
  const { participantPersonId, participantName, participantId, officialGroupings, rule } = context;
  if (!participantId) return [];

  return officialGroupings
    .filter((group) => (group.individualParticipantIds ?? []).includes(participantId))
    .map((group) => {
      // A GROUP carrying a `participantRole` is an explicitly-authored relationship (e.g. a coaching
      // group); one without is an incidental grouping. Per-role escalation lets policy block the
      // former while merely warning on the latter.
      const groupRole = group.participantRole;
      const escalated = groupRole ? rule?.roleSeverity?.[groupRole] : undefined;
      return {
        conflictType: CONFLICT_SHARED_GROUPING,
        severity: escalated ?? severity,
        personId: participantPersonId,
        participantId,
        participantName,
        groupParticipantId: group.participantId,
        groupName: group.participantName,
        groupRole,
        reason: groupRole
          ? `Official shares a ${groupRole} grouping (${group.participantName ?? group.participantId}) with this participant`
          : `Official shares a grouping (${group.participantName ?? group.participantId}) with this participant`,
      };
    });
}

const CONFLICT_EVALUATORS: Record<
  ConflictType,
  (severity: ConflictSeverity, context: RuleContext) => OfficialConflict[]
> = {
  [CONFLICT_SAME_PERSON]: samePersonConflicts,
  [CONFLICT_DECLARED_RELATIONSHIP]: declaredRelationshipConflicts,
  [CONFLICT_NATIONALITY]: nationalityConflicts,
  [CONFLICT_ORGANISATION]: organisationConflicts,
  [CONFLICT_SHARED_GROUPING]: sharedGroupingConflicts,
};

/** Rules absent from the policy, or present with `enabled: false`, are not
 *  evaluated at all — a policy is an allow-list of checks, never a silent
 *  partial application. */
function enabledRules(policy: ConflictOfInterestPolicy): [ConflictType, ConflictRule][] {
  return Object.entries(policy.conflictRules ?? {})
    .filter(([conflictType, rule]) => rule?.enabled && conflictType in CONFLICT_EVALUATORS)
    .map(([conflictType, rule]) => [conflictType as ConflictType, rule as ConflictRule]);
}

/**
 * Evaluate an official against a tournament's entered participants and return
 * every conflict of interest the supplied policy declares interest in.
 *
 * Pure and side-effect free: the caller supplies the participants, so this makes
 * no assumption about where the tournament record lives.
 *
 * **Two independent declaration sources, either of which is sufficient:**
 * - `officialRecord.conflictDeclarations` — durable, registry-owned (courthive-ams)
 * - `groupParticipants` + `officialParticipantId` — transient, expressed inside the
 *   tournamentRecord as GROUP membership (a coach GROUPed with players IS the declaration)
 *
 * The tournament-scoped source exists because expecting officials to keep a global registry
 * current is unrealistic, and an empty registry would otherwise make this return "no conflicts"
 * for everyone — indistinguishable from a check that passed.
 *
 * Returns an error rather than an empty result when a policy is supplied with no
 * participants to check: "no conflicts" and "nothing was checked" must not look
 * the same to a caller that is about to make an assignment decision.
 */
export function getOfficialConflicts({
  officialParticipantId,
  groupParticipants,
  policyDefinitions,
  nationalityCode,
  organisationIds,
  officialRecord,
  participants,
}: GetOfficialConflictsArgs): GetOfficialConflictsResult {
  const hasRegistrySource = Boolean(officialRecord);
  const hasTournamentSource = Boolean(officialParticipantId);
  if (!hasRegistrySource && !hasTournamentSource) return { error: MISSING_CONFLICT_SOURCE };

  const policy: ConflictOfInterestPolicy | undefined = policyDefinitions?.[POLICY_TYPE_OFFICIATING_CONFLICT];
  if (!policy) return { ...SUCCESS, conflicts: [], blocked: false };
  if (!Array.isArray(participants)) return { error: MISSING_CONFLICT_PARTICIPANTS };

  const declarations = officialRecord?.conflictDeclarations ?? [];
  const declaredOrganisationIds = new Set(
    [...declarations.map((declaration) => declaration.organisationId), ...(organisationIds ?? [])].filter(
      (organisationId): organisationId is string => Boolean(organisationId),
    ),
  );

  const rules = enabledRules(policy);

  // GROUP participants the official belongs to. Resolved once — membership is the same for every
  // participant being checked.
  const officialGroupings = officialParticipantId
    ? (groupParticipants ?? []).filter((group) =>
        (group.individualParticipantIds ?? []).includes(officialParticipantId),
      )
    : [];

  const conflicts = participants.flatMap((participant) => {
    const context: RuleContext = {
      ...participantContext(participant),
      officialPersonId: officialRecord?.personId,
      declaredOrganisationIds,
      officialParticipantId,
      officialGroupings,
      nationalityCode,
      declarations,
    };
    return rules.flatMap(([conflictType, rule]) =>
      CONFLICT_EVALUATORS[conflictType](rule.severity, { ...context, rule }),
    );
  });

  const blocked = conflicts.some((conflict) => conflict.severity === CONFLICT_BLOCK);

  return { ...SUCCESS, conflicts, blocked };
}
