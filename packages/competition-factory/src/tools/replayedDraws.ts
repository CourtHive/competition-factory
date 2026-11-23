import { randomSource, withAmbientRandomSource, type RandomFunction } from '@Tools/prng';

type Draw = { value: number } | { thrown: unknown };

/** runs a write on a copy of the record with its ambient draws kept; undefined, and `run` is not called, where they cannot be */
export type RecordDraws = <T>(run: () => T) => T | undefined;

/**
 * ONE CALL'S AMBIENT DRAWS, READ ONCE AND REPLAYED TO EVERY RUN OF THE CALL.
 *
 * A mutation that runs more than once for one call (on a copy of the record, then on the stored record) must make
 * the same random choices each time, and must leave every stream where one run alone would have left it. Each run
 * made through `record` or `replay` reads the call's draws from the first: those an earlier run took are handed
 * back in order, a source that threw throws the same error again, and only past their end is the source itself read
 * (and kept). So the source is read exactly as often as the longest run reads it, and yields each run the values a
 * single run would have been given.
 *
 * The draws are the AMBIENT ones (`randomSource()`: a seeded call's stream, the configured source or `Math.random`),
 * ids among them (`UUID`). Each run reads through a function of its own, so an id a later run mints again is not a
 * repeat (`UUID.ts` `refuseRepeatedId`, keyed by function). Synchronous runs only (`withAmbientRandomSource`).
 */
export function replayedDraws(): { record: RecordDraws; replay: <T>(run: () => T) => T } {
  const drawn: Draw[] = [];
  const reader = (source: RandomFunction): RandomFunction => {
    let index = 0;
    return () => {
      if (index === drawn.length) drawn.push(read(source));
      const draw = drawn[index++];
      if ('thrown' in draw) throw draw.thrown;
      return draw.value;
    };
  };
  return {
    // refused before `run` where the scope does not take (a provider that hands out a stream it will not replace)
    record: (run) => {
      const draws = reader(randomSource());
      return withAmbientRandomSource(draws, () => (randomSource() === draws ? run() : undefined));
    },
    // with nothing kept there is nothing to hand back: the run reads the source as it always did
    replay: (run) => (drawn.length ? withAmbientRandomSource(reader(randomSource()), run) : run()),
  };
}

function read(source: RandomFunction): Draw {
  try {
    return { value: source() };
  } catch (thrown) {
    return { thrown };
  }
}
