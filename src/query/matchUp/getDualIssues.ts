import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { getCategoryAgeDetails } from '@Query/event/getCategoryAgeDetails';
import { checkScoreCompleteness } from '@Validators/scoreCompleteness';
import { coercedGender } from '@Helpers/coercedGender';
import { findMatchUp } from '@Acquire/findMatchUp';

// constants and types
import { completedMatchUpStatuses, COMPLETED, DEFAULTED, RETIRED } from '@Constants/matchUpStatusConstants';
import {
  ErrorType,
  INVALID_VALUES,
  MISSING_MATCHUP,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';
import {
  DUAL_DECIDED,
  DUPLICATE_IN_COLLECTION,
  INELIGIBLE_CATEGORY,
  INELIGIBLE_GENDER,
  LINEUP_INCOMPLETE,
  MANUAL_SCORE,
  MANUAL_SCORE_DIVERGES,
  MISSING_REASON,
  SCORE_INCOMPLETE,
} from '@Constants/dualIssueConstants';
import { CollectionDefinition, DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { HydratedMatchUp, HydratedParticipant, HydratedSide } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

export type DualIssue = {
  code: string;
  matchUpId?: string; // the line, for a line's issue
  matchUpIds?: string[]; // the lines a dual's issue names
  collectionId?: string;
  participantIds?: string[];
  sideNumber?: number;
  info?: string;
};

type GetDualIssuesArgs = {
  /** a TEAM dual, hydrated ({ inContext: true }); when absent it is found from `matchUpId` */
  matchUp?: HydratedMatchUp;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUpId?: string;
  event?: Event;
  /** the date a category's ages are measured on; default the dual's scheduled date. Without one, ages are not checked */
  consideredDate?: string;
};

/**
 * What is wrong with a TEAM dual, for a scorecard to show: per line (an incomplete line-up, a participant twice in a
 * collection, a participant who does not fit the collection's gender or category, a completed line whose score does
 * not satisfy its format, a retirement or default without a reason) and per dual (decided with lines still unplayed;
 * a team score held by hand, and whether it disagrees with the lines). Reports only; changes nothing.
 */
export function getDualIssues(params: GetDualIssuesArgs): {
  issues?: DualIssue[];
  success?: boolean;
  error?: ErrorType;
} {
  const { matchUp, error } = params.matchUp?.hasContext
    ? { matchUp: params.matchUp, error: undefined }
    : resolve(params);
  if (error || !matchUp) return { error: error ?? MISSING_MATCHUP };
  if (!Array.isArray(matchUp.tieMatchUps)) return { error: INVALID_VALUES };

  const collections = matchUp.tieFormat?.collectionDefinitions ?? [];
  // a hydrated dual's lines are hydrated too
  const lines = matchUp.tieMatchUps as HydratedMatchUp[];
  const date = params.consideredDate ?? matchUp.schedule?.scheduledDate;

  const issues: DualIssue[] = [
    ...lines.flatMap(lineUpIssues),
    ...collections.flatMap((collection) => duplicateIssues(collection.collectionId, lines)),
    ...lines.flatMap((line) => eligibilityIssues(line, collections, date)),
    ...lines.flatMap(resultIssues),
    ...dualIssues(matchUp),
  ];
  return { issues, ...SUCCESS };
}

function resolve(params: GetDualIssuesArgs): { matchUp?: HydratedMatchUp; error?: ErrorType } {
  const { tournamentRecord, drawDefinition, matchUpId, event } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpId) return { error: MISSING_MATCHUP };
  return findMatchUp({ tournamentRecord, drawDefinition, matchUpId, event, inContext: true });
}

const individualsOf = (side?: HydratedSide): HydratedParticipant[] => {
  const participant = side?.participant;
  if (!participant) return [];
  return participant.individualParticipants?.length ? participant.individualParticipants : [participant];
};

function lineUpIssues(line: HydratedMatchUp): DualIssue[] {
  const needed = line.matchUpType === DOUBLES ? 2 : 1;
  return [1, 2].flatMap((sideNumber) => {
    const side = line.sides?.find((candidate) => candidate.sideNumber === sideNumber);
    return individualsOf(side).length < needed
      ? [{ code: LINEUP_INCOMPLETE, matchUpId: line.matchUpId, collectionId: line.collectionId, sideNumber }]
      : [];
  });
}

function duplicateIssues(collectionId: string, lines: HydratedMatchUp[]): DualIssue[] {
  const seen = new Map<string, string[]>();
  for (const line of lines.filter((candidate) => candidate.collectionId === collectionId)) {
    for (const side of line.sides ?? []) {
      for (const { participantId } of individualsOf(side)) {
        seen.set(participantId, [...(seen.get(participantId) ?? []), line.matchUpId]);
      }
    }
  }
  return [...seen.entries()]
    .filter(([, matchUpIds]) => matchUpIds.length > 1)
    .map(([participantId, matchUpIds]) => ({
      code: DUPLICATE_IN_COLLECTION,
      participantIds: [participantId],
      collectionId,
      matchUpIds,
    }));
}

function eligibilityIssues(line: HydratedMatchUp, collections: CollectionDefinition[], date?: string): DualIssue[] {
  const collection = collections.find((candidate) => candidate.collectionId === line.collectionId);
  if (!collection) return [];
  return (line.sides ?? []).flatMap((side) => [
    ...genderIssue(line, side, collection),
    ...categoryIssue(line, side, collection, date),
  ]);
}

function genderIssue(line: HydratedMatchUp, side: HydratedSide, collection: CollectionDefinition): DualIssue[] {
  const required = coercedGender(line.gender ?? collection.gender);
  const individuals = individualsOf(side);
  const sexes = individuals.map((individual) => coercedGender(individual?.person?.sex));
  let fits = true;
  if (required === MALE || required === FEMALE) fits = sexes.every((sex) => !sex || sex === required);
  // a MIXED doubles pair is one of each; a known pair of the same sex does not fit
  else if (required === MIXED && line.matchUpType === DOUBLES && sexes.length === 2 && sexes.every(Boolean))
    fits = sexes[0] !== sexes[1];
  if (fits) return [];
  return [
    {
      participantIds: individuals.map(({ participantId }) => participantId),
      collectionId: line.collectionId,
      sideNumber: side.sideNumber,
      matchUpId: line.matchUpId,
      code: INELIGIBLE_GENDER,
      info: required,
    },
  ];
}

function categoryIssue(
  line: HydratedMatchUp,
  side: HydratedSide,
  collection: CollectionDefinition,
  date?: string,
): DualIssue[] {
  const category = line.category ?? collection.category;
  if (!category || !date) return [];
  const { ageMinDate, ageMaxDate } = getCategoryAgeDetails({ category, consideredDate: date }) ?? {};
  if (!ageMinDate && !ageMaxDate) return [];
  const outside = individualsOf(side).filter(({ person }) => {
    const birthDate = person?.birthDate;
    if (!birthDate) return false;
    return (ageMinDate && birthDate < ageMinDate) || (ageMaxDate && birthDate > ageMaxDate);
  });
  if (!outside.length) return [];
  return [
    {
      participantIds: outside.map(({ participantId }) => participantId),
      collectionId: line.collectionId,
      sideNumber: side.sideNumber,
      matchUpId: line.matchUpId,
      code: INELIGIBLE_CATEGORY,
    },
  ];
}

// a submitted reason is split, at the write, into these keyed fields
const hasReason = (line: HydratedMatchUp) =>
  !!line.matchUpStatusCode || Object.values(line.sideStatusCodes ?? {}).some(Boolean);

function resultIssues(line: HydratedMatchUp): DualIssue[] {
  const issues: DualIssue[] = [];
  const { matchUpId, collectionId, matchUpStatus } = line;
  if (matchUpStatus === COMPLETED) {
    const { isComplete, info } = checkScoreCompleteness({
      matchUpFormat: line.matchUpFormat,
      winningSide: line.winningSide,
      sets: line.score?.sets ?? [],
      matchUpStatus,
    });
    if (!isComplete) issues.push({ code: SCORE_INCOMPLETE, matchUpId, collectionId, info });
  }
  if ((matchUpStatus === RETIRED || matchUpStatus === DEFAULTED) && !hasReason(line)) {
    issues.push({ code: MISSING_REASON, matchUpId, collectionId, info: matchUpStatus });
  }
  return issues;
}

function dualIssues(matchUp: HydratedMatchUp): DualIssue[] {
  const issues: DualIssue[] = [];
  const projected = generateTieMatchUpScore({ matchUp });
  const unplayed = (matchUp.tieMatchUps ?? [])
    .filter(({ matchUpStatus }) => !matchUpStatus || !completedMatchUpStatuses.includes(matchUpStatus))
    .map(({ matchUpId }) => matchUpId);
  if (projected.winningSide && unplayed.length) issues.push({ code: DUAL_DECIDED, matchUpIds: unplayed });

  const manual = firstClassOrExtension({ element: matchUp, attribute: 'disableAutoCalc', name: DISABLE_AUTO_CALC });
  if (manual) {
    issues.push({ code: MANUAL_SCORE });
    const diverges =
      (matchUp.score?.scoreStringSide1 ?? '') !== (projected.scoreStringSide1 ?? '') ||
      matchUp.winningSide !== projected.winningSide;
    if (diverges) issues.push({ code: MANUAL_SCORE_DIVERGES, info: projected.scoreStringSide1 });
  }
  return issues;
}
