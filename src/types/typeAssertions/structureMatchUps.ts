/** Compiler assertions for the tie-inclusive getter boundary; imported by nothing. */
import { includesMatchUpStatuses } from '@Mutate/drawDefinitions/matchUpGovernor/includesMatchUpStatuses';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import type { Structure, MatchUp } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

type IsAny<T> = 0 extends 1 & T ? true : false;
type ExpectFalse<T extends false> = T;

export type StructureMatchUpsAssertions = [
  ExpectFalse<IsAny<ReturnType<typeof getAllStructureMatchUps>['matchUps'][number]>>,
  ExpectFalse<IsAny<ReturnType<typeof getAllStructureMatchUps>['roundMatchUps'][number][number]>>,
  ExpectFalse<IsAny<ReturnType<typeof getAllStructureMatchUps>['collectionPositionMatchUps'][number][number]>>,
];

/** Uncalled: tsc checks actual overload selection and the filtering boundary; no runtime consumer. */
export function structureMatchUpsCompileChecks(structure: Structure) {
  const raw = getAllStructureMatchUps({ structure });
  const rawMatchUps: MatchUp[] = raw.matchUps;
  const contextual = getAllStructureMatchUps({ structure, inContext: true });
  const contextualMatchUps: HydratedMatchUp[] = contextual.matchUps;
  // @ts-expect-error raw records do not promise hydrated parent identifiers
  const rawAsHydrated: HydratedMatchUp[] = raw.matchUps;
  // @ts-expect-error contextual lists still include tieMatchUps
  getDrawPositionWinCount({ sourceMatchUps: contextual.matchUps, drawPosition: 1 });
  // @ts-expect-error contextual lists still include tieMatchUps
  includesMatchUpStatuses({ sourceMatchUps: contextual.matchUps });
  // @ts-expect-error filtering a raw list does not manufacture hydrated context
  getDrawPositionWinCount({ sourceMatchUps: teamLevelMatchUps(rawMatchUps), drawPosition: 1 });
  getDrawPositionWinCount({ sourceMatchUps: teamLevelMatchUps(contextual.matchUps), drawPosition: 1 });
  includesMatchUpStatuses({ sourceMatchUps: teamLevelMatchUps(contextual.matchUps) });
  return { rawAsHydrated, contextualMatchUps };
}
