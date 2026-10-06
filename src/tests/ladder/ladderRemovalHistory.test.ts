import { expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { LADDER } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

const ISO = (day: number) => `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`;

/**
 * A manual removal closes the ladder up, and every member who moves up is a standing change like
 * any other: it must be mirrored as a dated RANKING scale item, exactly as a challenge result or a
 * lapse consequence is. Removal used to build its own scale item without an `eventType`, which
 * `setParticipantScaleItem` refuses — so it recorded no history for anyone it moved.
 */
test('a manual removal records the new rank of everyone who moves up', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: LADDER, drawSize: 4 }],
    setState: true,
  });
  const { drawId } = tournamentRecord.events[0].drawDefinitions[0];
  for (const participant of tournamentRecord.participants.slice(0, 4)) {
    const result: any = tournamentEngine.addLadderParticipant({
      participantId: participant.participantId,
      addedAt: ISO(1),
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  const standing: any = tournamentEngine.getLadderStanding({ drawId });
  const [, second, third, fourth] = standing.map((s: any) => s.participantId);

  const result: any = tournamentEngine.removeLadderParticipant({ participantId: second, removedAt: ISO(2), drawId });
  expect(result.success).toEqual(true);
  expect(result.vacatedPosition).toEqual(2);

  const rankingOf = (participantId: string) =>
    tournamentEngine.getParticipantScaleItem({
      scaleAttributes: { scaleType: RANKING, eventType: SINGLES_EVENT, scaleName: drawId },
      participantId,
    }).scaleItem;

  expect(rankingOf(third)?.scaleValue).toEqual(2);
  expect(rankingOf(third)?.scaleDate).toEqual(ISO(2));
  expect(rankingOf(fourth)?.scaleValue).toEqual(3);
});
