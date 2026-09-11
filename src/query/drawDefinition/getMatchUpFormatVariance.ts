// constants and types
import { DrawDefinition, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

// matchUpFormat variance analysis for a drawDefinition.
//
// matchUpFormat can be set at event → drawDefinition → structure → matchUp (resolved
// most-specific-first). Two kinds of variance matter to a tournament director, and they mean
// very different things:
//
//  - CROSS-structure variance (MAIN plays SET3, CONSOLATION plays SET1): expected and
//    deliberate — reported informationally, never flagged.
//  - WITHIN-structure variance (a structure's own matchUps do not all share one format,
//    especially a change at a ROUND boundary): the notable signal. A round that departs from
//    the structure's dominant format — and then a later round that RETURNS to it (the
//    `revertPattern`) — is the fingerprint of an in-tournament format change: a weather event
//    that shortened a day's matches, then a return to the original format the next day.
//
// Variance is measured on the RAW matchUpFormat string. Any difference in the string is a real
// difference in the format — a change in set count, games per set, no-ad, the final-set spec
// (`-F:TB10` = a match-tiebreak deciding set), or the tiebreak trigger point — every one of which
// a director may set deliberately. Nothing is normalized or collapsed.
//
// Stateless over stored structure state (per structure → per round), so it also runs against a
// hand-built drawDefinition. Team ties (collectionId matchUps) carry a tieFormat rather than a
// matchUpFormat and are excluded.

type RoundFormats = { roundNumber: number; formats: string[]; differsFromBaseline: boolean };

type StructureFormatVariance = {
  structureId: string;
  structureName?: string;
  stage?: string;
  baselineFormat: string;
  distinctFormats: string[];
  rounds: RoundFormats[];
  withinStructureVariance: boolean;
  revertPattern: boolean;
};

type GetMatchUpFormatVarianceArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUpsMap?: MatchUpsMap;
  structureId?: string;
  event?: Event;
};

type StructureProfile = {
  structure: Structure;
  byRound: Map<number, Set<string>>;
  distinctFormats: string[];
  dominantFormat: string;
};

// leaf structures that actually carry matchUps (RR container nodes hold their matchUps in ITEM
// children, so recursion reaches each group)
function collectMatchUpStructures(structures: Structure[] | undefined, collected: Structure[]): void {
  for (const structure of structures ?? []) {
    if (structure.matchUps?.length) collected.push(structure);
    if (structure.structures?.length) collectMatchUpStructures(structure.structures, collected);
  }
}

const byCount = (a: [string, number], b: [string, number]): number => b[1] - a[1] || a[0].localeCompare(b[0]);

// resolve each matchUp's effective format and tally the raw string by round and overall;
// undefined when no matchUp in the structure resolves to any format at all
function structureFormatProfile(
  structure: Structure,
  drawFormat: string | undefined,
  eventFormat: string | undefined,
): StructureProfile | undefined {
  const structureFormat = structure.matchUpFormat;
  const byRound = new Map<number, Set<string>>();
  const tally = new Map<string, number>();

  for (const matchUp of (structure.matchUps ?? []) as MatchUp[]) {
    if (matchUp.collectionId || typeof matchUp.roundNumber !== 'number') continue;
    // only matchUps that carry format EVIDENCE — an explicit matchUp-level format, or a played
    // result. Unplayed, format-less matchUps merely inherit the current default and would
    // otherwise manufacture false variance against stamped rounds.
    if (!matchUp.matchUpFormat && !matchUp.winningSide) continue;
    const format = matchUp.matchUpFormat || structureFormat || drawFormat || eventFormat;
    if (!format) continue;
    if (!byRound.has(matchUp.roundNumber)) byRound.set(matchUp.roundNumber, new Set<string>());
    byRound.get(matchUp.roundNumber)!.add(format);
    tally.set(format, (tally.get(format) ?? 0) + 1);
  }

  const distinctFormats = [...tally.keys()];
  if (!distinctFormats.length) return undefined;
  return {
    structure,
    byRound,
    distinctFormats,
    dominantFormat: [...tally.entries()].sort(byCount)[0][0],
  };
}

function structureVariance(profile: StructureProfile): StructureFormatVariance {
  const { structure, byRound, distinctFormats, dominantFormat } = profile;
  const rounds: RoundFormats[] = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([roundNumber, set]) => {
      const formats = [...set].sort((a, b) => a.localeCompare(b));
      return { roundNumber, formats, differsFromBaseline: !(formats.length === 1 && formats[0] === dominantFormat) };
    });

  // revertPattern: a round that departs from the dominant format, followed by a later round
  // that returns to it — a temporary change that was reverted
  let revertPattern = false;
  let seenDeparture = false;
  for (const round of rounds) {
    if (round.differsFromBaseline) seenDeparture = true;
    else if (seenDeparture) {
      revertPattern = true;
      break;
    }
  }

  return {
    structureId: structure.structureId,
    structureName: structure.structureName,
    stage: structure.stage,
    baselineFormat: dominantFormat,
    distinctFormats: [...distinctFormats].sort((a, b) => a.localeCompare(b)),
    rounds,
    withinStructureVariance: true,
    revertPattern,
  };
}

export function getMatchUpFormatVariance(params: GetMatchUpFormatVarianceArgs): ResultType & {
  hasVariance?: boolean;
  variance?: {
    structures: StructureFormatVariance[];
    crossStructureVariance: boolean;
    crossStructureFormats: string[];
  };
} {
  const { drawDefinition, structureId, event } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const leafStructures: Structure[] = [];
  collectMatchUpStructures(drawDefinition.structures, leafStructures);

  const structures: StructureFormatVariance[] = [];
  const dominantFormats = new Set<string>();

  for (const structure of leafStructures) {
    const profile = structureFormatProfile(structure, drawDefinition.matchUpFormat, event?.matchUpFormat);
    if (!profile) continue;
    dominantFormats.add(profile.dominantFormat);
    if (structureId && structure.structureId !== structureId) continue;
    if (profile.distinctFormats.length > 1) structures.push(structureVariance(profile));
  }

  const crossStructureFormats = [...dominantFormats].sort((a, b) => a.localeCompare(b));
  return {
    ...SUCCESS,
    hasVariance: structures.length > 0,
    variance: {
      structures,
      crossStructureVariance: crossStructureFormats.length > 1,
      crossStructureFormats,
    },
  };
}
