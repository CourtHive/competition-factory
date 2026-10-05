import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { describe, expect, test } from 'vitest';

// A completed match takes no more points, but it does take corrections. A point played after the
// match is decided is not recorded at all; a penaltyType or an annotation added to a point already
// played is, on any point, and it survives every later rebuild of the score.

const FORMAT = 'SET1-S:TB5'; // one tiebreak set to 5: five straight points complete the match

function completedMatch() {
  const onPoint: any[] = [];
  const engine = new ScoringEngine({ matchUpFormat: FORMAT });
  engine.setEventHandlers({ onPoint: (ctx) => onPoint.push(ctx) });
  for (let i = 0; i < 5; i++) engine.addPoint({ winner: 0 });
  expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
  return { engine, onPoint };
}

const points = (engine: ScoringEngine): any[] => engine.getState().history?.points ?? [];

describe('a point the scorer ignores records nothing', () => {
  test('a point after the match is COMPLETED leaves no entry, no event and no stamp', () => {
    const { engine, onPoint } = completedMatch();
    const before = engine.getState();

    engine.addPoint({ winner: 1, penaltyType: 'Ball Abuse' });

    const after = engine.getState();
    expect(after.history?.points.length).toEqual(5);
    expect(after.history?.entries?.length).toEqual(before.history?.entries?.length);
    expect(engine.getUndoDepth()).toEqual(5);
    expect(onPoint.length).toEqual(5);
    expect(points(engine)[4].penaltyType).toBeUndefined();
    expect(after.score).toEqual(before.score);
  });

  test('so an undo after it undoes the last point played, not a phantom', () => {
    const { engine } = completedMatch();
    engine.addPoint({ winner: 1 });

    engine.undo();

    expect(points(engine).length).toEqual(4);
    expect(engine.getState().matchUpStatus).not.toEqual(COMPLETED);
  });

  test('a point naming no winner leaves no entry either', () => {
    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.addPoint({ winner: 0 });

    engine.addPoint({ penaltyType: 'Ball Abuse' });

    expect(engine.getState().history?.entries?.length).toEqual(1);
    expect(points(engine)[0].penaltyType).toBeUndefined();
  });
});

describe('a completed match takes per-point corrections', () => {
  test('any point can be given a penaltyType by editPoint, and the result stands', () => {
    const { engine } = completedMatch();
    const score = engine.getState().score;

    engine.editPoint(1, { penaltyType: 'Coaching' });

    expect(points(engine)[1].penaltyType).toEqual('Coaching');
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
    expect(engine.getState().score).toEqual(score);
  });

  test('a decoration survives a later recalculating edit', () => {
    const { engine } = completedMatch();

    engine.decoratePoint(2, { penaltyType: 'Ball Abuse', annotation: 'racquet thrown' });
    engine.editPoint(3, { rallyLength: 9 });

    expect(points(engine)[2].penaltyType).toEqual('Ball Abuse');
    expect(points(engine)[2].annotation).toEqual('racquet thrown');
  });

  test('the edited field itself survives the recalculation it triggers', () => {
    const { engine } = completedMatch();

    engine.editPoint(3, { rallyLength: 9 });

    expect(points(engine)[3].rallyLength).toEqual(9);
  });

  test('a correction survives undo and redo', () => {
    const { engine } = completedMatch();
    engine.editPoint(0, { penaltyType: 'Coaching' });
    engine.decoratePoint(1, { annotation: 'challenged' });

    engine.undo();
    engine.redo();

    expect(points(engine)[0].penaltyType).toEqual('Coaching');
    expect(points(engine)[1].annotation).toEqual('challenged');
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
  });

  test('an edit made without recalculating is applied by the next rebuild', () => {
    const { engine } = completedMatch();

    engine.editPoint(0, { penaltyType: 'Coaching' }, { recalculate: false });
    engine.editPoint(4, { rallyLength: 3 });

    expect(points(engine)[0].penaltyType).toEqual('Coaching');
  });
});

describe('a winner edited in either spelling', () => {
  test('winningSide reverses a point that was played with winner', () => {
    const { engine } = completedMatch();

    engine.editPoint(0, { winningSide: 2 });

    expect(points(engine)[0].winner).toEqual(1);
    expect(points(engine)[0].winningSide).toEqual(2);
    expect(engine.getState().matchUpStatus).not.toEqual(COMPLETED);
  });

  test('without recalculating, the point carries both spellings of the new winner', () => {
    const { engine } = completedMatch();

    engine.editPoint(0, { winner: 1 }, { recalculate: false });

    expect(points(engine)[0].winner).toEqual(1);
    expect(points(engine)[0].winningSide).toEqual(2);
  });
});

describe('a matchUp loaded without a timeline', () => {
  test('a penaltyType survives a recalculating edit, replayed from the points', () => {
    const { engine: scored } = completedMatch();
    const matchUp = scored.getState();
    delete matchUp.history?.entries;

    const engine = new ScoringEngine({ matchUpFormat: FORMAT });
    engine.setState(matchUp);
    engine.editPoint(1, { penaltyType: 'Coaching' });
    engine.editPoint(3, { rallyLength: 9 });

    expect(points(engine)[1].penaltyType).toEqual('Coaching');
    expect(points(engine)[3].rallyLength).toEqual(9);
    expect(engine.getState().matchUpStatus).toEqual(COMPLETED);
  });
});
