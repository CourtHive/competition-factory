import { CategoryRejection, getEventDateRange, getParticipantName, validateParticipantCategory } from './categoryValidation';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { addDrawEntries } from '@Mutate/drawDefinitions/addDrawEntries';
import { decorateResult } from '@Functions/global/decorateResult';
import { refreshEntryPositions } from './refreshEntryPositions';
import { isValidExtension } from '@Validators/isValidExtension';
import { addExtension } from '@Mutate/extensions/addExtension';
import { definedAttributes } from '@Tools/definedAttributes';
import { removeEventEntries } from './removeEventEntries';
import { isUngrouped } from '@Query/entries/isUngrouped';
import { coercedGender } from '@Helpers/coercedGender';
import { isMixed } from '@Validators/isMixed';
import { isAny } from '@Validators/isAny';

// constants and types
import { DrawDefinition, EntryStatusUnion, Event, Extension, Participant, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import POLICY_MATCHUP_ACTIONS_DEFAULT from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { DOUBLES_EVENT, HYBRID_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { INDIVIDUAL, PAIR, TEAM } from '@Constants/participantConstants';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { unique } from '@Tools/arrays';
import {
  EVENT_NOT_FOUND,
  INVALID_PARTICIPANT_IDS,
  INVALID_VALUES,
  MISSING_EVENT,
  MISSING_PARTICIPANT_IDS,
} from '@Constants/errorConditionConstants';

/**
 * Add entries into an event; optionally add to specified drawDefinition/flightProfile, if possible.
 */

type AddEventEntriesArgs = {
  policyDefinitions?: PolicyDefinitions;
  suppressDuplicateEntries?: boolean;
  entryStatus?: EntryStatusUnion;
  drawDefinition?: DrawDefinition;
  autoEntryPositions?: boolean;
  tournamentRecord?: Tournament;
  entryStageSequence?: number;
  ignoreStageSpace?: boolean;
  entryStage?: StageTypeUnion;
  participantIds?: string[];
  extensions?: Extension[];
  enforceCategory?: boolean;
  enforceGender?: boolean;
  extension?: Extension;
  roundTarget?: number;
  drawId?: string;
  event: Event;
};

function isValidSinglesGender(participant: any, event: Event, genderEnforced: boolean, mismatchedGender: any[]) {
  if (
    event.gender &&
    genderEnforced &&
    !(isMixed(event.gender) || isAny(event.gender)) &&
    coercedGender(event.gender) !== coercedGender(participant.person?.sex)
  ) {
    mismatchedGender.push({
      participantId: participant.participantId,
      sex: participant.person?.sex,
    });
    return false;
  }
  return true;
}

function getValidParticipantIds({
  participantIds,
  typedParticipantIds,
  checkTypedParticipants,
}: {
  participantIds: string[];
  typedParticipantIds: string[];
  checkTypedParticipants: boolean;
}): string[] {
  return participantIds.filter(
    (participantId) => !checkTypedParticipants || typedParticipantIds.includes(participantId),
  );
}

function getTypedParticipantIdsHelper({
  tournamentRecord,
  participantIds,
  event,
  entryStatus,
  genderEnforced,
  mismatchedGender,
}: {
  tournamentRecord?: Tournament;
  participantIds: string[];
  event: Event;
  entryStatus: EntryStatusUnion;
  genderEnforced: boolean;
  mismatchedGender: any[];
}): string[] {
  function isValidSinglesParticipant(participant: any, event: Event, entryStatus: EntryStatusUnion) {
    return (
      isMatchUpEventType(SINGLES)(event.eventType) &&
      participant.participantType === INDIVIDUAL &&
      !isUngrouped(entryStatus)
    );
  }

  function isValidDoublesParticipant(participant: any, event: Event, entryStatus: EntryStatusUnion) {
    return event.eventType === DOUBLES && participant.participantType === PAIR && !isUngrouped(entryStatus);
  }

  function isValidUngroupedDoublesIndividual(
    participant: any,
    event: Event,
    entryStatus: EntryStatusUnion,
    genderEnforced: boolean,
    mismatchedGender: any[],
  ) {
    if (event.eventType === DOUBLES && participant.participantType === INDIVIDUAL && isUngrouped(entryStatus)) {
      if (
        event.gender &&
        genderEnforced &&
        !(isMixed(event.gender) || isAny(event.gender)) &&
        coercedGender(event.gender) !== coercedGender(participant.person?.sex)
      ) {
        mismatchedGender.push({
          participantId: participant.participantId,
          sex: participant.person?.sex,
        });
        return false;
      }
      return true;
    }
    return false;
  }

  function isValidHybridParticipant(participant: any, event: Event, entryStatus: EntryStatusUnion) {
    return (
      event.eventType === HYBRID_EVENT &&
      [INDIVIDUAL, PAIR].includes(participant.participantType) &&
      !isUngrouped(entryStatus)
    );
  }

  function isValidTeamParticipant(participant: any, event: Event, entryStatus: EntryStatusUnion) {
    return (
      (event.eventType as string) === TEAM &&
      (participant.participantType === TEAM || (isUngrouped(entryStatus) && participant.participantType === INDIVIDUAL))
    );
  }

  return (
    tournamentRecord?.participants
      ?.filter((participant) => {
        if (!participantIds.includes(participant.participantId)) return false;

        if (isValidSinglesParticipant(participant, event, entryStatus)) {
          return isValidSinglesGender(participant, event, genderEnforced, mismatchedGender);
        }

        if (isValidDoublesParticipant(participant, event, entryStatus)) {
          return true;
        }

        if (isValidUngroupedDoublesIndividual(participant, event, entryStatus, genderEnforced, mismatchedGender)) {
          return true;
        }

        if (isValidHybridParticipant(participant, event, entryStatus)) {
          return true;
        }

        return isValidTeamParticipant(participant, event, entryStatus);
      })
      .map((participant) => participant.participantId) ?? []
  );
}

function validateCompoundParticipantCategory(
  participant: Participant,
  tournamentRecord: Tournament,
  event: Event,
  startDate: string,
  endDate: string,
): CategoryRejection | null {
  const individualRejections: CategoryRejection[] = [];

  for (const individualId of participant.individualParticipantIds ?? []) {
    const individualParticipant = tournamentRecord.participants?.find((p) => p.participantId === individualId);
    if (!individualParticipant) continue;

    const rejection = validateParticipantCategory(individualParticipant, event.category!, event, startDate, endDate, tournamentRecord);
    if (rejection) individualRejections.push(rejection);
  }

  if (!individualRejections.length) return null;

  return {
    participantId: participant.participantId,
    participantName: getParticipantName(participant),
    rejectionReasons: individualRejections.flatMap((r) =>
      r.rejectionReasons.map((reason) => ({
        ...reason,
        reason: `${r.participantName}: ${reason.reason}`,
      })),
    ),
  };
}

function isCompoundParticipant(participant: Participant): boolean {
  return (
    (participant.participantType === PAIR || participant.participantType === TEAM) &&
    !!participant.individualParticipantIds?.length
  );
}

function filterCategoryValidParticipantIds({
  typedParticipantIds,
  categoryRejections,
  tournamentRecord,
  startDate,
  endDate,
  event,
}: {
  typedParticipantIds: string[];
  tournamentRecord: Tournament;
  event: Event;
  startDate: string;
  endDate: string;
  categoryRejections: CategoryRejection[];
}): string[] {
  const categoryValidParticipantIds: string[] = [];

  for (const participantId of typedParticipantIds) {
    const participant = tournamentRecord.participants?.find((p) => p.participantId === participantId);

    if (!participant) continue;

    if (event.category) {
      const rejection = isCompoundParticipant(participant)
        ? validateCompoundParticipantCategory(participant, tournamentRecord, event, startDate, endDate)
        : validateParticipantCategory(participant, event.category, event, startDate, endDate, tournamentRecord);

      if (rejection) {
        categoryRejections.push(rejection);
      } else {
        categoryValidParticipantIds.push(participantId);
      }
    } else {
      // If no category, treat as valid
      categoryValidParticipantIds.push(participantId);
    }
  }

  return categoryValidParticipantIds;
}

function validateCategoryHelper({
  enforceCategory,
  event,
  tournamentRecord,
  typedParticipantIds,
  categoryRejections,
}: {
  enforceCategory: boolean;
  event: Event;
  tournamentRecord?: Tournament;
  typedParticipantIds: string[];
  categoryRejections: CategoryRejection[];
}): string[] {
  if (enforceCategory && event.category && tournamentRecord) {
    const dateRange = getEventDateRange(event, tournamentRecord);

    if (!('error' in dateRange)) {
      const { startDate, endDate } = dateRange;

      // Filter typedParticipantIds based on category validation
      return filterCategoryValidParticipantIds({
        typedParticipantIds,
        tournamentRecord,
        event,
        startDate,
        endDate,
        categoryRejections,
      });
    }
  }
  return typedParticipantIds;
}

function createEntriesHelper({
  validParticipantIds,
  existingIds,
  entryStatus,
  entryStage,
  extensions,
  extension,
  roundTarget,
  entryStageSequence,
  addedParticipantIdEntries,
  event,
}: {
  validParticipantIds: string[];
  existingIds: Set<string>;
  entryStatus: EntryStatusUnion;
  entryStage: StageTypeUnion;
  extensions?: Extension[];
  extension?: Extension;
  roundTarget?: number;
  entryStageSequence?: number;
  addedParticipantIdEntries: string[];
  event: Event;
}) {
  validParticipantIds.forEach((participantId) => {
    if (!existingIds.has(participantId)) {
      const entry = definedAttributes({
        participantId,
        entryStatus,
        entryStage,
        extensions,
      });

      if (extension) {
        addExtension({ element: entry, extension });
      }

      if (roundTarget) {
        addExtension({
          extension: { name: ROUND_TARGET, value: roundTarget },
          element: entry,
        });
      }
      if (entryStageSequence) entry.entryStageSequence = entryStageSequence;
      addedParticipantIdEntries.push(entry.participantId);
      event.entries?.push(entry);
    }
  });
}

function removeUngroupedParticipantIdsHelper({
  tournamentRecord,
  removedEntries,
  event,
}: {
  tournamentRecord?: Tournament;
  removedEntries: any[];
  event: Event;
}) {
  if (event.eventType && [DOUBLES_EVENT, TEAM_EVENT].includes(event.eventType)) {
    const enteredParticipantIds = new Set((event.entries ?? []).map((entry) => entry.participantId));
    const ungroupedIndividualParticipantIds = (event.entries ?? [])
      .filter((entry) => isUngrouped(entry.entryStatus))
      .map((entry) => entry.participantId);
    const tournamentParticipants = tournamentRecord?.participants ?? [];
    const groupedIndividualParticipantIds = new Set(
      tournamentParticipants
        .filter(
          (participant) =>
            enteredParticipantIds.has(participant.participantId) &&
            participant.participantType &&
            [PAIR, TEAM].includes(participant.participantType),
        )
        .map((participant) => participant.individualParticipantIds)
        .flat(Infinity),
    );
    const ungroupedParticipantIdsToRemove = ungroupedIndividualParticipantIds.filter((participantId) =>
      groupedIndividualParticipantIds.has(participantId),
    );
    if (ungroupedParticipantIdsToRemove.length) {
      removedEntries.push(...ungroupedParticipantIdsToRemove);
      removeEventEntries({
        participantIds: ungroupedParticipantIdsToRemove,
        autoEntryPositions: false, // because the method will be called below if necessary
        event,
      });
    }
  }
}

// Helper to validate params and return error if needed
function validateAddEventEntriesParams(params: AddEventEntriesArgs, stack: string) {
  if (!Array.isArray(params.participantIds))
    return decorateResult({ result: { error: INVALID_PARTICIPANT_IDS }, stack });

  const participantIds = unique(params.participantIds ?? []);

  if (!params.event) return { error: MISSING_EVENT };
  if (!participantIds?.length) {
    return decorateResult({
      result: { error: MISSING_PARTICIPANT_IDS },
      stack,
    });
  }

  if (!params.event?.eventId) return { error: EVENT_NOT_FOUND };

  return { participantIds };
}

// Helper to resolve policies and gender enforcement
function resolvePoliciesAndGender({
  policyDefinitions,
  tournamentRecord,
  event,
  enforceGender,
}: {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  event: Event;
  enforceGender: boolean;
}) {
  const appliedPolicies = getAppliedPolicies({ tournamentRecord, event }).appliedPolicies ?? {};

  const matchUpActionsPolicy =
    policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

  const genderEnforced = (enforceGender ?? matchUpActionsPolicy?.participants?.enforceGender) !== false;

  return { matchUpActionsPolicy, genderEnforced };
}

// Helper to validate extensions
function validateExtensions(extensions?: Extension[], extension?: Extension, stack?: string) {
  if (
    (extensions && (!Array.isArray(extensions) || !extensions.every((extension) => isValidExtension({ extension })))) ||
    (extension && !isValidExtension({ extension }))
  ) {
    return decorateResult({
      context: definedAttributes({ extension, extensions }),
      result: { error: INVALID_VALUES },
      info: 'Invalid extension(s)',
      stack,
    });
  }
  return null;
}

export function addEventEntries(params: AddEventEntriesArgs): ResultType {
  const {
    suppressDuplicateEntries = true,
    entryStatus = DIRECT_ACCEPTANCE,
    autoEntryPositions = true,
    enforceCategory = false,
    enforceGender = true,
    entryStageSequence,
    policyDefinitions,
    entryStage = MAIN,
    tournamentRecord,
    ignoreStageSpace,
    drawDefinition,
    roundTarget,
    extensions,
    extension,
    drawId,
    event,
  } = params;

  const stack = 'addEventEntries';

  // Validate params
  const paramValidation = validateAddEventEntriesParams(params, stack);
  if ('error' in paramValidation) return paramValidation;
  const participantIds = 'participantIds' in paramValidation ? paramValidation.participantIds : [];

  // Validate extensions
  const extensionValidation = validateExtensions(extensions, extension, stack);
  if (extensionValidation) return extensionValidation;

  // Resolve policies and gender enforcement
  const { genderEnforced } = resolvePoliciesAndGender({
    policyDefinitions,
    tournamentRecord,
    event,
    enforceGender,
  });

  const addedParticipantIdEntries: string[] = [];
  const removedEntries: any[] = [];

  const checkTypedParticipants = !!tournamentRecord;
  const mismatchedGender: any[] = [];
  let info;

  let typedParticipantIds = getTypedParticipantIdsHelper({
    tournamentRecord,
    participantIds,
    event,
    entryStatus,
    genderEnforced,
    mismatchedGender,
  });

  // Category validation
  const categoryRejections: CategoryRejection[] = [];

  typedParticipantIds = validateCategoryHelper({
    enforceCategory,
    event,
    tournamentRecord,
    typedParticipantIds,
    categoryRejections,
  });

  const validParticipantIds = getValidParticipantIds({
    participantIds,
    typedParticipantIds,
    checkTypedParticipants,
  });

  event.entries ??= [];
  const existingIds = new Set(event.entries.map((e: any) => e.participantId || e.participant?.participantId));

  createEntriesHelper({
    validParticipantIds,
    existingIds,
    entryStatus,
    entryStage,
    extensions,
    extension,
    roundTarget,
    entryStageSequence,
    addedParticipantIdEntries,
    event,
  });

  if (drawId && !isUngrouped(entryStage)) {
    const result = addDrawEntries({
      participantIds: validParticipantIds,
      suppressDuplicateEntries,
      autoEntryPositions,
      entryStageSequence,
      ignoreStageSpace,
      drawDefinition,
      entryStatus,
      roundTarget,
      entryStage,
      extension,
      drawId,
      event,
    });

    // Ignore error if drawId is included but entry can't be added to drawDefinition/flightProfile
    // return error as info to client
    if (result.error) {
      info = result.error;
    }
  }

  removeUngroupedParticipantIdsHelper({ event, tournamentRecord, removedEntries });

  const invalidParticipantIds = validParticipantIds.length !== participantIds.length;

  if (invalidParticipantIds)
    return decorateResult({
      context: definedAttributes({
        categoryRejections: categoryRejections.length ? categoryRejections : undefined,
        mismatchedGender: mismatchedGender.length ? mismatchedGender : undefined,
        gender: event.gender,
      }),
      result: { error: INVALID_PARTICIPANT_IDS },
      stack,
    });

  if (autoEntryPositions) {
    event.entries = refreshEntryPositions({
      entries: event.entries ?? [],
    });
  }

  const addedEntriesCount = addedParticipantIdEntries.length;
  const removedEntriesCount = removedEntries.length;

  return decorateResult({
    result: {
      ...SUCCESS,
      addedEntriesCount,
      removedEntriesCount,
      ...(categoryRejections.length && {
        context: definedAttributes({
          categoryRejections,
        }),
      }),
    },
    stack,
    info,
  });
}
