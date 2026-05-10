import { computeRatingDistributionStats } from './distributionStats';

// constants and types
import { FlightingStrategy, WizardFlight, WizardParticipant } from '@Types/formatWizardTypes';

const EQUAL_COUNT_VARIANTS = [2, 3, 4, 6];
const EQUAL_BAND_VARIANTS = [0.5, 1];
const NATURAL_CLUSTER_MIN_FILL = 4;
const MIN_FLIGHT_SIZE = 4;

// Cap on how many flights are reasonable for a given pool size. The
// purpose is to avoid the "9 flights for 32 players" trap — TDs
// can't realistically run that many parallel events. Pools above
// the largest tier still cap at 8 to keep ranked plans readable.
function maxFlightCount(poolSize: number): number {
  if (poolSize <= 8) return 1;
  if (poolSize <= 16) return 2;
  if (poolSize <= 32) return 4;
  if (poolSize <= 64) return 6;
  return 8;
}

function sortByRatingDescending(participants: WizardParticipant[]): WizardParticipant[] {
  return [...participants].sort((a, b) => b.rating - a.rating);
}

function buildFlight(label: string, members: WizardParticipant[]): WizardFlight {
  return {
    participantIds: members.map((p) => p.participantId),
    ratings: members.map((p) => p.rating),
    label,
  };
}

function flightLabel(prefix: string, index: number, total: number): string {
  return `${prefix} ${index + 1} of ${total}`;
}

// Splits a sorted array into k contiguous chunks of as-equal-as-
// possible size. Larger chunks come first (so the top tier is the
// strongest cohort by rating).
function splitIntoChunks<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [];
  const chunks: T[][] = [];
  const base = Math.floor(items.length / k);
  const remainder = items.length % k;
  let cursor = 0;
  for (let i = 0; i < k; i++) {
    const size = base + (i < remainder ? 1 : 0);
    chunks.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return chunks;
}

function equalCountStrategy(sorted: WizardParticipant[], k: number): FlightingStrategy | undefined {
  if (k > sorted.length) return undefined;
  const chunks = splitIntoChunks(sorted, k);
  if (chunks.some((c) => c.length < MIN_FLIGHT_SIZE)) return undefined;
  const flights = chunks.map((chunk, i) => buildFlight(flightLabel('Tier', i, k), chunk));
  return { type: 'EQUAL_COUNT', variant: `k=${k}`, flights };
}

function equalBandStrategy(sorted: WizardParticipant[], bandWidth: number): FlightingStrategy | undefined {
  if (sorted.length === 0 || bandWidth <= 0) return undefined;
  const max = sorted[0].rating;
  const min = sorted.at(-1)?.rating ?? 0;
  const groups = new Map<number, WizardParticipant[]>();
  for (const p of sorted) {
    const bandIndex = Math.floor((max - p.rating) / bandWidth);
    if (!groups.has(bandIndex)) groups.set(bandIndex, []);
    groups.get(bandIndex)!.push(p);
  }
  const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
  const flights: WizardFlight[] = [];
  for (const key of sortedKeys) {
    const members = groups.get(key)!;
    if (members.length < MIN_FLIGHT_SIZE) continue;
    const upper = max - key * bandWidth;
    const lower = Math.max(min, upper - bandWidth);
    const label = `${lower.toFixed(2)} – ${upper.toFixed(2)}`;
    flights.push(buildFlight(label, members));
  }
  if (flights.length < 2) return undefined;
  return { type: 'EQUAL_BAND', variant: `width=${bandWidth}`, flights };
}

function naturalClusterStrategy(sorted: WizardParticipant[]): FlightingStrategy | undefined {
  if (sorted.length < MIN_FLIGHT_SIZE * 2) return undefined;

  const ratings = sorted.map((p) => p.rating);
  const stats = computeRatingDistributionStats({ ratings });
  const cuts = stats.gaps.map((g) => g.start);

  const breakpoints = new Set<number>();
  for (const cut of cuts) {
    breakpoints.add(cut);
  }

  // sorted is descending; breakpoint = gap.start = the highest
  // rating below the gap, which (in descending order) is the FIRST
  // member of the lower cluster. Cut before pushing it so the
  // breakpoint participant starts the new cluster.
  const clusters: WizardParticipant[][] = [];
  let current: WizardParticipant[] = [];
  for (const participant of sorted) {
    if (breakpoints.has(participant.rating) && current.length >= NATURAL_CLUSTER_MIN_FILL) {
      clusters.push(current);
      current = [];
    }
    current.push(participant);
  }
  if (current.length > 0) clusters.push(current);

  const merged = mergeUndersizedClusters(clusters);
  if (merged.length < 2) return undefined;

  const flights = merged.map((c, i) => buildFlight(flightLabel('Cluster', i, merged.length), c));
  return { type: 'NATURAL_CLUSTER', flights };
}

function mergeUndersizedClusters(clusters: WizardParticipant[][]): WizardParticipant[][] {
  const result: WizardParticipant[][] = [];
  for (const cluster of clusters) {
    if (cluster.length >= NATURAL_CLUSTER_MIN_FILL || result.length === 0) {
      result.push(cluster);
    } else {
      const lastCluster = result.at(-1);
      if (lastCluster) {
        lastCluster.push(...cluster);
      }
    }
  }
  return result;
}

function staggeredSingleStrategy(sorted: WizardParticipant[]): FlightingStrategy {
  return {
    type: 'STAGGERED_SINGLE',
    flights: [buildFlight('All Levels', sorted)],
  };
}

// Generates all candidate flighting strategies for a participant
// pool. The pool is treated as a single cohort — gender/category
// segmentation is the caller's responsibility (filter the pool
// upstream and run the engine again to compare segregated plans).
//
// Flight-count caps + per-flight minimum size are enforced here so
// downstream scoring never sees "9 flights of 3 players" plans
// that no TD would ever run.
export function generateFlightingStrategies(participants: WizardParticipant[]): FlightingStrategy[] {
  if (!Array.isArray(participants) || participants.length < MIN_FLIGHT_SIZE) return [];

  const sorted = sortByRatingDescending(participants);
  const maxFlights = maxFlightCount(participants.length);
  const strategies: FlightingStrategy[] = [];

  for (const k of EQUAL_COUNT_VARIANTS) {
    if (k > maxFlights) continue;
    const candidate = equalCountStrategy(sorted, k);
    if (candidate) strategies.push(candidate);
  }

  for (const width of EQUAL_BAND_VARIANTS) {
    const candidate = equalBandStrategy(sorted, width);
    if (candidate && candidate.flights.length <= maxFlights) strategies.push(candidate);
  }

  const cluster = naturalClusterStrategy(sorted);
  if (cluster && cluster.flights.length <= maxFlights) strategies.push(cluster);

  // STAGGERED_SINGLE — one flight, whole pool — is always emitted
  // as the connected-bracket alternative (FEED_IN catalog) feeds off
  // it. It is not subject to the cap.
  strategies.push(staggeredSingleStrategy(sorted));

  return strategies;
}
