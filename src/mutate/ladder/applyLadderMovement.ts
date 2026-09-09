import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { getLadderMovement, getLadderOrdering } from '@Query/ladder/getLadderPolicy';
import { isLadder } from '@Query/drawDefinition/isLadder';

import { INSERTION, RANK } from '@Constants/ladderConstants';
import { RANKING } from '@Constants/scaleConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';

type MovementArgs = {
  /** The instant the movement took effect — the scaleDate of the resulting standing. */
  appliedAt: string;
  defenderParticipantId: string;
  challengerParticipantId: string;
  /** True when the challenger takes the defender's position — a win, or a forfeited decline. */
  challengerPrevails: boolean;
  tournamentRecord?: any;
  drawDefinition: any;
  structure: any;
  event?: any;
};

/**
 * Rearranges the standing after a challenge resolves, and mirrors the result to dated scale items.
 *
 * THE ONLY PLACE A LADDER STANDING MOVES. A win, a forfeited decline and an operator removal all
 * come through here, so the movement rule and the history it writes cannot diverge between paths.
 *
 * Under `RATING` ordering this does nothing and says so: the standing is derived from the rating
 * scale, `positionAssignments` is a projection, and there is no movement to apply. That early
 * return is why `getLadderOrdering` had to exist before any of this was written.
 */
export function applyLadderMovement(params: MovementArgs): ResultType & { moved?: boolean } {
  const { appliedAt, defenderParticipantId, challengerParticipantId, challengerPrevails } = params;
  const { drawDefinition, structure } = params;

  if (typeof drawDefinition !== 'object') return { error: MISSING_DRAW_DEFINITION };
  if (!isLadder(drawDefinition.drawType)) return { error: INVALID_VALUES, info: 'requires a LADDER drawType' };
  if (!appliedAt) return { error: INVALID_VALUES, info: 'appliedAt is required' };

  if (getLadderOrdering({ ...params }) !== RANK) {
    // Not a failure — a RATING ladder has no movement machinery by design.
    return { ...SUCCESS, moved: false };
  }

  // The defender keeps their position when they hold off the challenger; nobody else is affected.
  if (!challengerPrevails) return { ...SUCCESS, moved: false };

  const assignments = structure?.positionAssignments ?? [];
  const assignmentOf = (participantId: string) => assignments.find((a: any) => a.participantId === participantId);

  const challenger = assignmentOf(challengerParticipantId);
  const defender = assignmentOf(defenderParticipantId);
  if (!challenger || !defender) return { error: PARTICIPANT_NOT_FOUND };

  const from = challenger.drawPosition;
  const to = defender.drawPosition;
  // A ladder position is a rank: 1 is the top, so the challenger's number is the larger one.
  if (!(to < from)) return { error: INVALID_VALUES, info: 'challenger must occupy a lower rank than the defender' };

  const movement = getLadderMovement({ ...params });
  const touched: any[] = [];

  if (movement === INSERTION) {
    // The winner takes the defender's position and everyone from there down to the winner's old
    // position shifts one rank lower. A challenger winning from far below displaces a whole run.
    for (const assignment of assignments) {
      if (assignment.drawPosition >= to && assignment.drawPosition < from) {
        assignment.drawPosition += 1;
        touched.push(assignment);
      }
    }
    challenger.drawPosition = to;
    touched.push(challenger);
  } else {
    // SWAP — the two exchange positions and nobody else moves.
    challenger.drawPosition = to;
    defender.drawPosition = from;
    touched.push(challenger, defender);
  }

  mirrorToScale({ ...params, touched });
  return { ...SUCCESS, moved: true };
}

/**
 * Writes each changed rank as a dated `ScaleItem`, which is what makes a ladder's history queryable
 * without inventing a second store: "where was I in March" becomes an ordinary scale lookup.
 *
 * Deliberately a side-effect of the position mutation rather than a separate call, so the snapshot
 * and the series cannot drift apart.
 */
function mirrorToScale({ tournamentRecord, drawDefinition, appliedAt, touched }: any): void {
  if (!tournamentRecord) return; // positions still move; only the history needs a record to live in
  for (const assignment of touched) {
    if (!assignment.participantId) continue;
    setParticipantScaleItem({
      scaleItem: {
        scaleType: RANKING,
        scaleName: drawDefinition.drawId,
        scaleValue: assignment.drawPosition,
        scaleDate: appliedAt,
      },
      participantId: assignment.participantId,
      tournamentRecord,
    });
  }
}
