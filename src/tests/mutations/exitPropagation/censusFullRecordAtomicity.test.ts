import { checkErrorAtomicity, observeMutation, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it, vi } from 'vitest';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import type { Tournament } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/eventConstants';

const config = {
  drawType: SINGLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 8,
  drawSize: 8,
  seed: 42,
};
const drawOf = (record: Tournament) => record.events![0].drawDefinitions![0];

const faults = [
  {
    name: 'notes',
    field: '/notes',
    edit: (record: Tournament) => {
      drawOf(record).structures![0].matchUps![0].notes = 'planted';
    },
  },
  {
    name: 'schedule',
    field: '/schedule',
    edit: (record: Tournament) => {
      drawOf(record).structures![0].matchUps![0].schedule = { courtId: 'planted' };
    },
  },
  {
    name: 'updatedAt',
    field: '/updatedAt',
    edit: (record: Tournament) => {
      drawOf(record).updatedAt = 'planted';
    },
  },
  {
    name: 'event entry',
    field: '/entries/0/entryStatus',
    edit: (record: Tournament) => {
      record.events![0].entries![0].entryStatus = 'WITHDRAWN';
    },
  },
];

afterEach(() => vi.restoreAllMocks());

it.each(faults)('census replay catches a refused call that changes only $name', ({ edit, name, field }) => {
  setSubscriptions({});
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation(() => {
    const { tournamentRecord } = tournamentEngine.getTournament();
    const before = hash(drawOf(tournamentRecord));
    edit(tournamentRecord);
    // A control: the old detector sees exactly the same projection.
    expect(hash(drawOf(tournamentRecord))).toEqual(before);
    tournamentEngine.setState(tournamentRecord);
    return { error: INVALID_VALUES };
  });
  const failure = replay(config, [], `full-record-${name}`);
  expect(failure?.property).toEqual('ERROR_IMPLIES_NO_MUTATION');
  expect(failure?.detail).toContain('/events/0/');
  expect(failure?.detail).toContain(field);
});

it('a clean refusal stays clean', () => {
  setSubscriptions({});
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockReturnValue({ error: INVALID_VALUES });
  expect(replay(config, [], 'full-record-clean')).toBeNull();
});

it('replay catches an idempotence second apply that refuses after an omitted-field write', () => {
  setSubscriptions({});
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  let calls = 0;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params) => {
    calls += 1;
    // First probe: monotonicity's apply, idempotence's first apply, then its second apply.
    if (calls !== 3) return setMatchUpStatus(params);
    const { tournamentRecord } = tournamentEngine.getTournament();
    faults[0].edit(tournamentRecord);
    tournamentEngine.setState(tournamentRecord);
    return { error: INVALID_VALUES };
  });
  const failure = replay(config, [], 'full-record-second-apply');
  expect(calls).toBeGreaterThanOrEqual(3);
  expect(failure?.property).toEqual('ERROR_IMPLIES_NO_MUTATION');
  expect(failure?.detail).toContain('/notes');
});

it('a throw after an omitted-field write reports the divergent field as well as the exception', () => {
  setSubscriptions({});
  const drawId = 'full-record-throw';
  expect(prepareDraw(config, drawId)).toEqual(true);
  const { tournamentRecord } = tournamentEngine.getTournament();
  const matchUpId = drawOf(tournamentRecord).structures![0].matchUps![0].matchUpId;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation(() => {
    const { tournamentRecord: record } = tournamentEngine.getTournament();
    faults[0].edit(record);
    tournamentEngine.setState(record);
    throw new Error('planted throw');
  });
  const observation = observeMutation({ drawId, matchUpId, outcome: { winningSide: 1 } });
  expect(observation.mutated).toEqual(false);
  expect(checkErrorAtomicity(observation, matchUpId).map((failure) => failure.property)).toEqual([
    'NO_EXCEPTION_ESCAPES',
    'ERROR_IMPLIES_NO_MUTATION',
  ]);
});

it('a refused TEAM call cannot change a nested tieMatchUp outside the projection', () => {
  setSubscriptions({});
  const drawId = 'full-record-team';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    nonRandom: 42,
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const dual = drawOf(tournamentRecord).structures![0].matchUps![0];
  expect(dual.tieMatchUps?.length).toBeGreaterThan(0);
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation(() => {
    const { tournamentRecord: record } = tournamentEngine.getTournament();
    const before = hash(drawOf(record));
    drawOf(record).structures![0].matchUps![0].tieMatchUps![0].notes = 'planted';
    expect(hash(drawOf(record))).toEqual(before);
    tournamentEngine.setState(record);
    return { error: INVALID_VALUES };
  });
  const observation = observeMutation({ drawId, matchUpId: dual.matchUpId, outcome: { winningSide: 1 } });
  expect(checkErrorAtomicity(observation, dual.matchUpId)[0]?.property).toEqual('ERROR_IMPLIES_NO_MUTATION');
  expect(checkErrorAtomicity(observation, dual.matchUpId)[0]?.detail).toContain('/tieMatchUps/0/notes');
});

it('census replay catches a refusal that changes a generated TEAM line', () => {
  setSubscriptions({});
  const generateTournamentRecord = mocksEngine.generateTournamentRecord;
  vi.spyOn(mocksEngine, 'generateTournamentRecord').mockImplementation((params: any) =>
    generateTournamentRecord({
      ...params,
      drawProfiles: params.drawProfiles.map((profile: Record<string, unknown>) => ({
        ...profile,
        eventType: TEAM,
        tieFormatName: DOMINANT_DUO,
      })),
    }),
  );
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation(() => {
    const { tournamentRecord } = tournamentEngine.getTournament();
    const before = hash(drawOf(tournamentRecord));
    const line = drawOf(tournamentRecord).structures![0].matchUps![0].tieMatchUps![0];
    expect(line).toBeDefined();
    line.notes = 'planted-replay';
    expect(hash(drawOf(tournamentRecord))).toEqual(before);
    tournamentEngine.setState(tournamentRecord);
    return { error: INVALID_VALUES };
  });
  const failure = replay(config, [], 'full-record-team-replay');
  expect(failure?.property).toEqual('ERROR_IMPLIES_NO_MUTATION');
  expect(failure?.detail).toContain('/tieMatchUps/0/notes');
});
