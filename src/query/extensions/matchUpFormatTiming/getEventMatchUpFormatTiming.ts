import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { getMatchUpFormatTiming } from './getMatchUpFormatTiming';
import { definedAttributes } from '@Tools/definedAttributes';
import { findExtension } from '@Acquire/findExtension';
import { findPolicy } from '@Acquire/findPolicy';
import { unique } from '@Tools/arrays';

// constants, fixtures and types
import { POLICY_TYPE_SCHEDULING, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import POLICY_SCHEDULING_DEFAULT from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { ErrorType, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';
import { Event, Tournament } from '@Types/tournamentTypes';

type GetEventMatchUpFormatTimingArgs = {
  tournamentRecord: Tournament;
  matchUpFormats?: string[];
  categoryType?: string;
  event: Event;
};

export function getEventMatchUpFormatTiming({
  tournamentRecord,
  matchUpFormats, // optional - can be retrieved from policy
  categoryType, // optional - categoryType is not part of event attributes
  event,
}: GetEventMatchUpFormatTimingArgs): {
  eventMatchUpFormatTiming?: any;
  error?: ErrorType;
  info?: string;
} {
  if (!event) return { error: MISSING_EVENT };

  let matchUpFormatDefinitions: any[];
  let info;

  if (matchUpFormats?.length) {
    const uniqueMatchUpFormats: any[] = [];
    matchUpFormatDefinitions = matchUpFormats
      .map((definition) => {
        const definitionObject = typeof definition === 'string' ? { matchUpFormat: definition } : definition;
        if (uniqueMatchUpFormats.includes(definitionObject?.matchUpFormat)) return undefined;
        if (!isValidMatchUpFormat({ matchUpFormat: definitionObject?.matchUpFormat })) return undefined;
        uniqueMatchUpFormats.push(definitionObject.matchUpFormat);
        return definitionObject;
      })
      .filter(Boolean);
  } else {
    const { policy } = findPolicy({
      policyType: POLICY_TYPE_SCORING,
      tournamentRecord,
      event,
    });
    if (policy?.matchUpFormats) {
      matchUpFormatDefinitions = policy?.matchUpFormats;
    } else {
      const { extension } = findExtension({
        name: SCHEDULE_TIMING,
        element: event,
      });
      let matchUpAverageTimes, matchUpRecoveryTimes;
      if (extension?.value) {
        ({ matchUpAverageTimes, matchUpRecoveryTimes } = extension.value);
      } else {
        ({ matchUpAverageTimes, matchUpRecoveryTimes } = POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING]);
      }
      matchUpFormatDefinitions = unique(
        [
          ...(matchUpAverageTimes ?? []).map((at) => at.matchUpFormatCodes),
          ...(matchUpRecoveryTimes ?? []).map((at) => at.matchUpFormatCodes),
        ].flat(),
      ).map((matchUpFormat) => ({ matchUpFormat }));
      info = 'default scheduling policy in use';
    }
  }
  const { eventType, eventId, category } = event;
  const categoryName = category?.categoryName ?? category?.ageCategoryCode ?? eventId;

  if (!eventId) return { error: MISSING_EVENT };

  const eventMatchUpFormatTiming = matchUpFormatDefinitions.map(({ matchUpFormat, description }) => {
    const timing = getMatchUpFormatTiming({
      tournamentRecord,
      matchUpFormat,
      categoryName,
      categoryType,
      eventType,
      event,
    });
    return {
      matchUpFormat,
      description,
      ...timing,
    };
  });

  return definedAttributes({ eventMatchUpFormatTiming, info });
}
