import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { getParticipants } from '@Query/participants/getParticipants';
import { getQualityWinPoints } from '@Query/scales/getQualityWinPoints';
import { getTargetElement } from '@Query/scales/getTargetElement';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import { getAwardPoints } from '@Query/scales/getAwardPoints';
import { getDevContext } from '@Global/state/globalState';
import { unique } from '@Tools/arrays';

// constants and types
import { MISSING_POLICY_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { ParticipantFilters, PolicyDefinitions } from '@Types/factoryTypes';
import { PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SPLIT_EVEN } from '@Constants/rankingConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetTournamentPointsArgs = {
  participantFilters?: ParticipantFilters;
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  level?: number;
};
export function getTournamentPoints({
  participantFilters,
  policyDefinitions,
  tournamentRecord,
  level,
}: GetTournamentPointsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const devContext = getDevContext();

  const { policyDefinitions: attachedPolicies } = getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_RANKING_POINTS],
    tournamentRecord,
  });

  const pointsPolicy =
    policyDefinitions?.[POLICY_TYPE_RANKING_POINTS] ?? attachedPolicies?.[POLICY_TYPE_RANKING_POINTS];
  if (!pointsPolicy) return { error: MISSING_POLICY_DEFINITION };

  const awardProfiles = pointsPolicy.awardProfiles;
  let requireWinFirstRound = pointsPolicy.requireWinFirstRound;
  const requireWinForPoints = pointsPolicy.requireWinForPoints;
  const doublesAttribution = pointsPolicy.doublesAttribution;
  const qualityWinProfiles = pointsPolicy.qualityWinProfiles;

  const { participants, derivedEventInfo, derivedDrawInfo, mappedMatchUps } = getParticipants({
    withRankingProfile: true,
    participantFilters,
    tournamentRecord,
  });

  const participantsWithOutcomes = participants?.filter((p) => p.draws?.length);

  // build lookup maps for resolving individual participantId → personId
  const participantPersonMap: Record<string, string> = {};
  const participantIndividualIdsMap: Record<string, string[]> = {};
  for (const p of tournamentRecord.participants || []) {
    if (p.person?.personId) {
      participantPersonMap[p.participantId] = p.person.personId;
    }
    if (p.individualParticipantIds?.length) {
      participantIndividualIdsMap[p.participantId] = p.individualParticipantIds;
    }
  }

  // keep track of points earned per person / per team
  const personPoints = {};
  const teamPoints = {};
  const pairPoints = {};

  for (const participant of participantsWithOutcomes ?? []) {
    const { participantType, participantId, person, draws } = participant;

    for (const draw of draws) {
      const { drawId, structureParticipation, eventId } = draw;
      const eventInfo = derivedEventInfo[eventId];
      const drawInfo = derivedDrawInfo[drawId];
      const drawType = drawInfo?.drawType;

      const { category, eventType, gender, wheelchairClass } = eventInfo || {};
      const startDate = draw.startDate || eventInfo.startDate || tournamentRecord.startDate;
      const endDate = draw.endDate || eventInfo.endDate || tournamentRecord.endDate;

      // don't process INDIVIDUAL and PAIR participants in TEAM events
      // They are processed in the context of the TEAM in which they appear
      if (eventType === TEAM_EVENT && participantType !== TEAM_PARTICIPANT) {
        continue;
      }

      let points;

      if (awardProfiles) {
        let requireWin = requireWinForPoints;
        let totalWinsCount = 0;
        let positionPoints = 0;
        let perWinPoints = 0;
        let bonusPoints = 0;
        let rangeAccessor;
        let profileName;
        let countedWins = 0;
        let maxCountable: number | undefined;
        let bestFinishingPosition: number | undefined;
        let primaryAwardProfile: any;

        for (const participation of structureParticipation) {
          const { finishingPositionRange, participationOrder, participantWon, flightNumber, rankingStage, winCount } =
            participation;

          totalWinsCount += winCount || 0;

          // track best (lowest) finishing position for bonus points
          if (Array.isArray(finishingPositionRange) && finishingPositionRange.length) {
            const bestInParticipation = Math.min(...finishingPositionRange);
            if (bestFinishingPosition === undefined || bestInParticipation < bestFinishingPosition) {
              bestFinishingPosition = bestInParticipation;
            }
          }

          const drawSize = drawInfo?.drawSize;

          const { awardProfile } = getAwardProfile({
            wheelchairClass,
            awardProfiles,
            participation,
            eventType,
            startDate,
            category,
            drawSize,
            drawType,
            endDate,
            gender,
            level,
          });

          if (awardProfile) {
            // NOTE: for now drawSize: 0 indicates qualifying structure with no MAIN structure
            if (!drawSize) continue;

            if (awardProfile.profileName) profileName = awardProfile.profileName;
            if (!primaryAwardProfile) primaryAwardProfile = awardProfile;

            // resolve maxCountableMatches (once per draw, from first profile that specifies it)
            if (maxCountable === undefined && awardProfile.maxCountableMatches !== undefined) {
              const mcm = awardProfile.maxCountableMatches;
              if (typeof mcm === 'number') {
                maxCountable = mcm;
              } else if (typeof mcm === 'object') {
                const resolved = getTargetElement(level, mcm.level ?? mcm);
                if (typeof resolved === 'number') maxCountable = resolved;
              }
            }

            let accessor = Array.isArray(finishingPositionRange) && Math.max(...finishingPositionRange);

            // For QUALIFYING stages, normalize the accessor so that policies can use
            // position 1 = qualifier (won through), 2 = final round loser, 4 = 2nd round loser, etc.
            // The factory's raw finishingPositionRange is relative to the qualifying draw size
            // (e.g. [4,4] for a qualifier in a 8→4 qualifying draw), but policies model
            // qualifying positions as 1=Q, 2=FRQ, 4=Q2, etc.
            if (rankingStage === QUALIFYING && accessor && participation.finishingRound) {
              // finishingRound counts from the final: 1 = last round, 2 = penultimate, etc.
              // Normalize: round 1 losers → position 2, round 2 losers → position 4, winners → position 1
              if (participantWon) {
                accessor = 1;
              } else {
                accessor = Math.pow(2, participation.finishingRound);
              }
            }

            const dashRange = unique(finishingPositionRange || []).join('-');

            const firstRound = accessor && rankingStage !== QUALIFYING && finishingPositionRange?.includes(drawSize);

            if (awardProfile.requireWinForPoints !== undefined) requireWin = awardProfile.requireWinForPoints;
            if (awardProfile.requireWinFirstRound !== undefined)
              requireWinFirstRound = awardProfile.requireWinFirstRound;

            const {
              finishingPositionPoints = {},
              finishingPositionRanges,
              finishingRound,
              pointsPerWin,
              flights,
            } = awardProfile;

            const ppwProfile = Array.isArray(awardProfile.perWinPoints)
              ? awardProfile.perWinPoints?.find((pwp) => pwp.participationOrders?.includes(participationOrder))
              : awardProfile.perWinPoints;

            const participationOrders = finishingPositionPoints.participationOrders;

            let awardPoints = 0;
            let winRequired;

            const isValidOrder = !participationOrders || participationOrders.includes(participationOrder);

            if (isValidOrder && finishingPositionRanges && accessor) {
              const valueObj = finishingPositionRanges[accessor];
              if (valueObj) {
                ({ awardPoints, requireWin: winRequired } = getAwardPoints({
                  flightNumber,
                  valueObj,
                  drawSize,
                  flights,
                  level,
                }));
              }
            }

            if (!awardPoints && finishingRound && participationOrder === 1 && accessor) {
              const valueObj = finishingRound[accessor];
              if (valueObj) {
                ({ awardPoints, requireWin: winRequired } = getAwardPoints({
                  participantWon,
                  flightNumber,
                  valueObj,
                  drawSize,
                  flights,
                  level,
                }));
              }
            }

            if (firstRound && requireWinFirstRound !== undefined) {
              requireWin = requireWinFirstRound;
            }
            if (winRequired !== undefined) requireWin = winRequired;

            if (awardPoints > positionPoints && (!requireWin || winCount)) {
              positionPoints = awardPoints;
              rangeAccessor = accessor;
              primaryAwardProfile = awardProfile;
            }

            // cap wins for per-win calculations
            const effectiveWinCount =
              maxCountable !== undefined && maxCountable > 0
                ? Math.min(winCount || 0, Math.max(0, maxCountable - countedWins))
                : winCount;

            if (!awardPoints && pointsPerWin && effectiveWinCount) {
              perWinPoints += effectiveWinCount * pointsPerWin;
              countedWins += effectiveWinCount;
              rangeAccessor = dashRange;
            }

            if (!awardPoints && winCount && ppwProfile) {
              const levelValue = getTargetElement(level, ppwProfile?.level);
              if (typeof levelValue === 'number') {
                perWinPoints += (effectiveWinCount || 0) * levelValue;
                countedWins += effectiveWinCount || 0;
              } else if (!levelValue && ppwProfile.value) {
                perWinPoints += (effectiveWinCount || 0) * ppwProfile.value;
                countedWins += effectiveWinCount || 0;
              }
              // when levelValue is an object (e.g. { line: [...] }), line-based
              // points are handled in the team tieMatchUp loop below
            }
          }

          if (participantType === TEAM_PARTICIPANT && awardProfile) {
            const ppw = Array.isArray(awardProfile.perWinPoints)
              ? awardProfile.perWinPoints?.find((pwp) => pwp.participationOrders?.includes(participationOrder))
              : awardProfile.perWinPoints;
            const levelValue = ppw && getTargetElement(level, ppw.level);

            if (levelValue) {
              const teamStructureMatchUps = (participant.matchUps || []).filter(
                ({ structureId }) => structureId === participation.structureId,
              );
              for (const { matchUpId } of teamStructureMatchUps) {
                const matchUp = mappedMatchUps[matchUpId];
                const sideNumber = matchUp?.sides?.find((side) => side.participantId === participantId)?.sideNumber;

                // only award line position points for team wins
                if (!sideNumber || matchUp.winningSide !== sideNumber) continue;

                for (const tieMatchUp of matchUp.tieMatchUps || []) {
                  if (!tieMatchUp.winningSide) continue;

                  const { collectionPosition } = tieMatchUp;

                  let lineValue;
                  if (typeof levelValue === 'object' && levelValue.line) {
                    if (levelValue.limit && collectionPosition > levelValue.limit) continue;
                    lineValue = levelValue.line[collectionPosition - 1];
                  } else if (typeof levelValue === 'number') {
                    lineValue = levelValue;
                  }

                  if (!lineValue) continue;

                  for (const side of tieMatchUp.sides || []) {
                    if (side.sideNumber !== tieMatchUp.winningSide) continue;

                    const sideParticipantId = side.participantId;
                    if (!sideParticipantId) continue;

                    // resolve personIds (handles both singles and doubles tieMatchUps)
                    const individualIds = participantIndividualIdsMap[sideParticipantId];
                    const targetIds = individualIds || [sideParticipantId];

                    for (const targetId of targetIds) {
                      const personId = participantPersonMap[targetId];
                      if (!personId) continue;

                      if (!personPoints[personId]) personPoints[personId] = [];
                      personPoints[personId].push({
                        linePoints: lineValue,
                        collectionPosition,
                        eventType,
                        drawId,
                      });
                    }
                  }
                }
              }
            }
          }
        }

        // compute bonus points from the primary award profile
        if (primaryAwardProfile?.bonusPoints && bestFinishingPosition !== undefined) {
          for (const bp of primaryAwardProfile.bonusPoints) {
            if (bp.finishingPositions?.includes(bestFinishingPosition)) {
              const bonusValue = bp.value;
              if (typeof bonusValue === 'number') {
                bonusPoints = bonusValue;
              } else if (typeof bonusValue === 'object') {
                const resolved = getTargetElement(level, bonusValue.level ?? bonusValue);
                if (typeof resolved === 'number') bonusPoints = resolved;
              }
              break;
            }
          }
        }

        points = positionPoints + perWinPoints + bonusPoints;

        if (perWinPoints || positionPoints || bonusPoints) {
          const award: Record<string, any> = {
            winCount: totalWinsCount,
            positionPoints,
            rangeAccessor,
            perWinPoints,
            bonusPoints,
            eventType,
            drawId,
            points,
            category,
            drawType,
            startDate,
            endDate,
            level,
          };

          if (devContext && profileName) award.profileName = profileName;

          const personId = person?.personId;
          if (personId) {
            if (!personPoints[personId]) personPoints[personId] = [];
            personPoints[personId].push(award);
          } else if (participantType === PAIR) {
            if (!pairPoints[participantId]) pairPoints[participantId] = [];
            pairPoints[participantId].push(award);

            // doublesAttribution: resolve pair to individuals
            if (doublesAttribution) {
              const multiplier = doublesAttribution === SPLIT_EVEN ? 0.5 : 1;
              const individualIds = participantIndividualIdsMap[participantId] || [];
              for (const indId of individualIds) {
                const indPersonId = participantPersonMap[indId];
                if (!indPersonId) continue;
                const individualAward = {
                  ...award,
                  points: Math.round(award.points * multiplier),
                  positionPoints: Math.round(award.positionPoints * multiplier),
                  perWinPoints: Math.round(award.perWinPoints * multiplier),
                  bonusPoints: Math.round(award.bonusPoints * multiplier),
                  doublesParticipantId: participantId,
                };
                if (!personPoints[indPersonId]) personPoints[indPersonId] = [];
                personPoints[indPersonId].push(individualAward);
              }
            }
          } else if (participantType === TEAM_PARTICIPANT) {
            if (!teamPoints[participantId]) teamPoints[participantId] = [];
            teamPoints[participantId].push(award);
          }
        }

        // compute quality win points for this draw
        if (qualityWinProfiles?.length && participant.matchUps) {
          const drawMatchUps = Object.values(participant.matchUps as Record<string, any>).filter(
            (m: any) => m.drawId === drawId && m.participantWon,
          );

          if (drawMatchUps.length) {
            const wonMatchUpIds = drawMatchUps.map((m: any) => m.matchUpId);
            const participantSideMap: Record<string, number> = {};
            for (const m of drawMatchUps) {
              participantSideMap[m.matchUpId] = m.sideNumber;
            }

            const { qualityWinPoints, qualityWins } = getQualityWinPoints({
              qualityWinProfiles,
              wonMatchUpIds,
              mappedMatchUps,
              participantId,
              participantSideMap,
              tournamentParticipants: tournamentRecord.participants || [],
              tournamentStartDate: tournamentRecord.startDate,
              level,
            });

            if (qualityWinPoints > 0) {
              const personId = person?.personId;
              if (personId) {
                if (!personPoints[personId]) personPoints[personId] = [];
                personPoints[personId].push({
                  qualityWinPoints,
                  qualityWins,
                  eventType,
                  drawId,
                });
              }
            }
          }
        }
      }
    }
  }

  return {
    participantsWithOutcomes,
    personPoints,
    pairPoints,
    teamPoints,
    ...SUCCESS,
  };
}
