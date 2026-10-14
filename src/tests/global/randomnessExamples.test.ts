import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';
import * as tools from '@Assemblies/tools';
import fs from 'node:fs';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * The worked examples of documentation/docs/concepts/randomness.md, one test per example.
 *
 * Each code block on that page names the test below that runs it, and each test names the page
 * section it backs, so the page cannot claim what is not tested. Change one, change the other.
 *
 * The configured source is process-wide, so every test resets it (`setRandomSource()`) after itself.
 */
afterEach(() => {
  tools.setRandomSource();
});

// page: "Worked examples"
// what a draw IS, minus the ids it mints and the time it was made
const placements = (drawDefinition: any) =>
  drawDefinition.structures[0].positionAssignments.map(
    ({ drawPosition, participantId, bye, qualifier }: any) =>
      `${drawPosition}:${participantId ?? (bye && 'BYE') ?? (qualifier && 'QUALIFIER')}`,
  );

// one event of 25 entered participants and no draw yet, loaded fresh by each example
const fixture = mocksEngine.generateTournamentRecord({
  eventProfiles: [{ participantsProfile: { participantsCount: 25 } }],
  nonRandom: 1,
}).tournamentRecord;
const eventId = fixture.events[0].eventId;
const loadEvent = (engine: any = tournamentEngine) => engine.setState(structuredClone(fixture));
// end of page example

describe('Worked examples › A reproducible draw', () => {
  it('a seeded source regenerates the same draw: positions, byes, qualifiers and ids', () => {
    // page: "A reproducible draw"
    const drawProfiles = [{ drawSize: 32, participantsCount: 25, qualifiersCount: 2 }];
    const seed = 20261013;

    tournamentEngine.setRandomSource(seed);
    const first = mocksEngine.generateTournamentRecord({ drawProfiles }).tournamentRecord;

    tournamentEngine.setRandomSource(seed);
    const second = mocksEngine.generateTournamentRecord({ drawProfiles }).tournamentRecord;

    const [drawA] = first.events[0].drawDefinitions;
    const [drawB] = second.events[0].drawDefinitions;
    expect(drawB.drawId).toEqual(drawA.drawId);
    expect(placements(drawB)).toEqual(placements(drawA));
    // end of page example

    // the example is about a draw that has every kind of random placement in it
    const kinds = placements(drawA).map((p: string) => p.split(':')[1]);
    expect(kinds.filter((k: string) => k === 'BYE').length).toEqual(5);
    expect(kinds.filter((k: string) => k === 'QUALIFIER').length).toEqual(2);
    expect(kinds.filter((k: string) => !['BYE', 'QUALIFIER'].includes(k)).length).toEqual(25);

    // discriminating: without re-seeding, the stream continues and the draw is a different one
    const third = mocksEngine.generateTournamentRecord({ drawProfiles }).tournamentRecord;
    expect(placements(third.events[0].drawDefinitions[0])).not.toEqual(placements(drawA));
  });
});

describe('Worked examples › A function source', () => {
  it('a deterministic stub is used as given', () => {
    // page: "A function source"
    let n = 1;
    const stub = () => (n = (n * 16807) % 2147483647) / 2147483647; // Park–Miller: deterministic, never 1
    tournamentEngine.setRandomSource(stub);
    expect(tools.randomSource()()).toEqual(16807 / 2147483647); // the stub's first value
    // end of page example

    // and the engine draws from it: two generations from a restarted stub are identical. Restarting
    // a stream means setting it again, which also restarts the repeated-id check
    loadEvent();
    n = 1;
    tournamentEngine.setRandomSource(stub);
    const first = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;
    n = 1;
    tournamentEngine.setRandomSource(stub);
    const second = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;
    expect(placements(second)).toEqual(placements(first));
  });

  it('a crypto.getRandomValues-backed source is accepted and yields values in [0, 1)', () => {
    // page: "A function source"
    const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    tournamentEngine.setRandomSource(cryptoRandom);
    // end of page example

    for (let i = 0; i < 1000; i++) {
      const value = tools.randomSource()();
      expect(value >= 0 && value < 1).toEqual(true);
    }
    loadEvent();
    expect(tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).success).toEqual(true);

    // anything that is neither a seed nor a function is refused
    expect(tournamentEngine.setRandomSource('7' as any).error).toEqual(INVALID_VALUES);
  });
});

describe('Worked examples › nonRandom outranks the configured source', () => {
  it('the same call gives the same draw under two sources with nonRandom, and different draws without it', () => {
    // page: "nonRandom outranks the configured source"
    const drawUnder = (source: number, params: object) => {
      tournamentEngine.setRandomSource(source);
      return tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32, ...params }).drawDefinition;
    };

    loadEvent();
    const seededA = drawUnder(101, { nonRandom: 5 });
    const seededB = drawUnder(202, { nonRandom: 5 });
    expect(placements(seededB)).toEqual(placements(seededA)); // the call's seed decides

    const unseededA = drawUnder(101, {});
    const unseededB = drawUnder(202, {});
    expect(placements(unseededB)).not.toEqual(placements(unseededA)); // the configured source decides
    // end of page example
  });

  it('a call’s own random function outranks the configured source through a named engine method', () => {
    // backs: "Where randomness comes from" — precedence 1 is a method's `random` parameter
    loadEvent();
    tournamentEngine.setRandomSource(101);
    const first = tournamentEngine.generateDrawDefinition({
      random: tools.createSeededRandom(5),
      drawSize: 32,
      eventId,
    });
    tournamentEngine.setRandomSource(202);
    const second = tournamentEngine.generateDrawDefinition({
      random: tools.createSeededRandom(5),
      drawSize: 32,
      eventId,
    });
    // a function-valued param was once spread beside the method and refused as a second method
    expect(first.success).toEqual(true);
    expect(placements(second.drawDefinition)).toEqual(placements(first.drawDefinition));
  });
});

describe('Worked examples › Resetting the source', () => {
  it('setRandomSource() restores Math.random, so a seed no longer repeats', () => {
    // page: "Resetting the source"
    tournamentEngine.setRandomSource(7);
    const seeded = tools.randomSource()();
    tournamentEngine.setRandomSource(7);
    expect(tools.randomSource()()).toEqual(seeded); // seeded: the stream restarts

    tournamentEngine.setRandomSource();
    expect(tools.randomSource()).toBe(Math.random);
    // end of page example

    loadEvent();
    const first = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;
    tournamentEngine.setRandomSource();
    const second = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;
    expect(placements(second)).not.toEqual(placements(first));
  });
});

describe('Worked examples › Auditing a published seed', () => {
  it('a draw made with nonRandom is re-derived from the recorded seed and factory version', () => {
    // page: "Auditing a published seed"
    loadEvent();
    const seed = 731;
    const { drawDefinition } = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32, nonRandom: seed });
    const published = { seed, factoryVersion: tournamentEngine.version(), placements: placements(drawDefinition) };

    // later, anywhere: same entries, same factory version, same seed, whatever source is configured
    tournamentEngine.setRandomSource(999);
    expect(tournamentEngine.version()).toEqual(published.factoryVersion);
    const rederived = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32, nonRandom: published.seed });
    expect(placements(rederived.drawDefinition)).toEqual(published.placements);
    // end of page example

    // discriminating: a different seed is a different draw, so the match above means something
    const other = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32, nonRandom: seed + 1 });
    expect(placements(other.drawDefinition)).not.toEqual(published.placements);
  });
});

describe('Worked examples › What a seed does not promise', () => {
  it('one extra draw before the same seeded steps gives a different draw', () => {
    // page: "What a seed does not promise"
    loadEvent();
    tournamentEngine.setRandomSource(42);
    const before = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;

    tournamentEngine.setRandomSource(42);
    tools.UUID(); // one more random step, as a factory change might add
    const after = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 }).drawDefinition;

    expect(placements(after)).not.toEqual(placements(before));
    // end of page example
  });
});

describe('Worked examples › Where it is applied: the async engine', () => {
  // the server (CFS) runs the async engine; TMX replays the same directive with the sync engine
  const directive = { method: 'generateDrawDefinition', params: { eventId: '', drawSize: 32, nonRandom: 5 } };
  const run = async (engine: any, source: number, via: 'queue' | 'execute' | 'named') => {
    await loadEvent(engine);
    engine.setRandomSource(source);
    const params = { ...directive.params, eventId };
    if (via === 'queue') return (await engine.executionQueue([{ ...directive, params }])).results[0].drawDefinition;
    if (via === 'execute') return (await engine.execute({ ...directive, params })).drawDefinition;
    return (await engine.generateDrawDefinition(params)).drawDefinition;
  };

  it.each(['queue', 'execute', 'named'] as const)(
    'the async engine applies nonRandom, and agrees with the sync engine (%s)',
    async (via) => {
      const sync = placements(await run(tournamentEngine, 101, via));
      // a different configured source on the "server" must not matter: the directive carries the seed
      expect(placements(await run(asyncEngine, 202, via))).toEqual(sync);
      expect(placements(await run(asyncEngine, 303, via))).toEqual(sync);
    },
  );
});

describe('Worked examples › A source that repeats is refused', () => {
  useEngineCatch(); // what a consumer sees: the engine catches the throw and returns { error }

  it('a constant source is refused at its first repeated id, and a draw reports it as an error', () => {
    // page: "A source that repeats is refused"
    tournamentEngine.setRandomSource(() => 0.5); // a constant: every draw is the same number
    tools.UUID();
    expect(() => tools.UUID()).toThrow('DEGENERATE_RANDOM_SOURCE'); // the same id, minted twice

    loadEvent();
    const result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 32 });
    expect(result.error).toContain('DEGENERATE_RANDOM_SOURCE');
    // end of page example
  });

  it('a short cycle is refused too', () => {
    // page: "A source that repeats is refused"
    let n = 0;
    tournamentEngine.setRandomSource(() => (n++ % 10) / 10); // 0, 0.1, … 0.9, then again
    expect(() => tools.UUIDS(10)).toThrow('DEGENERATE_RANDOM_SOURCE');
    // end of page example
  });

  it('a value outside [0, 1) is refused at the draw', () => {
    // page: "A source that repeats is refused"
    tournamentEngine.setRandomSource(() => 1);
    expect(() => tools.randomSource()()).toThrow('DEGENERATE_RANDOM_SOURCE');
    // end of page example
  });

  it('a restarted stream repeats its ids legitimately: setting the source again starts a new window', () => {
    let n = 1;
    const stub = () => (n = (n * 16807) % 2147483647) / 2147483647;
    tournamentEngine.setRandomSource(stub);
    const first = tools.UUIDS(5);
    n = 1;
    tournamentEngine.setRandomSource(stub);
    expect(tools.UUIDS(5)).toEqual(first);

    // and so does a seed, and nonRandom on a call: each is a new stream
    tournamentEngine.setRandomSource(7);
    const seeded = tools.UUIDS(5);
    tournamentEngine.setRandomSource(7);
    expect(tools.UUIDS(5)).toEqual(seeded);
  });
});

describe('Worked examples › the page shows exactly these examples', () => {
  const page = fs.readFileSync('documentation/docs/concepts/randomness.md', 'utf8');
  const source = fs.readFileSync('src/tests/global/randomnessExamples.test.ts', 'utf8');
  const dedent = (lines: string[]) => {
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
    return lines.map((l) => l.slice(indent)).join('\n');
  };
  const examples = [...source.matchAll(/\/\/ page: "([^"]+)"\n([\s\S]*?)\n *\/\/ end of page example/g)].map(
    ([, section, body]) => ({ section, code: dedent(body.split('\n')) }),
  );
  const pageBlocks = [...page.matchAll(/```ts\n\/\/ randomnessExamples\.test\.ts › ([^\n]+)\n([\s\S]*?)\n```/g)];

  it('every marked example appears verbatim on the page, and the page shows no other', () => {
    expect(examples.length).toEqual(11);
    expect(pageBlocks.length).toEqual(examples.length);
    for (const { section, code } of examples) {
      const block = pageBlocks.find(([, , body]) => body === code);
      expect(block, `the page lacks the "${section}" example`).toBeDefined();
      expect(page.includes(`## ${section}`) || page.includes(`### ${section}`), `no "${section}" heading`).toEqual(
        true,
      );
    }
  });
});
