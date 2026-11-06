import { reduceRecordToFootprint } from '@Query/footprint/reduceRecordToFootprint';
import { getMutationFootprint } from '@Query/footprint/getMutationFootprint';
import methodKinds from '@Tests/testHarness/queryPurity/methodKinds.json';
import { mutationFootprints } from '@Query/footprint/mutationFootprints';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { setRandomSource } from '@Tools/prng';
import { expect, it, describe } from 'vitest';
import { setClock } from '@Tools/clock';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { WITHDRAWN } from '@Constants/entryStatusConstants';

/**
 * The footprint map, checked against the engine. Each scenario runs one method twice from the same record: on the
 * whole record, and on the record reduced to the method's declared footprint. It fails when
 * - the two runs disagree (result, error, or what they leave in the footprint's draws, shell and participants): the
 *   method READ outside its footprint, and on a partial record would have given a different answer;
 * - the whole-record run changed a draw or participant outside the footprint: the method WROTE outside it, and a
 *   storage layer writing back only the footprint would lose the write.
 *
 * Clock and random source are fixed per run, so the two runs stamp and mint alike.
 */

const START_DATE = '2026-06-01';
const CLOCK = '2026-06-02T10:00:00.000Z';

// keys a run writes from the clock or the random source when it consumes them in a different order
const VOLATILE = new Set(['factory']);

function fixture() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'V1', courtsCount: 4, idPrefix: 'court' }],
    participantsProfile: { participantsCount: 80 },
    eventProfiles: [
      {
        eventId: 'E1',
        eventType: SINGLES,
        drawProfiles: [
          { drawId: 'D1', drawSize: 8 },
          { drawId: 'D2', drawSize: 8 },
        ],
      },
      { eventId: 'E2', eventType: DOUBLES, drawProfiles: [{ drawId: 'D3', drawSize: 4 }] },
      { eventId: 'E3', eventType: TEAM, drawProfiles: [{ drawId: 'D4', drawSize: 4 }] },
      { eventId: 'E4', eventType: SINGLES, drawProfiles: [{ drawId: 'D5', drawSize: 8, automated: false }] },
    ],
    endDate: '2026-06-07',
    startDate: START_DATE,
    nonRandom: 1,
  });
  // collection lines with players on them: without line-ups a TEAM line has no sides to score
  tournamentEngine.setState(tournamentRecord);
  const result: any = tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'D4' });
  expect(result.success).toEqual(true);
  return tournamentEngine.getTournament().tournamentRecord;
}

// the value without its volatile keys, and without keys whose value is undefined (as a stored record would read)
const strip = (value: any): any => {
  if (Array.isArray(value)) return value.map(strip);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, v]) => !VOLATILE.has(key) && v !== undefined)
      .map(([key, v]) => [key, strip(v)]),
  );
};

const shellOf = (record: any) => ({
  ...record,
  participants: undefined,
  events: record.events?.map((event: any) => ({ ...event, drawDefinitions: undefined })),
});

const drawsOf = (record: any) =>
  Object.fromEntries(
    (record.events ?? []).flatMap((event: any) => (event.drawDefinitions ?? []).map((d: any) => [d.drawId, d])),
  );

const participantsOf = (record: any) =>
  Object.fromEntries((record.participants ?? []).map((p: any) => [p.participantId, p]));

function run(record: any, method: string, params: any, outcomePipeline: string) {
  setClock(CLOCK);
  setRandomSource(7);
  tournamentEngine.reset();
  tournamentEngine.outcomePipeline(outcomePipeline);
  tournamentEngine.setState(structuredClone(record));
  const result: any = tournamentEngine[method](params);
  const after = tournamentEngine.getTournament().tournamentRecord;
  tournamentEngine.outcomePipeline(OUTCOME_PIPELINE_V1);
  setRandomSource();
  setClock();
  return { result, after };
}

type Scenario = {
  name: string;
  method: string;
  params: (record: any) => any;
  pipelines?: string[];
  expectSuccess?: boolean;
};

const findMatchUp = (record: any, drawId: string, predicate: (m: any) => boolean = () => true) => {
  tournamentEngine.setState(structuredClone(record));
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId] } });
  return matchUps.find((m: any) => m.drawPositions?.filter(Boolean).length === 2 && !m.collectionId && predicate(m));
};

const collectionLine = (record: any) => {
  tournamentEngine.setState(structuredClone(record));
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: ['D4'] } });
  return matchUps.find(
    (m: any) => m.collectionId && m.roundNumber === 1 && m.sides?.every((s: any) => s.participantId),
  );
};

const outcome = {
  score: {
    sets: [
      { side1Score: 6, side2Score: 1, winningSide: 1 },
      { side1Score: 6, side2Score: 2, winningSide: 1 },
    ],
  },
  winningSide: 1,
  matchUpStatus: 'COMPLETED',
};

const bulkOutcome = (record: any, eventId: string, drawId: string) => ({
  ...outcome,
  matchUpId: findMatchUp(record, drawId).matchUpId,
  tournamentId: record.tournamentId,
  eventId,
  drawId,
});

const scheduled = (record: any, schedule: any) => {
  const matchUp = findMatchUp(record, 'D1');
  return { drawId: 'D1', matchUpId: matchUp.matchUpId, schedule };
};

const unassignedPosition = (record: any) => {
  tournamentEngine.setState(structuredClone(record));
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'D5' });
  const structure = drawDefinition.structures[0];
  const assigned = new Set(
    drawDefinition.structures[0].positionAssignments
      .filter((a: any) => a.participantId || a.bye)
      .map((a: any) => a.drawPosition),
  );
  const drawPosition = structure.positionAssignments
    .map((a: any) => a.drawPosition)
    .find((p: number) => !assigned.has(p));
  const placed = new Set(structure.positionAssignments.map((a: any) => a.participantId).filter(Boolean));
  const participantId = drawDefinition.entries.map((e: any) => e.participantId).find((id: string) => !placed.has(id));
  return { drawId: 'D5', structureId: structure.structureId, drawPosition, participantId };
};

const firstAssignment = (record: any) => {
  tournamentEngine.setState(structuredClone(record));
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'D1' });
  const structure = drawDefinition.structures[0];
  const { drawPosition } = structure.positionAssignments.find((a: any) => a.participantId);
  return { drawId: 'D1', eventId: 'E1', structureId: structure.structureId, drawPosition };
};

const SCENARIOS: Scenario[] = [
  {
    name: 'singles score',
    method: 'setMatchUpStatus',
    params: (r) => ({ drawId: 'D1', matchUpId: findMatchUp(r, 'D1').matchUpId, outcome }),
    pipelines: [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2],
  },
  {
    name: 'doubles score',
    method: 'setMatchUpStatus',
    params: (r) => ({ drawId: 'D3', matchUpId: findMatchUp(r, 'D3').matchUpId, outcome }),
    pipelines: [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2],
  },
  {
    name: 'TEAM collection line score',
    method: 'setMatchUpStatus',
    params: (r) => ({ drawId: 'D4', matchUpId: collectionLine(r).matchUpId, outcome }),
    pipelines: [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2],
  },
  {
    name: 'bulk scores, two draws of one event',
    method: 'bulkMatchUpStatusUpdate',
    params: (r) => ({ outcomes: [bulkOutcome(r, 'E1', 'D1'), bulkOutcome(r, 'E1', 'D2')] }),
    pipelines: [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2],
  },
  {
    name: 'bulk scores, draws of two events',
    method: 'bulkMatchUpStatusUpdate',
    params: (r) => ({ outcomes: [bulkOutcome(r, 'E1', 'D1'), bulkOutcome(r, 'E2', 'D3')] }),
    pipelines: [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2],
  },
  {
    name: 'score with a schedule',
    method: 'setMatchUpStatus',
    params: (r) => ({ ...scheduled(r, { scheduledDate: START_DATE }), outcome }),
  },
  { name: 'assign a position', method: 'assignDrawPosition', params: unassignedPosition },
  {
    name: 'assign a bye',
    method: 'assignDrawPositionBye',
    params: (r) => {
      const { drawId, structureId, drawPosition } = unassignedPosition(r);
      return { drawId, structureId, drawPosition };
    },
  },
  { name: 'remove an assignment', method: 'removeDrawPositionAssignment', params: firstAssignment },
  {
    name: 'remove an assignment, withdrawing',
    method: 'removeDrawPositionAssignment',
    params: (r) => ({ ...firstAssignment(r), entryStatus: WITHDRAWN }),
  },
  {
    name: 'schedule items: date, court, order, time',
    method: 'addMatchUpScheduleItems',
    params: (r) =>
      scheduled(r, {
        scheduledDate: START_DATE,
        courtId: 'court-1',
        venueId: 'V1',
        courtOrder: 2,
        scheduledTime: '10:00',
      }),
  },
  {
    name: 'schedule items: start and end times',
    method: 'addMatchUpScheduleItems',
    params: (r) => scheduled(r, { scheduledDate: START_DATE, startTime: '10:05', endTime: '11:30' }),
  },
  {
    name: 'scheduled date',
    method: 'addMatchUpScheduledDate',
    params: (r) => ({ ...scheduled(r, {}), scheduledDate: START_DATE }),
  },
  {
    name: 'scheduled time',
    method: 'addMatchUpScheduledTime',
    params: (r) => ({ ...scheduled(r, {}), scheduledTime: `${START_DATE}T10:00` }),
  },
  { name: 'court order', method: 'addMatchUpCourtOrder', params: (r) => ({ ...scheduled(r, {}), courtOrder: 3 }) },
  { name: 'start time', method: 'addMatchUpStartTime', params: (r) => ({ ...scheduled(r, {}), startTime: '10:05' }) },
  {
    name: 'assign court',
    method: 'assignMatchUpCourt',
    params: (r) => ({ ...scheduled(r, {}), courtId: 'court-1', courtDayDate: START_DATE }),
  },
  { name: 'assign venue', method: 'assignMatchUpVenue', params: (r) => ({ ...scheduled(r, {}), venueId: 'V1' }) },
  {
    name: 'check in, doubles individual',
    method: 'checkInParticipant',
    params: (r) => {
      const matchUp = findMatchUp(r, 'D3');
      tournamentEngine.setState(structuredClone(r));
      const pair = tournamentEngine.getParticipants({
        participantFilters: { participantIds: [matchUp.sides[0].participantId] },
      }).participants[0];
      return { drawId: 'D3', matchUpId: matchUp.matchUpId, participantId: pair.individualParticipantIds[0] };
    },
  },
  {
    name: 'check in, singles',
    method: 'checkInParticipant',
    params: (r) => {
      const matchUp = findMatchUp(r, 'D1');
      return { drawId: 'D1', matchUpId: matchUp.matchUpId, participantId: matchUp.sides[0].participantId };
    },
  },
  {
    name: 'matchUp format, one matchUp',
    method: 'setMatchUpFormat',
    params: (r) => ({ drawId: 'D1', matchUpId: findMatchUp(r, 'D1').matchUpId, matchUpFormat: 'SET1-S:6/TB7' }),
  },
  {
    name: 'matchUp format, one draw',
    method: 'setMatchUpFormat',
    params: () => ({ drawId: 'D2', matchUpFormat: 'SET1-S:6/TB7' }),
  },
  {
    name: 'matchUp format, event attribute',
    method: 'setMatchUpFormat',
    params: () => ({ eventId: 'E1', matchUpFormat: 'SET1-S:6/TB7' }),
  },
  {
    name: 'matchUp format, event structures',
    method: 'setMatchUpFormat',
    params: () => ({ eventId: 'E1', matchUpFormat: 'SET1-S:6/TB7', force: true }),
  },
];

describe('mutation footprints', () => {
  const record = fixture();

  it('declares only methods the engine classifies as mutations', () => {
    const kinds = methodKinds as Record<string, string>;
    for (const method of Object.keys(mutationFootprints)) expect([method, kinds[method]]).toEqual([method, 'mutation']);
  });

  const cases = SCENARIOS.flatMap((scenario) =>
    (scenario.pipelines ?? [OUTCOME_PIPELINE_V1]).map(
      (pipeline) => [`${scenario.name} (${pipeline})`, scenario, pipeline] as const,
    ),
  );

  it.each(cases)('%s: same answer on its footprint, no write outside it', (_name, scenario, pipeline) => {
    const params = scenario.params(record);
    const footprint = getMutationFootprint({
      methods: [{ method: scenario.method, params }],
      outcomePipeline: pipeline as any,
    });
    expect(footprint.tournament).toEqual(false);

    const whole = run(record, scenario.method, params, pipeline);
    expect(whole.result.error).toBeUndefined();

    const partialRecord = reduceRecordToFootprint({ tournamentRecord: record, footprint });
    const partial = run(partialRecord, scenario.method, params, pipeline);

    // the same answer
    expect(strip(partial.result.error)).toEqual(strip(whole.result.error));
    expect(!!partial.result.success).toEqual(!!whole.result.success);
    expect(strip(shellOf(partial.after))).toEqual(strip(shellOf(whole.after)));
    const partialDraws = drawsOf(partial.after);
    const wholeDraws = drawsOf(whole.after);
    for (const drawId of Object.keys(partialDraws))
      expect(strip(partialDraws[drawId])).toEqual(strip(wholeDraws[drawId]));
    const partialParticipants = participantsOf(partial.after);
    const wholeParticipants = participantsOf(whole.after);
    for (const participantId of Object.keys(partialParticipants))
      expect(strip(partialParticipants[participantId])).toEqual(strip(wholeParticipants[participantId]));

    // no write outside the footprint
    const beforeDraws = drawsOf(record);
    for (const drawId of Object.keys(wholeDraws)) {
      if (partialDraws[drawId]) continue;
      expect([drawId, strip(wholeDraws[drawId])]).toEqual([drawId, strip(beforeDraws[drawId])]);
    }
    const beforeParticipants = participantsOf(record);
    for (const participantId of Object.keys(wholeParticipants)) {
      if (partialParticipants[participantId]) continue;
      expect([participantId, strip(wholeParticipants[participantId])]).toEqual([
        participantId,
        strip(beforeParticipants[participantId]),
      ]);
    }
    expect(Object.keys(wholeParticipants).length).toEqual(Object.keys(beforeParticipants).length);
  });
});
