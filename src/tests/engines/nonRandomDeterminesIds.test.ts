import { randomSource, setRandomSource, withCallRandomSourceAsync } from '@Tools/prng';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setStateProvider } from '@Global/state/globalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';
import { UUID } from '@Tools/UUID';

/**
 * An engine call's `nonRandom: <seed>` determines its ids, not only its placements (pre-8.x fix, CA 2026-10-18).
 *
 * The seed reached only the code that takes the call's `random`; ids come from `UUID()`, which reads the configured
 * source, so a seeded `generateDrawDefinition` placed the same participants every time and minted different ids
 * every time (measured 2026-10-18: 0 of 31 matchUpIds alike). A seeded call now scopes a stream derived from its seed
 * for those draws, as the mocksEngine does, held per call in the state provider.
 */

const { tournamentRecord, eventIds } = mocksEngine.generateTournamentRecord({
  eventProfiles: [{ participantsProfile: { participantsCount: 32 } }],
  nonRandom: 3,
});
const RECORD = JSON.stringify(tournamentRecord);
const [eventId] = eventIds;

const STAMPS = /"(createdAt|updatedAt)":"[^"]+"/g;
const withoutStamps = (value: unknown) => JSON.stringify(value).replaceAll(STAMPS, '');
const matchUpIds = (drawDefinition: any) => JSON.stringify(drawDefinition).match(/"matchUpId":"[^"]+"/g) ?? [];

const params = (seed: number, drawType?: string) => ({
  eventId,
  drawSize: 32,
  seedsCount: 8,
  drawType,
  nonRandom: seed,
});

/** A run under a different process source each time: the seed, not the process, must decide. */
async function generate(engine: any, source: number, via: 'named' | 'queue' | 'execute', seed = 9, drawType?: string) {
  await engine.setState(JSON.parse(RECORD));
  engine.setRandomSource(source);
  const directive = { method: 'generateDrawDefinition', params: params(seed, drawType) };
  if (via === 'queue') return (await engine.executionQueue([directive])).results[0].drawDefinition;
  if (via === 'execute') return (await engine.execute(directive)).drawDefinition;
  return (await engine.generateDrawDefinition(directive.params)).drawDefinition;
}

afterEach(() => {
  setRandomSource();
  setStateProvider(syncGlobalState);
});

describe('a seeded engine call determines its ids', () => {
  it.each([
    ['named', undefined],
    ['queue', undefined],
    ['execute', undefined],
    ['named', 'ROUND_ROBIN'],
    ['named', 'FEED_IN_CHAMPIONSHIP'],
  ] as const)('the sync engine, %s, %s: the same seed is the same draw, ids included', async (via, drawType) => {
    const first = await generate(tournamentEngine, 101, via, 9, drawType);
    const second = await generate(tournamentEngine, 202, via, 9, drawType);

    expect(matchUpIds(first).length).toBeGreaterThan(0);
    expect(first.drawId).toEqual(second.drawId);
    expect(matchUpIds(second)).toEqual(matchUpIds(first));
    expect(withoutStamps(second)).toEqual(withoutStamps(first));
  });

  it.each(['named', 'queue', 'execute'] as const)(
    'the async engine (%s) mints the ids the sync engine mints, so a replayed directive agrees',
    async (via) => {
      const sync = await generate(tournamentEngine, 101, via);
      const async = await generate(asyncEngine, 303, via);
      expect(withoutStamps(async)).toEqual(withoutStamps(sync));
    },
  );

  it('a different seed is a different draw', async () => {
    const nine = await generate(tournamentEngine, 101, 'named', 9);
    const ten = await generate(tournamentEngine, 101, 'named', 10);
    expect(nine.drawId).not.toEqual(ten.drawId);
    expect(matchUpIds(ten)).not.toEqual(matchUpIds(nine));
  });

  it('an unseeded call still draws from the process source', async () => {
    const run = async () => {
      await tournamentEngine.setState(JSON.parse(RECORD));
      tournamentEngine.setRandomSource(7);
      return tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;
    };
    const first = await run();
    const second = await run();
    expect(withoutStamps(second)).toEqual(withoutStamps(first));

    tournamentEngine.setRandomSource(8);
    const other = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;
    expect(other.drawId).not.toEqual(first.drawId);
  });

  it('a seeded call leaves the process source where it found it', async () => {
    tournamentEngine.setRandomSource(7);
    const expected = [UUID(), UUID()];

    await tournamentEngine.setState(JSON.parse(RECORD));
    tournamentEngine.setRandomSource(7);
    tournamentEngine.generateDrawDefinition(params(9));
    expect([UUID(), UUID()]).toEqual(expected);
  });
});

describe('the seeded stream is per call, not per process', () => {
  it('two overlapping async requests do not share a seeded stream', async () => {
    setStateProvider(asyncGlobalState);
    const seeded = () => 0.25;
    let otherSaw: unknown;

    const [seededSaw] = await Promise.all([
      asyncGlobalState.runWithInstanceState(async () =>
        withCallRandomSourceAsync(seeded, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return randomSource();
        }),
      ),
      asyncGlobalState.runWithInstanceState(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5)); // while the seeded request is mid-call
        otherSaw = randomSource();
      }),
    ]);

    expect(seededSaw).toBe(seeded);
    expect(otherSaw).not.toBe(seeded);
    expect(otherSaw).toBe(Math.random);
  });
});
