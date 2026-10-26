import type { DayMatchUp, IndividualParticipantProfiles } from './checkParticipantProfileInitialization';
import { getReachableParticipantIds, ParticipantReachability } from './getParticipantReachability';
import { checkParticipantProfileInitialization } from './checkParticipantProfileInitialization';

// constants
import { TOTAL } from '@Constants/scheduleConstants';

/**
 * The most matchUps a participant can actually play on the day being scheduled.
 *
 * Every matchUp the participant is CERTAIN for counts. Of the matchUps they are only POTENTIAL for, they can play
 * one chain: a run of matchUps each of which can feed the next. Two potential matchUps in the same draw where neither
 * feeds the other are alternatives (a winner path and a loser path), so only the longest chain counts. Draws are
 * independent, so their loads add.
 */
export function getDayLoad({
  reachability,
  dayMatchUps,
  matchUpType,
}: {
  reachability: ParticipantReachability;
  dayMatchUps: DayMatchUp[];
  matchUpType?: string;
}): number {
  const relevant = matchUpType
    ? dayMatchUps.filter((dayMatchUp) => dayMatchUp.matchUpType === matchUpType)
    : dayMatchUps;
  const drawIds = [...new Set(relevant.map(({ drawId }) => drawId))];

  return drawIds.reduce((load, drawId) => {
    const drawMatchUps = relevant.filter((dayMatchUp) => dayMatchUp.drawId === drawId);
    const certainCount = drawMatchUps.filter(({ certain }) => certain).length;
    const potentialIds = drawMatchUps.filter(({ certain }) => !certain).map(({ matchUpId }) => matchUpId);
    return load + certainCount + longestChain(potentialIds, reachability.upstream);
  }, 0);
}

/**
 * One draw's term of a day load, ready to answer "and with this matchUp added?" in a single scan: the certain count, the
 * longest chain of potential matchUps, and for each potential matchUp the longest chain ending at it. The longest chain
 * starting at each is built only when a potential matchUp is first added to the term: a certain one, and the counters,
 * need only the certain count and the longest chain.
 */
type DrawTerm = {
  ordered: string[];
  endLength: Map<string, number>;
  startLength?: Map<string, number>;
  certainCount: number;
  longest: number;
};

function drawTerm(dayMatchUps: DayMatchUp[], upstream: ParticipantReachability['upstream']): DrawTerm {
  const certainCount = dayMatchUps.filter(({ certain }) => certain).length;
  // a matchUp has strictly more upstream matchUps than any matchUp upstream of it, so this order is topological
  const ordered = dayMatchUps
    .filter(({ certain }) => !certain)
    .map(({ matchUpId }) => matchUpId)
    .sort((a, b) => (upstream[a]?.size ?? 0) - (upstream[b]?.size ?? 0));
  const endLength = new Map<string, number>();
  ordered.forEach((matchUpId, index) => {
    const before = upstream[matchUpId];
    let longest = 0;
    // every matchUp upstream of this one comes before it, so endLength already holds those of the draw's day; read
    // whichever is shorter, the upstream set or the matchUps before it
    if (before && before.size < index) {
      for (const prior of before) longest = Math.max(longest, endLength.get(prior) ?? 0);
    } else if (before) {
      for (let prior = 0; prior < index; prior++)
        if (before.has(ordered[prior])) longest = Math.max(longest, endLength.get(ordered[prior]) ?? 0);
    }
    endLength.set(matchUpId, longest + 1);
  });
  const longest = ordered.length ? Math.max(...endLength.values()) : 0;
  return { ordered, certainCount, longest, endLength };
}

/** the longest chain starting at each potential matchUp of a term, built once, on the first potential addition */
function startLengths(term: DrawTerm, upstream: ParticipantReachability['upstream']): Map<string, number> {
  if (term.startLength) return term.startLength;
  const { ordered } = term;
  const startLength = new Map<string, number>();
  for (let index = ordered.length - 1; index >= 0; index--) {
    const matchUpId = ordered[index];
    let longest = 0;
    for (let later = index + 1; later < ordered.length; later++)
      if (upstream[ordered[later]]?.has(matchUpId)) longest = Math.max(longest, startLength.get(ordered[later]) ?? 0);
    startLength.set(matchUpId, longest + 1);
  }
  term.startLength = startLength;
  return startLength;
}

/**
 * A draw's term with one matchUp it does not already hold added. A certain matchUp adds one. A potential one can only
 * lengthen a chain through itself: the longest chain ending at a matchUp upstream of it, itself, and the longest chain
 * starting at a matchUp downstream of it (upstream is transitively closed, so the two halves join).
 */
function termWith(term: DrawTerm, adding: DayMatchUp, upstream: ParticipantReachability['upstream']): number {
  if (adding.certain) return term.certainCount + 1 + term.longest;
  let before = 0;
  let after = 0;
  for (const [matchUpId, length] of term.endLength)
    if (upstream[adding.matchUpId]?.has(matchUpId)) before = Math.max(before, length);
  for (const [matchUpId, length] of startLengths(term, upstream))
    if (upstream[matchUpId]?.has(adding.matchUpId)) after = Math.max(after, length);
  return term.certainCount + Math.max(term.longest, before + 1 + after);
}

type DayLoadCache = {
  /** the loads with a matchUp added, by the matchUp and its certainty: a candidate is asked about at every slot tried */
  withAdded: Map<string, { [counterName: string]: number }>;
  drawTerms: Map<string, DrawTerm>;
  drawsByCounter: Map<string, Set<string>>;
  dayMatchUpIds: Set<string>;
};

/** the profile's day grouped by counter (each matchUpType, and TOTAL) and draw, built once per change to the day */
function dayLoadCache(profile: IndividualParticipantProfiles[string], upstream: ParticipantReachability['upstream']) {
  if (profile.dayLoadCache) return profile.dayLoadCache as DayLoadCache;
  const groups = new Map<string, DayMatchUp[]>();
  const drawsByCounter = new Map<string, Set<string>>();
  for (const dayMatchUp of profile.dayMatchUps) {
    for (const counterName of [TOTAL, dayMatchUp.matchUpType].filter(Boolean) as string[]) {
      const key = `${counterName}|${dayMatchUp.drawId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(dayMatchUp);
      if (!drawsByCounter.has(counterName)) drawsByCounter.set(counterName, new Set());
      drawsByCounter.get(counterName)?.add(dayMatchUp.drawId);
    }
  }
  const drawTerms = new Map([...groups].map(([key, group]) => [key, drawTerm(group, upstream)]));
  const cache: DayLoadCache = {
    withAdded: new Map(),
    drawTerms,
    drawsByCounter,
    dayMatchUpIds: new Set(profile.dayMatchUps.map(({ matchUpId }) => matchUpId)),
  };
  profile.dayLoadCache = cache;
  return cache;
}

/**
 * The participant's load by matchUpType and in total, with an optional matchUp added.
 *
 * Asked for every participant of every candidate matchUp at every slot a scheduler tries; rebuilding every draw's
 * longest chain on each ask was ~85% of the profile scheduler's time (SCHEDULING_PIPELINE_VNEXT.md § 7.0). The day's
 * per-draw terms are cached on the profile (`dayLoadCache`, cleared by `modifyParticipantDayMatchUps` whenever the day
 * changes) and an added matchUp is folded into its draw's term in one scan. A candidate's loads are memoized on the same
 * cache: a participant at a limit is asked about the same candidate at every slot tried, and the answer cannot change
 * until the day does. The result is the number `getDayLoad` gives for the same matchUps (pinned by
 * dayLoadCache.test.ts). The memoized loads are shared: callers read them and never write to them.
 */
export function getParticipantDayLoads({
  individualParticipantProfiles,
  reachability,
  participantId,
  addingMatchUp,
}: {
  individualParticipantProfiles: IndividualParticipantProfiles;
  reachability: ParticipantReachability;
  participantId: string;
  addingMatchUp?: DayMatchUp;
}) {
  checkParticipantProfileInitialization({ individualParticipantProfiles, participantId });
  const profile = individualParticipantProfiles[participantId];
  const { upstream } = reachability;
  const cache = dayLoadCache(profile, upstream);

  // a matchUp already in the day is a replacement (its certainty may differ): answered from scratch, as it always was
  if (addingMatchUp && cache.dayMatchUpIds.has(addingMatchUp.matchUpId)) {
    const dayMatchUps = [
      ...profile.dayMatchUps.filter(({ matchUpId }) => matchUpId !== addingMatchUp.matchUpId),
      addingMatchUp,
    ];
    const matchUpTypes = [...new Set(dayMatchUps.map(({ matchUpType }) => matchUpType).filter(Boolean))] as string[];
    const loads: { [key: string]: number } = { [TOTAL]: getDayLoad({ reachability, dayMatchUps }) };
    for (const matchUpType of matchUpTypes) loads[matchUpType] = getDayLoad({ reachability, dayMatchUps, matchUpType });
    return loads;
  }

  // the answer for a candidate holds until the day changes, which discards the cache and with it this memo
  const addedKey = addingMatchUp && `${addingMatchUp.matchUpId}|${addingMatchUp.certain ? 1 : 0}`;
  const memoized = addedKey ? cache.withAdded.get(addedKey) : undefined;
  if (memoized) return memoized;

  const counterNames = new Set([TOTAL, ...cache.drawsByCounter.keys()]);
  if (addingMatchUp?.matchUpType) counterNames.add(addingMatchUp.matchUpType);

  const loads: { [key: string]: number } = {};
  for (const counterName of counterNames) {
    const adds = !!addingMatchUp && (counterName === TOTAL || counterName === addingMatchUp.matchUpType);
    const drawIds = new Set(cache.drawsByCounter.get(counterName) ?? []);
    if (adds && addingMatchUp) drawIds.add(addingMatchUp.drawId);
    let load = 0;
    for (const drawId of drawIds) {
      const term = cache.drawTerms.get(`${counterName}|${drawId}`) ?? drawTerm([], upstream);
      load +=
        adds && addingMatchUp?.drawId === drawId
          ? termWith(term, addingMatchUp, upstream)
          : term.certainCount + term.longest;
    }
    loads[counterName] = load;
  }
  if (addedKey) cache.withAdded.set(addedKey, loads);
  return loads;
}

/**
 * Adds (value 1) or removes (value -1) a matchUp from the day of every participant who can play it, and refreshes
 * each participant's `counters` (their day load by matchUpType and TOTAL), which over-limit details report.
 */
export function modifyParticipantDayMatchUps({
  individualParticipantProfiles,
  reachability,
  matchUp,
  value,
}: {
  individualParticipantProfiles: IndividualParticipantProfiles;
  reachability: ParticipantReachability;
  matchUp: { matchUpId: string; drawId: string; matchUpType?: string };
  value: 1 | -1;
}) {
  const { matchUpId, drawId, matchUpType } = matchUp;
  const { certain, all } = getReachableParticipantIds(reachability, matchUpId);

  for (const participantId of all) {
    checkParticipantProfileInitialization({ individualParticipantProfiles, participantId });
    const profile = individualParticipantProfiles[participantId];
    profile.dayMatchUps = profile.dayMatchUps.filter((dayMatchUp) => dayMatchUp.matchUpId !== matchUpId);
    profile.dayLoadCache = undefined;
    if (value > 0) {
      profile.dayMatchUps.push({ matchUpId, drawId, matchUpType, certain: certain.includes(participantId) });
    }
    deferCounters(profile, () =>
      getParticipantDayLoads({ individualParticipantProfiles, reachability, participantId }),
    );
  }
}

/**
 * `counters` is computed when it is first read, not on every change to the day: a placement changes the day of every
 * participant who can reach it, and most of those are not asked about again before the next change. Read, it is
 * computed once and kept as a plain value until the day changes again; it is enumerable either way, so a profile a
 * scheduler returns carries it as before.
 */
function deferCounters(
  profile: IndividualParticipantProfiles[string],
  compute: () => { [counterName: string]: number },
) {
  Object.defineProperty(profile, 'counters', {
    configurable: true,
    enumerable: true,
    get() {
      const value = compute();
      Object.defineProperty(profile, 'counters', { value, writable: true, enumerable: true, configurable: true });
      return value;
    },
    set(value) {
      Object.defineProperty(profile, 'counters', { value, writable: true, enumerable: true, configurable: true });
    },
  });
}

function longestChain(matchUpIds: string[], upstream: ParticipantReachability['upstream']): number {
  if (!matchUpIds.length) return 0;
  // a matchUp has strictly more upstream matchUps than any matchUp upstream of it, so this order is topological
  const ordered = [...matchUpIds].sort((a, b) => (upstream[a]?.size ?? 0) - (upstream[b]?.size ?? 0));
  const chainLengths: number[] = [];
  ordered.forEach((matchUpId, index) => {
    let longest = 0;
    for (let prior = 0; prior < index; prior++) {
      if (upstream[matchUpId]?.has(ordered[prior])) longest = Math.max(longest, chainLengths[prior]);
    }
    chainLengths[index] = longest + 1;
  });
  return Math.max(...chainLengths);
}
