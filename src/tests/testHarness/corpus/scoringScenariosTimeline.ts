import { scoringEngineScenario, slug, type ScoringAction } from './scoringScenarios';
import { formatCell } from '../scoringConformance/formatCells';
import { parse } from '@Helpers/matchUpFormatCode/parse';

/**
 * Golden corpus SE3, the timeline: authored scenarios through the ScoringEngine class, one per area of
 * the spec's § 2 (the nine action types) and § 12 (undo and redo, the corrections, the record a host
 * saves). Every scenario records v1 as it behaves today, refusals included: the corpus records, the
 * spec judges. A scenario that pins behaviour the spec calls a v1 defect says so in its `ref`.
 *
 * Also here: one scenario per REFUSED matrix cell (segments of outs, spec § 8), showing point and game
 * input refused and set totals accepted. Their ids sit under `scoring/conformance/<cell>/refused/` beside
 * the conformance cases the other cells emit, so the coverage gate finds every cell the same way.
 */

const STANDARD = 'SET3-S:6/TB7';
const SUB_TIME = '2026-10-01T12:30:00.000Z';

/** Points, one per character, to side 1 or side 2: `points('1121')`. Spaces are ignored. */
export function points(spec: string, extra: Record<string, unknown> = {}): ScoringAction[] {
  return [...spec.replaceAll(' ', '')].map((side) => ({
    method: 'addPoint',
    params: { winner: side === '1' ? 0 : 1, ...extra },
  }));
}
const games = (winners: string) => [...winners].map((side) => (side === '1' ? '1111' : '2222')).join('');
const call = (method: string, params: Record<string, unknown> = {}): ScoringAction => ({ method, params });
const undo = (count = 1) => call('undo', { count });
const redo = (count = 1) => call('redo', { count });

type TimelineScenario = {
  name: string;
  ref: string;
  matchUpFormat: string;
  competitionFormat?: Record<string, any>;
  actions: ScoringAction[];
};

export const TIMELINE_SCENARIOS: TimelineScenario[] = [
  {
    name: 'undo-redo-points',
    ref: 'spec § 12.3: undo and redo move entries; a new point clears the redo stack; nothing to redo is false',
    matchUpFormat: STANDARD,
    actions: [...points('1121221112'), undo(), undo(3), redo(2), redo(5), undo(), ...points('2'), redo(), undo(0)],
  },
  {
    name: 'undo-redo-across-a-set',
    ref: 'spec § 12.3: undo and redo cross game and set boundaries as one timeline',
    matchUpFormat: STANDARD,
    actions: [...points(games('111111') + '12'), undo(3), redo(1), redo(2), undo(30), redo(30)],
  },
  {
    name: 'undo-on-an-empty-timeline',
    ref: 'spec § 12.3: undo returns false when there is nothing to undo; redo likewise',
    matchUpFormat: STANDARD,
    actions: [undo(), redo(), ...points('1'), undo(), undo()],
  },
  {
    name: 'edit-point',
    ref: 'spec § 12.4: editPoint in either spelling, recalculate:false deferred to the next rebuild, out of range a no-op, invalid data refused',
    matchUpFormat: STANDARD,
    actions: [
      ...points('11112222'),
      call('editPoint', { pointIndex: 2, data: { winner: 1 } }),
      call('editPoint', { pointIndex: 3, data: { winningSide: 2 } }),
      call('editPoint', { pointIndex: 0, data: { winner: 1 }, options: { recalculate: false } }),
      undo(),
      redo(),
      call('editPoint', { pointIndex: 99, data: { winner: 0 } }),
      call('editPoint', { pointIndex: 1, data: { winner: 5 } }),
      call('editPoint', { pointIndex: 1, data: { server: 1 } }),
    ],
  },
  {
    name: 'edit-point-completes-the-match',
    ref: 'spec § 12.4: an edit that changes a set or the match rebuilds everything after it',
    matchUpFormat: 'SET1-S:4/TB7',
    actions: [
      ...points(games('1112') + '2221'),
      call('editPoint', { pointIndex: 19, data: { winner: 0 } }),
      call('editPoint', { pointIndex: 19, data: { winner: 1 } }),
    ],
  },
  {
    name: 'remove-point',
    ref: 'spec § 12.4: removePoint removes the point and its entry and renumbers; out of range a no-op; it clears the redo stack',
    matchUpFormat: STANDARD,
    actions: [
      ...points('112211221'),
      call('removePoint', { pointIndex: 0 }),
      call('removePoint', { pointIndex: 4 }),
      undo(),
      call('removePoint', { pointIndex: 50 }),
      call('removePoint', { pointIndex: 1 }),
      redo(),
      call('removePoint', { pointIndex: 2, options: { recalculate: false } }),
      ...points('1'),
    ],
  },
  {
    name: 'decorate-point',
    ref: 'spec § 12.4: decoratePoint writes to the point and its entry without a rebuild and survives later rebuilds',
    matchUpFormat: STANDARD,
    actions: [
      ...points('1212'),
      call('decoratePoint', { pointIndex: 1, metadata: { rallyLength: 9, note: 'let called' } }),
      undo(),
      redo(),
      call('editPoint', { pointIndex: 0, data: { winner: 1 } }),
      call('decoratePoint', { pointIndex: 40, metadata: { note: 'out of range' } }),
      call('removePoint', { pointIndex: 0 }),
      call('reload'),
    ],
  },
  {
    name: 'substitution',
    ref: 'spec § 2.7: substitute from the next point on; four refusals return a result and record nothing; undo, redo and reload replay the lineUps',
    matchUpFormat: STANDARD,
    actions: [
      call('setLineUp', { sideNumber: 1, lineUp: [{ participantId: 'a1' }] }),
      call('setLineUp', { sideNumber: 2, lineUp: [{ participantId: 'b1' }] }),
      ...points('12'),
      call('substitute', { sideNumber: 1, outParticipantId: 'a1', inParticipantId: 'a2' }),
      ...points('11'),
      call('substitute', { sideNumber: 1, outParticipantId: 'a2', inParticipantId: 'a2' }),
      call('substitute', { sideNumber: 2, outParticipantId: 'a1', inParticipantId: 'b2' }),
      call('substitute', { sideNumber: 2, outParticipantId: 'b1', inParticipantId: 'a2' }),
      undo(3),
      redo(1),
      call('reload'),
      redo(2),
      call('substitute', { sideNumber: 2, outParticipantId: 'b1', inParticipantId: 'b2', timestamp: SUB_TIME }),
      ...points('2'),
      call('removePoint', { pointIndex: 0 }),
    ],
  },
  {
    name: 'substitution-without-a-lineup',
    ref: 'spec § 2.7: NO_LINEUP when the side has none',
    matchUpFormat: STANDARD,
    actions: [...points('1'), call('substitute', { sideNumber: 1, outParticipantId: 'a1', inParticipantId: 'a2' })],
  },
  {
    name: 'set-server-entry',
    ref: 'spec § 2.6, § 10.6: setServer is a timeline entry; one that changes nothing records nothing; a side not 0 or 1 is refused',
    matchUpFormat: STANDARD,
    actions: [
      call('setServer', { side: 1 }),
      ...points('1111'),
      ...points('12'),
      call('setServer', { side: 1 }),
      call('setServer', { side: 1 }),
      ...points('11'),
      undo(3),
      redo(3),
      call('setServer', { side: 2 }),
      call('reload'),
      undo(),
    ],
  },
  {
    name: 'set-server-attached',
    ref: 'spec § 2.6 (CA 2026-10-18): with recordEntry false the correction rides on the preceding entry and is undone with it; with nothing before it, it orients the next point only',
    matchUpFormat: STANDARD,
    actions: [
      call('setServer', { side: 1, options: { recordEntry: false } }),
      ...points('1'),
      call('setServer', { side: 0, options: { recordEntry: false } }),
      ...points('2'),
      undo(),
      undo(),
      redo(2),
      call('reload'),
      undo(2),
    ],
  },
  {
    name: 'set-initial-score',
    ref: 'spec § 2.5: a baseline with a set in play, a game in play and a server; points after it; undo removes it; a second baseline once scored is refused',
    matchUpFormat: STANDARD,
    actions: [
      call('setInitialScore', {
        sets: [{ side1Score: 6, side2Score: 4 }],
        currentSetScore: { side1Score: 3, side2Score: 2 },
        currentGameScore: { side1Points: 2, side2Points: 1 },
        server: 1,
      }),
      ...points('1122'),
      call('setInitialScore', { sets: [{ side1Score: 1, side2Score: 6 }] }),
      call('reload'),
      undo(5),
      redo(5),
    ],
  },
  {
    name: 'set-initial-score-decides-the-match',
    ref: 'spec § 2.5 rules 1, 2 and 6: a decided baseline completes the match; a status beside the sets that disagrees is refused',
    matchUpFormat: STANDARD,
    actions: [
      call('setInitialScore', { sets: [{ side1Score: 6, side2Score: 5 }], matchUpStatus: 'COMPLETED' }),
      call('setInitialScore', {
        sets: [
          { side1Score: 6, side2Score: 0 },
          { side1Score: 6, side2Score: 0 },
        ],
      }),
      ...points('2'),
      call('addGame', { winner: 1 }),
      call('addSet', { side1Score: 6, side2Score: 1 }),
      undo(),
    ],
  },
  {
    name: 'end-segment-timed-games',
    ref: 'spec § 2.4, § 6.4: endSegment closes the timed segment in play; reason is a free string; a closed segment is refused; undo and redo take it back',
    matchUpFormat: 'SET3-S:T10',
    actions: [
      call('addGame', { winner: 0 }),
      call('addGame', { winner: 0 }),
      call('addGame', { winner: 1 }),
      call('endSegment', { reason: 'bolt_expired' }),
      call('endSegment', { setNumber: 1 }),
      call('addGame', { winner: 1 }),
      undo(),
      undo(),
      redo(2),
      call('endSegment'),
      call('addGame', { winner: 0 }),
      call('endSegment'),
      call('endSegment'),
      undo(),
    ],
  },
  {
    name: 'end-segment-timed-points',
    ref: 'spec § 6.2, § 6.4, § 12.3: points in a points-based timed segment; endSegment level at time; point, point, undo, endSegment, redo',
    matchUpFormat: 'SET3-S:T10P',
    actions: [...points('12'), call('endSegment'), ...points('11'), undo(), call('endSegment'), redo(), call('reload')],
  },
  {
    name: 'end-segment-not-timed',
    ref: 'spec § 2.4 (CA 2026-10-18): endSegment ends timed segments only; refused on a standard set and on a tiebreak-only set',
    matchUpFormat: STANDARD,
    actions: [...points(games('12')), call('endSegment'), call('endSegment', { reason: 'mercy' })],
  },
  {
    name: 'add-game',
    ref: 'spec § 2.2: games build the set in play, a tiebreak game closes it, invalid facts are refused',
    matchUpFormat: STANDARD,
    actions: [
      ...'111111222222'.split('').map((side) => call('addGame', { winner: side === '1' ? 0 : 1 })),
      call('addGame', { winner: 0, tiebreakScore: [7, 5] }),
      call('addGame', { winner: 2 }),
      call('addGame', {}),
      undo(),
      redo(),
      ...points('1111'),
      call('addGame', { winner: 1 }),
      call('reload'),
      undo(2),
    ],
  },
  {
    name: 'add-game-tiebreak-only',
    ref: 'spec § 2.2, § 5: in a tiebreak-only segment a game is the segment won; tiebreakScore is checked against the race',
    matchUpFormat: 'SET3-S:TB10',
    actions: [
      call('addGame', { winner: 0, tiebreakScore: [10, 8] }),
      call('addGame', { winner: 1, tiebreakScore: [10, 8] }),
      call('addGame', { winner: 1, tiebreakScore: [9, 11] }),
      call('addGame', { winner: 0 }),
      call('addGame', { winner: 0 }),
    ],
  },
  {
    name: 'add-set',
    ref: 'spec § 2.3: finished totals take the rule winner, a winningSide for the loser is refused, an unfinished total is the set in play, set input after COMPLETED is ignored',
    matchUpFormat: STANDARD,
    actions: [
      call('addSet', { side1Score: 6, side2Score: 4 }),
      call('addSet', { side1Score: 6, side2Score: 7, winningSide: 1 }),
      call('addSet', { side1Score: 6, side2Score: 7, side1TiebreakScore: 5, side2TiebreakScore: 7 }),
      call('addSet', { side1Score: 3, side2Score: 1 }),
      undo(),
      call('addSet', { side1Score: 4, side2Score: 1, winningSide: 1 }),
      call('addSet', { side1Score: 6, side2Score: 0 }),
      call('addSet', { side1Score: -1, side2Score: 0 }),
      undo(),
      redo(),
    ],
  },
  {
    name: 'mixed-input-levels',
    ref: 'spec § 12.3: one timeline across set, game and point input; undo and redo cross the levels',
    matchUpFormat: STANDARD,
    actions: [
      call('addSet', { side1Score: 6, side2Score: 3 }),
      call('addGame', { winner: 1 }),
      call('addGame', { winner: 1 }),
      ...points('1112'),
      undo(6),
      redo(3),
      ...points('2'),
      call('reload'),
    ],
  },
  {
    name: 'after-completion',
    ref: 'spec § 9.6: a completed match takes no scoring input; a point, a game and a set total are ignored alike',
    matchUpFormat: 'SET1-S:4/TB7',
    actions: [
      ...points(games('1111')),
      ...points('2'),
      call('addGame', { winner: 1 }),
      call('addSet', { side1Score: 0, side2Score: 4 }),
    ],
  },
  {
    name: 'timed-match-ends-level',
    ref: 'spec § 6.4 (3), § 9.7 (decision 3): a match that ends level with no declared decider is COMPLETED without a winner; no undeclared segment is played',
    matchUpFormat: 'SET1-S:T10',
    actions: [
      call('addGame', { winner: 0 }),
      call('addGame', { winner: 1 }),
      call('endSegment'),
      call('addGame', { winner: 0 }),
    ],
  },
  {
    name: 'exactly-n-ends-level',
    ref: 'spec § 9.2, § 9.7 (decisions 7 and 18): exactly N takes no set beyond N; a level exactly-N match is COMPLETED without a winner',
    matchUpFormat: 'SET2X-S:T10P',
    actions: [
      ...points('1'),
      call('endSegment'),
      ...points('2'),
      call('endSegment'),
      call('addSet', { side1Score: 3, side2Score: 0 }),
      ...points('1'),
    ],
  },
  {
    name: 'point-values',
    ref: 'spec § 2.1, § 4.4 (decision 9): a scoreValue other than 1 is refused where a point is not a unit, and adds its value where it is',
    matchUpFormat: 'SET3-S:T10P',
    actions: [
      ...points('1', { scoreValue: 3 }),
      ...points('2'),
      call('editPoint', { pointIndex: 1, data: { scoreValue: 2 } }),
      undo(),
      redo(),
    ],
  },
  {
    name: 'point-value-refused',
    ref: 'spec § 4.4 (decision 9): a scoreValue other than 1 in a standard set is refused before anything is written',
    matchUpFormat: STANDARD,
    actions: [...points('1'), ...points('1', { scoreValue: 2 }), ...points('1', { scoreValue: 1 })],
  },
  {
    name: 'challenge-and-annotation',
    ref: 'spec § 2.8: challenges and annotations change no score, are replayed in place, and undo takes back whatever was recorded last',
    matchUpFormat: STANDARD,
    actions: [
      ...points('12'),
      call('addChallenge', { sideNumber: 1, line: 'baseline' }),
      ...points('1'),
      call('addAnnotation', { data: { note: 'rain delay' } }),
      call('addChallenge', { sideNumber: 3 }),
      undo(),
      redo(),
      call('addChallenge', { sideNumber: 2, timestamp: SUB_TIME }),
      call('addAnnotation', { data: { note: 'resumed' }, options: { timestamp: SUB_TIME } }),
      call('editPoint', { pointIndex: 0, data: { winner: 1 } }),
      call('reload'),
      undo(2),
    ],
  },
  {
    name: 'save-load-rebuild',
    ref: 'spec § 12.5: save the matchUp and the envelope, load both into a new engine, then undo and redo rebuild from the loaded timeline and redo stack',
    matchUpFormat: STANDARD,
    actions: [
      call('setLineUp', { sideNumber: 1, lineUp: [{ participantId: 'a1' }] }),
      call('setLineUp', { sideNumber: 2, lineUp: [{ participantId: 'b1' }] }),
      call('setServer', { side: 1 }),
      ...points(games('12') + '121'),
      call('substitute', { sideNumber: 2, outParticipantId: 'b1', inParticipantId: 'b2' }),
      call('addGame', { winner: 0 }),
      call('addChallenge', { sideNumber: 2 }),
      undo(3),
      call('reload'),
      redo(1),
      undo(1),
      redo(3),
      call('reload'),
      undo(),
      redo(),
    ],
  },
  {
    name: 'save-load-competition-format',
    ref: 'spec § 10.7, § 12.6 (6): the envelope carries the configuration the history was scored under; a rebuild after reload scores it the same way (WINNER_SERVES)',
    matchUpFormat: STANDARD,
    competitionFormat: { serverRule: 'WINNER_SERVES' },
    actions: [...points('1221'), call('reload'), undo(), redo(), ...points('2'), call('setServer', { side: 0 })],
  },
  {
    name: 'load-without-a-timeline',
    ref: 'spec § 12.6 (2): a legacy point-only record undoes and redoes by points; the first recorded action builds a timeline from its points',
    matchUpFormat: STANDARD,
    actions: [
      ...points('112212'),
      call('reloadWithoutTimeline'),
      undo(2),
      redo(1),
      ...points('1'),
      undo(),
      call('editPoint', { pointIndex: 0, data: { winner: 1 } }),
    ],
  },
];

/**
 * The refused cells (spec § 8): one format code from each, chosen from the matrix gate's harvest. Each
 * scenario offers a point and a game, both refused, then set totals, accepted.
 */
export const REFUSED_CELL_CODES = ['SET1-S:O3', 'HAL2A-S:O3', 'INN4XA-S:O3', 'INN4XA-S:O3-M:T50'];

function refusedCellScenario(matchUpFormat: string, cell: string) {
  return scoringEngineScenario({
    scenarioId: `scoring/conformance/${slug(cell)}/refused/${slug(matchUpFormat)}`,
    ref: `refused matrix cell ${cell}: ${matchUpFormat} refuses point and game input and takes set totals (spec § 8)`,
    matchUpFormat,
    tags: ['conformance', 'refused', slug(cell)],
    actions: [
      ...points('1'),
      call('addGame', { winner: 0 }),
      call('addSet', { side1Score: 2, side2Score: 1 }),
      call('addSet', { side1Score: 0, side2Score: 3 }),
      undo(),
      redo(),
    ],
  });
}

/** The matrix cell a format code falls in. */
export const cellOf = (code: string) => formatCell(parse(code)!);

export function timelineScenarios() {
  const timeline = TIMELINE_SCENARIOS.map(({ name, ref, matchUpFormat, competitionFormat, actions }) =>
    scoringEngineScenario({
      scenarioId: `scoring/timeline/${name}`,
      ref,
      matchUpFormat,
      competitionFormat,
      actions,
      tags: ['timeline'],
    }),
  );
  const refused = REFUSED_CELL_CODES.map((code) => refusedCellScenario(code, cellOf(code)));
  return [...timeline, ...refused];
}
