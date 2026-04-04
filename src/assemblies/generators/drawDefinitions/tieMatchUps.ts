import { generateRange } from '@Tools/arrays';
import { UUID } from '@Tools/UUID';

// constants and types
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MatchUp, TieFormat } from '@Types/tournamentTypes';

type GenerateTieMatchUpsArgs = {
  tieFormat?: TieFormat;
  matchUp?: MatchUp;
  isMock?: boolean;
  uuids?: string[];
};
export function generateTieMatchUps({ matchUp, tieFormat, isMock, uuids }: GenerateTieMatchUpsArgs) {
  const { collectionDefinitions } = tieFormat ?? {};

  const tieMatchUps = (collectionDefinitions ?? [])
    .map((collectionDefinition) => generateCollectionMatchUps({ matchUp, collectionDefinition, uuids, isMock }))
    .filter(Boolean)
    .flat();

  return { tieMatchUps };
}

type GenerateCollectionMatchUpsArgs = {
  collectionPositionOffset?: number;
  collectionDefinition: any;
  matchUpsLimit?: number;
  matchUp?: MatchUp;
  isMock?: boolean;
  uuids?: string[];
};
export function generateCollectionMatchUps({
  collectionPositionOffset = 0,
  collectionDefinition,
  matchUpsLimit, // internal use allows generation of missing matchUps on "reset"
  matchUp,
  isMock,
  uuids,
}: GenerateCollectionMatchUpsArgs): MatchUp[] {
  const { matchUpCount, matchUpType, collectionId, processCodes } = collectionDefinition ?? {};

  const numberToGenerate = matchUpsLimit ?? matchUpCount ?? 0;

  const getMatchUpId = (index) => {
    if (!isMock && !matchUp?.isMock) return uuids?.pop() ?? UUID();
    const collectionId = collectionDefinition?.collectionId;
    return uuids?.pop() ?? `${matchUp?.matchUpId}-${collectionId}-TMU-${index + 1}`;
  };

  return generateRange(0, numberToGenerate).map((index) => {
    const collectionPosition = collectionPositionOffset + index + 1;
    return {
      sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
      matchUpId: getMatchUpId(index),
      matchUpStatus: TO_BE_PLAYED,
      collectionPosition,
      collectionId,
      processCodes,
      matchUpType,
      isMock,
    };
  });
}
