import { getTournamentRecords, setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { OUTCOME_PIPELINE_V2 } from '@Tests/testHarness/outcomeModes';

/**
 * A refusal changes nothing, however many tournament records the engine holds. The engine hands a call every record
 * it holds, so a call made with a second record loaded names two. Under v2 the whole call is first run on a copy
 * (`outcome/plan/recordedCall.ts`) and the copy's refusal is the call's refusal, met before the stored records are
 * touched. That copy was made only for a call naming one record: with two or more loaded, v1 ran on the stored record
 * and refused only after writing the result and the winner's advance.
 *
 * The case is a first-round-loser consolation draw of 16 where reversing a first-round result sends a participant to
 * a consolation seat they already hold (a swap of two decided first-round positions put them there), refused with
 * `ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT` once the result and the advance are written.
 *
 * Each case runs under v2, whichever pipeline the suite selects: every record reads as it did, and the engine holds the
 * very objects it held. A call made with `rollbackOnError` takes no snapshot under v2 and reports `rolledBack: true`,
 * which was said over the changed records too.
 */

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline();
});

const played = (winningSide: 1 | 2) => ({
  score: {
    sets: [1, 2].map((setNumber) => ({
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
      setNumber,
    })),
  },
  winningSide,
});

function setUp(recordCount: number) {
  setSubscriptions({ subscriptions: {} });
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 16 }],
  });
  const others = Array.from(
    { length: recordCount - 1 },
    () => mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] }).tournamentRecord,
  );
  tournamentEngine.setState([tournamentRecord, ...others]);
  tournamentEngine.setTournamentId(tournamentRecord.tournamentId);
  expect(Object.keys(getTournamentRecords()).length).toEqual(recordCount);

  const main = tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find((structure: any) => structure.structureName === 'Main');
  const firstRound = (roundPosition: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.find(
        (matchUp: any) =>
          matchUp.structureId === main.structureId &&
          matchUp.roundNumber === 1 &&
          matchUp.roundPosition === roundPosition,
      );
  const score = (roundPosition: number, winningSide: 1 | 2, rollbackOnError = false) => {
    const params = { matchUpId: firstRound(roundPosition).matchUpId, outcome: played(winningSide), drawId };
    if (!rollbackOnError) return tournamentEngine.setMatchUpStatus(params);
    return tournamentEngine.executionQueue([{ method: 'setMatchUpStatus', params }], true);
  };

  expect(score(4, 1).success).toEqual(true);
  expect(score(1, 2).success).toEqual(true);
  const swapped = tournamentEngine.swapDrawPositionAssignments({
    structureId: main.structureId,
    drawPositions: [1, 7],
    drawId,
  });
  expect(swapped.success).toEqual(true);
  return { score };
}

/** every object the engine holds, from each record down to its matchUps */
function heldObjects() {
  const held: object[] = [];
  for (const record of Object.values(getTournamentRecords()) as any[]) {
    held.push(record);
    for (const event of record.events ?? []) {
      held.push(event);
      for (const draw of event.drawDefinitions ?? []) {
        held.push(draw);
        for (const structure of draw.structures ?? []) held.push(structure, ...(structure.matchUps ?? []));
      }
    }
  }
  return held;
}

const cases = [1, 2, 3].flatMap((count) => [
  [count, false],
  [count, true],
]) as [number, boolean][];

it.each(cases)(
  'with %s record(s) loaded (rollbackOnError: %s), a refused loser seat leaves every record as it was',
  (count, rollbackOnError) => {
    setOutcomePipeline(OUTCOME_PIPELINE_V2);
    const { score } = setUp(count);
    const before = structuredClone(getTournamentRecords());
    const objects = heldObjects();

    const result: any = score(4, 2, rollbackOnError);

    expect(result.error?.code).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT.code);
    // a rollback that took no snapshot says it rolled back: true only where nothing was written
    if (rollbackOnError) expect(result.rolledBack).toEqual(true);
    expect(getTournamentRecords()).toEqual(before);
    const after = heldObjects();
    expect(after.length).toEqual(objects.length);
    after.forEach((object, at) => expect(object).toBe(objects[at]));
  },
);
