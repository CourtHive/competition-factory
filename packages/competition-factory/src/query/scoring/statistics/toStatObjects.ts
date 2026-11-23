/**
 * StatObject Adapter
 *
 * Transforms MatchStatistics (counters + calculated) into StatObject[]
 * for display in visualization components (e.g., statView bar chart).
 *
 * This is the bridge between factory's statistics engine and display layers.
 */

import { MatchStatistics, StatCounters, CalculatedStat, StatObject } from './types';

// ── Helpers ──────────────────────────────────────────────────────

/** Get count from counters for a given team and category */
function ct(counters: StatCounters, team: number, category: string): number {
  return counters.teams[team]?.[category]?.length ?? 0;
}

/** Calculate percentage, matching scoringVisualizations' cpct() */
function pct(num: number, den: number): number {
  if (!den || !num) return 0;
  return Number.parseFloat(((num / den) * 100).toFixed(2));
}

/** Look up a calculated stat value by category name */
function calcValue(calculated: CalculatedStat[], category: string, team: number): number {
  const stat = calculated.find((s) => s.category === category);
  return stat?.teams[team]?.value ?? 0;
}

// ── Adapter ─────────────────────────────────────────────────────

/**
 * Convert MatchStatistics to display-ready StatObject array.
 *
 * Produces the same statistics in the same order as scoringVisualizations'
 * computeMatchStats(), enabling drop-in replacement.
 *
 * @param stats - MatchStatistics from factory's statistics engine
 * @returns StatObject[] for statView / matchDashboard consumption
 */
export function toStatObjects(stats: MatchStatistics): StatObject[] {
  if (!stats?.counters?.teams) return [];

  const { counters, calculated } = stats;
  const so: StatObject[] = [];

  // ── Aces ──────────────────────────────────────────────────────
  so.push(
    {
      name: 'Aces',
      numerator: [ct(counters, 0, 'aces'), ct(counters, 1, 'aces')],
      default: 'numerator',
    },
    {
      // ── Double Faults ─────────────────────────────────────────────
      name: 'Double Faults',
      numerator: [ct(counters, 0, 'doubleFaults'), ct(counters, 1, 'doubleFaults')],
      default: 'numerator',
    },
  );

  // ── 1st/2nd Serve breakdown (conditional) ─────────────────────
  const serves1stWon = [ct(counters, 0, 'serves1stWon'), ct(counters, 1, 'serves1stWon')] as [number, number];
  const servesWon = [ct(counters, 0, 'servesWon'), ct(counters, 1, 'servesWon')] as [number, number];

  const hasServeBreakdown =
    serves1stWon[0] + serves1stWon[1] > 0 && (servesWon[0] !== serves1stWon[0] || servesWon[1] !== serves1stWon[1]);

  if (hasServeBreakdown) {
    const pointsServed = [ct(counters, 0, 'pointsServed'), ct(counters, 1, 'pointsServed')] as [number, number];
    const serves1stIn = [ct(counters, 0, 'serves1stIn'), ct(counters, 1, 'serves1stIn')] as [number, number];
    const serves2ndWon = [ct(counters, 0, 'serves2ndWon'), ct(counters, 1, 'serves2ndWon')] as [number, number];
    const serves2ndIn = [ct(counters, 0, 'serves2ndIn'), ct(counters, 1, 'serves2ndIn')] as [number, number];

    so.push(
      {
        name: '1st Serve In',
        numerator: serves1stIn,
        denominator: pointsServed,
        pct: [pct(serves1stIn[0], pointsServed[0]), pct(serves1stIn[1], pointsServed[1])],
      },
      {
        name: '1st Serve Points Won',
        numerator: serves1stWon,
        denominator: serves1stIn,
        pct: [pct(serves1stWon[0], serves1stIn[0]), pct(serves1stWon[1], serves1stIn[1])],
      },
      {
        name: '2nd Serve Points Won',
        numerator: serves2ndWon,
        denominator: serves2ndIn,
        pct: [pct(serves2ndWon[0], serves2ndIn[0]), pct(serves2ndWon[1], serves2ndIn[1])],
      },
    );
  }

  // ── Total Points Won ──────────────────────────────────────────
  so.push({
    name: 'Total Points Won',
    numerator: [ct(counters, 0, 'pointsWon'), ct(counters, 1, 'pointsWon')],
    default: 'numerator',
  });

  // ── Receiving Points Won ──────────────────────────────────────
  const received0 = ct(counters, 0, 'received1stWon') + ct(counters, 0, 'received2ndWon');
  const received1 = ct(counters, 1, 'received1stWon') + ct(counters, 1, 'received2ndWon');
  // Denominator is the opposing team's served points
  const oppServed0 = ct(counters, 1, 'pointsServed'); // team 0 received what team 1 served
  const oppServed1 = ct(counters, 0, 'pointsServed'); // team 1 received what team 0 served

  so.push({
    name: 'Receiving Points Won',
    numerator: [received0, received1],
    denominator: [oppServed0, oppServed1],
    pct: [pct(received0, oppServed0), pct(received1, oppServed1)],
  });

  // ── Break Points Won ──────────────────────────────────────────
  // Team 0's breakpoints converted = team 1's breakpoints faced - team 1's breakpoints saved
  const bpConverted0 = ct(counters, 1, 'breakpointsFaced') - ct(counters, 1, 'breakpointsSaved');
  const bpConverted1 = ct(counters, 0, 'breakpointsFaced') - ct(counters, 0, 'breakpointsSaved');
  const bpOpportunities0 = ct(counters, 1, 'breakpointsFaced');
  const bpOpportunities1 = ct(counters, 0, 'breakpointsFaced');

  so.push({
    name: 'Break Points Won',
    numerator: [bpConverted0, bpConverted1],
    denominator: [bpOpportunities0, bpOpportunities1],
    pct: [pct(bpConverted0, bpOpportunities0), pct(bpConverted1, bpOpportunities1)],
  });

  // ── Break Points Saved ────────────────────────────────────────
  const bpSaved0 = ct(counters, 0, 'breakpointsSaved');
  const bpSaved1 = ct(counters, 1, 'breakpointsSaved');
  const bpFaced0 = ct(counters, 0, 'breakpointsFaced');
  const bpFaced1 = ct(counters, 1, 'breakpointsFaced');

  so.push(
    {
      name: 'Break Points Saved',
      numerator: [bpSaved0, bpSaved1],
      denominator: [bpFaced0, bpFaced1],
      pct: [pct(bpSaved0, bpFaced0), pct(bpSaved1, bpFaced1)],
    },
    {
      name: 'Winners',
      numerator: [ct(counters, 0, 'winners'), ct(counters, 1, 'winners')],
      default: 'numerator',
    },
    {
      name: 'Unforced Errors',
      numerator: [ct(counters, 0, 'unforcedErrors'), ct(counters, 1, 'unforcedErrors')],
      default: 'numerator',
    },
    {
      name: 'Forced Errors',
      numerator: [ct(counters, 0, 'forcedErrors'), ct(counters, 1, 'forcedErrors')],
      default: 'numerator',
    },
  );

  // ── Service Points Won ────────────────────────────────────────
  const svcWon = servesWon;
  const ptsSvd = [ct(counters, 0, 'pointsServed'), ct(counters, 1, 'pointsServed')] as [number, number];

  so.push(
    {
      name: 'Service Points Won',
      numerator: svcWon,
      denominator: ptsSvd,
      pct: [pct(svcWon[0], ptsSvd[0]), pct(svcWon[1], ptsSvd[1])],
    },
    {
      name: 'Games Won',
      numerator: [ct(counters, 0, 'gamesWon'), ct(counters, 1, 'gamesWon')],
    },
    {
      name: 'Most Consecutive Points Won',
      numerator: [calcValue(calculated, 'Max Pts/Row', 0), calcValue(calculated, 'Max Pts/Row', 1)],
    },
    {
      name: 'Most Consecutive Games Won',
      numerator: [calcValue(calculated, 'Max Games/Row', 0), calcValue(calculated, 'Max Games/Row', 1)],
    },
  );

  return so;
}
