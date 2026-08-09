import { generateDrawDefinition } from '@Assemblies/governors/drawsGovernor';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import tieFormatDefaults from '@Generators/templates/tieFormatDefaults';
import { addParticipants } from '@Mutate/participants/addParticipants';
import { generateVenues } from '@Mutate/venues/generateVenues';
import { generateParticipants } from './generateParticipants';
import { genParticipantId } from './genParticipantId';
import { processTieFormat } from './processTieFormat';
import { generateRange } from '@Tools/arrays';
import { isObject } from '@Tools/objects';
import { isNumeric } from '@Tools/math';
import { UUID } from '@Tools/UUID';

// constants and types
import { Entry, EventTypeUnion, Participant, TieFormat } from '@Types/tournamentTypes';
import { AD_HOC, DOUBLE_ROUND_ROBIN, MAIN } from '@Constants/drawDefinitionConstants';
import { ANY, FEMALE, MALE, MIXED, OTHER } from '@Constants/genderConstants';
import { MISSING_TIE_FORMAT } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { COLLEGE_DEFAULT } from '@Constants/tieFormatConstants';
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

export function processLeagueProfiles(params): any {
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
      const participants = generateParticipants({
        ...leagueProfile?.participantsProfile,
        participantsCount: teamSize,
        consideredDate,
        gendersCount,
        category,
        gender,
        random,
        uuids,
      }).participants as Participant[];

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
      const teamParticipant: any = {
        participantId: teamParticipantId,
        participantRole: COMPETITOR,
        participantName: teamName,
        individualParticipantIds,
        participantType,
        homeVenueIds,
      };

      homeVenueIds.forEach((venueId) => !venueIds.includes(venueId) && venueIds.push(venueId));
      allUniqueParticipantIds.push(...individualParticipantIds, teamParticipantId);
      const result = addParticipants({
        participants: [teamParticipant, ...participants],
        tournamentRecord,
      });
      if (result.error) return result;
    }

    const eventType: EventTypeUnion = TEAM;
    const event = { eventName, entries, eventType, tieFormat, category, eventId, gender };
    tournamentRecord.events ??= [];
    tournamentRecord.events.push(event);

    if (entries.length) {
      // a pairingProfile supplies the schedule itself, so roundsCount is then only an optional
      // truncation to a partial round robin and the shape validates it
      const { pairingProfile } = leagueProfile;
      const roundsCount = pairingProfile
        ? isNumeric(leagueProfile.roundsCount) && leagueProfile.roundsCount
        : deriveLeagueRoundsCount({ roundsCount: leagueProfile.roundsCount, drawSize });
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
        addDrawDefinition({ drawDefinition, event, suppressNotifications: true });
        drawIds.push(drawId);
      }
    }

    leaguesCount++;
  }

  // add venues - can get more sophisticated with this and generate number of courts
  const venueProfiles = venueIds.map((venueId) => ({ venueId }));
  generateVenues({ tournamentRecord, ignoreExistingVenues: true, venueProfiles, uuids });
}
