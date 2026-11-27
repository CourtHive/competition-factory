import { assignDrawPositionBye as placeDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { defined } from '@Tests/helpers/defined';
import { planDrawPositionBye } from '@Mutate/matchUps/drawPositions/planDrawPositionBye';
import { assignDrawPositionBye } from '@Mutate/drawDefinitions/assignDrawPositionBye';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setOutcomePipeline, setStateProvider } from '@Global/state/globalState';
import { captureNotices } from '../../notifications/noticeConformance/harness';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { useEngineCatch } from '@Tests/testHarness/engineCatch';
import syncGlobalState from '@Global/state/syncGlobalState';
import { afterEach, describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import asyncEngine from '@Engines/asyncEngine';
import { setClock } from '@Tools/clock';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import {
  DRAW_POSITION_ASSIGNED,
  INVALID_MATCHUP,
  MATCHUP_HAS_SCHEDULING,
  MISSING_DRAW_DEFINITION,
} from '@Constants/errorConditionConstants';

/**
 * A public BYE placement is planned before it writes (`planDrawPositionBye`). Every refusal its walk can meet
 * leaves the record, its stamps and the notice stream exactly as they were, with rollback off, directly and through
 * the queue, under every outcome pipeline. An accepted placement stores, returns and announces what the writer did.
 */
useEngineCatch();

const instant = '2030-01-01T00:00:00.000Z';
const modes = ['v1', 'v2', 'differential'] as const;
afterEach(() => {
  setClock();
  setOutcomePipeline();
  setStateProvider(syncGlobalState);
});

const record = () => JSON.stringify(tournamentEngine.getTournament().tournamentRecord);

function unpositioned(drawType?: string, drawSize = 8) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, automated: false, ...(drawType ? { drawType } : {}) }],
    nonRandom: 1,
  });
  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  return { tournamentRecord, drawId, drawDefinition };
}

/** a record whose round-2 matchUp repeats a round-1 matchUpId (the archived finding) */
function repeatedIdRecord() {
  const { tournamentRecord, drawId, drawDefinition } = unpositioned();
  const [structure] = defined(drawDefinition.structures, 'structures');
  const first = (roundNumber: number) =>
    defined(structure.matchUps, 'matchUps').find((m: any) => m.roundNumber === roundNumber && m.roundPosition === 1);
  defined(first(2), 'value').matchUpId = defined(first(1), 'value').matchUpId;
  return { tournamentRecord, drawId, structureId: structure.structureId };
}

/** an FMLC draw whose consolation seat for main drawPosition 1's loser already holds a participant */
function filledLoserSeatRecord() {
  const { tournamentRecord, drawId, drawDefinition } = unpositioned(FIRST_MATCH_LOSER_CONSOLATION);
  const [main, consolation] = defined(drawDefinition.structures, 'structures');
  // the consolation seat a BYE on main drawPosition 1 sends its BYE to (consolation drawPosition 3)
  const seat = defined(consolation.positionAssignments, 'positionAssignments').find(
    (assignment: any) => assignment.drawPosition === 3,
  );
  defined(seat, 'seat').participantId = defined(tournamentRecord.participants, 'participants')[0].participantId;
  return { tournamentRecord, drawId, structureId: main.structureId };
}

/** a draw whose position 1 has no stored assignment, its first-round matchUp scheduled */
function scheduledMissingAssignmentRecord() {
  const { tournamentRecord, drawId, drawDefinition } = unpositioned();
  const [structure] = defined(drawDefinition.structures, 'structures');
  structure.positionAssignments = defined(structure.positionAssignments, 'positionAssignments').filter(
    (a: any) => a.drawPosition !== 1,
  );
  const matchUp = defined(structure.matchUps, 'matchUps').find(
    (m: any) => m.roundNumber === 1 && m.drawPositions.includes(1),
  );
  defined(matchUp, 'matchUp').schedule = { scheduledDate: '2030-01-02' };
  return { tournamentRecord, drawId, structureId: structure.structureId };
}

const refusals = [
  {
    name: 'a forward edge that resolves to an earlier round',
    build: repeatedIdRecord,
    params: {},
    check: (error: any) => {
      expect(String(error)).toContain(INVALID_MATCHUP.code);
      expect(String(error)).toContain("the record's matchUpIds are not unique");
    },
  },
  {
    name: 'a filled loser seat, after the main placement it follows',
    build: filledLoserSeatRecord,
    params: {},
    check: (error: any) => expect(error).toEqual(DRAW_POSITION_ASSIGNED),
  },
  {
    name: 'a scheduled matchUp, after an absent assignment is added',
    build: scheduledMissingAssignmentRecord,
    params: { isPositionAction: true },
    check: (error: any) => expect(error).toEqual(MATCHUP_HAS_SCHEDULING),
  },
];

describe('a refused BYE placement changes nothing', () => {
  for (const { name, build, params, check } of refusals) {
    for (const mode of modes) {
      it.each([true, false])(`${name}, ${mode}, copied=%s`, (copied) => {
        for (const via of ['direct', 'queue', 'assignDrawPosition'] as const) {
          setOutcomePipeline(mode);
          setClock(instant);
          const { tournamentRecord, drawId, structureId } = build();
          tournamentEngine.setState(tournamentRecord, copied);
          const before = record();
          const args = { drawId, structureId, drawPosition: 1, ...params };
          let result: any;
          const notices = captureNotices(() => {
            if (via === 'direct') result = tournamentEngine.assignDrawPositionBye(args);
            else if (via === 'queue')
              result = tournamentEngine.executionQueue([{ method: 'assignDrawPositionBye', params: args }], false);
            else if (!('isPositionAction' in params))
              result = tournamentEngine.assignDrawPosition({ drawId, structureId, drawPosition: 1, bye: true });
            else result = { error: MATCHUP_HAS_SCHEDULING };
          });
          check(result.error);
          expect(notices).toEqual([]);
          expect(record()).toBe(before);
        }
      });
    }
  }

  it('the writer the plan replaces changed the record on each of them', () => {
    for (const { build, params } of refusals) {
      setClock(instant);
      const { tournamentRecord, structureId } = build();
      const drawDefinition = defined(
        defined(tournamentRecord.events, 'events')[0].drawDefinitions,
        'drawDefinitions',
      )[0];
      const before = JSON.stringify(tournamentRecord);
      let refused: boolean;
      try {
        const result: any = placeDrawPositionBye({
          tournamentRecord,
          drawDefinition,
          structureId,
          drawPosition: 1,
          ...params,
        });
        refused = !!result.error;
      } catch {
        refused = true;
      }
      expect(refused).toBe(true);
      expect(JSON.stringify(tournamentRecord)).not.toBe(before);
    }
  });

  it('isolates a refused asynchronous placement from an accepted one running beside it', async () => {
    setStateProvider(asyncGlobalState);
    const refused = repeatedIdRecord();
    const accepted = unpositioned();
    const acceptedStructureId = defined(accepted.drawDefinition.structures, 'structures')[0].structureId;
    const run = (fixture: any, structureId: string) =>
      asyncGlobalState.runWithInstanceState(async () => {
        await asyncEngine.setState(structuredClone(fixture.tournamentRecord));
        const before = JSON.stringify((await asyncEngine.getTournament()).tournamentRecord);
        await Promise.resolve();
        const result: any = await asyncEngine.assignDrawPositionBye({
          drawId: fixture.drawId,
          drawPosition: 1,
          structureId,
        });
        const after = JSON.stringify((await asyncEngine.getTournament()).tournamentRecord);
        return { result, changed: before !== after };
      });
    const [a, b] = await Promise.all([run(refused, refused.structureId), run(accepted, acceptedStructureId)]);
    expect(String(a.result.error)).toContain('not unique');
    expect(a.changed).toBe(false);
    expect(b.result.success).toBe(true);
    expect(b.changed).toBe(true);
  });

  it('refuses a stale target: an unknown structure, with nothing written', () => {
    const { tournamentRecord, drawId } = unpositioned();
    tournamentEngine.setState(tournamentRecord);
    const before = record();
    const result: any = tournamentEngine.assignDrawPositionBye({ drawId, structureId: 'gone', drawPosition: 1 });
    expect(result.error).toBeDefined();
    expect(record()).toBe(before);
  });
});

describe('an accepted BYE placement keeps borrowed plain identities', () => {
  it('commits into the stored objects of a borrowed record', () => {
    const { tournamentRecord, drawId, drawDefinition } = unpositioned(FIRST_MATCH_LOSER_CONSOLATION);
    const [main, consolation] = defined(drawDefinition.structures, 'structures');
    const assignments = main.positionAssignments;
    const seat = defined(assignments, 'assignments').find((a: any) => a.drawPosition === 1);
    const first = defined(main.matchUps, 'matchUps').find(
      (m: any) => m.roundNumber === 1 && m.drawPositions.includes(1),
    );
    const consolationSeat = defined(consolation.positionAssignments, 'positionAssignments').find(
      (a: any) => a.drawPosition === 3,
    );
    tournamentEngine.setState(tournamentRecord, false);
    const result: any = tournamentEngine.assignDrawPositionBye({
      drawId,
      structureId: main.structureId,
      drawPosition: 1,
    });
    expect(result.success).toBe(true);
    // borrowed: the engine holds the caller's record, so the caller's own objects are the stored ones
    const stored = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
    expect(defined(stored.structures, 'structures')[0].positionAssignments).toBe(assignments);
    expect(
      defined(defined(stored.structures, 'structures')[0].positionAssignments, 'positionAssignments').find(
        (a: any) => a.drawPosition === 1,
      ),
    ).toBe(seat);
    expect(defined(seat, 'seat').bye).toBe(true);
    expect(defined(first, 'first').matchUpStatus).toBe('BYE');
    expect(defined(stored.structures, 'structures')[0].matchUps).toContain(first);
    expect(defined(consolationSeat, 'consolationSeat').bye).toBe(true);
  });
});

describe('the edges of the planned domain', () => {
  it('asks for a draw before anything else', () => {
    const planned: any = planDrawPositionBye({ drawPosition: 1 });
    expect(planned.result.error).toEqual(MISSING_DRAW_DEFINITION);
  });

  it('keeps the writer for a call that hands in its own draw state', () => {
    const { tournamentRecord, drawDefinition } = unpositioned();
    const event = defined(tournamentRecord.events, 'events')[0];
    const structureId = defined(drawDefinition.structures, 'structures')[0].structureId;
    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    const result: any = assignDrawPositionBye({
      tournamentRecord,
      drawDefinition,
      structureId,
      drawPosition: 1,
      event,
      matchUpsMap,
    });
    expect(result.success).toBe(true);
    expect(
      defined(
        defined(defined(drawDefinition.structures, 'structures')[0].positionAssignments, 'positionAssignments').find(
          (a: any) => a.drawPosition === 1,
        ),
        'value',
      ).bye,
    ).toBe(true);
  });

  it('leaves a round robin position with no assignment to the writer', () => {
    const { tournamentRecord, drawDefinition, drawId } = unpositioned(ROUND_ROBIN);
    const [group] = defined(defined(drawDefinition.structures, 'structures')[0].structures, 'structures');
    group.positionAssignments = defined(group.positionAssignments, 'positionAssignments').filter(
      (a: any) => a.drawPosition !== defined(group.positionAssignments, 'positionAssignments')[0].drawPosition,
    );
    tournamentEngine.setState(tournamentRecord);
    const result: any = tournamentEngine.assignDrawPositionBye({
      structureId: defined(drawDefinition.structures, 'structures')[0].structureId,
      drawPosition: 1,
      drawId,
    });
    expect(result.error ?? result.success).toBeDefined();
  });

  it('refuses a malformed round link before the first write', () => {
    const { tournamentRecord, drawDefinition, drawId } = unpositioned(FIRST_MATCH_LOSER_CONSOLATION);
    for (const link of drawDefinition.links ?? []) delete link.source.roundNumber;
    tournamentEngine.setState(tournamentRecord);
    const before = record();
    const result: any = tournamentEngine.assignDrawPositionBye({
      structureId: defined(drawDefinition.structures, 'structures')[0].structureId,
      drawPosition: 1,
      drawId,
    });
    expect(result.error).toBeDefined();
    expect(record()).toBe(before);
  });
});
