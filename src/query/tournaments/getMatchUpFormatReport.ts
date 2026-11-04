import { isWellFormedMatchUpFormat, matchUpFormatRefusal } from '@Validators/isValidMatchUpFormat';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';

// constants and types
import { DrawDefinition, Event, Extension, MatchUp, Structure, TieFormat, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_SANCTIONING, POLICY_TYPE_SCHEDULING, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { APPLIED_POLICIES, SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Every matchUpFormat code a tournament record holds, where it is, and whether it can be read.
 *
 * Two tiers, never conflated:
 *
 * - `MALFORMED`: `isWellFormedMatchUpFormat` is false. Nothing can read the code: an error.
 * - `REFUSED_FOR_NEW_USE`: well-formed, but `matchUpFormatRefusal` refuses it for a format being SET. A stored
 *   code is read and never refused on read (`isValidMatchUpFormat.ts`), so this is a warning: legacy codes are
 *   expected here and are not defects.
 *
 * Locations (Mentat/planning/TOURNAMENT_RECORD_FORMAT_VALIDATION.md, swept 2026-11-04):
 *
 * - `matchUpFormat` on an event, drawDefinition, structure (nested round robin groups included) and matchUp
 *   (`tieMatchUps` included), and the record-level and drawDefinition-level `matchUps` arrays;
 * - `collectionDefinitions[].matchUpFormat` in every `tieFormat`: event, drawDefinition, structure, matchUp,
 *   and the event's `tieFormats` catalog;
 * - `competitionFormat.matchUpFormat` on an event, drawDefinition and structure;
 * - `matchUpFormatCodes` in schedule timing: the tournament's `scheduling.timing` (else its `scheduleTiming`
 *   extension) and an event's `scheduleTiming` extension;
 * - applied policies on the tournament, event, drawDefinition and structure (the first-class `appliedPolicies`,
 *   else the extension, as `getAppliedPolicies` reads them): scoring `defaultMatchUpFormat` and
 *   `matchUpFormats[].matchUpFormat`, scheduling `matchUpAverageTimes` / `matchUpRecoveryTimes` codes, and
 *   sanctioning `tiers[].allowedMatchUpFormats`.
 *
 * Absent values (`undefined`, `null`) are not reported; any other value is, a non-string as `MALFORMED`.
 * A pure query: repair is a separate decision.
 */

export const FORMAT_LOCATION = {
  EVENT: 'EVENT',
  DRAW_DEFINITION: 'DRAW_DEFINITION',
  STRUCTURE: 'STRUCTURE',
  MATCHUP: 'MATCHUP',
  COLLECTION_DEFINITION: 'COLLECTION_DEFINITION',
  COMPETITION_FORMAT: 'COMPETITION_FORMAT',
  SCHEDULE_TIMING: 'SCHEDULE_TIMING',
  SCORING_POLICY: 'SCORING_POLICY',
  SCHEDULING_POLICY: 'SCHEDULING_POLICY',
  SANCTIONING_POLICY: 'SANCTIONING_POLICY',
} as const;

export const FORMAT_VERDICT = {
  VALID: 'VALID',
  REFUSED_FOR_NEW_USE: 'REFUSED_FOR_NEW_USE',
  MALFORMED: 'MALFORMED',
} as const;

export type FormatLocation = (typeof FORMAT_LOCATION)[keyof typeof FORMAT_LOCATION];
export type FormatVerdict = (typeof FORMAT_VERDICT)[keyof typeof FORMAT_VERDICT];

export type FormatReportIds = {
  eventId?: string;
  drawId?: string;
  structureId?: string;
  matchUpId?: string;
  collectionId?: string;
  tieFormatId?: string;
};

export type FormatReportEntry = {
  location: FormatLocation;
  /** where the code sits, from the tournament record: `events[0].drawDefinitions[1].structures[0].matchUpFormat` */
  path: string;
  ids: FormatReportIds;
  matchUpFormat: unknown;
  verdict: FormatVerdict;
  info?: string;
};

export type FormatReportCounts = Record<FormatVerdict, number>;

type Scope = { path: string; ids: FormatReportIds };

/** what an event, drawDefinition, structure and matchUp share; read loosely, since a stored record need not obey its type */
type FormatHolder = { matchUpFormat?: unknown; competitionFormat?: { matchUpFormat?: unknown }; tieFormat?: TieFormat };
type ExtensionHolder = { extensions?: Extension[]; appliedPolicies?: PolicyDefinitions };
type TimingDefinition = { matchUpFormatCodes?: unknown };
type ScoringFormatDefinition = string | { matchUpFormat?: unknown };
type SanctioningTier = { allowedMatchUpFormats?: unknown };

export function getMatchUpFormatReport({ tournamentRecord }: { tournamentRecord: Tournament }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const entries: FormatReportEntry[] = [];

  const consider = (location: FormatLocation, path: string, ids: FormatReportIds, matchUpFormat: unknown) => {
    if (matchUpFormat === undefined || matchUpFormat === null) return;
    const definedIds = Object.fromEntries(Object.entries(ids).filter(([, id]) => id !== undefined));
    entries.push({ location, path, ids: definedIds, matchUpFormat, ...verdictOf(matchUpFormat) });
  };

  const considerTieFormat = (tieFormat: TieFormat | undefined, scope: Scope) => {
    const ids = tieFormat?.tieFormatId ? { ...scope.ids, tieFormatId: tieFormat.tieFormatId } : scope.ids;
    arrayOf<TieFormat['collectionDefinitions'][number]>(tieFormat?.collectionDefinitions).forEach(
      (collectionDefinition, index) => {
        const collectionIds = collectionDefinition?.collectionId
          ? { ...ids, collectionId: collectionDefinition.collectionId }
          : ids;
        const path = `${scope.path}.collectionDefinitions[${index}].matchUpFormat`;
        consider(FORMAT_LOCATION.COLLECTION_DEFINITION, path, collectionIds, collectionDefinition?.matchUpFormat);
      },
    );
  };

  // `matchUpFormat`, `competitionFormat` and `tieFormat`, which an event, drawDefinition, structure and matchUp share
  const considerElement = (element: FormatHolder | undefined, location: FormatLocation, scope: Scope) => {
    consider(location, `${scope.path}.matchUpFormat`, scope.ids, element?.matchUpFormat);
    const competitionFormatPath = `${scope.path}.competitionFormat.matchUpFormat`;
    consider(
      FORMAT_LOCATION.COMPETITION_FORMAT,
      competitionFormatPath,
      scope.ids,
      element?.competitionFormat?.matchUpFormat,
    );
    if (element?.tieFormat) considerTieFormat(element.tieFormat, { path: `${scope.path}.tieFormat`, ids: scope.ids });
  };

  const considerTiming = (timing: Record<string, unknown> | undefined, scope: Scope, location: FormatLocation) => {
    for (const key of ['matchUpAverageTimes', 'matchUpRecoveryTimes']) {
      arrayOf<TimingDefinition>(timing?.[key]).forEach((definition, index) => {
        arrayOf(definition?.matchUpFormatCodes).forEach((code, codeIndex) => {
          consider(location, `${scope.path}.${key}[${index}].matchUpFormatCodes[${codeIndex}]`, scope.ids, code);
        });
      });
    }
  };

  const considerPolicies = (element: ExtensionHolder | undefined, scope: Scope) => {
    const extensionIndex = arrayOf<Extension>(element?.extensions).findIndex(
      (extension) => extension?.name === APPLIED_POLICIES,
    );
    const policies: PolicyDefinitions | undefined =
      element?.appliedPolicies ?? element?.extensions?.[extensionIndex]?.value;
    if (!policies) return;
    const policiesPath =
      element?.appliedPolicies === undefined
        ? `${scope.path}.extensions[${extensionIndex}].value`
        : `${scope.path}.appliedPolicies`;

    const scoring = policies[POLICY_TYPE_SCORING];
    const scoringPath = `${policiesPath}.${POLICY_TYPE_SCORING}`;
    const scoringLocation = FORMAT_LOCATION.SCORING_POLICY;
    consider(scoringLocation, `${scoringPath}.defaultMatchUpFormat`, scope.ids, scoring?.defaultMatchUpFormat);
    arrayOf<ScoringFormatDefinition>(scoring?.matchUpFormats).forEach((definition, index) => {
      // a definition is `{ matchUpFormat, description, ... }`; a bare code is read too rather than skipped
      const code = typeof definition === 'string' ? definition : definition?.matchUpFormat;
      const path = `${scoringPath}.matchUpFormats[${index}]${typeof definition === 'string' ? '' : '.matchUpFormat'}`;
      consider(scoringLocation, path, scope.ids, code);
    });

    const schedulingPath = `${policiesPath}.${POLICY_TYPE_SCHEDULING}`;
    const schedulingScope = { path: schedulingPath, ids: scope.ids };
    considerTiming(policies[POLICY_TYPE_SCHEDULING], schedulingScope, FORMAT_LOCATION.SCHEDULING_POLICY);

    const sanctioningPath = `${policiesPath}.${POLICY_TYPE_SANCTIONING}`;
    arrayOf<SanctioningTier>(policies[POLICY_TYPE_SANCTIONING]?.tiers).forEach((tier, index) => {
      arrayOf(tier?.allowedMatchUpFormats).forEach((code, codeIndex) => {
        const path = `${sanctioningPath}.tiers[${index}].allowedMatchUpFormats[${codeIndex}]`;
        consider(FORMAT_LOCATION.SANCTIONING_POLICY, path, scope.ids, code);
      });
    });
  };

  const considerScheduleTimingExtension = (element: ExtensionHolder | undefined, scope: Scope) => {
    const extensions = arrayOf<Extension>(element?.extensions);
    const index = extensions.findIndex((extension) => extension?.name === SCHEDULE_TIMING);
    if (index < 0) return;
    const path = `${scope.path}.extensions[${index}].value`;
    considerTiming(extensions[index].value, { path, ids: scope.ids }, FORMAT_LOCATION.SCHEDULE_TIMING);
  };

  const considerMatchUp = (matchUp: MatchUp | undefined, scope: Scope) => {
    const ids = matchUp?.matchUpId ? { ...scope.ids, matchUpId: matchUp.matchUpId } : scope.ids;
    considerElement(matchUp, FORMAT_LOCATION.MATCHUP, { path: scope.path, ids });
    arrayOf<MatchUp>(matchUp?.tieMatchUps).forEach((tieMatchUp, index) =>
      considerMatchUp(tieMatchUp, { path: `${scope.path}.tieMatchUps[${index}]`, ids }),
    );
  };

  const considerMatchUps = (matchUps: unknown, scope: Scope) =>
    arrayOf<MatchUp>(matchUps).forEach((matchUp, index) =>
      considerMatchUp(matchUp, { path: `${scope.path}.matchUps[${index}]`, ids: scope.ids }),
    );

  // a round robin container's groups are structures too, so this recurses; `matchUps` and `structures` are both
  // read whatever `structureType` says, since a record built outside the API need not agree with it
  const considerStructure = (structure: Structure | undefined, scope: Scope) => {
    const ids = structure?.structureId ? { ...scope.ids, structureId: structure.structureId } : scope.ids;
    const structureScope = { path: scope.path, ids };
    considerElement(structure, FORMAT_LOCATION.STRUCTURE, structureScope);
    considerPolicies(structure, structureScope);
    considerMatchUps(matchUpsOf(structure), structureScope);
    arrayOf<Structure>(structuresOf(structure)).forEach((child, index) =>
      considerStructure(child, { path: `${scope.path}.structures[${index}]`, ids }),
    );
  };

  // tournament: CODES `scheduling.timing` is read first, the `scheduleTiming` extension only without it
  const tournamentScope = { path: 'tournamentRecord', ids: {} };
  const timing = tournamentRecord.scheduling?.timing;
  if (timing === undefined) {
    considerScheduleTimingExtension(tournamentRecord, tournamentScope);
  } else {
    const timingScope = { path: 'tournamentRecord.scheduling.timing', ids: {} };
    considerTiming(timing as Record<string, unknown>, timingScope, FORMAT_LOCATION.SCHEDULE_TIMING);
  }
  considerPolicies(tournamentRecord, tournamentScope);
  considerMatchUps(tournamentRecord.matchUps, tournamentScope);

  arrayOf<Event>(tournamentRecord.events).forEach((event, eventIndex) => {
    const eventScope = { path: `tournamentRecord.events[${eventIndex}]`, ids: { eventId: event?.eventId } };
    considerElement(event, FORMAT_LOCATION.EVENT, eventScope);
    arrayOf<TieFormat>(event?.tieFormats).forEach((tieFormat, index) =>
      considerTieFormat(tieFormat, { path: `${eventScope.path}.tieFormats[${index}]`, ids: eventScope.ids }),
    );
    considerScheduleTimingExtension(event, eventScope);
    considerPolicies(event, eventScope);

    arrayOf<DrawDefinition>(event?.drawDefinitions).forEach((drawDefinition, drawIndex) => {
      const drawScope = {
        path: `${eventScope.path}.drawDefinitions[${drawIndex}]`,
        ids: { ...eventScope.ids, drawId: drawDefinition?.drawId },
      };
      considerElement(drawDefinition, FORMAT_LOCATION.DRAW_DEFINITION, drawScope);
      considerPolicies(drawDefinition, drawScope);
      considerMatchUps(drawDefinition?.matchUps, drawScope);
      arrayOf<Structure>(drawDefinition?.structures).forEach((structure, structureIndex) =>
        considerStructure(structure, { path: `${drawScope.path}.structures[${structureIndex}]`, ids: drawScope.ids }),
      );
    });
  });

  const counts: FormatReportCounts = { VALID: 0, REFUSED_FOR_NEW_USE: 0, MALFORMED: 0 };
  for (const entry of entries) counts[entry.verdict] += 1;

  return { ...SUCCESS, entries, counts };
}

function verdictOf(matchUpFormat: unknown): { verdict: FormatVerdict; info?: string } {
  if (typeof matchUpFormat !== 'string' || !isWellFormedMatchUpFormat({ matchUpFormat })) {
    return { verdict: FORMAT_VERDICT.MALFORMED };
  }
  const refusal = matchUpFormatRefusal({ matchUpFormat });
  if (!refusal) return { verdict: FORMAT_VERDICT.VALID };
  return { verdict: FORMAT_VERDICT.REFUSED_FOR_NEW_USE, ...(refusal.info ? { info: refusal.info } : {}) };
}

function arrayOf<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
