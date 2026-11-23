import { expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { LADDER } from '@Constants/drawDefinitionConstants';
import { DECLINE } from '@Constants/ladderConstants';

/**
 * A TimeItem's `itemDate` is `Date | string` in the model, and the ladder's dated mutations write
 * whatever instant they are given. Every ladder read compares and sorts those instants as ISO
 * strings, so a `Date` must read as the same instant its ISO string would — not throw in a
 * `localeCompare`, and not compare as `String(date)` ("Thu Mar 05 2026 ..."), which sorts after
 * every ISO string.
 */
const ISO = (day: number) => `2026-03-${String(day).padStart(2, '0')}T10:00:00.000Z`;
const asDate = (day: number): any => new Date(ISO(day));

function seatedLadder() {
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
  return { drawId, ids: standing.map((s: any) => s.participantId) };
}

test('a dispute dated by a Date before the confirmation does not stand', () => {
  const { drawId, ids } = seatedLadder();
  const [defender, challenger] = ids;

  const { matchUpId }: any = tournamentEngine.issueChallenge({
    challengerParticipantId: challenger,
    defenderParticipantId: defender,
    issuedAt: ISO(1),
    drawId,
  });
  expect(tournamentEngine.acceptChallenge({ matchUpId, respondedAt: ISO(2), drawId }).success).toEqual(true);
  const submitted: any = tournamentEngine.submitResult({
    participantId: challenger,
    outcome: { winningSide: 1 },
    submittedAt: ISO(4),
    matchUpId,
    drawId,
  });
  expect(submitted.success).toEqual(true);

  // disputed on the 5th, then confirmed on the 6th: a dispute raised BEFORE the confirmation is
  // resolved by it, whichever form the dispute's instant was recorded in
  const disputed: any = tournamentEngine.disputeResult({
    participantId: defender,
    disputedAt: asDate(5),
    matchUpId,
    drawId,
  });
  expect(disputed.success).toEqual(true);
  const confirmed: any = tournamentEngine.confirmResult({
    participantId: defender,
    confirmedAt: ISO(6),
    matchUpId,
    drawId,
  });
  expect(confirmed.success).toEqual(true);

  const attestation: any = tournamentEngine.getResultAttestation({ matchUpId, drawId });
  expect(attestation.disputed).toEqual(false);
  expect(attestation.attested).toEqual(true);
});

test('declines dated by a Date are counted and ordered as lapses', () => {
  const { drawId, ids } = seatedLadder();
  const [defender, second, third] = ids;

  const declinedOn = [3, 2];
  [second, third].forEach((challenger, index) => {
    const { matchUpId }: any = tournamentEngine.issueChallenge({
      challengerParticipantId: challenger,
      defenderParticipantId: defender,
      issuedAt: ISO(1),
      drawId,
    });
    expect(matchUpId).toBeDefined();
    const declined: any = tournamentEngine.declineChallenge({
      respondedAt: asDate(declinedOn[index]),
      matchUpId,
      drawId,
    });
    expect(declined.success).toEqual(true);
  });

  const lapses: any = tournamentEngine.getLapses({ participantId: defender, asOf: ISO(9), drawId });
  expect(lapses.count).toEqual(2);
  expect(lapses.lapses.map((lapse: any) => lapse.kind)).toEqual([DECLINE, DECLINE]);
  // ISO strings, in chronological order
  expect(lapses.lapses.map((lapse: any) => lapse.at)).toEqual([ISO(2), ISO(3)]);
});
