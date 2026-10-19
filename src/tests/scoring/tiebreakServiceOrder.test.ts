import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { isStandardSetTiebreak } from '@Tools/scoring/scoringUtilities';
import { describe, expect, it } from 'vitest';

import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/*
 * Tiebreak service order, against sequences written out from the rule rather than from the engine.
 * ITF Rules of Tennis 2026, Rule 5(b): the player whose turn it is to serve serves the first point of
 * the tiebreak; the opponent serves the next two; thereafter each serves two points in turn. The
 * player who served first in the tiebreak receives in the first game of the following set.
 *
 * Opener 0 → 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, …   Opener 1 → 1, 0, 0, 1, 1, 0, 0, 1, …
 */
const OPENER_0 = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0];
const OPENER_1 = OPENER_0.map((server) => 1 - server);

function engineFor(matchUpFormat: string): ScoringEngine {
  return new ScoringEngine({ matchUpFormat, matchUpId: 'tiebreak-service' });
}

// games won alternately, so the set reaches games-all with each side holding serve
function gamesAllIn(engine: ScoringEngine, games: number): void {
  for (let i = 0; i < games; i++) engine.addGame({ winner: (i % 2) as 0 | 1 });
}

/*
 * Plays `count` points and, before each one, reads every surface that names the server: the next-server
 * query, the score situation, and the server recorded on the point added without an explicit server.
 * A4: all three must agree at every point.
 */
function playTiebreak(engine: ScoringEngine, winners: number[]) {
  const nextServers: number[] = [];
  const situationServers: (number | undefined)[] = [];
  const isTiebreak: boolean[] = [];
  const preMatch: boolean[] = [];
  const firstPoint = engine.getState().history?.points.length ?? 0;
  for (const winner of winners) {
    nextServers.push(engine.getNextServer());
    preMatch.push(engine.getState().matchUpStatus === TO_BE_PLAYED);
    const situation = engine.getScore().situation;
    situationServers.push(situation?.server);
    isTiebreak.push(!!situation?.isTiebreak);
    engine.addPoint({ winner: winner as 0 | 1 });
  }
  const recorded = engine
    .getState()
    .history!.points.slice(firstPoint)
    .map((point) => point.server);
  return { nextServers, situationServers, recorded, isTiebreak, preMatch };
}

const alternating = (count: number) => Array.from({ length: count }, (_, i) => i % 2);

function expectServers(played: ReturnType<typeof playTiebreak>, expected: number[]) {
  expect(played.nextServers).toEqual(expected);
  // getScore reports no situation before the first point of a match
  expect(played.situationServers).toEqual(expected.map((server, i) => (played.preMatch[i] ? undefined : server)));
  expect(played.recorded).toEqual(expected);
}

describe('tiebreak service order (ITF Rule 5(b))', () => {
  it('a set tiebreak at 6-6: one opening serve, then two each', () => {
    const engine = engineFor('SET3-S:6/TB7');
    gamesAllIn(engine, 12);
    const played = playTiebreak(engine, alternating(8));
    expect(played.isTiebreak.every(Boolean)).toBe(true);
    expectServers(played, OPENER_0.slice(0, 8));
  });

  // Rule 5(b) is tennis's: a tiebreak-only format (squash, table tennis, pickleball and badminton shapes)
  // derives no server until each sport's own rule is added (spec § 10.2 rule 2; CA 2026-10-18, decision 17).
  // Pinned in serviceTiebreakOnlyFormats.test.ts; this rotation used to be applied to `SET1-S:TB7` here.
  it('a standalone tiebreak set derives no server, whichever side a setServer names', () => {
    const played = playTiebreak(engineFor('SET1-S:TB7'), alternating(6));
    expect(played.recorded).toEqual(new Array(6).fill(undefined));

    const engine = engineFor('SET1-S:TB7');
    engine.setServer(1);
    expect(playTiebreak(engine, alternating(6)).recorded).toEqual(new Array(6).fill(undefined));
    expect(engine.isServerDerived()).toBe(false);
  });

  it('a set tiebreak opened by side 2 after a setServer correction', () => {
    const engine = engineFor('SET3-S:6/TB7');
    gamesAllIn(engine, 12);
    engine.setServer(1);
    expectServers(playTiebreak(engine, alternating(6)), OPENER_1.slice(0, 6));
  });

  it('an extended tiebreak keeps rotating in pairs past 6-6', () => {
    const engine = engineFor('SET3-S:6/TB7');
    gamesAllIn(engine, 12);
    // 6-6 in points after 12, then alternating keeps it level through 16 points
    const played = playTiebreak(engine, alternating(16));
    expect(played.isTiebreak.every(Boolean)).toBe(true);
    expectServers(played, OPENER_0);
  });

  // R1: a final-set format that differs from the ordinary set used to stop the rotation entirely
  it('an ordinary-set tiebreak when the final set has no tiebreak (-F:6)', () => {
    const engine = engineFor('SET3-S:6/TB7-F:6');
    gamesAllIn(engine, 12);
    const played = playTiebreak(engine, alternating(6));
    expect(played.isTiebreak.every(Boolean)).toBe(true);
    expectServers(played, OPENER_0.slice(0, 6));
  });

  it('a final-set tiebreak at a different games-all (-F:4/TB7)', () => {
    const engine = engineFor('SET3-S:6/TB7-F:4/TB7');
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 1 });
    gamesAllIn(engine, 8);
    expect(engine.getScore().scoreString).toBe('6-0, 0-6, 4-4');
    const played = playTiebreak(engine, alternating(6));
    expect(played.isTiebreak.every(Boolean)).toBe(true);
    expectServers(played, OPENER_0.slice(0, 6));
  });

  it('a match tiebreak in lieu of the final set (-F:TB10)', () => {
    const engine = engineFor('SET3-S:6/TB7-F:TB10');
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 0 });
    for (let i = 0; i < 6; i++) engine.addGame({ winner: 1 });
    // 12 games played, so side 1 is due to serve and opens the match tiebreak
    expectServers(playTiebreak(engine, alternating(8)), OPENER_0.slice(0, 8));
  });

  it('the tiebreak opener receives in the first game of the next set', () => {
    const engine = engineFor('SET3-S:6/TB7');
    gamesAllIn(engine, 12);
    // side 1 opens the tiebreak and wins it 7-0
    playTiebreak(engine, new Array(7).fill(0));
    expect(engine.getScore().scoreString).toBe('7-6(0)');
    expect(engine.getNextServer()).toBe(1);
    engine.addPoint({ winner: 0 });
    expect(engine.getState().history!.points.at(-1)!.server).toBe(1);
  });

  it('survives undo, redo and reload, including a mid-tiebreak setServer correction', () => {
    const engine = engineFor('SET3-S:6/TB7');
    gamesAllIn(engine, 12);
    playTiebreak(engine, alternating(3)); // servers 0, 1, 1
    // the operator rules side 2 serves next instead of side 1: setServer flips the rotation from here,
    // so the pairs continue from the corrected server (1, 1) and then hand over (0)
    engine.setServer(1);
    playTiebreak(engine, alternating(3));
    const servers = engine.getState().history!.points.map((point) => point.server);
    expect(servers).toEqual([0, 1, 1, 1, 1, 0]);

    engine.undo();
    engine.undo();
    engine.redo();
    engine.redo();
    expect(engine.getState().history!.points.map((point) => point.server)).toEqual(servers);
    const next = engine.getNextServer();

    const reloaded = engineFor('SET3-S:6/TB7');
    reloaded.setState(engine.getState());
    reloaded.loadSupplementaryState(engine.getSupplementaryState());
    reloaded.addPoint({ winner: 0 });
    reloaded.undo();
    expect(reloaded.getState().history!.points.map((point) => point.server)).toEqual(servers);
    expect(reloaded.getNextServer()).toBe(next);
  });
});

/*
 * R2 resolution / A3: a timeline entry records `server` only when the caller supplied one. A calculated
 * server is a snapshot on the materialized point, and a rebuild re-derives it — so a record saved under
 * the old rotation is corrected on its next rebuild, while a caller-supplied server is kept as recorded.
 */
describe('tiebreak servers on records saved under the old rotation', () => {
  // a set tiebreak at six all: a tiebreak-only format derives no server (decision 17), so the rotation is
  // shown where Rule 5(b) still applies
  function legacyRecord() {
    const engine = engineFor('SET3-S:6/TB7');
    gamesAllIn(engine, 12);
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1, server: 0 }); // caller-supplied: the scorer saw side 1 serve
    engine.addPoint({ winner: 0 });
    engine.addPoint({ winner: 1 });
    const state = engine.getState();
    // the snapshot the old rule calculated: 0, 0, 1, 1 (the entry for point 2 carries its observed 0)
    state.history!.points.forEach((point, index) => (point.server = [0, 0, 1, 1][index] as 0 | 1));
    return state;
  }

  it('loads the snapshot as stored, and re-derives calculated servers on the next rebuild', () => {
    const engine = engineFor('SET3-S:6/TB7');
    engine.setState(legacyRecord());
    expect(engine.getState().history!.points.map((point) => point.server)).toEqual([0, 0, 1, 1]);

    engine.addPoint({ winner: 0 }); // an unrelated action, then undo → rebuild from the entries
    engine.undo();

    const entries = engine.getState().history!.entries!.filter((entry) => entry.type === 'point');
    expect(entries.map((entry) => entry.data.server ?? null)).toEqual([null, 0, null, null]);
    // point 2 keeps its observed server; the calculated ones follow Rule 5(b): 0, [0], 1, 0
    expect(engine.getState().history!.points.map((point) => point.server)).toEqual([0, 0, 1, 0]);
  });
});

describe('isStandardSetTiebreak', () => {
  it('reads the format it is given, with the defaults of a hand-built one', () => {
    // parsed: tiebreak at games-all of setTo, or at an explicit tiebreakAt
    expect(isStandardSetTiebreak({ setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } }, 6, 6)).toBe(true);
    expect(isStandardSetTiebreak({ setTo: 4, tiebreakAt: 3, tiebreakFormat: { tiebreakTo: 5 } }, 3, 3)).toBe(true);
    // hand-built with only a tiebreak format: games-all of setTo, and setTo defaults to 6
    expect(isStandardSetTiebreak({ setTo: 8, tiebreakFormat: { tiebreakTo: 7 } }, 8, 8)).toBe(true);
    expect(isStandardSetTiebreak({ tiebreakFormat: { tiebreakTo: 7 } }, 6, 6)).toBe(true);
    expect(isStandardSetTiebreak({ tiebreakFormat: { tiebreakTo: 7 } }, 5, 5)).toBe(false);
    // an advantage set, or no format at all, has no tiebreak
    expect(isStandardSetTiebreak({ setTo: 6, noTiebreak: true }, 6, 6)).toBe(false);
    expect(isStandardSetTiebreak(undefined, 6, 6)).toBe(false);
  });
});
