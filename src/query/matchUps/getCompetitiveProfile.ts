import {
  bandFromBoundaries,
  DeltaBand,
  ResolvedDeltaBoundary,
  resolveDeltaBoundaries,
} from '@Query/matchUp/resolveDeltaBand';
import { resolveCompetitiveBands, resolveDeltaBands } from '@Query/matchUp/resolveCompetitiveBands';
import { getBand, getScoreComponents, pctSpread } from '@Query/matchUp/scoreComponents';
import { getMatchUpRatingDelta } from '@Query/matchUp/getMatchUpRatingDelta';

// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPETITIVE, DECISIVE, ROUTINE } from '@Constants/statsConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type Counts = { [key: string]: number };

type CompetitiveAxis = {
  ratios: Counts;
  counts: Counts;
};

export type CompetitiveProfile = {
  realized: CompetitiveAxis & { completed: number };
  exposure: CompetitiveAxis & {
    meanSignedDelta?: number;
    deltaBandsApplied: boolean;
    unrated: number;
    rated: number;
  };
  matchUpsCount: number;
  participantId?: string;
  success?: boolean;
};

type GetCompetitiveProfileArgs = {
  policyDefinitions?: PolicyDefinitions;
  singlesForDoubles?: boolean;
  deltaBands?: DeltaBand[];
  scaleAccessor?: string;
  participantId?: string;
  ascending?: boolean;
  profileBands?: any;
  scaleName?: string;
  matchUps: any[];
};

const percent = (part: number, whole: number): number => (whole ? Math.round((10000 * part) / whole) / 100 : 0);

function ratiosFrom(counts: Counts, whole: number): Counts {
  return Object.assign({}, ...Object.keys(counts).map((key) => ({ [key]: percent(counts[key], whole) })));
}

function participantIds(participant: any): string[] {
  if (!participant) return [];
  const individualIds = (participant.individualParticipants ?? [])
    .map((individual: any) => individual?.participantId)
    .filter(Boolean);
  return participant.participantId ? [participant.participantId, ...individualIds] : individualIds;
}

function includesParticipant(matchUp: any, participantId: string): boolean {
  return (matchUp?.sides ?? []).some((side: any) => participantIds(side?.participant).includes(participantId));
}

/**
 * Both competitive axes for one participant (or for a whole matchUp array),
 * aggregated.
 *
 * PURE over the `matchUps` array it is given — no storage access, no engine
 * state, no tournamentRecord required. That is deliberate: TMX computes this
 * offline from IndexedDB state for an in-card fingerprint bar, and the server
 * runs the identical code over a corpus. One implementation, so the two cannot
 * drift.
 *
 * The caller decides which matchUps are in scope (completed only, one season,
 * one division). Within them:
 *
 * - REALIZED counts only matchUps with a `winningSide` — a score spread needs a
 *   result. `realized.completed` reports how many that was.
 * - EXPOSURE counts every matchUp with a resolvable rating on both sides,
 *   result or not: who you were drawn against is known before the match is
 *   played. `exposure.rated` / `unrated` report the split, so a bar rendered
 *   from `ratios` can never quietly imply coverage it does not have.
 *
 * `exposure.counts` is zero-filled for every band the policy declares, so a
 * five-segment bar has five segments even when a participant has never played
 * up. With no `deltaBands` in policy, `deltaBandsApplied` is false and the
 * exposure counts are empty — never a guessed default.
 */
export function getCompetitiveProfile({
  singlesForDoubles,
  policyDefinitions,
  scaleAccessor,
  participantId,
  profileBands,
  deltaBands,
  ascending,
  scaleName,
  matchUps,
}: GetCompetitiveProfileArgs): CompetitiveProfile | { error: ErrorType; info?: string } {
  if (!Array.isArray(matchUps)) return { error: INVALID_VALUES, info: 'matchUps must be an array' };

  const scoped = participantId ? matchUps.filter((matchUp) => includesParticipant(matchUp, participantId)) : matchUps;

  const bandProfiles = profileBands || resolveCompetitiveBands({ policyDefinitions });

  // The exposure axis engages only when a scale is identified — same rule as
  // getMatchUpCompetitiveProfile. A caller that wants the realized axis alone
  // is not made to care that the policy it passed carries `deltaBands`.
  const exposureRequested = scaleName !== undefined || ascending !== undefined;
  const resolvedDeltaBands = exposureRequested ? (deltaBands ?? resolveDeltaBands({ policyDefinitions })) : undefined;

  let boundaries: ResolvedDeltaBoundary[] | undefined;
  if (resolvedDeltaBands) {
    // Validated and converted ONCE rather than per matchUp.
    const resolution = resolveDeltaBoundaries(resolvedDeltaBands, scaleName);
    if (resolution.error) return { error: resolution.error, info: resolution.info };
    boundaries = resolution.boundaries;
  }

  const realizedCounts: Counts = { [DECISIVE]: 0, [ROUTINE]: 0, [COMPETITIVE]: 0 };
  const exposureCounts: Counts = Object.assign({}, ...(boundaries ?? []).map(({ key }) => ({ [key]: 0 })));

  let deltaTotal = 0;
  let completed = 0;
  let unrated = 0;
  let rated = 0;

  for (const matchUp of scoped) {
    if (matchUp?.winningSide) {
      completed += 1;
      const spread = pctSpread([getScoreComponents({ score: matchUp.score })]);
      const band = getBand(spread, bandProfiles);
      realizedCounts[band] = (realizedCounts[band] ?? 0) + 1;
    }

    if (!exposureRequested) continue;

    const { signedDelta, error, info } = getMatchUpRatingDelta({
      singlesForDoubles,
      scaleAccessor,
      participantId,
      ascending,
      scaleName,
      matchUp,
    });
    if (error) return { error, info };
    if (signedDelta === undefined) {
      // Missing ratings, not a caller mistake — counted so the ratios below can
      // never be read as coverage they do not have.
      unrated += 1;
      continue;
    }

    rated += 1;
    deltaTotal += signedDelta;
    if (boundaries) {
      const band = bandFromBoundaries(signedDelta, boundaries);
      if (band) exposureCounts[band] = (exposureCounts[band] ?? 0) + 1;
    }
  }

  return {
    ...SUCCESS,
    participantId,
    matchUpsCount: scoped.length,
    realized: {
      counts: realizedCounts,
      ratios: ratiosFrom(realizedCounts, completed),
      completed,
    },
    exposure: {
      counts: exposureCounts,
      ratios: ratiosFrom(exposureCounts, rated),
      meanSignedDelta: rated ? Math.round(10000 * (deltaTotal / rated)) / 10000 : undefined,
      deltaBandsApplied: Boolean(boundaries),
      unrated,
      rated,
    },
  };
}
