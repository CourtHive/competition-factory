import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and types
import type { DrawDefinition, Tournament } from '@Types/tournamentTypes';

/**
 * `getEvent` RETURNS A ROTATING ROUND'S PAIRINGS EXACTLY AS STORED.
 *
 * A round's `pairings` is an array of matches, each an array of two sides, each an array of individual ids. `getEvent`
 * projects through `definedAttributes`, which rebuilt an array inside an array as an object with numeric keys:
 * `pairings[0]` came back as `{"0":["a","d"],"1":["b","c"]}` while `getTournament()` held `[["a","d"],["b","c"]]`.
 * Found by the TMX settlement adapter on 2026-10-11, which had to read the tournament record instead.
 * Falsified: with `definedAttributes`' array fix reverted, every assertion below fails.
 */
function rotatingDraw() {
  const ids = ['a', 'b', 'c', 'd'];
  const draw: DrawDefinition = {
    drawId: 'd',
    drawType: 'AD_HOC',
    matchUpType: 'DOUBLES',
    entries: ids.map((participantId) => ({ participantId, entryStatus: 'DIRECT_ACCEPTANCE' })),
    structures: [{ structureId: 's', matchUps: [] }],
    competitionProfile: {
      version: 1,
      format: 'AMERICANO',
      entrantScope: 'INDIVIDUAL',
      matchUpType: 'DOUBLES',
      scoring: { combinedPointTotal: 32, selectedVariant: { tieResolution: 'ALLOW' } },
      standings: { metric: 'SIDE_POINTS', attribution: 'EACH_INDIVIDUAL' },
      pairing: { seed: 42, algorithmVersion: 1 },
      completion: { kind: 'PARTNERSHIP_COVERAGE' },
    },
  };
  const record: Tournament = {
    tournamentId: 't',
    participants: ids.map((participantId) => ({
      participantId,
      participantType: 'INDIVIDUAL',
      participantRole: 'COMPETITOR',
      participantName: participantId,
    })),
    events: [
      {
        eventId: 'e',
        eventType: 'DOUBLES',
        entries: ids.map((participantId) => ({ participantId, entryStatus: 'UNGROUPED' })),
        drawDefinitions: [draw],
      },
    ],
  };
  tournamentEngine.setState(record);
  const preview = tournamentEngine.getRotatingPartnerRoundPreview({ drawId: 'd', roundNumber: 1 });
  const applied = tournamentEngine.generateRotatingPartnerRound({
    drawId: 'd',
    roundNumber: 1,
    requestId: 'r1',
    expectedPairings: preview.round!,
    expectedScoringContract: preview.scoringContract!,
  });
  expect(applied.error).toBeUndefined();
}

it('getEvent returns competitionRounds pairings as nested arrays, equal to the stored record', () => {
  rotatingDraw();
  const stored = tournamentEngine.getTournament().tournamentRecord.events[0].drawDefinitions[0].competitionRounds;
  expect(stored.length).toBeGreaterThan(0);

  const { drawDefinition, event } = tournamentEngine.getEvent({ drawId: 'd' });
  for (const rounds of [drawDefinition.competitionRounds, event.drawDefinitions[0].competitionRounds]) {
    expect(rounds.map((round) => round.pairings)).toEqual(stored.map((round) => round.pairings));
    for (const round of rounds) {
      expect(Array.isArray(round.pairings)).toEqual(true);
      for (const match of round.pairings) {
        expect(Array.isArray(match)).toEqual(true);
        for (const side of match) expect(Array.isArray(side)).toEqual(true);
      }
    }
  }
});
