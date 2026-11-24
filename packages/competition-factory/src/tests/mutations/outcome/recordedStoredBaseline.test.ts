import {
  drawMatchUps,
  drawStructures,
  outsideAsStored,
  readBefore,
  snapshotBaseline,
  storedBaseline,
} from '@Mutate/matchUps/outcome/plan/recordedDiff';
import { getDifferentialTally, resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { firstPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { Recording } from '@Mutate/matchUps/outcome/recording';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { cloneState } from '@Tools/cloneState';
import { describe, expect, it } from 'vitest';

// constants and types
import { DOUBLE_ELIMINATION, ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { DRAW_CHILDREN, MATCHUP_CHILDREN, STRUCTURE_CHILDREN } from '@Mutate/matchUps/outcome/ops';
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/eventConstants';

/**
 * THE STORED RECORD IS THE READING (G4, 2026-11-24; `recordedDiff.ts` `storedBaseline`). A whole-call recording no longer
 * reads the copy's draw before v1 runs on it: what the run changed is measured against the stored record the copy was
 * made from. The claim is that the verdict is `readBefore`'s exactly, entity by entity. Held here two ways:
 * - by construction: a copy is made, read the old way, written the ways a writer can write (a field, a key holding
 *   undefined, a new object saying the same, a stored object taken into the copy, an array's length, a key's order, a
 *   shared object), and every entity's verdict is compared under both baselines; each case also names the entity it
 *   must find changed, so a baseline that called everything unchanged would fail;
 * - in `differential`, where `recordedCall.ts` holds the two to each other on every recorded call (`heldToReading`):
 *   draws are completed under it, and the tally proves the oracle compared, not that nothing was asked.
 */

type Fixture = { tournamentRecord: Tournament; drawDefinition: DrawDefinition; event: Event };

function fixture(drawType: string, eventType?: string, drawSize = 4): Fixture {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({});
  const drawId = 'baseline';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize, drawId, ...(eventType ? { eventType } : {}) }],
    completeAllMatchUps: true,
    randomWinningSide: false,
  });
  const event = tournamentRecord.events?.[0] as Event;
  const drawDefinition = event.drawDefinitions?.[0] as DrawDefinition;
  return { tournamentRecord, drawDefinition, event };
}

const entities = (drawDefinition: DrawDefinition): [object, string[]][] => [
  ...drawMatchUps(drawDefinition).map((matchUp): [object, string[]] => [matchUp, MATCHUP_CHILDREN]),
  ...drawStructures(drawDefinition).map((structure): [object, string[]] => [structure, STRUCTURE_CHILDREN]),
  [drawDefinition, DRAW_CHILDREN],
];

/** copy `stored`, read the copy the old way, write it, and return each entity's verdict under both baselines */
function verdicts(stored: Fixture, write: (copy: Fixture, stored: Fixture) => void) {
  const { copy, originals } = cloneState(stored);
  const reading = snapshotBaseline(readBefore(copy.drawDefinition));
  const fromStored = storedBaseline(originals);
  write(copy, stored);
  return entities(copy.drawDefinition).map(([entity, children]) => ({
    id: String((entity as any).matchUpId ?? (entity as any).structureId ?? (entity as any).drawId),
    reading: reading.unchanged(entity, children),
    stored: fromStored.unchanged(entity, children),
  }));
}

const firstMatchUp = (fixture: Fixture) => drawMatchUps(fixture.drawDefinition)[0] as any;
const secondMatchUp = (fixture: Fixture) => drawMatchUps(fixture.drawDefinition)[1] as any;

const WRITES: {
  label: string;
  prepare?: (stored: Fixture) => void;
  write: (copy: Fixture, stored: Fixture) => void;
  changed?: (copy: Fixture) => string;
}[] = [
  { label: 'nothing written', write: () => undefined },
  {
    label: 'a field',
    write: (copy) => (firstMatchUp(copy).matchUpStatus = 'IN_PROGRESS'),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'a key holding undefined, new',
    write: (copy) => (firstMatchUp(copy).notAKey = undefined),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'a new object saying the same',
    write: (copy) => (firstMatchUp(copy).score = structuredClone(firstMatchUp(copy).score)),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'a stored object taken into the copy',
    write: (copy, stored) => (firstMatchUp(copy).score = firstMatchUp(stored).score),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: "an array's length",
    write: (copy) => (firstMatchUp(copy).drawPositions.length += 1),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'a key deleted',
    write: (copy) => delete firstMatchUp(copy).score,
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: "a key's order",
    write: (copy) => {
      const { matchUpStatus } = firstMatchUp(copy);
      delete firstMatchUp(copy).matchUpStatus;
      firstMatchUp(copy).matchUpStatus = matchUpStatus;
    },
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'a shared object kept shared',
    prepare: (stored) => (secondMatchUp(stored).notes = firstMatchUp(stored).notes = { testing: 'shared' }),
    write: (copy) => (secondMatchUp(copy).notes = firstMatchUp(copy).notes),
  },
  {
    label: 'a shared object written through',
    prepare: (stored) => (secondMatchUp(stored).notes = firstMatchUp(stored).notes = { testing: 'shared' }),
    write: (copy) => (firstMatchUp(copy).notes.testing = 'written'),
    changed: (copy) => secondMatchUp(copy).matchUpId,
  },
  {
    label: 'a shared object split in two',
    prepare: (stored) => (secondMatchUp(stored).notes = firstMatchUp(stored).notes = { testing: 'shared' }),
    write: (copy) => (secondMatchUp(copy).notes = { ...firstMatchUp(copy).notes }),
    changed: (copy) => secondMatchUp(copy).matchUpId,
  },
  {
    label: 'a value JSON cannot tell, unwritten (NaN, a function)',
    prepare: (stored) => Object.assign(firstMatchUp(stored), { nan: Number.NaN, fn: () => 'held by reference' }),
    write: () => undefined,
  },
  // JSON drops a function and objectsOf lists none: the reading calls this unchanged, and so must the stored record
  {
    label: 'a function replaced by another',
    prepare: (stored) => Object.assign(firstMatchUp(stored), { fn: () => 'one' }),
    write: (copy) => (firstMatchUp(copy).fn = () => 'another'),
  },
  {
    label: 'a number made NaN',
    prepare: (stored) => (firstMatchUp(stored).counted = 1),
    write: (copy) => (firstMatchUp(copy).counted = Number.NaN),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  // JSON writes both as null: the reading calls this unchanged
  {
    label: 'an infinity made the other',
    prepare: (stored) => (firstMatchUp(stored).counted = Number.POSITIVE_INFINITY),
    write: (copy) => (firstMatchUp(copy).counted = Number.NEGATIVE_INFINITY),
  },
  {
    label: 'null made undefined',
    prepare: (stored) => (firstMatchUp(stored).held = null),
    write: (copy) => (firstMatchUp(copy).held = undefined),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'an object made a primitive',
    write: (copy) => (firstMatchUp(copy).score = 'none'),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'a primitive made an object',
    write: (copy) => (firstMatchUp(copy).matchUpStatus = { matchUpStatus: firstMatchUp(copy).matchUpStatus }),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: 'a function replaced, then a field written after it',
    prepare: (stored) => Object.assign(firstMatchUp(stored), { fn: () => 'one', after: 'kept' }),
    write: (copy) => Object.assign(firstMatchUp(copy), { fn: () => 'another', after: 'written' }),
    changed: (copy) => firstMatchUp(copy).matchUpId,
  },
  {
    label: "a structure's own field",
    write: (copy) => ((copy.drawDefinition.structures as any)[0].structureName = 'renamed'),
    changed: (copy) => (copy.drawDefinition.structures as any)[0].structureId,
  },
  {
    label: "the draw's own field",
    write: (copy) => ((copy.drawDefinition as any).drawName = 'renamed'),
    changed: (copy) => copy.drawDefinition.drawId,
  },
];

describe('storedBaseline gives readBefore’s verdict', () => {
  for (const [drawType, eventType] of [[DOUBLE_ELIMINATION], [ROUND_ROBIN, TEAM]] as [string, string?][])
    for (const { label, prepare, write, changed } of WRITES)
      it(`${[drawType, eventType].filter(Boolean).join(' ')}: ${label}`, () => {
        const stored = fixture(drawType, eventType, drawType === DOUBLE_ELIMINATION ? 16 : 4);
        prepare?.(stored);
        const results = verdicts(stored, write);
        // CONTROL: the draw was read, entity by entity
        expect(results.length).toBeGreaterThan(5);
        expect(results.filter(({ reading, stored }) => reading !== stored)).toEqual([]);
        const found = results.filter(({ reading }) => !reading).map(({ id }) => id);
        if (changed) {
          const { copy } = cloneState(stored);
          write(copy, stored);
          expect(found).toContain(changed(copy));
        } else expect(found).toEqual([]);
      });
});

describe('outsideAsStored gives the text comparison’s verdict', () => {
  const text = ({ tournamentRecord, event, drawDefinition }: Fixture) =>
    JSON.stringify({ tournamentRecord, event }, (_key, value) => (value === drawDefinition ? 0 : value));
  const CASES: [string, (copy: Fixture) => void, boolean][] = [
    ['nothing written', () => undefined, true],
    ['only the draw written', (copy) => ((copy.drawDefinition as any).drawName = 'renamed'), true],
    ['a participant renamed', (copy) => ((copy.tournamentRecord.participants as any)[0].participantName = 'x'), false],
    ['an event field', (copy) => ((copy.event as any).eventName = 'renamed'), false],
    [
      'an equal new object outside the draw',
      (copy) => ((copy.tournamentRecord as any).participants = structuredClone(copy.tournamentRecord.participants)),
      true,
    ],
    ['the draw moved off the event', (copy) => (copy.event.drawDefinitions as any).pop(), false],
    [
      'a participant field made undefined',
      (copy) => ((copy.tournamentRecord.participants as any)[0].participantName = undefined),
      false,
    ],
    ['an outside primitive made an object', (copy) => ((copy.event as any).eventName = { eventName: 'x' }), false],
  ];
  for (const [label, write, expected] of CASES)
    it(label, () => {
      const stored = fixture(DOUBLE_ELIMINATION);
      const { copy, originals } = cloneState(stored);
      const before = text(copy);
      write(copy);
      expect(text(copy) === before).toEqual(expected);
      expect(outsideAsStored({ originals, copied: copy, stored })).toEqual(expected);
    });
});

it('a draw holding a Date is read before the run: cloneState copies each Date where it finds it', () => {
  const stored = fixture(DOUBLE_ELIMINATION);
  expect(new Recording(cloneState(stored).copy.drawDefinition).holdsDate).toEqual(false);
  (firstMatchUp(stored) as any).at = new Date(0);
  expect(new Recording(cloneState(stored).copy.drawDefinition).holdsDate).toEqual(true);
});

it('in differential, the oracle holds the stored baseline to the reading on every recorded call', () => {
  const { outcome } = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({});
  const drawId = 'oracle';
  const generated: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, eventType: TEAM, drawSize: 4, drawId }],
    setState: true,
  });
  expect(generated.drawIds).toContain(drawId);
  expect(tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId }).success).toEqual(
    true,
  );
  resetDifferentialTally();
  setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
  let entered = 0;
  const skip = new Set<string>();
  for (let guard = 0; guard < 500; guard++) {
    const target = firstPlayable(getDrawMatchUps(drawId), skip);
    if (!target) break;
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, outcome, drawId });
    if (result.success) entered += 1;
    else skip.add(target.matchUpId);
  }
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  const tally = getDifferentialTally();
  // CONTROL: the draw was played, and the recorder was asked on it: a green run that compared nothing proves nothing
  expect(entered).toBeGreaterThan(20);
  expect(tally['recorder:baseline']?.compared).toBeGreaterThan(100);
  expect(tally['recorder:outside']?.compared).toBeGreaterThan(5);
});
