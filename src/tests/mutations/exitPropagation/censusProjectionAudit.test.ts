import { auditAcceptedRecord, createProjectionAudit } from '@Tests/testHarness/exitPropagation/projectionAudit';
import { replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { emptyCoverage } from '@Tests/testHarness/exitPropagation/properties';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it, vi } from 'vitest';
import { captureRecord } from '@Tools/recordDiff';

// constants and types
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const config = { drawType: SINGLE_ELIMINATION, propagateExitStatus: true, participantsCount: 8, drawSize: 8, seed: 42 };

afterEach(() => vi.restoreAllMocks());

it('reports planted accepted notes through replay even when outcome fields also change', () => {
  setSubscriptions({});
  const setMatchUpStatus = tournamentEngine.setMatchUpStatus;
  vi.spyOn(tournamentEngine, 'setMatchUpStatus').mockImplementation((params) => {
    let result: any = setMatchUpStatus(params);
    const { tournamentRecord } = tournamentEngine.getTournament();
    const matchUp = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0];
    matchUp.notes = (matchUp.notes ?? '') + 'planted';
    tournamentEngine.setState(tournamentRecord);
    return result;
  });
  const coverage = emptyCoverage();
  const audit = createProjectionAudit(config.seed, 1);
  expect(replay(config, [], 'accepted-notes', undefined, coverage, audit)).toBeNull();
  expect(audit.accepted).toEqual(15);
  expect(audit.sampled).toEqual(15);
  expect(audit.projectionChanged).toBeGreaterThan(0);
  expect(audit.projectionMisses).toBeGreaterThan(0);
  expect(audit.omittedFields['/events/*/drawDefinitions/*/structures/*/matchUps/*/notes']).toEqual(15);
  expect(coverage.projectionAudit.omittedFields).toEqual(audit.omittedFields);
});

it('samples one in N accepted calls at a seed-specific offset without shared process state', () => {
  const run = () => {
    const audit = createProjectionAudit(6, 4);
    for (let index = 1; index <= 12; index++)
      auditAcceptedRecord({
        audit,
        before: captureRecord({ notes: 'before' }),
        record: { notes: `after-${index}` },
        drawId: 'draw',
        projectionChanged: false,
      });
    return audit;
  };
  const audit = run();
  expect(audit).toEqual(run());
  expect(audit.accepted).toEqual(12);
  expect(audit.sampled).toEqual(3);
  expect(audit.examples.map((example) => example.acceptedCall)).toEqual([3, 7, 11]);
});

it('recognizes projected fields only on structure matchUps in the target draw', () => {
  const makeRecord = (winningSide: number) => ({
    events: [
      {
        drawDefinitions: [
          {
            drawId: 'draw',
            structures: [
              {
                matchUps: [{ winningSide, tieMatchUps: [{ winningSide }] }],
                positionAssignments: [{ drawPosition: 1, updatedAt: String(winningSide) }],
              },
            ],
          },
          { drawId: 'other', structures: [{ matchUps: [{ winningSide }] }] },
        ],
      },
    ],
  });
  const audit = createProjectionAudit(1, 1);
  auditAcceptedRecord({
    audit,
    before: captureRecord(makeRecord(1)),
    record: makeRecord(2),
    drawId: 'draw',
    projectionChanged: true,
  });
  expect(audit.omittedWrites).toEqual(3);
  expect(audit.omittedFields['/events/*/drawDefinitions/*/structures/*/matchUps/*/tieMatchUps/*/winningSide']).toEqual(
    1,
  );
  expect(audit.omittedFields['/events/*/drawDefinitions/*/structures/*/positionAssignments/*/updatedAt']).toEqual(1);
  expect(audit.omittedFields['/events/*/drawDefinitions/*/structures/*/matchUps/*/winningSide']).toEqual(1);
});

it('reports an unknown field rather than silently treating it as covered', () => {
  const audit = createProjectionAudit(0, 1);
  auditAcceptedRecord({
    audit,
    before: captureRecord({}),
    record: { futureField: true },
    drawId: 'draw',
    projectionChanged: false,
  });
  expect(audit.omittedFields).toEqual({ '/futureField': 1 });
});

it.each([0, -1, 1.5, Number.NaN])('refuses an invalid sample interval %s', (every) => {
  expect(() => createProjectionAudit(42, every)).toThrow(/positive integer/);
});
