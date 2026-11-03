import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/**
 * THE OVERTIME SCOREBOARD AND SUDDEN-DEATH TABLES IN THE SCORING ENGINE SPEC ARE ITS SPECIFICATION.
 *
 * `documentation/docs/scoring-engine/scoring-engine-spec.md` § 9.8.1 lists scoreboard examples and the values every
 * sudden-death overtime point carries. This test reads both tables and replays them, so neither the page nor the
 * engine can change without the other.
 */

const page = fs.readFileSync('documentation/docs/scoring-engine/scoring-engine-spec.md', 'utf8');
const section = page.slice(page.indexOf('#### 9.8.1 '), page.indexOf('Undo/redo, corrections, supplementary-state'));

const unquote = (cell: string) => cell.trim().replace(/^`/, '').replace(/`$/, '');
const cells = (line: string) =>
  line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());

/** the body rows of the table whose header row starts with the given column name */
function tableRows(firstColumn: string): string[][] {
  const lines = section.split('\n');
  const header = lines.findIndex((line) => line.startsWith('|') && cells(line)[0] === firstColumn);
  const rows: string[][] = [];
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(cells(line));
  }
  return rows;
}

function enter(engine: ScoringEngine, entered: string) {
  if (entered === 'none') return;
  for (const step of unquote(entered).split(', ')) {
    const point = /^P([12])$/.exec(step);
    if (point) {
      engine.addPoint({ winner: (Number(point[1]) - 1) as 0 | 1 });
    } else {
      const [side1Score, side2Score] = step.split('-').map(Number);
      engine.addSet({ side1Score, side2Score } as any);
    }
  }
}

describe('overtime scoreboard examples', () => {
  const rows = tableRows('Format');
  it('the page has examples to replay', () => expect(rows.length).toBeGreaterThan(3));

  it.each(rows)('%s after %s reads %s', (format, entered, scoreboard) => {
    const engine = new ScoringEngine({ matchUpFormat: unquote(format) });
    enter(engine, entered);
    expect(engine.getScoreboard()).toEqual(unquote(scoreboard));
  });
});

describe('sudden-death overtime points', () => {
  const rows = tableRows('Field');
  const SUDDEN_DEATH = 'SET2XA-S:T10P-O:1SD/T5P';

  function suddenDeathPoint(server?: 0 | 1) {
    const engine = new ScoringEngine({ matchUpFormat: SUDDEN_DEATH });
    enter(engine, '3-2, 1-2');
    engine.addPoint({ winner: 0, ...(server === undefined ? {} : { server }) });
    const point: any = engine.getState().history?.points?.at(-1);
    return point;
  }

  it('the page lists every needed field', () => {
    expect(rows.map(([field]) => unquote(field))).toEqual([
      'pointsToGame',
      'pointsToSet',
      'pointsToMatch',
      'gamesToSet',
      'isBreakpoint',
    ]);
  });

  it.each(rows.filter(([field]) => unquote(field) !== 'isBreakpoint'))('%s is %s', (field, value) => {
    expect(suddenDeathPoint(0)[unquote(field)]).toEqual(JSON.parse(unquote(value)));
  });

  it('isBreakpoint is true whether the server is supplied or derived from the service order', () => {
    expect(suddenDeathPoint(0).isBreakpoint).toBe(true);
    expect(suddenDeathPoint().isBreakpoint).toBe(true);
  });
});
