import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { RANKING } from '@Constants/scaleConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

/**
 * Writes each changed rank as a dated `ScaleItem`, which is what makes a ladder's history queryable
 * without inventing a second store: "where was I in March" becomes an ordinary scale lookup.
 *
 * SHARED by every path that moves a standing — a challenge result, a lapse consequence, an operator
 * removal — so that the snapshot and the series cannot drift apart depending on how someone moved.
 * Always call it as a side effect of the mutation, never as a separate step a caller might skip.
 */
export function mirrorStandingToScale({ tournamentRecord, drawDefinition, appliedAt, touched, event }: any): {
  written: number;
  error?: any;
} {
  if (!tournamentRecord) return { written: 0 }; // positions still move; only history needs a record
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
