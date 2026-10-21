import { REFUSED_CELL_CODES, cellOf, timelineScenarios } from '../testHarness/corpus/scoringScenariosTimeline';
import { FORMAT_MATRIX } from '../scoring/conformance/formatMatrix';
import { slug } from '../testHarness/corpus/scoringScenarios';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/**
 * The SE3 gate (ScoringEngine v2 plan, § 3 SE3, "done when every action type and every matrix cell
 * appears in at least one pinned scenario"). Pinned means in `corpus/MANIFEST.txt`, the list
 * `pnpm verify:corpus-manifest` holds the corpus to.
 *
 * - Every timeline action type of the spec's § 2, every correction of § 12.3–12.4, and the save/load
 *   round trip of § 12.5 must be ACCEPTED (not refused) in at least one timeline scenario whose id is
 *   pinned. `setServer` counts twice: as its own entry and with `recordEntry: false` (§ 2.6).
 * - Every cell of the conformance matrix must have a pinned scenario under
 *   `scoring/conformance/<cell>/`: an emitted conformance case, or, for a refused cell, the authored
 *   refusal scenario.
 */
const pinned = new Set(
  fs
    .readFileSync('corpus/MANIFEST.txt', 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split(/\s+/)[0]),
);

/** What the gate requires, each with the directive that shows it and a test on its params. */
const REQUIRED: Record<string, { method: string; when?: (params: any) => boolean }> = {
  point: { method: 'addPoint' },
  game: { method: 'addGame' },
  set: { method: 'addSet' },
  endSegment: { method: 'endSegment' },
  setInitialScore: { method: 'setInitialScore' },
  setServer: { method: 'setServer', when: (params) => params.options?.recordEntry !== false },
  'setServer(recordEntry: false)': { method: 'setServer', when: (params) => params.options?.recordEntry === false },
  substitution: { method: 'substitute' },
  challenge: { method: 'addChallenge' },
  annotation: { method: 'addAnnotation' },
  undo: { method: 'undo' },
  redo: { method: 'redo' },
  editPoint: { method: 'editPoint' },
  removePoint: { method: 'removePoint' },
  decoratePoint: { method: 'decoratePoint' },
  'save/load/rebuild': { method: 'reload' },
};

/** An accepted step: not refused, and for a scoring action, recorded. */
function accepted(step: any) {
  if (!step.result.success) return false;
  const returned = step.result.value?.returned;
  if (returned && typeof returned === 'object' && 'recorded' in returned) return returned.recorded === true;
  if (returned && typeof returned === 'object' && 'success' in returned) return returned.success === true;
  return returned !== false;
}

describe('scoring corpus coverage gate (SE3)', () => {
  it('pins every timeline action type, every correction and save/load/rebuild', () => {
    const scenarios = timelineScenarios().filter((scenario) => pinned.has(scenario.scenarioId));
    const uncovered = Object.entries(REQUIRED)
      .filter(([, { method, when }]) => {
        const shows = (step: any) =>
          step.directive.method === method && (!when || when(step.directive.params)) && accepted(step);
        return !scenarios.some((scenario) => scenario.steps.some(shows));
      })
      .map(([name]) => name);
    expect(uncovered.join(', ')).toEqual('');
  });

  it('pins a scenario for every matrix cell', () => {
    const cells = Object.keys(FORMAT_MATRIX);
    // the slug is the cell's address in a scenario id, so two cells must never share one
    expect(new Set(cells.map(slug)).size).toEqual(cells.length);
    const ids = [...pinned];
    const unpinned = cells.filter((cell) => !ids.some((id) => id.startsWith(`scoring/conformance/${slug(cell)}/`)));
    expect(unpinned.join('\n')).toEqual('');
  });

  it('pins the refusal of every refused cell, from a code in that cell', () => {
    const refusedCells = Object.entries(FORMAT_MATRIX)
      .filter(([, entry]) => entry.status === 'refused')
      .map(([cell]) => cell);
    expect(REFUSED_CELL_CODES.map(cellOf).toSorted()).toEqual(refusedCells.toSorted());
    const ids = [...pinned];
    const unpinned = refusedCells.filter(
      (cell) => !ids.some((id) => id.startsWith(`scoring/conformance/${slug(cell)}/refused/`)),
    );
    expect(unpinned.join('\n')).toEqual('');

    // each shows what the cell is refused for: a point and a game refused, a set total accepted
    for (const scenario of timelineScenarios().filter((s) => s.scenarioId.includes('/refused/'))) {
      const outcome = (method: string) =>
        scenario.steps.find((step: any) => step.directive.method === method)?.result.error ? 'refused' : 'accepted';
      expect({
        id: scenario.scenarioId,
        point: outcome('addPoint'),
        game: outcome('addGame'),
        set: outcome('addSet'),
      }).toEqual({
        id: scenario.scenarioId,
        point: 'refused',
        game: 'refused',
        set: 'accepted',
      });
    }
  });
});
