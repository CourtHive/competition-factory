import { generateRange, intersection, overlap, unique } from '@Tools/arrays';

// constants and types
import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { StructureProfile } from '@Types/factoryTypes';
import {
  BOTTOM_UP,
  DRAW,
  QUALIFYING,
  RANDOM,
  TOP_DOWN,
  VOLUNTARY_CONSOLATION,
  WATERFALL,
} from '@Constants/drawDefinitionConstants';

/**
 * return an array of arrays of grouped structureIds => structureGroups
 * the expectation is that all structures within a drawDefintion are linked
 * return a boolean whether this condition is met => allSructuresLinked
 */
export function getStructureGroups({ drawDefinition }: { drawDefinition: DrawDefinition }): {
  sourceStructureIds: { [key: string]: boolean };
  hasDrawFeedProfile: { [key: string]: boolean }; // denotes placement is by DRAW, e.g. manually placed qualifiers
  structureProfiles: { [key: string]: StructureProfile };
  allStructuresLinked: boolean;
  structureGroups: string[][];
  maxQualifyingDepth: number;
} {
  const structures = drawDefinition.structures ?? [];
  const links = drawDefinition.links ?? [];

  const structureProfiles = new Map<string, StructureProfile>();

  const initStructureProfile = (structureId) => {
    const profile =
      structureProfiles.get(structureId) ||
      (structureProfiles.set(structureId, {
        drawSources: [],
        drawTargets: [],
        progeny: [],
        sources: [],
        targets: [],
      }) &&
        structureProfiles.get(structureId));

    if (profile && !profile?.stage) {
      const structure = structures.find((structure) => structure.structureId === structureId);
      profile.stage = structure?.stage;
    }

    return profile;
  };

  const sourceStructureIds = {};
  const hasDrawFeedProfile = {};
  let linkedStructureIds = processLinks({ links, initStructureProfile, sourceStructureIds, hasDrawFeedProfile });

  enrichProfilesWithRootStageAndProgeny(structureProfiles);

  const maxQualifyingDepth = calculateMaxQualifyingDepth(structureProfiles);

  // iterate through all groups of structureIds to flatten tree of links between structures
  const iterations = linkedStructureIds.length;
  generateRange(0, Math.ceil(iterations / 2)).forEach(() => {
    linkedStructureIds = generateRange(0, iterations).map((index) => {
      const structureIds = linkedStructureIds[index];
      const mergedWithOverlappingIds =
        linkedStructureIds.reduce((biggest, ids) => {
          const hasOverlap = overlap(structureIds, ids);
          return hasOverlap ? biggest.concat(...ids) : biggest;
        }, []) ?? [];
      return unique(structureIds.concat(...mergedWithOverlappingIds));
    });
  });

  // at this point all linkedStructureIds arrays should be equivalent
  // use the first of these as the identity array
  const groupedStructureIds = linkedStructureIds[0];

  // utility method to recognize equivalent arrays of structureIds
  const identityLink = (a, b) => intersection(a, b).length === a.length;

  // check that all arrays of linkedStructureIds are equivalent to identity array
  const allLinkStructuresLinked = linkedStructureIds.slice(1).reduce((allLinkStructuresLinked, ids) => {
    return allLinkStructuresLinked && identityLink(ids, groupedStructureIds);
  }, true);

  // if a drawDefinition contains no links then no structure groups will exist
  // filter out undefined when there are no links in a drawDefinition
  const structureGroups = [groupedStructureIds].filter(Boolean);

  // this is the same as structureGroups, but excludes VOLUNTARY_CONSOLATION
  const linkCheck: string[][] = [groupedStructureIds].filter(Boolean);

  // iterate through all structures to add missing structureIds
  addMissingStructures({ structures, structureGroups, linkCheck });

  const allStructuresLinked = allLinkStructuresLinked && linkCheck.length === 1;

  if (!links?.length && structures.length === 1) {
    initStructureProfile(structures[0].structureId);
  }

  return {
    structureProfiles: Object.fromEntries(structureProfiles),
    allStructuresLinked,
    maxQualifyingDepth,
    sourceStructureIds,
    hasDrawFeedProfile,
    structureGroups,
  };
}

function processLinks({ links, initStructureProfile, sourceStructureIds, hasDrawFeedProfile }) {
  return links.map((link) => {
    const sourceId = link.source.structureId;
    const targetId = link.target.structureId;

    const sourceProfile = initStructureProfile(sourceId);
    const targetProfile = initStructureProfile(targetId);
    if ([BOTTOM_UP, TOP_DOWN, RANDOM, WATERFALL].includes(link.target.feedProfile)) {
      sourceProfile?.targets.push(targetId);
      targetProfile?.sources.push(sourceId);
    } else if (link.target.feedProfile === DRAW) {
      targetProfile?.drawSources.push(sourceId);
      sourceProfile?.drawTargets.push(targetId);
    }

    hasDrawFeedProfile[targetId] = hasDrawFeedProfile[targetId] || link.target.feedProfile === DRAW;
    sourceStructureIds[targetId] = unique([...(sourceStructureIds[targetId] ?? []), sourceId]).filter(Boolean);

    return [link.source.structureId, link.target.structureId];
  });
}

function enrichProfilesWithRootStageAndProgeny(structureProfiles: Map<string, StructureProfile>) {
  for (const structureId of structureProfiles.keys()) {
    const profile = structureProfiles.get(structureId);
    if (!profile) continue;

    resolveRootStage(profile, structureProfiles);
    resolveProgeny(profile, structureProfiles);
  }
}

function resolveRootStage(profile: StructureProfile, structureProfiles: Map<string, StructureProfile>) {
  const sourceIds = profile.targets ?? [];
  while (sourceIds.length) {
    const sourceId = sourceIds.pop();
    const sourceProfile = sourceId && structureProfiles[sourceId];
    if (sourceProfile?.targets?.length) {
      sourceIds.push(...sourceProfile.targets);
    } else if (sourceProfile) {
      profile.rootStage = sourceProfile.stage;
    }
  }
  profile.rootStage ??= profile.stage;
}

function resolveProgeny(profile: StructureProfile, structureProfiles: Map<string, StructureProfile>) {
  if (profile.targets?.length) return;
  const targetIds = profile.sources ?? [];
  while (targetIds.length) {
    const targetId = targetIds.pop();
    const targetProfile = targetId && structureProfiles[targetId];
    if (targetProfile?.sources?.length) {
      for (const id of targetProfile.sources) {
        if (!profile.progeny?.includes(id)) profile.progeny?.push(id);
      }
      targetIds.push(...targetProfile.sources);
    }
  }
}

function calculateMaxQualifyingDepth(structureProfiles: Map<string, StructureProfile>): number {
  let maxQualifyingDepth = 0;
  for (const structureId of structureProfiles.keys()) {
    const profile = structureProfiles.get(structureId);
    if (profile?.rootStage !== QUALIFYING) continue;

    const drawTargets = [profile.drawTargets?.[0]];
    let distanceFromMain = 0;
    while (drawTargets.length) {
      distanceFromMain += 1;
      const drawTarget = drawTargets.pop();
      const targetProfile = drawTarget ? structureProfiles.get(drawTarget) : undefined;
      if (targetProfile?.drawTargets?.length) {
        drawTargets.push(targetProfile.drawTargets[0]);
      }
    }
    profile.distanceFromMain = distanceFromMain;
    if (distanceFromMain > maxQualifyingDepth) maxQualifyingDepth = distanceFromMain;
  }
  return maxQualifyingDepth;
}

function addMissingStructures({
  structures,
  structureGroups,
  linkCheck,
}: {
  structures: Structure[];
  structureGroups: string[][];
  linkCheck: string[][];
}) {
  structures.forEach((structure) => {
    const { structureId, stage } = structure;
    const existingGroup = structureGroups.find((group) => {
      return group.includes(structureId);
    });
    if (!existingGroup) {
      structureGroups.push([structureId]);
      if (stage !== VOLUNTARY_CONSOLATION) linkCheck.push([structureId]);
    }
  });
}
