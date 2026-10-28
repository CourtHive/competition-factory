import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { automatedPlayoffPositioning } from '@Mutate/drawDefinitions/automatedPlayoffPositioning';
import { addSchedulingProfileRound } from '@Mutate/matchUps/schedule/addSchedulingProfileRound';
import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { scheduleProfileRounds } from '@Mutate/matchUps/schedule/scheduleProfileRounds';
import { scheduleProfileGrid } from '@Mutate/matchUps/schedule/scheduleProfileGrid';
import { checkInParticipant } from '@Mutate/timeItems/matchUps/checkInParticipant';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { setMatchUpCalledAt } from '@Mutate/matchUps/schedule/setMatchUpCalledAt';
import { addTournamentExtension } from '@Mutate/extensions/addRemoveExtensions';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import { setSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { addAdHocMatchUps } from '@Mutate/structures/addAdHocMatchUps';
import { addEventEntries } from '@Mutate/entries/addEventEntries';
import { recorded } from '@Mutate/simulation/scenarioRecorder';
import { publishEvent } from '@Mutate/publishing/publishEvent';
import { addFlight } from '@Mutate/events/addFlight';
import { addEvent } from '@Mutate/events/addEvent';
import { UUID } from '@Tools/UUID';

/**
 * Scenario generation's writes, each logged as the engine call a client makes for it (see `scenarioRecorder`) and
 * then made. The logged params are the engine's: the record implicit, an event or draw named by its id, and an
 * object passed only where it is the payload (`addEvent`'s event, `addDrawDefinition`'s draw).
 */
export const addParticipantsRecorded = recorded('addParticipants', addParticipants);
export const setParticipantScaleItemRecorded = recorded('setParticipantScaleItem', setParticipantScaleItem);
export const addEventRecorded = recorded('addEvent', addEvent, 'event');
const addFlightLogged = recorded('addFlight', addFlight);
// addFlight mints the flight's drawId when none is given, and a replay would mint another. The id is minted here
// instead, by the same single UUID() draw addFlight would make at the same point, so the flight is unchanged and the
// logged call names it
export const publishEventRecorded = recorded('publishEvent', publishEvent);
export const addTournamentExtensionRecorded = recorded('addTournamentExtension', addTournamentExtension);
export const addAdHocMatchUpsRecorded = recorded('addAdHocMatchUps', addAdHocMatchUps);
export const addFlightRecorded = (args: Parameters<typeof addFlight>[0]) =>
  addFlightLogged({ ...args, drawId: args.drawId || UUID() });
export const addEventEntriesRecorded = recorded('addEventEntries', addEventEntries);
export const automatedPlayoffPositioningRecorded = recorded('automatedPlayoffPositioning', automatedPlayoffPositioning);
export const addDrawDefinitionRecorded = recorded('addDrawDefinition', addDrawDefinition, 'drawDefinition');

// scheduling
export const addSchedulingProfileRoundRecorded = recorded('addSchedulingProfileRound', addSchedulingProfileRound);
export const scheduleProfileRoundsRecorded = recorded('scheduleProfileRounds', scheduleProfileRounds);
export const addMatchUpScheduledDateRecorded = recorded('addMatchUpScheduledDate', addMatchUpScheduledDate);
export const addMatchUpScheduledTimeRecorded = recorded('addMatchUpScheduledTime', addMatchUpScheduledTime);
export const scheduleProfileGridRecorded = recorded('scheduleProfileGrid', scheduleProfileGrid);
export const setMatchUpCalledAtRecorded = recorded('setMatchUpCalledAt', setMatchUpCalledAt);
export const checkInParticipantRecorded = recorded('checkInParticipant', checkInParticipant);
export const addMatchUpScheduleItemsRecorded = recorded('addMatchUpScheduleItems', addMatchUpScheduleItems);
export const setSchedulingProfileRecorded = recorded('setSchedulingProfile', setSchedulingProfile);
