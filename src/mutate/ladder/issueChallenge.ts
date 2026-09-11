import { getLadderPolicy, isChallengeInRange } from '@Query/ladder/getLadderPolicy';
import { addAdHocMatchUps } from '@Mutate/structures/addAdHocMatchUps';
import { addTimeItem } from '@Mutate/timeItems/addTimeItem';
import { isLadder } from '@Query/drawDefinition/isLadder';
import { UUID } from '@Tools/UUID';

import { CHALLENGED } from '@Constants/matchUpStatusConstants';
import { CHALLENGE_ISSUED } from '@Constants/ladderConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_STRUCTURE_ID,
  PARTICIPANT_NOT_FOUND,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type IssueChallengeArgs = {
  defenderParticipantId: string;
  challengerParticipantId: string;
  /** The instant the challenge was issued. Supplied, never read from an ambient clock. */
  issuedAt: string;
  tournamentRecord?: any;
  drawDefinition: any;
  structureId?: string;
  event?: any;
};

/**
 * One participant challenges another, creating the matchUp that a ladder is played through.
 *
 * A challenge is the only fixture in the factory a PARTICIPANT creates. Everything else arrives from
 * a draw, which is why the eligibility rules live here rather than in a generator: nothing upstream
 * decided these two would meet.
 */
export function issueChallenge(params: IssueChallengeArgs): ResultType & { matchUpId?: string } {
  const { defenderParticipantId, challengerParticipantId, issuedAt, drawDefinition } = params;
  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) {
    return { error: INVALID_VALUES, info: 'issueChallenge requires a LADDER drawType' };
  }
  if (!challengerParticipantId || !defenderParticipantId) return { error: INVALID_VALUES };
  if (challengerParticipantId === defenderParticipantId) {
    return { error: INVALID_VALUES, info: 'a participant cannot challenge themselves' };
  }
  if (!issuedAt) return { error: INVALID_VALUES, info: 'issuedAt is required' };

  const structureId = params.structureId ?? drawDefinition.structures?.[0]?.structureId;
  if (typeof structureId !== 'string') return { error: MISSING_STRUCTURE_ID };
  const structure = drawDefinition.structures?.find((s: any) => s.structureId === structureId);
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  // The standing. Under RANK ordering these positions ARE the ladder.
  const positionOf = (participantId: string): number | undefined =>
    structure.positionAssignments?.find((a: any) => a.participantId === participantId)?.drawPosition;

  const challengerPosition = positionOf(challengerParticipantId);
  const defenderPosition = positionOf(defenderParticipantId);
  if (challengerPosition === undefined || defenderPosition === undefined) {
    return { error: PARTICIPANT_NOT_FOUND, info: 'both participants must be seated on the ladder' };
  }

  const policy = getLadderPolicy({ ...params, structure });
  if (!isChallengeInRange({ challengerPosition, defenderPosition, policy })) {
    return {
      error: INVALID_VALUES,
      info: `position ${challengerPosition} may not challenge position ${defenderPosition} — range is ${policy.challengeRange}`,
    };
  }

  // AD_HOC shape: no roundPosition, no drawPositions. The participants are on the sides, and the
  // ladder positions are deliberately NOT copied onto the matchUp — they change underneath it.
  const matchUpId = UUID();
  const matchUp = {
    matchUpId,
    matchUpStatus: CHALLENGED,
    sides: [
      { sideNumber: 1, participantId: challengerParticipantId },
      { sideNumber: 2, participantId: defenderParticipantId },
    ],
  };

  const addResult = addAdHocMatchUps({ ...params, matchUps: [matchUp], structureId } as any);
  if (addResult.error) return addResult;

  const added = structure.matchUps?.find((m: any) => m.matchUpId === matchUpId);
  addTimeItem({
    timeItem: { itemType: CHALLENGE_ISSUED, itemValue: challengerParticipantId, itemDate: issuedAt },
    element: added,
  });

  return { ...SUCCESS, matchUpId };
}
