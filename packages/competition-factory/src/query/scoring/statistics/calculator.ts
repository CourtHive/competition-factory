/**
 * Statistics Calculator
 *
 * Calculates statistics from counters, matching v3 API format.
 * Implements all v3 statistics calculations.
 */

import { StatCounters, CalculatedStat, StatTeamValue, StatDefinition } from './types';

/**
 * Calculate all statistics from counters
 *
 * Returns array of statistics in v3 format:
 * [
 *   { category: 'Aces', teams: [{ value: 5, display: '5' }, { value: 3, display: '3' }] },
 *   { category: 'Winners', teams: [{ value: 12, display: '12' }, { value: 8, display: '8' }] },
 *   ...
 * ]
 *
 * @param counters - Statistics counters from buildCounters
 * @returns Array of calculated statistics
 */
export function calculateStats(counters: StatCounters): CalculatedStat[] {
  if (!counters?.teams) {
    return [];
  }

  const stats: CalculatedStat[] = [];

  // Define all statistics (matching v3)
  const statDefinitions: Record<string, StatDefinition> = {
    Aces: {
      category: 'Aces',
      numerators: ['aces'],
      calc: 'number',
    },
    'Double Faults': {
      category: 'Double Faults',
      numerators: ['doubleFaults'],
      calc: 'number',
    },
    Winners: {
      category: 'Winners',
      numerators: ['winners'],
      calc: 'number',
    },
    'Unforced Errors': {
      category: 'Unforced Errors',
      numerators: ['unforcedErrors'],
      calc: 'number',
    },
    'Forced Errors': {
      category: 'Forced Errors',
      numerators: ['forcedErrors'],
      calc: 'number',
    },
    'Total Points Won': {
      category: 'Total Points Won',
      numerators: ['pointsWon'],
      calc: 'number',
    },
    'Max Pts/Row': {
      category: 'Max Pts/Row',
      numerators: ['pointsWon'],
      calc: 'maxConsecutive',
      attribute: 'index',
    },
    'Max Games/Row': {
      category: 'Max Games/Row',
      numerators: ['gamesWon'],
      calc: 'maxConsecutive',
      attribute: 'game',
    },
    'First Serve %': {
      category: 'First Serve %',
      numerators: ['serves1stIn'],
      denominators: ['pointsServed'],
      calc: 'percentage',
    },
    'Points Won 1st': {
      category: 'Points Won 1st',
      numerators: ['serves1stWon'],
      denominators: ['serves1stIn'],
      calc: 'percentage',
    },
    'Points Won 2nd': {
      category: 'Points Won 2nd',
      numerators: ['serves2ndWon'],
      denominators: ['serves2ndIn'],
      calc: 'percentage',
    },
    'Points Won Receiving': {
      category: 'Points Won Receiving',
      numerators: ['received1stWon', 'received2ndWon'],
      denominators: ['-pointsServed'],
      calc: 'percentage',
    },
    'Breakpoints Saved': {
      category: 'Breakpoints Saved',
      numerators: ['breakpointsSaved'],
      denominators: ['breakpointsFaced'],
      calc: 'percentage',
    },
    'Breakpoints Converted': {
      category: 'Breakpoints Converted',
      numerators: ['-breakpointsSaved'],
      denominators: ['-breakpointsFaced'],
      calc: 'difference',
    },
    'Games Won': {
      category: 'Games Won',
      numerators: ['gamesWon'],
      calc: 'number',
    },
    'Service Points Won': {
      category: 'Service Points Won',
      numerators: ['servesWon'],
      denominators: ['pointsServed'],
      calc: 'percentage',
    },
    'Aggressive Margin': {
      category: 'Aggressive Margin',
      numerators: ['*doubleFaults', '*unforcedErrors'],
      denominators: ['*aces', '*winners', '-*forcedErrors'],
      calc: 'aggressiveMargin',
    },
  };

  // Calculate each statistic
  Object.values(statDefinitions).forEach((def) => {
    const teams = [calculateSingleStat(def, counters.teams, 0), calculateSingleStat(def, counters.teams, 1)];

    // Only include if at least one team has data
    if (teams[0].value !== 0 || teams[1].value !== 0) {
      stats.push({
        category: def.category,
        teams,
      });
    }
  });

  return stats;
}

/**
 * Calculate a single statistic for one team
 *
 * @param definition - Stat definition
 * @param teams - Team counters
 * @param team - Team index (0 or 1)
 * @returns Calculated stat value
 */
function calculateSingleStat(
  definition: StatDefinition,
  teams: Record<number, Record<string, any[]>>,
  team: number,
): StatTeamValue {
  switch (definition.calc) {
    case 'number':
      return calculateNumber(definition, teams, team);

    case 'percentage':
      return calculatePercentage(definition, teams, team);

    case 'maxConsecutive':
      return calculateMaxConsecutive(definition, teams, team);

    case 'difference':
      return calculateDifference(definition, teams, team);

    case 'aggressiveMargin':
      return calculateAggressiveMargin(definition, teams, team);

    // DEAD CODE: all statDefinitions use known calc types above;
    // this default branch is unreachable.
    // default:
    //   return { value: 0, display: '0' };
  }
}

/**
 * Calculate simple number statistic (count of episodes)
 */
function calculateNumber(
  definition: StatDefinition,
  teams: Record<number, Record<string, any[]>>,
  team: number,
): StatTeamValue {
  const numerator = sumComponents(definition.numerators, teams, team);
  return {
    value: numerator,
    display: String(numerator),
    numerators: definition.numerators,
  };
}

/**
 * Calculate percentage statistic
 */
function calculatePercentage(
  definition: StatDefinition,
  teams: Record<number, Record<string, any[]>>,
  team: number,
): StatTeamValue {
  const numerator = sumComponents(definition.numerators, teams, team);
  const denominator = sumComponents(definition.denominators ?? [], teams, team);

  if (!denominator) {
    return { value: 0, display: '0', numerators: definition.numerators };
  }

  const pct = Math.round((numerator / denominator) * 100);
  return {
    value: pct,
    display: `${pct}% (${numerator}/${denominator})`,
    numerators: definition.numerators,
  };
}

/**
 * Calculate max consecutive statistic (streaks)
 */
function calculateMaxConsecutive(
  definition: StatDefinition,
  teams: Record<number, Record<string, any[]>>,
  team: number,
): StatTeamValue {
  const category = definition.numerators[0];
  const attribute = definition.attribute || 'index';

  if (!teams[team][category]) {
    return { value: 0, display: '0' };
  }

  const episodes = teams[team][category];

  let maxStreak = 0;
  let currentStreak = episodes.length ? 1 : 0;
  let lastValue: number | undefined;

  episodes.forEach((episode: any) => {
    const value = episode[attribute];

    if (lastValue !== undefined && value === lastValue + 1) {
      currentStreak++;
    } else {
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
      }
      currentStreak = 1;
    }

    lastValue = value;
  });

  if (currentStreak > maxStreak) {
    maxStreak = currentStreak;
  }

  return {
    value: maxStreak,
    display: String(maxStreak),
  };
}

/**
 * Calculate difference statistic (for breakpoint conversion)
 */
function calculateDifference(
  definition: StatDefinition,
  teams: Record<number, Record<string, any[]>>,
  team: number,
): StatTeamValue {
  const numerator = sumComponents(definition.numerators, teams, team);
  const denominator = sumComponents(definition.denominators ?? [], teams, team);

  if (!denominator) {
    return { value: 0, display: '0', numerators: definition.numerators };
  }

  const diff = Math.abs(denominator - numerator);
  const pct = Math.round((diff / denominator) * 100);

  return {
    value: pct,
    display: `${pct}% (${diff}/${denominator})`,
    numerators: definition.numerators,
  };
}

/**
 * Calculate aggressive margin (winners - errors)
 */
function calculateAggressiveMargin(
  definition: StatDefinition,
  teams: Record<number, Record<string, any[]>>,
  team: number,
): StatTeamValue {
  const positives = sumComponents(definition.denominators ?? [], teams, team);
  const negatives = sumComponents(definition.numerators, teams, team);
  const margin = positives - negatives;

  return {
    value: margin,
    display: String(margin),
  };
}

/**
 * Sum components from counters
 *
 * Handles special prefixes:
 * - '-' means use opposing team
 * - '*' means optional (don't fail if missing)
 *
 * @param components - Array of component names
 * @param teams - Team counters
 * @param team - Team index
 * @returns Sum of all components
 */
function sumComponents(components: string[], teams: Record<number, Record<string, any[]>>, team: number): number {
  if (!components) return 0;

  return components.reduce((sum, component) => {
    // Handle '-' prefix (opposing team)
    const isOpposingTeam = component.startsWith('-');
    const isOptional = component.includes('*');

    // Clean component name
    let cleanComponent = component.replace('-', '').replace('*', '');

    // Get the right team
    const targetTeam = isOpposingTeam ? 1 - team : team;

    // Get count
    const episodes = teams[targetTeam]?.[cleanComponent];
    if (!episodes) {
      if (isOptional) {
        return sum; // Optional component missing, skip
      }
      return sum; // Missing component, contribute 0
    }

    return sum + episodes.length;
  }, 0);
}
