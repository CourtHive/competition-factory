import { generateDrawDefinition } from '@Assemblies/governors/drawsGovernor';
import tieFormatDefaults from '@Generators/templates/tieFormatDefaults';
import { generateVenues } from '@Mutate/venues/generateVenues';
import { generateParticipants } from './generateParticipants';
import { genParticipantId } from './genParticipantId';
import { processTieFormat } from './processTieFormat';
import { isGendered } from '@Validators/isGendered';
import { generateRange } from '@Tools/arrays';
import { isObject } from '@Tools/objects';
import { isNumeric } from '@Tools/math';
import { UUID } from '@Tools/UUID';
import {
  addDrawDefinitionRecorded,
  addEventEntriesRecorded,
  addEventRecorded,
  addParticipantsRecorded,
} from './recordedWrites';

// constants and types
import { Entry, Event, EventTypeUnion, Participant, TieFormat, Tournament } from '@Types/tournamentTypes';
import { AD_HOC, DOUBLE_ROUND_ROBIN, MAIN } from '@Constants/drawDefinitionConstants';
import { ANY, FEMALE, MALE, MIXED, OTHER } from '@Constants/genderConstants';
import { EVENT_NOT_FOUND, MISSING_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
import type { MockLeagueProfile } from '@Types/mocksTypes';
import { COMPETITOR } from '@Constants/participantRoles';
import { TEAM } from '@Constants/participantConstants';

/**
 * A leagueProfile expresses rounds either as an explicit count, or as DOUBLE_ROUND_ROBIN, or not at all
 * (defaulting to a single round robin). Each entrant meets every other entrant once over (drawSize - 1)
 * rounds, so a double round robin is twice that.
 */
function deriveLeagueRoundsCount({ roundsCount, drawSize }): number {
  if (isNumeric(roundsCount)) return roundsCount;
  if (roundsCount === DOUBLE_ROUND_ROBIN) return (drawSize - 1) * 2;
  return drawSize - 1;
}

export function processLeagueProfiles(params) {
  const { tournamentRecord, leagueProfiles, eventIds, venueIds, drawIds, allUniqueParticipantIds, random, uuids } =
    params;

  let leaguesCount = 0;
  for (const leagueProfile of leagueProfiles) {
    const entries: Entry[] = [];
    const {
      tieFormatName = COLLEGE_DEFAULT,
      teamProfiles = [],
      teamsCount = 0,
      // weekdays,
      category,
      idPrefix,
      gender,
    } = leagueProfile;

    const eventName = leagueProfile.leagueName ?? leagueProfile.eventName ?? `League ${leaguesCount + 1}`;
    const eventId = leagueProfile.leagueId ?? leagueProfile.eventId ?? uuids?.pop() ?? UUID(undefined, random);
    eventIds.push(eventId);

    // use tieFormat or tieFormatName to generate determine number of individualParticipants per team
    const tieFormat: TieFormat =
      (isObject(leagueProfile.tieFormat) && leagueProfile.tieFormat) ||
      tieFormatDefaults({
        event: { eventId, category, gender },
        namedFormat: tieFormatName,
        isMock: params.isMock,
      }) ||
      undefined;

    if (!tieFormat) return { error: MISSING_TIE_FORMAT };

    const drawSize = Math.max(teamsCount, teamProfiles.length);
    const teamsRange = generateRange(0, drawSize);
    const { genders, teamSize } = processTieFormat({ tieFormat, drawSize, random });

    const gendersCount = { [FEMALE]: 0, [MIXED]: 0, [OTHER]: 0, [MALE]: 0, [ANY]: 0 };
    Object.keys(genders).forEach((key) => (gendersCount[key] += genders[key]));

    for (const index of teamsRange) {
      const teamName = teamProfiles?.[index]?.teamName ?? `Team ${index + 1}`;
      const teamId = teamProfiles?.[index]?.teamId || uuids?.pop() || UUID(undefined, random);

      const consideredDate = leagueProfile.startDate ?? params.startDate;
      // a team-only league enumerates no individuals: the competition is between TEAMs and the
      // federation never publishes who played. Generating placeholder persons would invent data.
      const participants =
        leagueProfile.individualParticipants === false
          ? []
          : (generateParticipants({
              ...leagueProfile?.participantsProfile,
              participantsCount: teamSize,
              consideredDate,
              gendersCount,
              category,
              // persons have a sex, and only a MALE or FEMALE league names one: `gender` was passed under its
              // own name, which generateParticipants never reads (M14, 2026-10-17)
              sex: isGendered(gender) ? gender : undefined,
              random,
              uuids,
            }).participants as Participant[]);

      const individualParticipantIds = participants.map((participant) => participant.participantId);

      const participantType = TEAM;
      const teamParticipantId =
        teamId ??
        genParticipantId({
          participantType,
          idPrefix,
          random,
          index,
          uuids,
        });
      entries.push({ participantId: teamParticipantId, entryStatus: DIRECT_ACCEPTANCE, entryStage: MAIN });

      const homeVenueIds = teamProfiles?.[index]?.venueIds ?? [];
      const teamParticipant: Participant = {
        participantId: teamParticipantId,
        participantRole: COMPETITOR,
        participantName: teamName,
        individualParticipantIds,
        participantType,
        homeVenueIds,
      };

      homeVenueIds.forEach((venueId) => !venueIds.includes(venueId) && venueIds.push(venueId));
      allUniqueParticipantIds.push(...individualParticipantIds, teamParticipantId);
      const result = addParticipantsRecorded({
        participants: [teamParticipant, ...participants],
        tournamentRecord,
      });
      if (result.error) return result;
    }

    const leagueResult = addLeagueEvent({
      event: { eventName, eventType: TEAM as EventTypeUnion, tieFormat, category, eventId, gender },
      tournamentRecord,
      leagueProfile,
      drawSize,
      entries,
      drawIds,
    });
    if (leagueResult?.error) return leagueResult;

    leaguesCount++;
  }

  // add venues - can get more sophisticated with this and generate number of courts
  const venueProfiles = venueIds.map((venueId) => ({ venueId }));
  const venuesResult = generateVenues({ tournamentRecord, ignoreExistingVenues: true, venueProfiles, uuids });
  if (!Array.isArray(venuesResult)) return venuesResult;
}

// a league's event, entries and draw, in a client's order
type AddLeagueEventArgs = {
  entries: { participantId: string }[];
  leagueProfile: MockLeagueProfile;
  tournamentRecord: Tournament;
  event: Partial<Event> & { eventId: string };
  drawIds: string[];
  drawSize: number;
};

function addLeagueEvent({
  event: leagueEvent,
  tournamentRecord,
  leagueProfile,
  drawSize,
  entries,
  drawIds,
}: AddLeagueEventArgs) {
  // as a client builds it: the event added, then its entries, then its draw (the event was pushed onto the record
  // with its entries already in it)
  const added = addEventRecorded({ tournamentRecord, event: leagueEvent });
  if (added.error) return added;
  const event = tournamentRecord.events?.find((stored) => stored.eventId === leagueEvent.eventId);
  if (!event) return { error: EVENT_NOT_FOUND };
  if (entries.length) {
    const entered = addEventEntriesRecorded({
      participantIds: entries.map(({ participantId }) => participantId),
      entryStatus: DIRECT_ACCEPTANCE,
      entryStage: MAIN,
      tournamentRecord,
      event,
    });
    if (entered.error) return entered;
  }

  if (entries.length) {
    // a pairingProfile supplies the schedule itself, so roundsCount is then only an optional
    // truncation to a partial round robin and the shape validates it
    const { pairingProfile } = leagueProfile;
    const roundsCount = Number(
      pairingProfile
        ? isNumeric(leagueProfile.roundsCount) && leagueProfile.roundsCount
        : deriveLeagueRoundsCount({ roundsCount: leagueProfile.roundsCount, drawSize }),
    );
    // a single round robin is (drawSize - 1) rounds; anything beyond that replays pairings,
    // which drawMatic only permits when enableDoubleRobin is set
    const enableDoubleRobin = !pairingProfile && roundsCount > drawSize - 1;
    // generate drawDefinition for league
    const result = generateDrawDefinition({
      automated: leagueProfile.automated,
      roundsCount: roundsCount || undefined,
      enableDoubleRobin,
      tournamentRecord,
      pairingProfile,
      drawType: AD_HOC,
      drawSize,
      event,
    });
    if (result.error) return result;
    const { drawDefinition } = result;
    if (drawDefinition) {
      const drawId = drawDefinition?.drawId;
      addDrawDefinitionRecorded({ drawDefinition, event, tournamentRecord });
      drawIds.push(drawId);
    }
  }
  return undefined;
}
