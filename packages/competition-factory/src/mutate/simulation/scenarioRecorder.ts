import { makeDeepCopy } from '@Tools/makeDeepCopy';

/** One engine call: what a client sends to reproduce a step of a generated scenario. */
export type RecordedMethod = { method: string; params: Record<string, unknown> };

let recording: RecordedMethod[] | undefined;

/**
 * The method list of a generated scenario (CA 2026-10-29): every write scenario generation makes to the record,
 * also logged as the engine call a client would make for it, with params by id (drawId, eventId, matchUpId), so the
 * list replays through any engine. Random steps are logged as their results (the draw that was generated, each
 * outcome that was set), so a replay is deterministic. The first entry is `newTournamentRecord`, an engine method;
 * the rest are governor methods for `executionQueue`.
 *
 * Opt-in (`recordMethods`): logging copies each call's params.
 */
export function startRecording() {
  recording = [];
}

export function stopRecording(): RecordedMethod[] | undefined {
  const methods = recording;
  recording = undefined;
  return methods;
}

export function recordMethod(method: string, params: Record<string, unknown>): RecordedMethod | undefined {
  if (!recording) return undefined;
  const entry = { method, params: makeDeepCopy(params, false, true) };
  recording.push(entry);
  return entry;
}

/** a result, logged as the setMatchUpStatus a client sends for it: the draw by id, the outcome as set */
type RecordedResult = {
  drawDefinition?: { drawId: string };
  policyDefinitions?: object;
  matchUpFormat?: string;
  matchUpId: string;
  outcome: unknown;
};
export function recordSetMatchUpStatus({
  policyDefinitions,
  drawDefinition,
  matchUpFormat,
  matchUpId,
  outcome,
}: RecordedResult) {
  recordMethod('setMatchUpStatus', {
    drawId: drawDefinition?.drawId,
    ...(policyDefinitions && { policyDefinitions }),
    ...(matchUpFormat && { matchUpFormat }),
    matchUpId,
    outcome,
  });
}

/**
 * A write, logged as the engine call a client makes for it and then made. The logged params are the engine's: the
 * record implicit, an event or draw named by its id, and an object passed only where it is the payload (`addEvent`'s
 * event, `addDrawDefinition`'s draw).
 */
export function recorded<T extends (args: never) => unknown>(
  method: string,
  write: T,
  payload?: 'event' | 'drawDefinition',
  // what the call minted that a replay must be told: ids the write chose (courts' ids, say)
  minted?: (result: ReturnType<T>) => Record<string, unknown> | undefined,
) {
  return (args: Parameters<T>[0]): ReturnType<T> => {
    const { event, drawDefinition, ...rest }: Record<string, any> = { ...(args as object) };
    delete rest.tournamentRecord;
    delete rest.tournamentRecords;
    const entry = recordMethod(method, {
      ...rest,
      ...(event && (payload === 'event' ? { event } : { eventId: event.eventId })),
      ...(drawDefinition && (payload === 'drawDefinition' ? { drawDefinition } : { drawId: drawDefinition.drawId })),
    });
    const result = write(args) as ReturnType<T>;
    const refused = !!(result as { error?: unknown } | undefined)?.error;
    if (entry && minted && !refused) Object.assign(entry.params, makeDeepCopy(minted(result), false, true));
    return result;
  };
}
