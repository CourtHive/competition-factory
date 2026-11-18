import { withClockSourceReader, type ClockSourceReading } from '@Tools/clock';

/**
 * ONE CALL'S CLOCK READINGS, READ ONCE AND REPLAYED TO EVERY RUN OF THE CALL (`replayedDraws.ts`, for the clock).
 *
 * A mutation made OUTSIDE an engine call has no captured instant: each stamp it writes reads the source where it is
 * written (`clock.ts`), so two runs of one call (on a copy of the record, then on the stored record) would stamp
 * different instants, and would read a configured source twice as often as the call alone does. Each run made through
 * `record` or `replay` takes the call's readings from the first: those an earlier run took are handed back in order, a
 * reading the source refused (it threw, or was invalid) is refused again at the same read, and only past their end is
 * the source itself read (and kept). So the source is read exactly as often as the longest run reads it, in the order
 * one run alone would read it, and every run is given the readings a single run would have been given.
 *
 * Nothing is captured: no instant is fixed for the call and no stamp ledger is opened, so a run stamps as an
 * uncaptured call stamps, each write at its own reading. Inside a captured instant no read reaches the source, and
 * there is nothing to keep. Synchronous runs only (`withClockSourceReader`).
 */
export function replayedInstants(): {
  record: <T>(run: () => T) => T;
  replay: <T>(run: () => T) => T;
  /** whether the replayed run has read, so far, exactly the readings the recorded run took: no fewer and no more */
  exact: () => boolean;
} {
  const kept: ClockSourceReading[] = [];
  let recorded: number | undefined;
  let replayed: number | undefined;
  // each run counts its own reads as it makes them: a caller inside the run can ask
  const through = <T>(run: () => T, count: (reads: number) => void): T => {
    let index = 0;
    count(index);
    return withClockSourceReader((source) => {
      if (index === kept.length) kept.push(source());
      const reading = kept[index++];
      count(index);
      return reading;
    }, run);
  };
  return {
    record: (run) => through(run, (reads) => (recorded = reads)),
    // with no recorded run there is nothing to hand back: the run reads the source as it always did
    replay: (run) => (recorded === undefined ? run() : through(run, (reads) => (replayed = reads))),
    exact: () => recorded === replayed,
  };
}
