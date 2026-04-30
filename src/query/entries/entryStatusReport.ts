import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getParticipants } from '@Query/participants/getParticipants';
import { getDetailsWTN } from '@Query/scales/getDetailsWTN';

// Constants and Types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { DOUBLES_MATCHUP, SINGLES_MATCHUP } from '@Constants/matchUpTypes';
import { WITHDRAW_PARTICIPANT } from '@Constants/positionActionConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { DOUBLES_EVENT } from '@Constants/eventConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { Tournament } from '@Types/tournamentTypes';

type GetEntryStatusReportsArgs = {
  tournamentRecord: Tournament;
};

export function getEntryStatusReports({ tournamentRecord }: GetEntryStatusReportsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const tournamentId = tournamentRecord.tournamentId;
  const { participantMap } = getParticipants({
    withScaleValues: true,
    withEvents: true, // so that event rankings will be present
    withSeeding: true,
    tournamentRecord,
    withDraws: true,
  });

  const nonTeamMatchUps =
    allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES_MATCHUP, DOUBLES_MATCHUP] },
      tournamentRecord,
    }).matchUps ?? [];

  const nonTeamEnteredParticipantIds = nonTeamMatchUps
    .flatMap(({ sides, matchUpType }) =>
      sides
        ?.flatMap((side: any) =>
          matchUpType === DOUBLES_MATCHUP
            ? side?.participant?.individualParticipantIds
            : side?.participant?.participantId || side.participantId,
        )
        .filter(Boolean),
    )
    .filter(Boolean);

  const withDrawnParticipantIds: string[] = [];
  const participantEntryReports = {};
  const entryStatusReports = {};
  const eventReports = {};

  let drawDefinitionsCount = 0;

  const pushEntryReport = ({ id, entry, eventId, eventType }) => {
    const { qualifyingSeeding, mainSeeding, entryStatus, entryStage, drawId } = entry;

    if (!participantEntryReports[id]) participantEntryReports[id] = [];

    const { participant, events } = participantMap?.[id] ?? {};
    const entryDetailsWTN = getDetailsWTN({ participant, eventType });
    const ranking = events?.[eventId]?.ranking;

    if (entryStatus === WITHDRAW_PARTICIPANT) withDrawnParticipantIds.push(id);

    participantEntryReports[id].push({
      participantType: participant?.participantType,
      participantId: id,
      tournamentId,
      eventType,
      eventId,
      drawId,
      entryStatus,
      entryStage,
      ...entryDetailsWTN,
      ranking,
      mainSeeding,
      qualifyingSeeding,
    });
  };

  // Who was in a draw and how they got there...
  for (const event of tournamentRecord.events ?? []) {
    const entryStatuses: { [key: string]: { count: number; pct?: number } } = {};
    const countEntryStatus = (entryStatus) => {
      if (!entryStatuses[entryStatus]) entryStatuses[entryStatus] = { count: 0 };
      entryStatuses[entryStatus].count += 1;
    };

    const { drawDefinitions = [], eventType, eventId } = event;
    const entries = drawDefinitions.flatMap((params) => {
      const { drawId, entries } = params;
      drawDefinitionsCount += 1;

      // build up assignedParticipantIds array
      // to ensure that only assignedParticipants are included
      const stageFilter = ({ stage, stageSequence }) => (stage === MAIN && stageSequence === 1) || stage === QUALIFYING;
      const structures: any[] = params.structures ?? [];
      const assignedParticipantIds = structures
        .filter(stageFilter)
        .flatMap(({ positionAssignments }) => positionAssignments)
        .filter(Boolean)
        .map(({ participantId }) => participantId);

      const entryFilter = ({ participantId }) => assignedParticipantIds.includes(participantId);

      const createEntryProfile = (params) => {
        const { participantId, entryStatus, entryStage } = params;
        countEntryStatus(entryStatus);

        const seedAssignments = participantMap?.[participantId]?.draws?.[drawId]?.seedAssignments;
        const mainSeeding = seedAssignments?.[MAIN]?.seedValue ?? seedAssignments?.[MAIN]?.seedNumber;
        const qualifyingSeeding = seedAssignments?.[QUALIFYING]?.seedValue ?? seedAssignments?.[QUALIFYING]?.seedNumber;

        return {
          qualifyingSeeding,
          participantId,
          mainSeeding,
          entryStatus,
          entryStage,
          drawId,
        };
      };

      return entries?.filter(entryFilter).map(createEntryProfile);
    });

    const createEntryMap = (entry) => {
      const participantId = entry.participantId;
      const individualParticipantIds = participantMap?.[participantId].participant.individualParticipantIds?.filter(
        // ensure that for TEAM events individuals who did not compete are not included
        (id) => nonTeamEnteredParticipantIds.includes(id),
      );
      return participantId && { [participantId]: { individualParticipantIds } };
    };

    const processDoublesEvent = () => {
      const participantEntriesMap = Object.assign({}, ...entries.map(createEntryMap).filter(Boolean));

      const processIndividuals = (entry) => {
        participantEntriesMap[entry.participantId].individualParticipantIds.forEach((individualParticipantId) => {
          pushEntryReport({
            id: individualParticipantId,
            eventType,
            eventId,
            entry,
          });
        });
      };

      // add entry details into participantEntryReports
      entries.forEach(processIndividuals);
    };

    if (eventType === DOUBLES_EVENT) {
      processDoublesEvent();
    } else {
      // add entry details into participantEntryReports
      entries.forEach((entry) => {
        pushEntryReport({
          id: entry?.participantId,
          eventType,
          eventId,
          entry,
        });
      });
    }

    const totalEntries: number = Object.values(entryStatuses).reduce((p, c: any) => p + c.count, 0);
    Object.keys(entryStatuses).forEach((key) => {
      entryStatuses[key].pct = (entryStatuses[key].count / totalEntries) * 100;
    });

    // for each entry of each event get their WTN and eventRanking
    eventReports[eventId] = { tournamentId, eventId, entries, entryStatuses };

    const selectedStatuses = Object.assign(
      {},
      ...STRUCTURE_SELECTED_STATUSES.flatMap((entryStatus) => {
        return [
          {
            [entryStatus + '_count']: entryStatuses[entryStatus]?.count,
          },
          {
            [entryStatus + '_pct']: entryStatuses[entryStatus]?.pct,
          },
        ];
      }),
    );
    entryStatusReports[eventId] = {
      tournamentId,
      eventId,
      ...selectedStatuses,
    };
  }

  const individualParticipants = Object.values(participantMap ?? {}).filter(
    ({ participant: { participantType, participantRole } }) =>
      participantType === INDIVIDUAL && participantRole === COMPETITOR,
  );
  const nonParticipatingParticipantIds = individualParticipants
    .filter(({ participant }) => !nonTeamEnteredParticipantIds.includes(participant.participantId))
    .map(({ participant }) => participant.participantId);

  const tournamentEntryReport = {
    nonParticipatingEntriesCount: nonParticipatingParticipantIds.length,
    individualParticipantsCount: individualParticipants.length,
    eventsCount: Object.values(eventReports).length,
    nonParticipatingParticipantIds,
    drawDefinitionsCount,
    tournamentId,
  };

  return {
    entryStatusReports: Object.values(entryStatusReports).flat(),
    participantEntryReports: Object.values(participantEntryReports).flat(),
    eventReports: Object.values(eventReports).flat(),
    withDrawnParticipantIds,
    tournamentEntryReport,
  };
}
