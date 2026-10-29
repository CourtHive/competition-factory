/**
 * Builds up an exhaustive map of all matchUpIds on which a matchUpId is depdendent
 * Optionally builds up an exhaustive map of all potential participantIds for each matchUpId
 */

import { isRoundWinnerLink, traversesByFinishingPosition } from '@Query/drawDefinition/linkTraversal';
import { getIndividualParticipantIds } from '@Query/matchUp/getIndividualParticipantIds';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { derivedGoesToOrLinkError, GoesToMap } from '@Query/matchUps/addGoesTo';
import { allCompetitionMatchUps } from './getAllCompetitionMatchUps';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { allDrawMatchUps } from './getAllDrawMatchUps';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { ErrorType, MISSING_DRAW_ID, MISSING_MATCHUPS, MISSING_MATCHUP_IDS } from '@Constants/errorConditionConstants';
import { DrawDefinition, DrawLink, Tournament } from '@Types/tournamentTypes';
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
  /**
   * the given matchUps cover every draw of the records (`getLeanMatchUpDependencies`): position links read them, not a
   * hydration of the competition
   */
  coversAllDraws?: boolean;
  /** the competition's matchUps, as the scheduling projection gives them: position links read them, not a hydration */
  competitionMatchUps?: HydratedMatchUp[];
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

  const allDrawDefinitions: DrawDefinition[] = allTournamentRecords.flatMap((tournamentRecord) =>
    (tournamentRecord.events ?? []).flatMap((event) => event.drawDefinitions ?? []),
  );
  // each link is classified with its own draw in view: a link out of a round robin traverses by finishing position,
  // labelled POSITION or WINNER (linkTraversal.ts)
  const linksOf = (predicate: (link: DrawLink, drawDefinition: DrawDefinition) => boolean): DrawLink[] =>
    allDrawDefinitions.flatMap((drawDefinition) =>
      (drawDefinition.links ?? []).filter((link) => predicate(link, drawDefinition)),
    );

  const positionLinks = linksOf((link, drawDefinition) => traversesByFinishingPosition(link, drawDefinition));
  // a WINNER link between two structures feeds the winners of a qualifying round into qualifier positions
  const qualifyingLinks = linksOf(
    (link, drawDefinition) =>
      isRoundWinnerLink(link, drawDefinition) &&
      !!link.source?.structureId &&
      !!link.target?.structureId &&
      link.source.structureId !== link.target.structureId,
  );

  let matchUps: HydratedMatchUp[] | undefined = targetMatchUps;

  if (positionLinks.length) {
    if (!params.coversAllDraws)
      matchUps =
        params.competitionMatchUps ?? allCompetitionMatchUps({ nextMatchUps: true, tournamentRecords }).matchUps;

    buildPositionDependencies({
      positionLinks,
      sourceStructureIdMap,
      positionDependencies,
      matchUps,
    });
  }

  // the matchUps whose winners can fill a qualifier position of this matchUp
  const getQualifyingSourceMatchUpIds = (matchUp: HydratedMatchUp): string[] => {
    if (!qualifyingLinks.length || !matchUp.sides?.some((side) => side?.qualifier)) return [];
    const { structureId, roundNumber } = matchUp;
    return qualifyingLinks
      .filter(({ target }) => target.structureId === structureId && (target.roundNumber ?? 1) === roundNumber)
      .flatMap(({ source }) =>
        (matchUps ?? [])
          .filter((sourceMatchUp) => sourceMatchUp.structureId === source.structureId)
          .filter((sourceMatchUp) => !source.roundNumber || sourceMatchUp.roundNumber === source.roundNumber)
          .map(({ matchUpId }) => matchUpId),
      );
  };

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

  // the edges of a draw that does not store them, derived on a copy: a matchUp read from that draw carries none
  const derivedGoesTo: GoesToMap = { winnerMatchUpIds: {}, loserMatchUpIds: {} };
  const readGoesTo = (drawDefinition: DrawDefinition) => {
    const result = derivedGoesToOrLinkError({ drawDefinition });
    if (result?.error) return result;
    Object.assign(derivedGoesTo.winnerMatchUpIds, result?.goesToMap?.winnerMatchUpIds);
    Object.assign(derivedGoesTo.loserMatchUpIds, result?.goesToMap?.loserMatchUpIds);
    return undefined;
  };

  const processMatchUps = (matchUpsToProcess) => {
    const processSourceStructures = Object.keys(positionDependencies).length;

    for (const matchUp of matchUpsToProcess ?? []) {
      const { matchUpId } = matchUp;
      const winnerMatchUpId = matchUp.winnerMatchUpId ?? derivedGoesTo.winnerMatchUpIds[matchUpId];
      const loserMatchUpId = matchUp.loserMatchUpId ?? derivedGoesTo.loserMatchUpIds[matchUpId];

      // only process specified matchUps
      if (!matchUpIds.length || matchUpIds.includes(matchUpId)) {
        initializeMatchUpId(matchUpId);

        // a matchUp's own participants JOIN those its sources have already pushed onto it (G1: assigning them
        // replaced the inherited ones, so participant dependencies never reached past one round)
        if (includeParticipantDependencies) {
          const { individualParticipantIds } = getIndividualParticipantIds(matchUp);
          const participantIds = matchUpDependencies[matchUpId].participantIds;
          individualParticipantIds.forEach((participantId) => {
            if (!participantIds.includes(participantId)) participantIds.push(participantId);
          });
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

        // G2: a qualifier position is filled by the winner of ANY matchUp in the linked qualifying round
        for (const qualifyingMatchUpId of getQualifyingSourceMatchUpIds(matchUp)) {
          initializeMatchUpId(qualifyingMatchUpId);
          propagateDependencies(qualifyingMatchUpId, matchUpId);
          sourceMatchUpIds[matchUpId].push(qualifyingMatchUpId);
        }

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
    // the edges are read from the stored matchUps, derived on a copy for a draw that does not store them; a
    // malformed round link is refused either way
    const goesTo = readGoesTo(drawDefinition);
    if (goesTo?.error) return goesTo;
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
      const result = processDrawMatchUps({
        matchUps,
        drawId,
        tournamentRecords,
        processMatchUps,
        readGoesTo,
      });
      if (result?.error) return result;
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
        .map(({ events = [] }) => events.map(({ drawDefinitions = [] }) => drawDefinitions.map(({ drawId }) => drawId)))
        .flat(Infinity) as string[])
    : [];
}

function processDrawMatchUps({ matchUps, drawId, tournamentRecords, processMatchUps, readGoesTo }) {
  const drawMatchUps = matchUps?.filter((matchUp) => matchUp.drawId === drawId).sort(matchUpSort);

  const isRoundRobin = drawMatchUps?.find(({ roundPosition }) => !roundPosition);
  if (!isRoundRobin) {
    const hasTournamentId = drawMatchUps?.find(({ tournamentId }) => tournamentId);
    const { drawDefinition } = findEvent({
      tournamentRecord: tournamentRecords[hasTournamentId?.tournamentId],
      drawId,
    });
    const goesTo = drawDefinition && readGoesTo(drawDefinition);
    if (goesTo?.error) return goesTo;
  }

  processMatchUps(drawMatchUps);
  return undefined;
}
