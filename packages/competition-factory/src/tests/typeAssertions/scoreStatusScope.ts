import type { MatchUpAction } from '@Query/drawDefinition/positionActions/actionPolicyUtils';
import type { getDisabledMatchUpStatuses } from '@Query/matchUps/getDisabledMatchUpStatuses';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type ScoreStatusScopeAssertions = [
  Expect<Equals<ReturnType<typeof getDisabledMatchUpStatuses>, MatchUpStatusUnion[]>>,
  Expect<Equals<MatchUpAction['disabledMatchUpStatuses'], MatchUpStatusUnion[] | undefined>>,
];
