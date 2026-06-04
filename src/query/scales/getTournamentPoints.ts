import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { getParticipants } from '@Query/participants/getParticipants';
import { getQualityWinPoints } from '@Query/scales/getQualityWinPoints';
import { getTargetElement } from '@Query/scales/getTargetElement';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import { getAwardPoints } from '@Query/scales/getAwardPoints';
import { getDevContext } from '@Global/state/globalState';
import { policyRegistry } from '@Global/policyRegistry';
import { unique } from '@Tools/arrays';

// constants and types
import { MISSING_POLICY_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { ParticipantFilters, PolicyDefinitions } from '@Types/factoryTypes';
import { PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DOUBLES, TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SPLIT_EVEN, TEAM_ONLY } from '@Constants/rankingConstants';
import { Tournament } from '@Types/tournamentTypes';

function calculateBonusPoints(primaryAwardProfile, bestFinishingPosition, level) {
  let bonusPoints = 0;
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
  return bonusPoints;
}

function resolveLineValue(levelValue, collectionPosition) {
  if (typeof levelValue === 'object' && levelValue.line) {
    if (levelValue.limit && collectionPosition > levelValue.limit) return undefined;
    return levelValue.line[collectionPosition - 1];
  }
  if (typeof levelValue === 'number') return levelValue;
  return undefined;
}

function awardLinePointsToWinningSide({
  tieMatchUp,
  lineValue,
  participantIndividualIdsMap,
  participantPersonMap,
  personPoints,
  pointsAuthority,
  eventType,
  drawId,
}) {
  const { collectionPosition } = tieMatchUp;
  for (const side of tieMatchUp.sides ?? []) {
    if (side.sideNumber !== tieMatchUp.winningSide) continue;

    const sideParticipantId = side.participantId;
    if (!sideParticipantId) continue;

    const individualIds = participantIndividualIdsMap[sideParticipantId];
    const targetIds = individualIds || [sideParticipantId];

    for (const targetId of targetIds) {
      const personId = participantPersonMap[targetId];
      if (!personId) continue;

      if (!personPoints[personId]) personPoints[personId] = [];
      personPoints[personId].push({
        linePoints: lineValue,
        collectionPosition,
        pointsAuthority,
        eventType,
        drawId,
      });
    }
  }
}

function calculateTeamLinePoints({
  participantType,
  participantId,
  awardProfile,
  participant,
  participation,
  mappedMatchUps,
  levelValue,
  participantIndividualIdsMap,
  participantPersonMap,
  personPoints,
  pointsAuthority,
  eventType,
  drawId,
}) {
  if (participantType !== TEAM_PARTICIPANT || !awardProfile || !levelValue) return;

  const teamStructureMatchUps = (participant.matchUps ?? []).filter(
    ({ structureId }) => structureId === participation.structureId,
  );
  for (const { matchUpId } of teamStructureMatchUps) {
    const matchUp = mappedMatchUps[matchUpId];
    const sideNumber = matchUp?.sides?.find((side) => side.participantId === participantId)?.sideNumber;

    if (!sideNumber || matchUp.winningSide !== sideNumber) continue;

    for (const tieMatchUp of matchUp.tieMatchUps ?? []) {
      if (!tieMatchUp.winningSide) continue;

      const lineValue = resolveLineValue(levelValue, tieMatchUp.collectionPosition);
      if (!lineValue) continue;

      awardLinePointsToWinningSide({
        tieMatchUp,
        lineValue,
        participantIndividualIdsMap,
        participantPersonMap,
        personPoints,
        pointsAuthority,
        eventType,
        drawId,
      });
    }
  }
}

function calculateQualityWinPoints({
  qualityWinProfiles,
  participant,
  drawId,
  mappedMatchUps,
  participantId,
  person,
  tournamentRecord,
  level,
  personPoints,
  pointsAuthority,
  eventType,
}) {
  if (!qualityWinProfiles?.length || !participant.matchUps) return;

  const drawMatchUps = Object.values(participant.matchUps as Record<string, any>).filter(
    (m: any) => m.drawId === drawId && m.participantWon,
  );

  if (!drawMatchUps.length) return;

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
    tournamentParticipants: tournamentRecord.participants ?? [],
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
        pointsAuthority,
        eventType,
        drawId,
      });
    }
  }
}

function resolveMaxCountable(awardProfile, level, currentMax) {
  if (currentMax !== undefined || awardProfile.maxCountableMatches === undefined) return currentMax;
  const mcm = awardProfile.maxCountableMatches;
  if (typeof mcm === 'number') return mcm;
  if (typeof mcm === 'object') {
    const resolved = getTargetElement(level, mcm.level ?? mcm);
    if (typeof resolved === 'number') return resolved;
  }
  return currentMax;
}

function resolvePositionPoints({ awardProfile, participation, level, drawSize }) {
  const { finishingPositionRange, participationOrder, participantWon, flightNumber, rankingStage } = participation;

  let accessor = Array.isArray(finishingPositionRange) && Math.max(...finishingPositionRange);

  if (rankingStage === QUALIFYING && accessor && participation.finishingRound) {
    accessor = participantWon ? 1 : Math.pow(2, participation.finishingRound);
  }

  const { finishingPositionPoints = {}, finishingPositionRanges, finishingRound, flights } = awardProfile;

  const participationOrders = finishingPositionPoints.participationOrders;
  const isValidOrder = !participationOrders || participationOrders.includes(participationOrder);

  let awardPoints = 0;
  let winRequired;

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

  return { awardPoints, winRequired, accessor };
}

function accumulatePerWinPoints({ awardProfile, participation, level, maxCountable, countedWins }) {
  const { participationOrder, winCount } = participation;
  const { pointsPerWin } = awardProfile;

  const effectiveWinCount =
    maxCountable !== undefined && maxCountable > 0
      ? Math.min(winCount || 0, Math.max(0, maxCountable - countedWins))
      : winCount;

  const dashRange = unique(participation.finishingPositionRange ?? []).join('-');

  let perWin = 0;
  let counted = 0;
  let rangeAccessor;

  if (pointsPerWin && effectiveWinCount) {
    perWin += effectiveWinCount * pointsPerWin;
    counted += effectiveWinCount;
    rangeAccessor = dashRange;
  }

  const ppwProfile = Array.isArray(awardProfile.perWinPoints)
    ? awardProfile.perWinPoints?.find((pwp) => pwp.participationOrders?.includes(participationOrder))
    : awardProfile.perWinPoints;

  if (winCount && ppwProfile) {
    const levelValue = getTargetElement(level, ppwProfile?.level);
    if (typeof levelValue === 'number') {
      perWin += (effectiveWinCount || 0) * levelValue;
      counted += effectiveWinCount || 0;
    } else if (!levelValue && ppwProfile.value) {
      perWin += (effectiveWinCount || 0) * ppwProfile.value;
      counted += effectiveWinCount || 0;
    }
  }

  return { perWin, counted, rangeAccessor };
}

function distributeAward({
  award,
  participantType,
  participantId,
  person,
  personPoints,
  pairPoints,
  teamPoints,
  doublesAttribution,
  participantIndividualIdsMap,
  participantPersonMap,
}) {
  const personId = person?.personId;
  if (personId) {
    if (!personPoints[personId]) personPoints[personId] = [];
    personPoints[personId].push(award);
    return;
  }

  if (participantType === PAIR) {
    // The pair "owns" the award only when the policy treats the pair as
    // the ranking entity — either `teamOnly` (explicit pair ranking) or
    // no doublesAttribution declared at all (legacy default). Under
    // `fullToEach` and `splitEven` the per-individual rankings are the
    // target; the pair is bookkeeping for who played together and gets
    // nothing of its own.
    if (!doublesAttribution || doublesAttribution === TEAM_ONLY) {
      if (!pairPoints[participantId]) pairPoints[participantId] = [];
      pairPoints[participantId].push(award);
      return;
    }

    const multiplier = doublesAttribution === SPLIT_EVEN ? 0.5 : 1;
    const individualIds = participantIndividualIdsMap[participantId] ?? [];
    for (const indId of individualIds) {
      const indPersonId = participantPersonMap[indId];
      if (!indPersonId) continue;
      const individualAward = {
        ...award,
        points: Math.round(award.points * multiplier),
        positionPoints: Math.round(award.positionPoints * multiplier),
        perWinPoints: Math.round(award.perWinPoints * multiplier),
        bonusPoints: Math.round(award.bonusPoints * multiplier),
      };
      if (!personPoints[indPersonId]) personPoints[indPersonId] = [];
      personPoints[indPersonId].push(individualAward);
    }
    return;
  }

  if (participantType === TEAM_PARTICIPANT) {
    if (!teamPoints[participantId]) teamPoints[participantId] = [];
    teamPoints[participantId].push(award);
  }
}

function processParticipation({
  participation,
  awardProfiles,
  wheelchairClass,
  eventType,
  startDate,
  category,
  drawInfo,
  drawType,
  endDate,
  gender,
  level,
  accum,
}) {
  const { finishingPositionRange, rankingStage, winCount } = participation;

  accum.totalWinsCount += winCount || 0;

  if (Array.isArray(finishingPositionRange) && finishingPositionRange.length) {
    const bestInParticipation = Math.min(...finishingPositionRange);
    if (accum.bestFinishingPosition === undefined || bestInParticipation < accum.bestFinishingPosition) {
      accum.bestFinishingPosition = bestInParticipation;
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
    if (!drawSize) return { awardProfile, skip: true };

    if (awardProfile.profileName) accum.profileName = awardProfile.profileName;
    if (accum.primaryAwardProfile === undefined) {
      accum.primaryAwardProfile = awardProfile;
      accum.rankingStage = rankingStage;
    }

    accum.maxCountable = resolveMaxCountable(awardProfile, level, accum.maxCountable);

    const { awardPoints, winRequired, accessor } = resolvePositionPoints({
      awardProfile,
      participation,
      drawSize,
      level,
    });

    const firstRound = accessor && rankingStage !== QUALIFYING && finishingPositionRange?.includes(drawSize);

    if (awardProfile.requireWinForPoints !== undefined) accum.requireWin = awardProfile.requireWinForPoints;
    if (awardProfile.requireWinFirstRound !== undefined) accum.requireWinFirstRound = awardProfile.requireWinFirstRound;

    if (firstRound && accum.requireWinFirstRound !== undefined) {
      accum.requireWin = accum.requireWinFirstRound;
    }
    if (winRequired !== undefined) accum.requireWin = winRequired;

    if (awardPoints > accum.positionPoints && (!accum.requireWin || winCount)) {
      accum.positionPoints = awardPoints;
      accum.rangeAccessor = accessor;
      accum.primaryAwardProfile = awardProfile;
      accum.rankingStage = rankingStage;
    }

    if (!awardPoints) {
      const pwResult = accumulatePerWinPoints({
        awardProfile,
        participation,
        maxCountable: accum.maxCountable,
        countedWins: accum.countedWins,
        level,
      });
      accum.perWinPoints += pwResult.perWin;
      accum.countedWins += pwResult.counted;
      if (pwResult.rangeAccessor) accum.rangeAccessor = pwResult.rangeAccessor;
    }
  }

  return { awardProfile, skip: false };
}

function calculateDrawPoints({
  participant,
  draw,
  eventInfo,
  drawInfo,
  mappedMatchUps,
  awardProfiles,
  requireWinForPoints,
  requireWinFirstRound: initialRequireWinFirstRound,
  doublesAttribution,
  qualityWinProfiles,
  personPoints,
  pairPoints,
  teamPoints,
  participantPersonMap,
  participantIndividualIdsMap,
  pointsAuthority,
  level,
  devContext,
  tournamentRecord,
}) {
  const { participantType, participantId, person } = participant;
  const { drawId, structureParticipation } = draw;
  const drawType = drawInfo?.drawType;

  const { category, eventType, gender, wheelchairClass } = eventInfo ?? {};
  const startDate = draw.startDate || eventInfo.startDate || tournamentRecord.startDate;
  const endDate = draw.endDate || eventInfo.endDate || tournamentRecord.endDate;

  if (eventType === TEAM_EVENT && participantType !== TEAM_PARTICIPANT) {
    return;
  }

  // Mirror of the TEAM_EVENT guard above for DOUBLES: the PAIR
  // participant is the canonical processing path for every doubles
  // event regardless of policy mode. distributeAward's PAIR branch
  // routes the resulting award to either personPoints (fullToEach,
  // splitEven) or pairPoints (teamOnly, no attribution declared)
  // based on policy. The individual's own draw participation would
  // otherwise emit a duplicate per-personId award; under modes that
  // route to pairPoints it would also leak individual awards that
  // the policy explicitly didn't ask for.
  if (eventType === DOUBLES && participantType !== PAIR) {
    return;
  }

  let points;

  if (awardProfiles && structureParticipation) {
    const accum = buildAccumulator({ initialRequireWinFirstRound, requireWinForPoints });

    processAllParticipations({
      structureParticipation,
      awardProfiles,
      wheelchairClass,
      participantType,
      participantId,
      participant,
      eventType,
      startDate,
      category,
      drawInfo,
      drawType,
      endDate,
      gender,
      level,
      accum,
      mappedMatchUps,
      participantIndividualIdsMap,
      participantPersonMap,
      personPoints,
      pointsAuthority,
      drawId,
    });

    const bonusPoints = calculateBonusPoints(accum.primaryAwardProfile, accum.bestFinishingPosition, level);

    points = accum.positionPoints + accum.perWinPoints + bonusPoints;

    if (accum.perWinPoints || accum.positionPoints || bonusPoints) {
      buildAndDistributeAward({
        accum,
        bonusPoints,
        points,
        eventType,
        drawId,
        category,
        drawType,
        startDate,
        endDate,
        level,
        devContext,
        participantType,
        participantId,
        person,
        personPoints,
        pairPoints,
        teamPoints,
        doublesAttribution,
        participantIndividualIdsMap,
        participantPersonMap,
        pointsAuthority,
      });
    }

    // Quality-win bonuses are part of the same draw context as the
    // primary award, so they inherit the matched profile's authority
    // and only fall back to the policy default when no profile matched.
    calculateQualityWinPoints({
      qualityWinProfiles,
      participant,
      drawId,
      mappedMatchUps,
      participantId,
      person,
      tournamentRecord,
      level,
      personPoints,
      pointsAuthority: accum.primaryAwardProfile?.pointsAuthority ?? pointsAuthority,
      eventType,
    });
  }
}

function buildAccumulator({ initialRequireWinFirstRound, requireWinForPoints }) {
  return {
    requireWinFirstRound: initialRequireWinFirstRound,
    requireWin: requireWinForPoints,
    bestFinishingPosition: undefined as number | undefined,
    primaryAwardProfile: undefined as any,
    maxCountable: undefined as number | undefined,
    rangeAccessor: undefined as any,
    profileName: undefined as any,
    // rankingStage of the participation that contributed positionPoints —
    // tracked so emitted awards can be disambiguated by stage. Without it,
    // a Q-final loser (accessor rewritten to 2) and a MAIN finalist (max
    // finishingPositionRange = 2) share rangeAccessor=2 and downstream
    // consumers can't tell them apart.
    rankingStage: undefined as string | undefined,
    totalWinsCount: 0,
    positionPoints: 0,
    perWinPoints: 0,
    countedWins: 0,
  };
}

function processAllParticipations({
  structureParticipation,
  awardProfiles,
  wheelchairClass,
  participantType,
  participantId,
  participant,
  eventType,
  startDate,
  category,
  drawInfo,
  drawType,
  endDate,
  gender,
  level,
  accum,
  mappedMatchUps,
  participantIndividualIdsMap,
  participantPersonMap,
  personPoints,
  pointsAuthority,
  drawId,
}) {
  for (const participation of structureParticipation) {
    const { awardProfile, skip } = processParticipation({
      participation,
      awardProfiles,
      wheelchairClass,
      eventType,
      startDate,
      category,
      drawInfo,
      drawType,
      endDate,
      gender,
      level,
      accum,
    });

    if (skip) continue;

    if (participantType === TEAM_PARTICIPANT && awardProfile) {
      const ppw = Array.isArray(awardProfile.perWinPoints)
        ? awardProfile.perWinPoints?.find((pwp) => pwp.participationOrders?.includes(participation.participationOrder))
        : awardProfile.perWinPoints;
      const levelValue = ppw && getTargetElement(level, ppw.level);

      calculateTeamLinePoints({
        participantType,
        participantId,
        awardProfile,
        participant,
        participation,
        mappedMatchUps,
        levelValue,
        participantIndividualIdsMap,
        participantPersonMap,
        personPoints,
        pointsAuthority: awardProfile.pointsAuthority ?? pointsAuthority,
        eventType,
        drawId,
      });
    }
  }
}

function buildAndDistributeAward({
  accum,
  bonusPoints,
  points,
  eventType,
  drawId,
  category,
  drawType,
  startDate,
  endDate,
  level,
  devContext,
  participantType,
  participantId,
  person,
  personPoints,
  pairPoints,
  teamPoints,
  doublesAttribution,
  participantIndividualIdsMap,
  participantPersonMap,
  pointsAuthority,
}) {
  // Profile authority wins over policy authority; falls back to the
  // policy default (or undefined) when no profile overrides.
  const effectiveAuthority = accum.primaryAwardProfile?.pointsAuthority ?? pointsAuthority;
  const award: Record<string, any> = {
    winCount: accum.totalWinsCount,
    positionPoints: accum.positionPoints,
    rangeAccessor: accum.rangeAccessor,
    perWinPoints: accum.perWinPoints,
    bonusPoints,
    pointsAuthority: effectiveAuthority,
    stage: accum.rankingStage,
    eventType,
    drawId,
    points,
    category,
    drawType,
    startDate,
    endDate,
    level,
  };

  if (devContext && accum.profileName) award.profileName = accum.profileName;

  distributeAward({
    award,
    participantType,
    participantId,
    person,
    personPoints,
    pairPoints,
    teamPoints,
    doublesAttribution,
    participantIndividualIdsMap,
    participantPersonMap,
  });
}

type GetTournamentPointsArgs = {
  participantFilters?: ParticipantFilters;
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  policyName?: string;
  level?: number;
};
export function getTournamentPoints({
  participantFilters,
  policyDefinitions,
  tournamentRecord,
  policyName,
  level,
}: GetTournamentPointsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const devContext = getDevContext();

  const { policyDefinitions: attachedPolicies } = getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_RANKING_POINTS],
    tournamentRecord,
  });

  const explicitOrAttached =
    policyDefinitions?.[POLICY_TYPE_RANKING_POINTS] ?? attachedPolicies?.[POLICY_TYPE_RANKING_POINTS];
  const pointsPolicy =
    explicitOrAttached ??
    (policyName ? policyRegistry.lookup({ policyType: POLICY_TYPE_RANKING_POINTS, name: policyName }) : undefined);
  if (!pointsPolicy) return { error: MISSING_POLICY_DEFINITION };

  const awardProfiles = pointsPolicy.awardProfiles;
  let requireWinFirstRound = pointsPolicy.requireWinFirstRound;
  const requireWinForPoints = pointsPolicy.requireWinForPoints;
  const doublesAttribution = pointsPolicy.doublesAttribution;
  const qualityWinProfiles = pointsPolicy.qualityWinProfiles;
  const pointsAuthority = pointsPolicy.pointsAuthority;

  const { participants, derivedEventInfo, derivedDrawInfo, mappedMatchUps } = getParticipants({
    withRankingProfile: true,
    participantFilters,
    tournamentRecord,
  });

  const participantsWithOutcomes = participants?.filter((p) => p.draws?.length);

  // build lookup maps for resolving individual participantId → personId
  const participantPersonMap: Record<string, string> = {};
  const participantIndividualIdsMap: Record<string, string[]> = {};
  for (const p of tournamentRecord.participants ?? []) {
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
    for (const draw of participant.draws) {
      const eventInfo = derivedEventInfo[draw.eventId];
      const drawInfo = derivedDrawInfo[draw.drawId];

      calculateDrawPoints({
        participant,
        draw,
        eventInfo,
        drawInfo,
        mappedMatchUps,
        awardProfiles,
        requireWinForPoints,
        requireWinFirstRound,
        doublesAttribution,
        qualityWinProfiles,
        personPoints,
        pairPoints,
        teamPoints,
        participantPersonMap,
        participantIndividualIdsMap,
        pointsAuthority,
        level,
        devContext,
        tournamentRecord,
      });
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
