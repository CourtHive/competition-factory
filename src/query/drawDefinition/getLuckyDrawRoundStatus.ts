import { calculateMatchUpMargin } from '@Query/matchUp/calculateMatchUpMargin';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { findStructure } from '@Acquire/findStructure';

// constants
import { ErrorType, INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { LUCKY_DRAW } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type LuckyParticipantInfo = {
  participantId: string;
  participantName?: string;
  matchUpId: string;
  scoreString?: string;
  margin?: number;
  gameRatio?: number;
  pointRatio?: number;
  setRatio?: number;
  gameDifferential?: number;
  setsWonByLoser?: number;
};

type LuckyRoundInfo = {
  roundNumber: number;
  matchUpsCount: number;
  completedCount: number;
  isComplete: boolean;
  isPreFeedRound: boolean;
  needsLuckySelection: boolean;
  nextRoundHasOpenPosition: boolean;
  advancingWinners?: LuckyParticipantInfo[];
  eligibleLosers?: LuckyParticipantInfo[];
};

type GetLuckyDrawRoundStatusArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureId?: string;
  cumulativeMargin?: boolean;
};

type GetLuckyDrawRoundStatusResult = {
  isLuckyDraw?: boolean;
  rounds?: LuckyRoundInfo[];
  success?: boolean;
  error?: ErrorType;
};

/**
 * Returns the status of each round in a lucky draw, identifying which rounds
 * need a lucky loser selection and providing eligible losers ranked by margin.
 */
export function getLuckyDrawRoundStatus({
  tournamentRecord,
  drawDefinition,
  structureId,
  cumulativeMargin,
}: GetLuckyDrawRoundStatusArgs): GetLuckyDrawRoundStatusResult {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const isLuckyDraw = drawDefinition.drawType === LUCKY_DRAW;
  if (!isLuckyDraw) return { ...SUCCESS, isLuckyDraw: false, rounds: [] };

  structureId = structureId || drawDefinition.structures?.[0]?.structureId;
  if (!structureId) return { error: INVALID_VALUES };

  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure) return { error: INVALID_VALUES };

  const matchUps = structure.matchUps || [];
  const { roundProfile, roundNumbers } = getRoundMatchUps({ matchUps });
  if (!roundProfile || !roundNumbers?.length) return { ...SUCCESS, isLuckyDraw: true, rounds: [] };

  // Build lookup maps for resolving participants from drawPositions
  const positionAssignments = structure.positionAssignments || [];
  const positionToParticipantId: Record<number, string> = {};
  for (const pa of positionAssignments) {
    if (pa.drawPosition && pa.participantId) {
      positionToParticipantId[pa.drawPosition] = pa.participantId;
    }
  }

  const participantMap: Record<string, string> = {};
  if (tournamentRecord?.participants) {
    for (const p of tournamentRecord.participants) {
      if (p.participantId && p.participantName) {
        participantMap[p.participantId] = p.participantName;
      }
    }
  }

  const rounds: LuckyRoundInfo[] = roundNumbers.map((roundNumber) => {
    const profile = roundProfile[roundNumber];
    const roundMatchUps = matchUps.filter((m) => m.roundNumber === roundNumber);
    const completedCount = roundMatchUps.filter(
      (m) => completedMatchUpStatuses.includes(m.matchUpStatus) || m.winningSide,
    ).length;
    const isComplete = completedCount === profile.matchUpsCount;
    const isFinalRound = profile.matchUpsCount === 1;
    const isPreFeedRound = !isFinalRound && profile.matchUpsCount % 2 !== 0;

    const nextRoundNumber = roundNumber + 1;
    const nextRoundMatchUps = matchUps.filter((m) => m.roundNumber === nextRoundNumber);
    const nextRoundHasOpenPosition =
      nextRoundMatchUps.length > 0 &&
      nextRoundMatchUps.some((m) => {
        if (!m.drawPositions || m.drawPositions.filter(Boolean).length < 2) return true;
        // drawPositions exist but check if they actually have participants assigned
        return m.drawPositions.some((dp: number) => {
          if (!dp) return true;
          const assignment = positionAssignments.find((a) => a.drawPosition === dp);
          return !assignment?.participantId && !assignment?.bye;
        });
      });

    const needsLuckySelection = isPreFeedRound && isComplete && nextRoundHasOpenPosition;

    const roundInfo: LuckyRoundInfo = {
      roundNumber,
      matchUpsCount: profile.matchUpsCount,
      completedCount,
      isComplete,
      isPreFeedRound,
      needsLuckySelection,
      nextRoundHasOpenPosition,
    };

    if (isPreFeedRound) {
      const completedMatchUps = roundMatchUps.filter((m) => m.winningSide);

      // Resolve participantId for a given side of a matchUp.
      // Hydrated matchUps have sides[]; raw structure matchUps only have drawPositions[].
      const resolveParticipantId = (m: any, sideNumber: number): string | undefined => {
        // Try hydrated sides first
        const side = m.sides?.find((s: any) => s.sideNumber === sideNumber);
        if (side) return side.participantId || side.participant?.participantId;
        // Fall back to drawPositions → positionAssignments
        const drawPosition = m.drawPositions?.[sideNumber - 1];
        return drawPosition ? positionToParticipantId[drawPosition] : undefined;
      };

      const resolveParticipantName = (m: any, sideNumber: number, participantId: string): string | undefined => {
        const side = m.sides?.find((s: any) => s.sideNumber === sideNumber);
        return side?.participant?.participantName || participantMap[participantId];
      };

      const getParticipantInfo = (m: any, sideNumber: number): LuckyParticipantInfo | undefined => {
        const participantId = resolveParticipantId(m, sideNumber);
        if (!participantId) return undefined;

        const participantName = resolveParticipantName(m, sideNumber, participantId);
        const result = calculateMatchUpMargin({ matchUp: m });
        return {
          participantId,
          participantName,
          matchUpId: m.matchUpId,
          scoreString: m.score?.scoreStringSide1,
          margin: result.margin ?? 0,
          gameRatio: Number.isFinite(result.gameRatio) ? result.gameRatio : undefined,
          pointRatio: Number.isFinite(result.pointRatio) ? result.pointRatio : undefined,
          setRatio: Number.isFinite(result.setRatio) ? result.setRatio : undefined,
          gameDifferential: result.gameDifferential ?? 0,
          setsWonByLoser: result.setsWonByLoser ?? 0,
        };
      };

      // Advancing winners
      roundInfo.advancingWinners = completedMatchUps
        .map((m) => getParticipantInfo(m, m.winningSide!))
        .filter((w): w is LuckyParticipantInfo => !!w);

      // Eligible losers sorted by narrowest margin
      const losers = completedMatchUps
        .map((m) => {
          const losingSideNumber = m.winningSide === 1 ? 2 : 1;
          const info = getParticipantInfo(m, losingSideNumber);
          if (!info || !cumulativeMargin) return info;

          // Cumulative: average margin across all prior matchUps for this participant
          const priorMatchUps = matchUps.filter((pm) => {
            if (!pm.roundNumber || pm.roundNumber > roundNumber || !pm.winningSide) return false;
            const id1 = resolveParticipantId(pm, 1);
            const id2 = resolveParticipantId(pm, 2);
            return id1 === info.participantId || id2 === info.participantId;
          });

          let totalMargin = 0;
          let count = 0;
          for (const pm of priorMatchUps) {
            const pmResult = calculateMatchUpMargin({ matchUp: pm });
            if (Number.isFinite(pmResult.margin)) {
              const pmSide1Id = resolveParticipantId(pm, 1);
              const isLoser =
                (pmSide1Id === info.participantId && pm.winningSide !== 1) ||
                (pmSide1Id !== info.participantId && pm.winningSide !== 2);
              totalMargin += isLoser ? (pmResult.margin ?? 0) : 1 - (pmResult.margin ?? 0);
              count++;
            }
          }

          if (count > 0) info.margin = totalMargin / count;
          return info;
        })
        .filter((l): l is LuckyParticipantInfo => !!l)
        .sort((a, b) => {
          if ((b.margin ?? 0) !== (a.margin ?? 0)) return (b.margin ?? 0) - (a.margin ?? 0);
          return (b.setsWonByLoser ?? 0) - (a.setsWonByLoser ?? 0);
        });

      roundInfo.eligibleLosers = losers;
    }

    return roundInfo;
  });

  return { ...SUCCESS, isLuckyDraw: true, rounds };
}
