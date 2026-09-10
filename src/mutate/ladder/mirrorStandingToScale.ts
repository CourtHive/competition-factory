import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { RANKING } from '@Constants/scaleConstants';

/**
 * Writes each changed rank as a dated `ScaleItem`, which is what makes a ladder's history queryable
 * without inventing a second store: "where was I in March" becomes an ordinary scale lookup.
 *
 * SHARED by every path that moves a standing — a challenge result, a lapse consequence, an operator
 * removal — so that the snapshot and the series cannot drift apart depending on how someone moved.
 * Always call it as a side effect of the mutation, never as a separate step a caller might skip.
 */
export function mirrorStandingToScale({ tournamentRecord, drawDefinition, appliedAt, touched }: any): void {
  if (!tournamentRecord) return; // positions still move; only the history needs a record to live in
  for (const assignment of touched ?? []) {
    if (!assignment?.participantId) continue;
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
