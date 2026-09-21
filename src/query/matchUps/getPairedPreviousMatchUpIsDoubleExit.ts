import { getMappedStructureMatchUps } from '@Query/matchUps/getMatchUpsMap';
import { findPairedFeeder } from '@Query/matchUps/getPairedPreviousMatchup';
import { pushGlobalLog } from '@Functions/global/globalLog';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

export function getPairedPreviousMatchUpIsDoubleExit(params) {
  let { sourceMatchUp } = params;
  const { targetMatchUp, structure, matchUpsMap, drawPosition } = params;

  const previousRoundNumber = targetMatchUp.roundNumber > 1 && targetMatchUp.roundNumber - 1;

  const structureMatchUps = getMappedStructureMatchUps({
    structureId: structure.structureId,
    matchUpsMap,
  });

  pushGlobalLog({
    method: 'getPairedPreviousMatchUpIsDoubleExit',
    color: 'brightcyan',
    keyColors: { structureId: 'brightyellow', sourceMatchUpId: 'brightmagenta' },
    structureId: structure.structureId?.slice(0, 8),
    targetMatchUpId: targetMatchUp.matchUpId,
    targetRound: [targetMatchUp.roundNumber, targetMatchUp.roundPosition],
    previousRoundNumber,
    sourceMatchUpId: sourceMatchUp?.matchUpId,
    sourceStructureId: sourceMatchUp?.structureId?.slice(0, 8),
    sourceRound: sourceMatchUp ? [sourceMatchUp.roundNumber, sourceMatchUp.roundPosition] : undefined,
    drawPosition,
    structureMatchUpCount: structureMatchUps?.length,
  });

  // When sourceMatchUp is from a different structure (e.g. main draw source
  // feeding into a consolation target), re-resolve within the target structure
  // so the paired round position lookup is scoped correctly.
  if (sourceMatchUp && sourceMatchUp.structureId !== structure.structureId && drawPosition) {
    pushGlobalLog({
      method: 'getPairedPreviousMatchUpIsDoubleExit',
      color: 'cyan',
      info: 'cross_structure_sourceMatchUp_resolving_in_target',
      originalSourceId: sourceMatchUp?.matchUpId,
      originalSourceStructure: sourceMatchUp?.structureId?.slice(0, 8),
      targetStructure: structure.structureId?.slice(0, 8),
    });
    sourceMatchUp = structureMatchUps.find(
      ({ drawPositions, roundNumber }) => roundNumber === previousRoundNumber && drawPositions?.includes(drawPosition),
    );
    pushGlobalLog({
      method: 'getPairedPreviousMatchUpIsDoubleExit',
      color: 'cyan',
      info: 'resolved_cross_structure_sourceMatchUp',
      resolvedMatchUpId: sourceMatchUp?.matchUpId,
      resolvedRound: sourceMatchUp ? [sourceMatchUp.roundNumber, sourceMatchUp.roundPosition] : undefined,
      resolvedStatus: sourceMatchUp?.matchUpStatus,
    });
  } else if (!sourceMatchUp && drawPosition) {
    sourceMatchUp = structureMatchUps.find(
      ({ drawPositions, roundNumber }) => roundNumber === previousRoundNumber && drawPositions?.includes(drawPosition),
    );
    pushGlobalLog({
      method: 'getPairedPreviousMatchUpIsDoubleExit',
      color: 'cyan',
      info: 'resolved_sourceMatchUp_from_drawPosition',
      resolvedMatchUpId: sourceMatchUp?.matchUpId,
      resolvedRound: sourceMatchUp ? [sourceMatchUp.roundNumber, sourceMatchUp.roundPosition] : undefined,
      resolvedStatus: sourceMatchUp?.matchUpStatus,
    });
  }

  /**
   * The previous-round matchUp that feeds this same target — asked structurally, through the single
   * implementation in `getPairedPreviousMatchup`, rather than by `roundPosition ± 1` here and again
   * there. See that file for what the arithmetic got wrong and where it was measured.
   */
  const pairedPreviousMatchUp = findPairedFeeder({
    excludeMatchUpId: sourceMatchUp?.matchUpId,
    targetMatchUpId: targetMatchUp.matchUpId,
    roundNumber: previousRoundNumber,
    candidates: structureMatchUps,
  });

  const pairedPreviousMatchUpStatus = pairedPreviousMatchUp?.matchUpStatus;
  const pairedPreviousMatchUpIsDoubleExit = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(pairedPreviousMatchUpStatus);

  pushGlobalLog({
    method: 'getPairedPreviousMatchUpIsDoubleExit',
    color: pairedPreviousMatchUpIsDoubleExit ? 'brightred' : 'brightgreen',
    keyColors: {
      pairedMatchUpId: 'brightcyan',
      isDoubleExit: pairedPreviousMatchUpIsDoubleExit ? 'brightred' : 'brightgreen',
    },
    sourceRoundPosition: sourceMatchUp?.roundPosition,
    pairedMatchUpId: pairedPreviousMatchUp?.matchUpId,
    pairedRound: pairedPreviousMatchUp
      ? [pairedPreviousMatchUp.roundNumber, pairedPreviousMatchUp.roundPosition]
      : undefined,
    pairedStatus: pairedPreviousMatchUpStatus,
    isDoubleExit: pairedPreviousMatchUpIsDoubleExit,
  });

  return { pairedPreviousMatchUp, pairedPreviousMatchUpIsDoubleExit };
}
