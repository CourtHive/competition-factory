import { randomSource, RandomFunction, withCallRandomSource, withRandomSource } from '@Tools/prng';

/**
 * COMPOSE ON A WORKING COPY, THEN WRITE — and write only what composed without error.
 *
 * `compose` runs the whole mutation against a working copy the caller builds (nothing it touches is the
 * stored record); a refusal there is returned and the record has not been written at all. Only when it
 * composed does `write` run the same mutation against the stored record. Nothing is written and then
 * undone; there is no snapshot and no restore.
 *
 * The write must make the choices the composition made, so every random draw the composition takes is
 * recorded and the write replays them, in order:
 * - draws from the `random` the caller was given (passed on to `compose` / `write` as their argument);
 * - draws from the ambient source (`randomSource()`: a seeded call's stream, the configured source or
 *   `Math.random`), which code without a `random` parameter reads — ids among it.
 * The composition draws from the real sources exactly what the mutation alone would have drawn, and the
 * write draws nothing new, so every stream is left exactly where the mutation alone would have left it:
 * for valid input the record, and everything drawn after, is what it was without this wrapper.
 */
export function composeThenWrite<T extends { error?: unknown }>({
  compose,
  random,
  write,
}: {
  compose: (random?: RandomFunction) => T;
  write: (random?: RandomFunction) => T;
  random?: RandomFunction;
}): T {
  const ambientSource = randomSource();
  const ambient = recording(ambientSource);
  const passed = random ? recording(random) : undefined;

  const composed = withAmbient(ambient.draw, () => compose(passed?.draw));
  if (composed.error) return composed;

  const ambientReplay = replaying(ambient.values, ambientSource);
  return withAmbient(ambientReplay, () => write(passed && replaying(passed.values, random as RandomFunction)));
}

/**
 * Whether `drawDefinition` is part of the stored record, so that a refusal part-way would leave the record
 * half-written. A draw being GENERATED is not yet in it: a refusal discards the whole draw, and composing it
 * first would only position it twice. Without a record to look in, the draw is treated as stored.
 */
export function isStoredDraw({
  tournamentRecord,
  drawDefinition,
}: {
  tournamentRecord?: { events?: { drawDefinitions?: unknown[] }[] };
  drawDefinition: unknown;
}): boolean {
  if (!tournamentRecord) return true;
  return !!tournamentRecord.events?.some((event) => event.drawDefinitions?.includes(drawDefinition));
}

function withAmbient<T>(source: RandomFunction, fn: () => T): T {
  // both scopes: a provider without the call-stream hooks reads the configured source instead
  return withCallRandomSource(source, () => withRandomSource(source, fn));
}

function recording(source: RandomFunction) {
  const values: number[] = [];
  const draw = () => {
    const value = source();
    values.push(value);
    return value;
  };
  return { draw, values };
}

/** the recorded draws in order; past their end (a write that diverged from its composition) the source itself */
function replaying(values: number[], source: RandomFunction): RandomFunction {
  let index = 0;
  return () => (index < values.length ? values[index++] : source());
}
