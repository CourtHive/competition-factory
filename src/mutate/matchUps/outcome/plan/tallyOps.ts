import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { annotateScoreSets } from '@Query/matchUps/addMatchUpContext';
import { validMatchUps } from '@Validators/validMatchUp';

// constants and types
import type { MatchUpStatusUnion, Score, TallyResult } from '@Types/tournamentTypes';
import type { MatchUpWrite, OutcomeView } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';

/**
 * A round robin group's tally after the call (S3, S7): the group re-tallied with the call's result in place, as v1's
 * `updateAssignmentParticipantResults` computes it, written through the reducer.
 */

/**
 * A dual's projected lines with the call's line holding its score as a round robin group's tally reads it (S7): as
 * written, then annotated as hydration annotates it under the line's format (`annotateScoreSets`: a tiebreak-only set
 * read as 1-0), since v1 tallies the group's hydrated duals
 */
export function writtenLine(
  tieMatchUps: HydratedMatchUp['tieMatchUps'],
  matchUpId: string,
  score?: Score,
): HydratedMatchUp['tieMatchUps'] {
  return tieMatchUps?.map((tieMatchUp) => {
    if (tieMatchUp.matchUpId !== matchUpId) return tieMatchUp;
    const read = { ...tieMatchUp, score: score && structuredClone(score) };
    if (read.score?.sets?.length && read.matchUpFormat) annotateScoreSets(read, read.matchUpFormat);
    return read;
  });
}

/**
 * A round robin group's tally after the call, as v1's `updateAssignmentParticipantResults` computes it: the group's
 * matchUps with the call's result in place of the target's, tallied under the group's format and tally policy. Its
 * participant results are written by `writeAssignmentResults`, v1's writer, through the reducer. Undefined where v1 would
 * refuse the tally (a matchUp it cannot read), so the call abstains rather than plan what v1 refuses.
 */
export function groupTally(
  group: NonNullable<OutcomeView['group']>,
  call: {
    matchUpId: string;
    matchUpWrite: MatchUpWrite;
    score?: Score;
    matchUpFormat?: string;
    tieMatchUps?: HydratedMatchUp['tieMatchUps'];
  },
): OutcomeOp[] | undefined {
  const matchUps = group.matchUps.map((matchUp) =>
    matchUp.matchUpId === call.matchUpId
      ? {
          ...matchUp,
          matchUpStatus: call.matchUpWrite.matchUpStatus as MatchUpStatusUnion,
          winningSide: call.matchUpWrite.winningSide as 1 | 2 | undefined,
          score: call.score ?? matchUp.score,
          ...(call.matchUpFormat ? { matchUpFormat: call.matchUpFormat } : {}),
          ...(call.tieMatchUps ? { tieMatchUps: call.tieMatchUps } : {}),
        }
      : matchUp,
  );
  if (!validMatchUps(matchUps)) return undefined;
  const { subOrderMap } = createSubOrderMap({ positionAssignments: group.positionAssignments });
  const result = matchUps.length
    ? tallyParticipantResults({
        policyDefinitions: group.policyDefinitions,
        matchUpFormat: group.matchUpFormat,
        subOrderMap,
        matchUps,
      })
    : undefined;
  if (result && 'error' in result && result.error) return undefined;
  const participantResults = (result as { participantResults?: Record<string, TallyResult> } | undefined)
    ?.participantResults;
  return [
    {
      op: 'setParticipantResults',
      structureId: group.structureId,
      participantResults: participantResults ?? {},
      ...(group.adHoc
        ? { participantIds: group.positionAssignments.map(({ participantId }) => participantId as string) }
        : {}),
    },
  ];
}
