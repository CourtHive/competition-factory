import { addStructureParticipation } from '@Query/matchUps/addStructureParticipation';
import { addScheduleItem } from '@Query/matchUps/addScheduleItem';

// constants
import { PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { TEAM } from '@Constants/matchUpTypes';

export function processSides(params) {
  const {
    withScheduleItems,
    scheduleAnalysis,
    withTeamMatchUps,
    participantMap,
    withOpponents,
    withMatchUps,
    withEvents,
    withDraws,

    finishingPositionRange,
    finishingRound,
    matchUpStatus,
    stageSequence,
    roundNumber,
    structureId,
    score,
    stage,

    withRankingProfile,
    collectionPosition,
    tieWinningSide,
    roundPosition,
    matchUpTieId,
    matchUpSides,
    collectionId,
    matchUpType,
    winningSide,
    matchUpId,
    schedule,
    eventId,
    drawId,
    sides,
  } = params;
  const opponents =
    withOpponents &&
    sides?.length === 2 &&
    Object.assign(
      {},
      ...sides
        .map(({ sideNumber }, i) => {
          const opponentParticipantId = sides[1 - i].participantId;
          return (
            sideNumber && {
              [sideNumber]: opponentParticipantId,
            }
          );
        })
        .filter(Boolean),
    );

  for (const side of sides) {
    const { participantId, sideNumber, bye } = side;
    if (bye) continue;

    const participantWon = winningSide === sideNumber;

    const getOpponentInfo = (opponentParticipantId) => {
      const opponent = participantMap[opponentParticipantId]?.participant;
      const participantType = opponent?.participantType;
      const info = [
        {
          participantId: opponentParticipantId,
          participantType,
        },
      ];

      if (participantType !== TEAM_PARTICIPANT) {
        for (const participantId of opponent?.individualParticipantIds || []) {
          const participant = participantMap[participantId]?.participant;
          info.push({
            participantType: participant?.participantType,
            participantId,
          });
        }
      }

      return info;
    };

    const addMatchUp = (participantId, opponentParticipantId) => {
      if (withMatchUps) {
        participantMap[participantId].matchUps[matchUpId] = {
          participantWon,
          matchUpType,
          structureId,
          sideNumber,
          matchUpId,
          eventId,
          drawId,
          stage,
        };
        if (withOpponents) {
          const opponentParticipantInfo = getOpponentInfo(opponentParticipantId);
          participantMap[participantId].matchUps[matchUpId].opponentParticipantInfo = opponentParticipantInfo;
        }
        if (collectionId) {
          participantMap[participantId].matchUps[matchUpId].collectionId = collectionId;
        }
      }

      if (withOpponents && opponentParticipantId) {
        participantMap[participantId].opponents[opponentParticipantId] = {
          participantId: opponentParticipantId,
          matchUpId,
          eventId,
          drawId,
        };
      }

      if (withRankingProfile && winningSide) {
        addStructureParticipation({
          finishingPositionRange,
          collectionPosition,
          participantMap,
          participantWon,
          collectionId,
          finishingRound,
          matchUpStatus,
          participantId,
          stageSequence,
          roundNumber,
          structureId,
          matchUpId,
          drawId,
          stage,
        });
      }

      if (scheduleAnalysis || withScheduleItems) {
        addScheduleItem({
          participantMap,
          participantId,
          matchUpStatus,
          roundPosition,
          matchUpType,
          roundNumber,
          structureId,
          matchUpId,
          schedule,
          drawId,
          score,
        });
      }
    };

    const addPartner = ({ participant, partnerParticipantId }) => {
      const addPartnerParticiapntId = (element, partnerParticipantId) => {
        if (element) {
          if (!element.partnerParticipantIds) element.partnerParticipantIds = [];
          if (!element.partnerParticipantIds.includes(partnerParticipantId))
            element.partnerParticipantIds.push(partnerParticipantId);
        }
      };

      if (withDraws) addPartnerParticiapntId(participant?.draws?.[drawId], partnerParticipantId);
      if (withEvents) {
        addPartnerParticiapntId(participant?.events?.[eventId], partnerParticipantId);
      }
      if (withMatchUps) {
        addPartnerParticiapntId(participant?.matchUps?.[matchUpId], partnerParticipantId);
      }
    };

    if (participantId && participantMap[participantId]) {
      const opponentParticipantId = opponents?.[sideNumber];

      addMatchUp(participantId, opponentParticipantId);

      const isPair = participantMap[participantId]?.participant.participantType === PAIR;
      const individualParticipantIds = participantMap[participantId]?.participant.individualParticipantIds || [];

      if (matchUpTieId) {
        if (withTeamMatchUps) {
          const addTeamMatchUp = (participantId) =>
            (participantMap[participantId].matchUps[matchUpTieId] = {
              participantWon: tieWinningSide === sideNumber,
              matchUpId: matchUpTieId,
              matchUpType: TEAM,
              sideNumber,
            });
          addTeamMatchUp(participantId);
          individualParticipantIds.forEach(addTeamMatchUp);
        }

        if (withDraws && !participantMap[participantId].draws[drawId]) {
          const teamParticipantId = matchUpSides.find((s) => s.sideNumber === sideNumber)?.participant?.participantId;
          const teamEntryStatus = participantMap[teamParticipantId]?.draws?.[drawId]?.entryStatus;

          const addDrawData = (participantId) =>
            (participantMap[participantId].draws[drawId] = {
              entryStatus: teamEntryStatus,
              // add positions played in lineUp collections
              eventId,
              drawId,
            });
          addDrawData(participantId);
          individualParticipantIds.forEach(addDrawData);
        }
      }

      if (isPair) {
        individualParticipantIds.forEach(
          (participantId) => participantMap[participantId] && addMatchUp(participantId, opponentParticipantId),
        );
        individualParticipantIds.forEach((participantId, i) => {
          const partnerParticipantId = individualParticipantIds[1 - i];
          const participant = participantMap[participantId];
          if (participant) addPartner({ participant, partnerParticipantId });
        });

        // in TEAM events PAIR participants do not appear in entries
        if (withEvents && matchUpSides) {
          const teamParticipantId = matchUpSides.find((s) => s.sideNumber === sideNumber)?.participant?.participantId;
          if (teamParticipantId) {
            const teamEntry = participantMap[teamParticipantId]?.events[eventId];

            if (teamEntry) {
              participantMap[participantId].events[eventId] = { ...teamEntry };
              individualParticipantIds.forEach(
                (individualParticiapntId) =>
                  (participantMap[individualParticiapntId].events[eventId] = {
                    ...teamEntry,
                  }),
              );
            } else {
              console.log('Missing teamEntry', { eventId, teamParticipantId });
            }
          }
        }
      }

      if (winningSide) {
        const processParticipantId = (id) => {
          if (participantWon) {
            participantMap[id].counters[matchUpType].wins += 1;
            participantMap[id].counters.wins += 1;
            if (matchUpStatus === WALKOVER) {
              participantMap[id].counters[matchUpType].walkoverWins += 1;
              participantMap[id].counters.walkoverWins += 1;
            }
            if (matchUpStatus === DEFAULTED) {
              participantMap[id].counters[matchUpType].defaultWins += 1;
              participantMap[id].counters.defaultWins += 1;
            }
          } else {
            participantMap[id].counters[matchUpType].losses += 1;
            participantMap[id].counters.losses += 1;
            if (matchUpStatus === WALKOVER) {
              participantMap[id].counters[matchUpType].walkovers += 1;
              participantMap[id].counters.walkovers += 1;
            }
            if (matchUpStatus === DEFAULTED) {
              participantMap[id].counters[matchUpType].defaults += 1;
              participantMap[id].counters.defaults += 1;
            }
          }
        };
        processParticipantId(participantId);
        individualParticipantIds.forEach(processParticipantId);
      }
    }
  }
}
