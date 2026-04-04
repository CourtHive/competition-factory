import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getParticipants } from '@Query/participants/getParticipants';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// Constants
import { INDIVIDUAL, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetAggregateTeamResultsArgs = {
  finishingPositionRangeBounsPoints?: { [key: string]: number };
  tournamentRecord: Tournament;
};

export function getAggregateTeamResults(params: GetAggregateTeamResultsArgs) {
  const paramsCheck = checkRequiredParameters(params, [{ [TOURNAMENT_RECORD]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const bonusPoints = params.finishingPositionRangeBounsPoints ?? {};
  const teamBonusPointHashes = {};

  const getTeamParticipant = (participant) => {
    const individualTeams = participant?.individualParticipants?.map((i) => i.teams?.length === 1 && i.teams[0]);
    return (
      (participant?.teams?.length === 1 && participant?.teams?.[0]) ||
      (individualTeams?.[0].participantId === individualTeams?.[1].participantId && individualTeams?.[0])
    );
  };

  const { matchUps, participants } = getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    withRankingProfile: true,
    withStatistics: true,
    ...params,
  });

  // use finishingPositionRange for each draw to determine bonus points
  for (const participant of participants ?? []) {
    if (participant.participantType === TEAM_PARTICIPANT) continue;
    if (participant.draws?.[0]?.drawId === 'draw-0-3') {
      console.log(participant.participantType, participant.draws[0].finishingPositionRange);
    }
    const teamParticipant = getTeamParticipant(participant);
    if (!teamParticipant) continue;
    for (const draw of participant?.draws ?? []) {
      const finishingPositionRange = draw?.finishingPositionRange?.join('-');
      if (finishingPositionRange && bonusPoints?.[finishingPositionRange]) {
        const teamParticipantId = teamParticipant?.participantId;
        const drawId = draw?.drawId;
        const hash = `${teamParticipantId}|${drawId}|${finishingPositionRange}`;
        teamBonusPointHashes[hash] = bonusPoints[finishingPositionRange];
      }
    }
  }

  const initializeResults = (teamName) => ({
    teamName,
    standingPoints: 0,
    pointsPlayed: 0,
    pointsPct: 0,
    points: 0,
    bonus: 0,
    diff: 0,
    loss: 0,
    win: 0,
  });

  const increment = (results, key, value) => {
    if (results[key] === undefined) results[key] = 0;
    results[key] += value;
  };

  const { individualResults, teamResults } = tallyMatchUpResults({
    getTeamParticipant,
    initializeResults,
    increment,
    matchUps,
  });

  applyBonusPoints({ teamBonusPointHashes, teamResults });
  computeIndividualPointsPct(individualResults);

  return { ...SUCCESS, individualResults, teamResults };
}

function tallyMatchUpResults({ getTeamParticipant, initializeResults, increment, matchUps }) {
  const individualResults = {};
  const teamResults = {};

  for (const matchUp of matchUps ?? []) {
    const { sides, matchUpFormat } = matchUp;
    const parsedMatchUpFormat: any = matchUpFormat && parse(matchUpFormat);

    if (
      sides?.length === 2 &&
      parsedMatchUpFormat.setFormat?.timed &&
      (!parsedMatchUpFormat.finalSetFormat || parsedMatchUpFormat.finalSetFormat?.timed)
    ) {
      for (const side of sides) {
        tallySide({ side, matchUp, getTeamParticipant, initializeResults, increment, individualResults, teamResults });
      }
    }
  }

  return { individualResults, teamResults };
}

function tallySide({ side, matchUp, getTeamParticipant, initializeResults, increment, individualResults, teamResults }) {
  const teamParticipant = getTeamParticipant(side.participant);
  const teamParticipantId = teamParticipant?.participantId;
  const participantId = side.participant?.participantId;
  const teamName = teamParticipant?.participantName;
  const sideNumber = side.sideNumber;
  const individualParticipantIds =
    side.participant?.individualParticipantIds || ((participantId && [participantId]) ?? []);

  individualParticipantIds.forEach((individualParticipantId) => {
    if (individualParticipantId && !individualResults[individualParticipantId]) {
      individualResults[individualParticipantId] = initializeResults(teamName);
    }
  });

  if (teamParticipantId && sideNumber) {
    if (!teamResults[teamParticipantId]) teamResults[teamParticipantId] = initializeResults(teamName);

    const resultObjects = [
      ...individualParticipantIds.map((id) => individualResults[id]),
      teamResults[teamParticipantId],
    ];

    if (matchUp.winningSide) {
      if (sideNumber === matchUp.winningSide) {
        resultObjects.forEach((resultObject) => increment(resultObject, 'win', 1));
      } else {
        resultObjects.forEach((resultObject) => increment(resultObject, 'loss', 1));
      }
    }

    const sets = matchUp.score?.sets ?? [];
    for (const set of sets) {
      const opponentPoints = set?.[`side${3 - sideNumber}Score`] || 0;
      const points = set?.[`side${sideNumber}Score`] || 0;
      const diff = points - opponentPoints;

      resultObjects.forEach((resultObject) => increment(resultObject, 'pointsPlayed', points + opponentPoints));
      resultObjects.forEach((resultObject) => increment(resultObject, 'points', points));
      resultObjects.forEach((resultObject) => increment(resultObject, 'diff', diff));
    }
  }
}

function applyBonusPoints({ teamBonusPointHashes, teamResults }) {
  for (const hash of Object.keys(teamBonusPointHashes)) {
    const [teamParticipantId] = hash.split('|');
    if (teamResults[teamParticipantId]) {
      teamResults[teamParticipantId].bonus += teamBonusPointHashes[hash];
      teamResults[teamParticipantId].pointsPct = parseFloat(
        (teamResults[teamParticipantId].points / teamResults[teamParticipantId].pointsPlayed).toFixed(2),
      );
      teamResults[teamParticipantId].standingPoints =
        teamResults[teamParticipantId].win + teamResults[teamParticipantId].bonus;
    }
  }
}

function computeIndividualPointsPct(individualResults) {
  for (const individualParticipantId of Object.keys(individualResults)) {
    individualResults[individualParticipantId].pointsPct = parseFloat(
      (
        individualResults[individualParticipantId].points / individualResults[individualParticipantId].pointsPlayed
      ).toFixed(2),
    );
  }
}
