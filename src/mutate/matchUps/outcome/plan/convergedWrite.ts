import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { producedTargetOps } from './producedTarget';

// constants and types
import type { DrawDefinition, MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import type { LandingView, OutcomeView } from '../types';
import type { ProducedTarget } from './producedTarget';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { ByeChain } from './byeChain';
import type { OutcomeOp } from '../ops';

/**
 * The converged double exit as `modifyMatchUpScore` writes it (`conditionallyAdvanceDrawPosition`'s `existingExit`,
 * `handleEmptyExitLoser`): the one writer of the produced and pending convergences, parameterised by what each adds.
 */

/** what a produced convergence reads beyond its view: the draw, the landing's view on the cursor, and the program before it */
export type ConvergedContext = { drawDefinition?: DrawDefinition; landing?: LandingView; prefix?: OutcomeOp[] };

/**
 * A convergence's write and what it produces on, the one writer of both RULE 4 cells that `modifyMatchUpScore` writes
 * (ruling 3 keeps their decisions apart). The defaults are the produced arrival's; a pending exit converged under the
 * policy off (`handleEmptyExitLoser`) states its own provenance, retained codes, score removal and withdrawals.
 */
export type ConvergedWrite = {
  landing: HydratedMatchUp;
  matchUpStatus: MatchUpStatusUnion;
  /** where the converged double exit produces in turn: none from a final */
  onward?: ProducedTarget;
  /** the onward matchUp's loser seat, which its produced exit leaves unfillable: a BYE and its chain */
  onwardBye?: ByeChain;
  /** what is merged beside the provenance standing there */
  provenance?: SideExitProvenance;
  /** v1's `retainPolicyCodes`; none by default */
  matchUpStatusCodes?: string[];
  /** `removeScore`: the score reset whatever the double exit; by default a DOUBLE_WALKOVER's alone */
  resetsScore?: boolean;
  /** the converged matchUp's own advancement taken back before it produces on (`withdrawOwnAdvancement`) */
  withdrawn?: OutcomeOp[];
  /** a re-entered landing's loser link, served before it produces on (DEA:316 before :417) */
  reentered?: OutcomeOp[];
  /** the converged matchUp's loser link, served after its produced exit (`serveConvergedLoserLink`, DEA:767–775) */
  loserLinkOps?: OutcomeOp[];
  /** 1c: its produced exit passing a BYE-held target instead (`byeHeldProduced`, from the converged origin) */
  heldPassage?: OutcomeOp[];
};

export function convergedWrite(view: OutcomeView, planned: ConvergedWrite): OutcomeOp[] {
  const { landing, matchUpStatus, provenance, onward, onwardBye } = planned;
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: landing.matchUpId,
      matchUpStatus,
      removesWinningSide: true,
      matchUpStatusCodes: planned.matchUpStatusCodes ?? [],
      stampsScoredTime: false,
      ...(planned.resetsScore || matchUpStatus === DOUBLE_WALKOVER
        ? { resetsScore: true, score: toBePlayed.score }
        : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: landing.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
    ...(planned.withdrawn ?? []),
    ...(planned.reentered ?? []),
    // the onward matchUp's unfillable seat is served before its produced exit is written (`conditionallyAdvanceDrawPosition`)
    ...(onwardBye ? [...onwardBye.assigns, ...onwardBye.writes] : []),
    ...(onward ? producedTargetOps(view, onward, landing.matchUpId, matchUpStatus) : []),
    ...(planned.heldPassage ?? []),
    ...(planned.loserLinkOps ?? []),
  ];
}
