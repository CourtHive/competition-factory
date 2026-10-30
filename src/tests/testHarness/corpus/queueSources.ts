import { CorpusWriteError, EXECUTION_QUEUE, writeScenario, type Directive } from './writeScenario';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { RECORD_CLOCK } from './recordClock';
import { setClock } from '@Tools/clock';
import path from 'path';
import fs from 'fs';

const CLOCK = '2026-10-01T12:00:00.000Z';
const SEED = 6000;

type Queued = {
  scenarioId: string;
  ref: string;
  initialRecord: any;
  directives: Directive[];
  // what each step's result must be: true for a success, else the refusal's code
  expected: (true | string)[];
};

const queue = (methods: Directive[], rollbackOnError?: boolean): Directive => ({
  method: EXECUTION_QUEUE,
  params: { methods, ...(rollbackOnError === undefined ? {} : { rollbackOnError }) },
});

// a tournament with eight participants and no events, built at the record clock
function participantsOnly() {
  setClock(RECORD_CLOCK);
  setRandomSource(SEED);
  try {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 8 },
      startDate: '2026-10-01',
      endDate: '2026-10-03',
    });
    const participantIds = tournamentRecord.participants.map(({ participantId }: any) => participantId);
    return { tournamentRecord, participantIds };
  } finally {
    setClock();
    setRandomSource();
  }
}

const addEvent = (eventId: string): Directive => ({
  method: 'addEvent',
  params: { event: { eventId, eventName: eventId } },
});
const addEntries = (eventId: string, participantIds: string[]): Directive => ({
  method: 'addEventEntries',
  params: { eventId, participantIds },
});

/**
 * The `queue` scenarios: engine calls sent as a client sends them to a server, several directives in one
 * `executionQueue`. A queue is one call: one instant, one stamp after it; a refusal stops it, and with
 * `rollbackOnError` restores the records as they were, otherwise keeps what the directives before it wrote.
 */
export function queueScenarios(): Queued[] {
  const { tournamentRecord, participantIds } = participantsOnly();
  const scenario = (args: Omit<Queued, 'initialRecord'>): Queued => ({ ...args, initialRecord: tournamentRecord });
  return [
    scenario({
      scenarioId: 'queue/builds-an-event-in-one-call',
      ref: 'executionQueue: the directives run in order, under one instant, and the record is stamped once',
      directives: [queue([addEvent('queue-event'), addEntries('queue-event', participantIds)])],
      expected: [true],
    }),
    scenario({
      scenarioId: 'queue/refusal-rolls-back',
      ref: 'executionQueue: with rollbackOnError a refusal restores the record, unstamped',
      directives: [queue([addEvent('queue-event'), addEntries('no-such-event', participantIds)], true)],
      expected: ['ERR_NOT_FOUND_EVENT'],
    }),
    scenario({
      scenarioId: 'queue/refusal-keeps-earlier-writes',
      ref: 'executionQueue: without rollbackOnError a refusal keeps what the directives before it wrote, stamped',
      directives: [queue([addEvent('queue-event'), addEntries('no-such-event', participantIds)], false)],
      expected: ['ERR_NOT_FOUND_EVENT'],
    }),
    scenario({
      scenarioId: 'queue/unknown-method-refused-before-any-runs',
      ref: 'executionQueue: every directive is checked before any runs, so a queue naming no method writes nothing',
      directives: [queue([addEvent('queue-event'), { method: 'notAnEngineMethod', params: {} }])],
      expected: ['ERR_NOT_FOUND_METHOD'],
    }),
    scenario({
      scenarioId: 'queue/one-queue-after-another',
      ref: 'executionQueue: a refused queue between two that succeed leaves the record as the first left it',
      directives: [
        queue([addEvent('first-event')]),
        queue([addEvent('second-event'), addEntries('no-such-event', participantIds)], true),
        queue([addEntries('first-event', participantIds)]),
      ],
      expected: [true, 'ERR_NOT_FOUND_EVENT', true],
    }),
  ];
}

export function recordQueue({ outDir }: { outDir: string }) {
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'queue.jsonl');
  fs.writeFileSync(outPath, '');
  const written: { scenario: any; expected: (true | string)[] }[] = [];
  const failed: { scenarioId: string; reason: string }[] = [];
  for (const queued of queueScenarios()) {
    try {
      const scenario = writeScenario({
        scenarioId: queued.scenarioId,
        source: { kind: 'authored', ref: queued.ref },
        tags: ['queue', 'execution-queue'],
        initialRecord: queued.initialRecord,
        directives: queued.directives,
        seed: SEED,
        clock: CLOCK,
      });
      fs.appendFileSync(outPath, JSON.stringify(scenario) + '\n');
      written.push({ scenario, expected: queued.expected });
    } catch (err: any) {
      if (!(err instanceof CorpusWriteError)) throw err;
      failed.push({ scenarioId: queued.scenarioId, reason: err.message.slice(0, 300) });
    }
  }
  return { written, failed };
}
