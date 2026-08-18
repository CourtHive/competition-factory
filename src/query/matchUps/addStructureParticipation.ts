import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

// constants and types
import { MatchUpFinishingPositionRange, MatchUpStatusUnion, StageTypeUnion } from '@Types/tournamentTypes';
import { ParticipantMap } from '@Types/factoryTypes';

export function addStructureParticipation({
  finishingPositionRange: matchUpFinishingPositionRanges = { winner: [], loser: [] },
  collectionPosition,
  participantMap,
  finishingRound,
  participantWon,
  collectionId,
  matchUpStatus,
  participantId,
  stageSequence,
  roundNumber,
  structureId,
  matchUpId,
  drawId,
  stage,
}: {
  finishingPositionRange?: MatchUpFinishingPositionRange;
  matchUpStatus?: MatchUpStatusUnion;
  participantMap: ParticipantMap;
  collectionPosition?: number;
  participantWon: boolean;
  collectionId?: string;
  stageSequence?: number;
  finishingRound?: number;
  stage?: StageTypeUnion;
  participantId: string;
  roundNumber?: number;
  structureId: string;
  matchUpId: string;
  drawId: string;
}) {
  const participantAggregator = participantMap[participantId];
  const diff = (range) => Math.abs(range[0] - range[1]);

  if (!participantAggregator.structureParticipation[structureId]) {
    participantAggregator.structureParticipation[structureId] = {
      rankingStage: stage,
      walkoverWinCount: 0,
      defaultWinCount: 0,
      stageSequence,
      winCount: 0,
      structureId,
      drawId,
    };
  }

  const structureParticipation = participantAggregator.structureParticipation[structureId];

  const { winner, loser } = matchUpFinishingPositionRanges as any;
  const finishingPositionRange = participantWon ? winner : loser;
  if (participantWon) {
    structureParticipation.winCount += 1;
    if (matchUpStatus === WALKOVER) {
      structureParticipation.walkoverWinCount += 1;
    }
    if (matchUpStatus === DEFAULTED) {
      structureParticipation.defaultWinCount += 1;
    }
  }

  if (
    finishingPositionRange &&
    (!structureParticipation.finishingPositionRange ||
      diff(finishingPositionRange) < diff(structureParticipation.finishingPositionRange))
  ) {
    structureParticipation.finishingPositionRange = finishingPositionRange;
  }

  if (finishingRound) {
    if (!structureParticipation.finishingRound || finishingRound < structureParticipation.finishingRound) {
      structureParticipation.finishingMatchUpId = matchUpId;
      structureParticipation.finishingRound = finishingRound;
      structureParticipation.roundNumber = roundNumber;
    }
    if (finishingRound === 1) {
      // participant won the structure
      structureParticipation.participantWon = participantWon;
    }
  }

  if (collectionPosition) {
    if (!structureParticipation.lineParticipation) {
      structureParticipation.lineParticipation = [];
    }
    structureParticipation.lineParticipation.push({
      collectionPosition,
      collectionId,
      won: participantWon,
    });
  }
}
