import { getObjectTieFormat } from '@Query/hierarchical/tieFormats/getObjectTieFormat';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getCategoryAgeDetails } from '@Query/event/getCategoryAgeDetails';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { getParticipants } from '@Query/participants/getParticipants';
import { categoryCanContain } from '@Query/event/categoryCanContain';
import { decorateResult } from '@Functions/global/decorateResult';
import { validateCategory } from '@Validators/validateCategory';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { setEventDates } from './setEventDates';
import { isMixed } from '@Validators/isMixed';
import { isAny } from '@Validators/isAny';
import { unique } from '@Tools/arrays';

// constants and types
import { Category, Event, Tournament, EventTypeUnion, GenderUnion, TieFormat } from '@Types/tournamentTypes';
import type { competitionFormat } from '@Types/competitionFormat';
import { ALTERNATE, STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { DOUBLES, HYBRID, SINGLES, TEAM } from '@Constants/eventConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { OBJECT } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  CATEGORY_MISMATCH,
  INVALID_CATEGORY,
  INVALID_EVENT_TYPE,
  INVALID_GENDER,
  MISSING_BIRTH_DATE,
} from '@Constants/errorConditionConstants';

type ModifyEventArgs = {
  tournamentRecord: Tournament;
  eventUpdates: {
    eventType?: EventTypeUnion;
    gender?: GenderUnion;
    startDate?: string;
    endDate?: string;
    category?: Category;
    eventName?: string;
    // Set to a competitionFormat object to attach sport rules (timers,
    // multipliers, penalties) to the event. Pass null to clear an existing
    // value. Hierarchical resolution lets drawDefinition/structure overrides
    // win at lower scopes. See @Types/competitionFormat.
    competitionFormat?: competitionFormat | null;
  };
  eventId: string;
  event: Event;
};

export function modifyEvent(params: ModifyEventArgs): ResultType {
  const paramsCheck = checkRequiredParameters(params, [
    { tournamentRecord: true, eventId: true, event: true },
    { eventUpdates: true, _ofType: OBJECT },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { eventUpdates, event } = params;
  const stack = 'modifyEvent';

  const enteredParticipants = getEnteredParticipants(params);
  const participantsProfile = getParticipantsProfile({ enteredParticipants });
  const { enteredParticipantGenders, enteredParticipantTypes } = participantsProfile;

  const flights = getFlightProfile({ event })?.flightProfile?.flights;
  const noFlightsNoDraws = !event.drawDefinitions?.length && !flights?.length;

  const genderResult = checkGenderUpdates({ noFlightsNoDraws, enteredParticipantGenders, eventUpdates, stack });
  if (genderResult.error) return genderResult;

  const eventTypeResult = checkEventType({ enteredParticipantTypes, eventUpdates, stack });
  if (eventTypeResult.error) return eventTypeResult;

  const categoryResult = checkCategoryUpdates({ ...params, ...participantsProfile, enteredParticipants, stack });
  if (categoryResult.error) return categoryResult;

  const dateResult = dateUpdates({ ...params, stack });
  if (dateResult.error) return dateResult;

  if (eventUpdates.eventType) event.eventType = eventUpdates.eventType;
  if (eventUpdates.eventName) event.eventName = eventUpdates.eventName;
  if (eventUpdates.gender) event.gender = eventUpdates.gender;

  if (eventUpdates.competitionFormat !== undefined) {
    if (eventUpdates.competitionFormat === null) {
      delete event.competitionFormat;
    } else {
      event.competitionFormat = eventUpdates.competitionFormat;
    }
  }

  return { ...SUCCESS };
}

function checkCategoryUpdates(params) {
  const category = params.eventUpdates?.category;
  if (!category) return { ...SUCCESS };

  const categoryCheck = validateCategory({ category });
  if (categoryCheck.error) return categoryCheck;

  if (params.event.eventType === TEAM) {
    const teamCategoryResult = checkTeamCategory(params);
    if (teamCategoryResult.error) return teamCategoryResult;
  }

  if (params.enteredParticipants?.length) {
    const participantAgeResult = checkParticipantAges(params, category);
    if (participantAgeResult.error) return participantAgeResult;
  }

  return { ...SUCCESS };
}

function checkTeamCategory(params) {
  const drawTieFormats = params.event?.drawDefinitions?.map((draw) => getObjectTieFormat(draw)) ?? [];
  const eventTieFormat = getObjectTieFormat(params.event);
  const eventMatchUps = allEventMatchUps(params)?.matchUps ?? [];
  const matchUpTieFormats = eventMatchUps.map((matchUp) => getObjectTieFormat(matchUp)) ?? [];
  const tieFormats: TieFormat[] = [eventTieFormat, ...drawTieFormats, ...matchUpTieFormats].filter(Boolean);
  const validCategory = tieFormats.every((tieFormat) =>
    tieFormat.collectionDefinitions.every(
      (cd) =>
        !cd.category || categoryCanContain({ category: params.eventUpdates.category, childCategory: cd.category }),
    ),
  );
  if (!validCategory) return decorateResult({ result: { error: INVALID_CATEGORY }, stack: params.stack });
  return { ...SUCCESS };
}

function checkParticipantAges(params, category) {
  const startDate = params.eventUpdates.startDate || params.event.startDate || params.tournamentRecord.startDate;
  const endDate = params.eventUpdates.endDate || params.event.endDate || params.tournamentRecord.endDate;
  const individualParticpants = params.enteredParticipants.flatMap((p) =>
    p.participantType === INDIVIDUAL ? [p] : (p.individualParticpants ?? []),
  );

  const startAgeDetails = getCategoryAgeDetails({ category, consideredDate: startDate });
  const endAgeDetails = getCategoryAgeDetails({ category, consideredDate: endDate });

  if (
    startAgeDetails?.ageMinDate ||
    startAgeDetails?.ageMaxDate ||
    endAgeDetails?.ageMinDate ||
    endAgeDetails?.ageMaxDate
  ) {
    for (const individualParticipant of individualParticpants) {
      const birthDate = individualParticipant.person?.birthDate;
      const birthYear = individualParticipant.person?.birthYear;
      if (!birthDate && birthYear === undefined) {
        return decorateResult({ result: { error: MISSING_BIRTH_DATE }, stack: params.stack });
      }
      // birthDate authoritative; for a year-precision birthYear use a mid-year
      // representative date (minimises error against the date-boundary checks).
      const birthTime = new Date(birthDate ?? `${birthYear}-07-01`).getTime();

      const startCheck = checkAgeAgainstDetails(birthTime, startAgeDetails, params.stack);
      if (startCheck) return startCheck;

      const endCheck = checkAgeAgainstDetails(birthTime, endAgeDetails, params.stack);
      if (endCheck) return endCheck;
    }
  }
  return { ...SUCCESS };
}

function checkAgeAgainstDetails(birthTime: number, ageDetails: any, stack: string) {
  if (!ageDetails) return null;

  if (ageDetails.ageMinDate || ageDetails.ageMaxDate) {
    const minTime = new Date(ageDetails.ageMinDate).getTime();
    const maxTime = new Date(ageDetails.ageMaxDate).getTime();
    if (birthTime < minTime || birthTime > maxTime) {
      return decorateResult({ result: { error: CATEGORY_MISMATCH }, stack });
    }
  }
  return null;
}

function dateUpdates(params) {
  const { tournamentRecord, eventUpdates, event, stack } = params;
  if (eventUpdates.startDate || eventUpdates.endDate) {
    const result = setEventDates({
      startDate: eventUpdates.startDate || event.startDate || tournamentRecord.startDate,
      endDate: eventUpdates.endDate || event.endDate || tournamentRecord.endDate,
      tournamentRecord,
      event,
    });
    if (result.error) return decorateResult({ result, stack });
  }

  return { ...SUCCESS };
}

function getEnteredParticipants(params) {
  const { tournamentRecord, event } = params;

  const enteredParticipantIds: string[] =
    event?.entries
      ?.filter(({ entryStatus }) => {
        const status: any = entryStatus;
        return [...STRUCTURE_SELECTED_STATUSES, ALTERNATE].includes(status);
      })
      .map(({ participantId }) => participantId) ?? [];

  return enteredParticipantIds
    ? (getParticipants({
        participantFilters: { participantIds: enteredParticipantIds },
        withIndividualParticipants: true,
        tournamentRecord,
      }).participants ?? [])
    : [];
}

function getParticipantsProfile({ enteredParticipants }) {
  const genderAccumulator: string[] = [];
  const enteredParticipantTypes = enteredParticipants.reduce((types: any[], participant) => {
    const genders = participant.person?.sex
      ? [participant.person.sex]
      : (participant.individualParticpants?.map((p) => p.person?.sex) ?? []);
    genderAccumulator.push(...genders);
    return types.includes(participant.participantType) ? types : types.concat(participant.participantType);
  }, []);

  const enteredParticipantGenders: string[] = unique(genderAccumulator);

  return { enteredParticipantTypes, enteredParticipantGenders };
}

function checkGenderUpdates({ noFlightsNoDraws, enteredParticipantGenders, eventUpdates, stack }) {
  const validGender =
    !enteredParticipantGenders.length ||
    !eventUpdates.gender ||
    isAny(eventUpdates.gender) ||
    (enteredParticipantGenders.length === 1 && enteredParticipantGenders[0] === eventUpdates.gender) ||
    // MIXED is only a valid gender change if there are no draws or flights
    (noFlightsNoDraws && isMixed(eventUpdates.gender));

  return eventUpdates.gender && !validGender
    ? decorateResult({
        context: { gender: eventUpdates.gender, validGender },
        result: { error: INVALID_GENDER },
        stack,
      })
    : { ...SUCCESS };
}

function checkEventType({ enteredParticipantTypes, eventUpdates, stack }) {
  const hasMixedTypes = enteredParticipantTypes.includes(INDIVIDUAL) && enteredParticipantTypes.includes(PAIR);
  const validEventTypes = (hasMixedTypes && [HYBRID]) ||
    (enteredParticipantTypes.includes(TEAM) && [TEAM]) ||
    (enteredParticipantTypes.includes(INDIVIDUAL) && [SINGLES, HYBRID]) ||
    (enteredParticipantTypes.includes(PAIR) && [DOUBLES, HYBRID]) || [DOUBLES, SINGLES, TEAM, HYBRID];

  const validEventType = validEventTypes.includes(eventUpdates.eventType ?? '');

  return eventUpdates.eventType && !validEventType
    ? decorateResult({
        context: { participantType: eventUpdates.eventType, validEventType },
        result: { error: INVALID_EVENT_TYPE },
        stack,
      })
    : { ...SUCCESS };
}
