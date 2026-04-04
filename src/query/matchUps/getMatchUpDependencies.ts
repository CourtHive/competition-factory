/**
 * Builds up an exhaustive map of all matchUpIds on which a matchUpId is depdendent
 * Optionally builds up an exhaustive map of all potential participantIds for each matchUpId
 */

import { getIndividualParticipantIds } from '@Query/matchUp/getIndividualParticipantIds';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { allCompetitionMatchUps } from './getAllCompetitionMatchUps';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { allDrawMatchUps } from './getAllDrawMatchUps';
import { addGoesTo } from '@Query/matchUps/addGoesTo';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { ErrorType, MISSING_DRAW_ID, MISSING_MATCHUPS, MISSING_MATCHUP_IDS } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Tournament } from '@Types/tournamentTypes';
import { POSITION } from '@Constants/drawDefinitionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type GetMatchUpDependenciesArgs = {
  includeParticipantDependencies?: boolean;
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUps?: HydratedMatchUp[]; // requires matchUps { inContext: true }
  matchUpIds?: string[]; // will restrict dependency checking if prior matchUpIds are not included
  drawIds?: string[];
};

export function getMatchUpDependencies(params: GetMatchUpDependenciesArgs): {
  sourceMatchUpIds?: { [key: string]: any[] };
  matchUps?: HydratedMatchUp[];
  positionDependencies?: any;
  matchUpDependencies?: any;
  error?: ErrorType;
  success?: boolean;
} {
  let tournamentRecords = resolveTournamentRecords(params);
  const targetMatchUps = params.matchUps ?? []; // requires matchUps { inContext: true }
  let drawIds = params.drawIds ?? [];

  const { includeParticipantDependencies, tournamentRecord, drawDefinition } = params;

  if (!Array.isArray(targetMatchUps)) return { error: MISSING_MATCHUPS };
  if (!Array.isArray(drawIds)) return { error: MISSING_DRAW_ID };

  const matchUpIds = params.matchUpIds?.length ? params.matchUpIds : targetMatchUps.map((matchUp) => matchUp.matchUpId);
  if (!Array.isArray(matchUpIds)) return { error: MISSING_MATCHUP_IDS };

  const positionDependencies = {};
  const matchUpDependencies = {};
  const sourceStructureIdMap = {};
  const sourceMatchUpIds = {};

  if (tournamentRecord && !Object.keys(tournamentRecords).length)
    tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };

  const allTournamentRecords: Tournament[] = Object.values(tournamentRecords);

  const allLinks: DrawLink[] = allTournamentRecords.reduce((allLinks: any[], tournamentRecord) => {
    return allLinks
      .concat(tournamentRecord.events ?? [])
      .map((event) => (event.drawDefinitions ?? []).map((drawDefinition) => drawDefinition.links ?? []))
      .flat(Infinity);
  }, []);

  const positionLinks = allLinks.filter(({ linkType }) => linkType === POSITION);

  let matchUps: HydratedMatchUp[] | undefined = targetMatchUps;

  if (positionLinks.length) {
    matchUps = allCompetitionMatchUps({ nextMatchUps: true, tournamentRecords }).matchUps;

    buildPositionDependencies({
      positionLinks,
      sourceStructureIdMap,
      positionDependencies,
      matchUps,
    });
  }

  const initializeMatchUpId = (matchUpId) => {
    if (!matchUpDependencies[matchUpId]) {
      matchUpDependencies[matchUpId] = {
        dependentMatchUpIds: [],
        participantIds: [],
        matchUpIds: [],
        sources: [],
      };
      sourceMatchUpIds[matchUpId] = [];
    }
  };

  const propagateDependencies = (matchUpId, targetMatchUpId) => {
    const propagatedMatchUpIds = matchUpDependencies[matchUpId].matchUpIds;

    // push all existing dependents onto target dependents
    propagatedMatchUpIds.forEach((matchUpIdDependency) => {
      matchUpDependencies[targetMatchUpId].matchUpIds.push(matchUpIdDependency);
    });

    matchUpDependencies[targetMatchUpId].matchUpIds.push(matchUpId);
    matchUpDependencies[matchUpId].dependentMatchUpIds.push(targetMatchUpId);

    if (includeParticipantDependencies) {
      matchUpDependencies[matchUpId].participantIds.forEach((participantIdDependency) =>
        matchUpDependencies[targetMatchUpId].participantIds.push(participantIdDependency),
      );
    }
  };

  const processMatchUps = (matchUpsToProcess) => {
    const processSourceStructures = Object.keys(positionDependencies).length;

    for (const matchUp of matchUpsToProcess ?? []) {
      const { matchUpId, winnerMatchUpId, loserMatchUpId } = matchUp;

      // only process specified matchUps
      if (!matchUpIds.length || matchUpIds.includes(matchUpId)) {
        initializeMatchUpId(matchUpId);

        if (includeParticipantDependencies) {
          const { individualParticipantIds } = getIndividualParticipantIds(matchUp);
          matchUpDependencies[matchUpId].participantIds = individualParticipantIds;
        }

        if (winnerMatchUpId) {
          initializeMatchUpId(winnerMatchUpId);
          propagateDependencies(matchUpId, winnerMatchUpId);
          sourceMatchUpIds[winnerMatchUpId].push(matchUpId);
        }
        if (loserMatchUpId) {
          initializeMatchUpId(loserMatchUpId);
          propagateDependencies(matchUpId, loserMatchUpId);
          sourceMatchUpIds[loserMatchUpId].push(matchUpId);
        }

        matchUpDependencies[matchUpId].sources.push(sourceMatchUpIds[matchUpId]);
        const s1 = sourceMatchUpIds[matchUpId].map((id) => matchUpDependencies[id].sources[0]).flat();
        const s2 = sourceMatchUpIds[matchUpId].map((id) => matchUpDependencies[id].sources[1]).flat();
        matchUpDependencies[matchUpId].sources.push(...[s1, s2]);

        if (processSourceStructures) {
          const relevantStructureId = matchUp.containerStructureId || matchUp.structureId;
          const sourceStructureId = sourceStructureIdMap[relevantStructureId];
          if (positionDependencies[sourceStructureId]) {
            for (const matchUpDependency of positionDependencies[sourceStructureId]) {
              initializeMatchUpId(matchUpDependency);
              propagateDependencies(matchUpDependency, matchUpId);
              sourceMatchUpIds[matchUpDependency].push(matchUpId);
            }
          }
        }
      }
    }
  };

  if (drawDefinition) {
    addGoesTo({ drawDefinition });
    if (!matchUps?.length) {
      matchUps = allDrawMatchUps({ drawDefinition }).matchUps;
    }
    processMatchUps(matchUps);
  } else {
    if (!matchUps?.length) {
      matchUps = allCompetitionMatchUps({
        nextMatchUps: true,
        tournamentRecords,
      }).matchUps;
    }

    if (!drawIds.length) {
      drawIds = gatherAllDrawIds(allTournamentRecords);
    }

    for (const drawId of drawIds) {
      processDrawMatchUps({
        matchUps,
        drawId,
        tournamentRecords,
        processMatchUps,
      });
    }
  }

  return {
    positionDependencies,
    matchUpDependencies,
    sourceMatchUpIds,
    matchUps,
    ...SUCCESS,
  };
}

function buildPositionDependencies({ positionLinks, sourceStructureIdMap, positionDependencies, matchUps }) {
  const sourceStructureIds = positionLinks.reduce((structureIds: string[], link) => {
    const sourceStructureId = link.source?.structureId;
    const targetStructureId = link.target?.structureId;
    if (sourceStructureId && targetStructureId) sourceStructureIdMap[targetStructureId] = sourceStructureId;
    if (sourceStructureId && !structureIds.includes(sourceStructureId)) structureIds.push(sourceStructureId);
    return structureIds;
  }, []);

  for (const sourceStructureId of sourceStructureIds) {
    positionDependencies[sourceStructureId] = [];
  }
  for (const matchUp of matchUps ?? []) {
    const sourceStructureId = matchUp.containerStructureId || matchUp.structureId;
    if (sourceStructureIds.includes(sourceStructureId)) {
      positionDependencies[sourceStructureId].push(matchUp.matchUpId);
    }
  }
}

function gatherAllDrawIds(allTournamentRecords) {
  return allTournamentRecords?.length
    ? (allTournamentRecords
        .map(({ events = [] }) =>
          events.map(({ drawDefinitions = [] }) => drawDefinitions.map(({ drawId }) => drawId)),
        )
        .flat(Infinity) as string[])
    : [];
}

function processDrawMatchUps({ matchUps, drawId, tournamentRecords, processMatchUps }) {
  const drawMatchUps = matchUps?.filter((matchUp) => matchUp.drawId === drawId).sort(matchUpSort);

  const isRoundRobin = drawMatchUps?.find(({ roundPosition }) => !roundPosition);
  if (!isRoundRobin) {
    const hasTournamentId = drawMatchUps?.find(({ tournamentId }) => tournamentId);
    const { drawDefinition } = findEvent({
      tournamentRecord: tournamentRecords[hasTournamentId?.tournamentId],
      drawId,
    });
    if (drawDefinition) addGoesTo({ drawDefinition });
  }

  processMatchUps(drawMatchUps);
}
