import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { refreshEntryPositions } from '@Mutate/entries/refreshEntryPositions';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { participantInEntries } from '@Query/drawDefinition/entryGetter';
import { getValidStage } from '@Query/drawDefinition/getValidStage';
import { getStageSpace } from '@Query/drawDefinition/getStageSpace';
import { decorateResult } from '@Functions/global/decorateResult';
import { isValidExtension } from '@Validators/isValidExtension';
import { addExtension } from '@Mutate/extensions/addExtension';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { definedAttributes } from '@Tools/definedAttributes';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { MAIN, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE, LUCKY_LOSER } from '@Constants/entryStatusConstants';
import { DRAW_DEFINITION, ENTRY_STAGE } from '@Constants/attributeConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { DATA_ISSUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_STAGE,
  MISSING_STAGE,
  EXISTING_PARTICIPANT,
  MISSING_DRAW_DEFINITION,
  INVALID_PARTICIPANT_IDS,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE,
  INVALID_VALUES,
  DUPLICATE_ENTRY,
} from '@Constants/errorConditionConstants';
import {
  DrawDefinition,
  Entry,
  EntryStatusUnion,
  Event,
  Extension,
  Participant,
  StageTypeUnion,
} from '@Types/tournamentTypes';

type AddDrawEntryArgs = {
  suppressDuplicateEntries?: boolean;
  entryStatus?: EntryStatusUnion;
  drawDefinition: DrawDefinition;
  entryStageSequence?: number;
  entryStage?: StageTypeUnion;
  ignoreStageSpace?: boolean;
  participant?: Participant;
  extensions?: Extension[];
  entryPosition?: number;
  participantId?: string;
  extension?: Extension;
  roundTarget?: number;
  drawType?: string;
  event?: Event;
};

export function addDrawEntry(params: AddDrawEntryArgs) {
  const paramsCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true, [ENTRY_STAGE]: true }]);
  if (paramsCheck.error) return paramsCheck;
  const {
    suppressDuplicateEntries = true,
    entryStatus = DIRECT_ACCEPTANCE,
    entryStageSequence,
    entryStage = MAIN,
    ignoreStageSpace,
    drawDefinition,
    entryPosition,
    participant,
    roundTarget,
    extensions,
    extension,
    drawType,
    event,
  } = params;

  const stack = 'addDrawEntry';
  if (!isAdHocType(drawType) && !getValidStage({ stage: entryStage, drawDefinition })) {
    return decorateResult({ result: { error: INVALID_STAGE }, stack });
  }
  const spaceAvailable = getStageSpace({
    stageSequence: entryStageSequence,
    stage: entryStage,
    drawDefinition,
    entryStatus,
  });

  if (!ignoreStageSpace && !spaceAvailable.success && (!drawType || !isAdHocType(drawType))) {
    return { error: spaceAvailable.error };
  }

  if (extension && !isValidExtension({ extension }))
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'Invalid extension',
      context: { extension },
      stack,
    });

  const participantId = params.participantId || participant?.participantId;
  if (!participantId) return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });

  const invalidLuckyLoser =
    entryStatus === LUCKY_LOSER && participantInEntries({ participantId, drawDefinition, entryStatus });
  const invalidVoluntaryConsolation =
    entryStage === VOLUNTARY_CONSOLATION &&
    participantInEntries({
      participantId,
      drawDefinition,
      entryStage,
    });

  const duplicateEntry = participantInEntries({ participantId, drawDefinition });
  // duplicate entries are NOT invalide for LUCKY_LOSER or VOLUNTARY_CONSOLATION
  const invalidEntry = entryStatus !== LUCKY_LOSER && entryStage !== VOLUNTARY_CONSOLATION && duplicateEntry;
  if (invalidEntry) {
    if (suppressDuplicateEntries) {
      addNotice({
        payload: {
          drawId: drawDefinition.drawId,
          eventId: event?.eventId,
          error: DUPLICATE_ENTRY,
          participantId,
        },
        topic: DATA_ISSUE,
      });
      return { ...SUCCESS };
    } else {
      return decorateResult({ result: { error: DUPLICATE_ENTRY }, context: { participantId }, stack });
    }
  }

  if (invalidLuckyLoser || invalidVoluntaryConsolation) {
    return decorateResult({
      context: { invalidEntry, invalidLuckyLoser, invalidVoluntaryConsolation },
      result: { error: EXISTING_PARTICIPANT },
      stack,
    });
  }

  const entry = definedAttributes({
    entryStageSequence,
    participantId,
    entryPosition,
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

  drawDefinition.entries ??= [];
  drawDefinition.entries.push(entry);
  modifyDrawNotice({ drawDefinition });

  return { ...SUCCESS };
}

type AddDrawEntriesArgs = {
  suppressDuplicateEntries?: boolean;
  entryStatus?: EntryStatusUnion;
  drawDefinition: DrawDefinition;
  autoEntryPositions?: boolean;
  ignoreStageSpace?: boolean;
  participantIds: string[];
  stageSequence?: number;
  stage?: StageTypeUnion;
  extension?: Extension;
  roundTarget?: number;
  event?: Event;
};

export function addDrawEntries(params: AddDrawEntriesArgs) {
  const stack = 'addDrawEntries';
  const {
    suppressDuplicateEntries = true,
    entryStatus = DIRECT_ACCEPTANCE,
    autoEntryPositions = true,
    ignoreStageSpace,
    participantIds,
    drawDefinition,
    stageSequence,
    stage = MAIN,
    roundTarget,
    extension,
    event,
  } = params;

  const isAdHocDraw = isAdHocType(drawDefinition.drawType);

  if (!stage) return { error: MISSING_STAGE };
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!Array.isArray(participantIds)) return { error: INVALID_PARTICIPANT_IDS };
  if (!isAdHocDraw && !getValidStage({ stage, drawDefinition })) {
    return { error: INVALID_STAGE };
  }

  if (extension && !isValidExtension({ extension })) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'Invalid extension',
      context: { extension },
      stack,
    });
  }

  const spaceAvailable = getStageSpace({
    drawDefinition,
    stageSequence,
    entryStatus,
    stage,
  });
  if (!ignoreStageSpace && !spaceAvailable.success && !isAdHocDraw) {
    return { error: spaceAvailable.error };
  }
  const positionsAvailable = spaceAvailable.positionsAvailable ?? 0;
  if (
    !ignoreStageSpace &&
    !isAdHocDraw &&
    stage !== VOLUNTARY_CONSOLATION &&
    positionsAvailable < participantIds.length
  )
    return { error: PARTICIPANT_COUNT_EXCEEDS_DRAW_SIZE };

  const duplicateEntries: string[] = [];
  const drawId = drawDefinition.drawId;
  const eventId = event?.eventId;
  const participantIdsNotAdded = participantIds.reduce((notAdded: string[], participantId) => {
    const invalidLuckyLoser =
      entryStatus === LUCKY_LOSER && participantInEntries({ participantId, drawDefinition, entryStatus });
    const invalidVoluntaryConsolation =
      stage === VOLUNTARY_CONSOLATION &&
      participantInEntries({
        entryStage: stage,
        drawDefinition,
        participantId,
      });

    const duplicateEntry = participantInEntries({ participantId, drawDefinition });
    const invalidEntry = entryStatus !== LUCKY_LOSER && stage !== VOLUNTARY_CONSOLATION && duplicateEntry;

    if (invalidEntry) {
      duplicateEntries.push(participantId);
      if (suppressDuplicateEntries) {
        addNotice({
          payload: {
            error: DUPLICATE_ENTRY,
            participantId,
            eventId,
            drawId,
          },
          topic: DATA_ISSUE,
        });
      }
    }

    if (invalidLuckyLoser || invalidVoluntaryConsolation) {
      return notAdded.concat(participantId);
    }

    return notAdded;
  }, []);

  if (duplicateEntries.length && !suppressDuplicateEntries) {
    return decorateResult({
      context: { eventId, drawId, duplicateEntries },
      result: { error: DUPLICATE_ENTRY },
      stack,
    });
  }

  participantIds
    .filter((participantId) => participantId && !participantIdsNotAdded.includes(participantId))
    .forEach((participantId) => {
      const entry: Entry = {
        entryStageSequence: stageSequence,
        entryStage: stage,
        participantId,
        entryStatus,
      };
      if (extension) {
        addExtension({ element: entry, extension });
      }
      if (roundTarget) {
        addExtension({
          extension: { name: ROUND_TARGET, value: roundTarget },
          element: entry,
        });
      }
      drawDefinition.entries ??= [];
      drawDefinition.entries.push(entry);
    });

  if (autoEntryPositions) {
    drawDefinition.entries = refreshEntryPositions({
      entries: drawDefinition.entries,
    });
  }

  modifyDrawNotice({ drawDefinition });

  return participantIdsNotAdded?.length || duplicateEntries?.length
    ? {
        info: 'some participantIds could not be added',
        participantIdsNotAdded,
        duplicateEntries,
        ...SUCCESS,
      }
    : { ...SUCCESS };
}
