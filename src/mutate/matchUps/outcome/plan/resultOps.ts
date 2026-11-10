import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';

// constants and types
import type { MatchUpWrite, OutcomeRequest, OutcomeView } from '../types';
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';

/**
 * The call's own result on its matchUp (S1, S7): the score as v1 stores it, the auto-calc stamp a dual's call writes,
 * and the result op with the notes v1 adds inside `modifyMatchUpScore`.
 */

/**
 * the score as v1's write stores it (`applyScoreAndStatus`): blanked, the blank; given, the object as given (point
 * scores and all); neither, the matchUp's own is left where it is
 */
export function writtenScore(request: OutcomeRequest, write: MatchUpWrite): Score | undefined {
  const blanked = write.scoreStringSide1 === '' && write.scoreStringSide2 === '' && !write.sets;
  return blanked ? toBePlayed.score : (request.score as Score | undefined);
}

/** the call's own result on its matchUp, and the matchUp's stamp */
/**
 * S7: a dual's own call that disables auto-calc writes `disableAutoCalc` on the dual, one that enables it removes it
 * (`handleTeamAutoCalc`, through `setFirstClassOrExtension`); enabling also projects the dual's winner and score from its
 * lines, which the route and the write read (`dualProjection`)
 */
export function autoCalcWrite(request: OutcomeRequest, view: OutcomeView): true | null | undefined {
  if (!view.isTeam) return undefined;
  if (request.flags.disableAutoCalc) return true;
  return request.flags.enableAutoCalc ? null : undefined;
}

export function resultOps(
  request: OutcomeRequest,
  write: MatchUpWrite,
  matchUpId: string,
  ensuredSides?: unknown[],
  disableAutoCalc?: true | null,
): OutcomeOp[] {
  const score = writtenScore(request, write);
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      ...(ensuredSides ? { ensuredSides } : {}),
      ...(disableAutoCalc === undefined ? {} : { disableAutoCalc }),
      matchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
      ...(score ? { score } : {}),
      ...(request.matchUpFormat ? { matchUpFormat: request.matchUpFormat } : {}),
      ...(write.winningSide ? { winningSide: write.winningSide as 1 | 2 } : {}),
      ...(write.matchUpStatusCodes ? { matchUpStatusCodes: write.matchUpStatusCodes } : {}),
      // the call's notes land on its own matchUp (a deciding line's dual, planned through here too, takes none)
      ...(typeof request.carries?.notes === 'string' && matchUpId === request.matchUpId
        ? { notes: request.carries.notes }
        : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
}
