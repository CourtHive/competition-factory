import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * `nonRandom` must fully determine a generated tournament, however many were generated before it.
 *
 * `generateTournamentRecord` selected its default `tournamentName` with `randomPop`, which SPLICES.
 * The array it popped from is a module-level constant of nine names, so each call permanently
 * consumed one and the tenth call in a process found it empty.
 *
 * That is not merely a naming quirk. `randomPop` on an empty array returns `undefined` WITHOUT
 * drawing, so from the tenth call onward the shared seeded RNG was one draw out of step for the rest
 * of the process — and every later consumer read a shifted stream. Measured before the fix, same
 * seed throughout:
 *
 *   - draws consumed per call: 8970 nine times, then **8969** forever;
 *   - first participant changed from "Ursula Escher" to "Ursula Yates";
 *   - a BYE moved from drawPosition 23 to 10.
 *
 * The consequence that cost real time: in the exit-propagation sweep, three of thirty-one failing
 * seeds could not be reproduced in isolation, because their outcome depended on how many tournaments
 * the process had generated first. Per-seed attribution in that census was therefore unsound, and a
 * reproduction lifted out of a long run might not reproduce alone. This test exists so that class
 * cannot come back.
 *
 * The generator is the RIGHT place to fix it: a test-local workaround would leave every other
 * consumer of `mocksEngine` — and every future sweep — exposed.
 */

it('generates identical tournaments for one seed however many precede it', () => {
  const generate = (call: number) => {
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ participantsCount: 29, drawSize: 32, drawType: COMPASS, drawId: `reuse-${call}` }],
      nonRandom: 9000158,
    });
    const structures: any[] = tournamentRecord?.events?.[0]?.drawDefinitions?.[0]?.structures ?? [];
    return JSON.stringify({
      participantNames: (tournamentRecord?.participants ?? []).map((participant: any) => participant.participantName),
      byePositions: structures.map((structure: any) => [
        structure.structureName,
        (structure.positionAssignments ?? [])
          .filter((assignment: any) => assignment.bye)
          .map((assignment: any) => assignment.drawPosition),
      ]),
    });
  };

  // Twelve is deliberate: the pool held NINE names, so the divergence began at the tenth call.
  const fingerprints = Array.from({ length: 12 }, (_, call) => generate(call));

  const distinct = [...new Set(fingerprints)];
  expect(
    distinct.length,
    `the same seed produced ${distinct.length} distinct tournaments across 12 calls; ` +
      `first divergence at call ${fingerprints.findIndex((entry) => entry !== fingerprints[0])}`,
  ).toEqual(1);
});

it('does not consume the shared name pool', () => {
  // The mechanism, asserted directly rather than only through its effect. A default name must remain
  // available no matter how many tournaments have been generated — `undefined` here is the tell that
  // the pool was spliced empty.
  const names = Array.from({ length: 12 }, (_, call) => {
    const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({ nonRandom: 500 + call });
    return tournamentRecord?.tournamentName;
  });

  // the control: these are DEFAULT names, so every one must be a non-empty string
  for (const [call, name] of names.entries()) {
    expect(typeof name, `call ${call + 1} produced ${JSON.stringify(name)}`).toEqual('string');
    expect(name.length, `call ${call + 1} produced an empty name`).toBeGreaterThan(0);
  }
});
