import type { DrawDefinition, Event, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import type { ErrorType } from '@Constants/errorConditionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

type MirrorStandingArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  touched?: PositionAssignment[];
  appliedAt: string;
  event?: Event;
};

/**
 * Writes each changed rank as a dated `ScaleItem`, which is what makes a ladder's history queryable
 * without inventing a second store: "where was I in March" becomes an ordinary scale lookup.
 *
 * SHARED by every path that moves a standing — a challenge result, a lapse consequence, an operator
 * removal — so that the snapshot and the series cannot drift apart depending on how someone moved.
 * Always call it as a side effect of the mutation, never as a separate step a caller might skip.
 */
export function mirrorStandingToScale({
  tournamentRecord,
  drawDefinition,
  appliedAt,
  touched,
  event,
}: MirrorStandingArgs): {
  written: number;
  error?: ErrorType;
  participantId?: string;
} {
  if (!tournamentRecord) return { written: 0 }; // positions still move; only history needs a record
  // Checked before anything is written (LADDER-101): a participant missing from the record used to
  // fail mid-loop, leaving a partial history the caller ignored while reporting the move a success.
  const known = new Set((tournamentRecord.participants ?? []).map((participant) => participant.participantId));
  const missing = (touched ?? []).find(
    (assignment) => assignment?.participantId && !known.has(assignment.participantId),
  );
  if (missing) return { written: 0, error: PARTICIPANT_NOT_FOUND, participantId: missing.participantId };
  let written = 0;
  for (const assignment of touched ?? []) {
    if (!assignment?.participantId) continue;
    const result = setParticipantScaleItem({
      scaleItem: {
        scaleType: RANKING,
        // REQUIRED by isValidScaleItem, and its absence is silent: setParticipantScaleItem returns
        // INVALID_SCALE_ITEM and a caller ignoring the result writes nothing while appearing to
        // work. An earlier version of this file omitted it and mirrored no history at all.
        eventType: event?.eventType ?? SINGLES_EVENT,
        scaleName: drawDefinition.drawId,
        scaleValue: assignment.drawPosition,
        scaleDate: appliedAt,
      },
      participantId: assignment.participantId,
      tournamentRecord,
    });
    if (result.error) return { written, error: result.error };
    written += 1;
  }
  return { written };
}

/**
 * Records a structure's standing before a move, and returns what undoes it. Every standing move
 * mirrors its history AFTER rearranging positions in place; when the mirror refuses, the move must
 * be undone with it, or the standing and its history drift apart — the one thing the shared writer
 * exists to prevent (LADDER-101).
 */
export function snapshotStanding(structure?: Structure) {
  const assignments = positionAssignmentsOf(structure);
  const original = assignments ? [...assignments] : undefined;
  const positions = (assignments ?? []).map((assignment) => [assignment, assignment.drawPosition] as const);
  return () => {
    for (const [assignment, drawPosition] of positions) assignment.drawPosition = drawPosition;
    if (original && structure && 'positionAssignments' in structure) structure.positionAssignments = original;
  };
}

/** The refusal a standing move returns when its history could not be written; the move is undone. */
export function mirrorFailure(mirrored: { error?: ErrorType; participantId?: string }) {
  return {
    error: mirrored.error as ErrorType,
    info: 'standing history could not be written; the standing was not moved',
    context: { participantId: mirrored.participantId },
  };
}
