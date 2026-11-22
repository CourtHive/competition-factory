import { getTournamentRecords, setOutcomePipeline } from '@Global/state/globalState';
import type { MatchUp } from '@Types/tournamentTypes';
import engine from '@Engines/syncEngine';
import mocks from '@Assemblies/engines/mock';
import { afterEach, describe, expect, it } from 'vitest';

const drawId = 'team-seats';
const profiles = ['bracket', 'ad-hoc'] as const;
const seats = ['empty', 'one-team', 'vacant-assignment', 'bye-assignment', 'duplicate-team', 'two-teams'] as const;
type Seats = (typeof seats)[number];
const routes = ['direct', 'queue-off', 'queue-on'] as const;
const modes = ['v1', 'v2', 'differential'] as const;
afterEach(() => setOutcomePipeline('v1'));

function configureSeats(
  shape: Seats,
  first: { participantId?: string },
  second: { participantId?: string; bye?: boolean },
) {
  if (shape === 'empty') delete first.participantId;
  if (shape === 'duplicate-team') second.participantId = first.participantId;
  else if (shape !== 'two-teams') delete second.participantId;
  if (shape === 'bye-assignment') second.bye = true;
}

function makeDual(profile: (typeof profiles)[number], shape: Seats) {
  engine.reset();
  const adHoc = profile === 'ad-hoc';
  mocks.generateTournamentRecord({
    drawProfiles: [
      {
        drawId,
        drawSize: 4,
        eventType: 'TEAM',
        tieFormatName: 'DOMINANT_DUO',
        ...(adHoc ? { drawType: 'AD_HOC' as const, automated: true, roundsCount: 1 } : {}),
      },
    ],
    nonRandom: 1,
    setState: true,
  });
  const arrivals = {
    empty: 0,
    'one-team': 1,
    'vacant-assignment': 2,
    'bye-assignment': 2,
    'duplicate-team': 2,
    'two-teams': 2,
  };
  const matches = engine.getEvent({ drawId }).drawDefinition!.structures[0].matchUps!;
  if (!adHoc) {
    for (const semi of matches.filter((m) => m.roundNumber === 1).slice(0, arrivals[shape])) {
      expect(engine.setMatchUpStatus({ drawId, matchUpId: semi.matchUpId, outcome: { winningSide: 1 } }).success).toBe(
        true,
      );
    }
  }
  const record = structuredClone(engine.getTournament().tournamentRecord!);
  const structure = record.events![0].drawDefinitions![0].structures[0];
  const dual = adHoc ? structure.matchUps![0] : structure.matchUps!.find((m) => m.roundNumber === 2)!;
  if (adHoc) {
    const first = dual.sides!.find((s) => s.sideNumber === 1)!;
    const second = dual.sides!.find((s) => s.sideNumber === 2)!;
    expect(first.participantId).toBeTruthy();
    expect(second.participantId).toBeTruthy();
    expect(first.participantId).not.toBe(second.participantId);
    configureSeats(shape, first, second);
    if (shape === 'one-team') dual.sides = [first];
    if (shape === 'empty') dual.sides = [];
  } else {
    expect(dual.drawPositions).toHaveLength(arrivals[shape]);
    if (arrivals[shape] === 2) {
      const [first, second] = dual.drawPositions!.map((position) =>
        structure.positionAssignments!.find((a) => a.drawPosition === position)!,
      );
      configureSeats(shape, first, second);
    }
  }
  return { record, dual };
}

const tallies = ['unplayed', 'tied', 'clinched'] as const;
function setTally(dual: MatchUp, tally: (typeof tallies)[number]) {
  if (tally === 'unplayed') return;
  const [one, two] = dual.tieMatchUps!.slice(1);
  Object.assign(one, { matchUpStatus: 'COMPLETED', winningSide: 1 });
  Object.assign(two, { matchUpStatus: 'COMPLETED', winningSide: tally === 'tied' ? 2 : 1 });
}

describe.each(profiles)('%s explicit TEAM auto-calculation', (profile) => {
  describe.each(modes)('%s', (mode) => {
    it.each(seats)('checks %s before committing', (shape) => {
      const { record, dual } = makeDual(profile, shape);
      for (const tally of tallies) {
        setTally(dual, tally);
        for (const route of routes) {
          setOutcomePipeline(mode);
          expect(engine.setState(structuredClone(record)).success).toBe(true);
          const before = JSON.stringify(getTournamentRecords());
          const params = { drawId, matchUpId: dual.matchUpId, enableAutoCalc: true, outcome: {} };
          const result =
            route === 'direct'
              ? engine.setMatchUpStatus(params)
              : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
          const label = [profile, shape, tally, mode, route].join('/');
          if (shape === 'two-teams') {
            expect(result.success, label).toBe(true);
            const stored = engine
              .getEvent({ drawId })
              .drawDefinition!.structures[0].matchUps!.find((m) => m.matchUpId === dual.matchUpId)!;
            expect(stored.winningSide, label).toBe(tally === 'clinched' ? 1 : undefined);
            if (tally === 'clinched') expect(stored.matchUpStatus).toBe('COMPLETED');
          } else {
            const missingPositions = profile === 'bracket' && shape === 'empty' && tally === 'tied';
            expect(result.error?.code, label).toBe(
              missingPositions ? 'ERR_MISSING_DRAW_POSITIONS' : 'ERR_MISSING_ASSIGNMENTS',
            );
            expect(JSON.stringify(getTournamentRecords()), label).toBe(before);
          }
        }
      }
    });
  });
});

it.each(modes)('advances the occupied team past a structural BYE in %s', (mode) => {
  for (const route of routes) {
    engine.reset();
    setOutcomePipeline(mode);
    mocks.generateTournamentRecord({
      drawProfiles: [{ drawId, eventType: 'TEAM', drawSize: 4, participantsCount: 3 }],
      nonRandom: 1,
      setState: true,
    });
    const structure = () => engine.getEvent({ drawId }).drawDefinition!.structures[0];
    const bye = structure().matchUps!.find((m) => m.matchUpStatus === 'BYE')!;
    const occupied = bye.drawPositions!.find((position) =>
      structure().positionAssignments!.some((a) => a.drawPosition === position && a.participantId),
    );
    expect(occupied).toBeTruthy();
    const params = { drawId, matchUpId: bye.matchUpId, outcome: { matchUpStatus: 'BYE' as const } };
    const result =
      route === 'direct'
        ? engine.setMatchUpStatus(params)
        : engine.executionQueue([{ method: 'setMatchUpStatus', params }], route === 'queue-on');
    expect(result.success).toBe(true);
    expect(structure().matchUps!.find((m) => m.matchUpId === bye.matchUpId)?.winningSide).toBeUndefined();
    expect(structure().matchUps!.find((m) => m.roundNumber === 2)?.drawPositions).toEqual([occupied]);
  }
});
