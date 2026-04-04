import { getTieFormatDesc } from '../hierarchical/tieFormats/getTieFormatDescription';
import { allTournamentMatchUps } from '../matchUps/getAllTournamentMatchUps';
import { getAccessorValue } from '@Tools/getAccessorValue';
import { getDetailsWTN } from '../scales/getDetailsWTN';
import { findExtension } from '@Acquire/findExtension';
import { getTimeItem } from '../base/timeItems';
import { getAvgWTN } from '../scales/getAvgWTN';

// constants and types
import { POSITION_ACTIONS, DRAW_DELETIONS, FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { CONSOLATION, MAIN, PLAY_OFF, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { MISSING_TOURNAMENT_ID } from '@Constants/errorConditionConstants';
import { PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { Participant, Side, Tournament } from '@Types/tournamentTypes';
import { ADD_SCALE_ITEMS } from '@Constants/topicConstants';
import { HydratedParticipant } from '@Types/hydrated';
import { SEEDING } from '@Constants/scaleConstants';

type GetStructureReportsArgs = {
  firstStageSequenceOnly?: boolean;
  tournamentRecord: Tournament;
  extensionProfiles?: any[];
  firstFlightOnly?: boolean;
};

export function getStructureReports(params: GetStructureReportsArgs) {
  const { tournamentRecord, extensionProfiles, firstFlightOnly, firstStageSequenceOnly = true } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_ID };

  const mainStructures: any[] = [];
  const structureManipulations = {};
  const eventStructureReports = {};
  const flightReports: any[] = [];

  const filteStructreManipulations = (structureId) => (action) => action.structureId === structureId;

  const extensionValues = Object.assign(
    {},
    ...(extensionProfiles ?? []).map(({ name, label, accessor }) => {
      const element = findExtension({
        element: tournamentRecord,
        name,
      })?.extension?.value;

      const value = accessor ? getAccessorValue({ element, accessor })?.value : element;

      return { [label ?? name]: value };
    }),
  );

  const tournamentId = tournamentRecord?.tournamentId;
  const participantsProfile = { withScaleValues: true };
  const matchUps =
    allTournamentMatchUps({
      participantsProfile,
      tournamentRecord,
    }).matchUps ?? [];

  const getSeedingBasis = (timeItems) => {
    const timeItem = getTimeItem({
      itemType: ADD_SCALE_ITEMS,
      itemSubTypes: [SEEDING],
      element: { timeItems },
    })?.timeItem;
    return timeItem?.itemValue?.scaleBasis;
  };

  const updateStructureManipulations = ({ positionManipulations }) => {
    positionManipulations?.forEach((action) => {
      const { structureId, name } = action;
      const drawPositions = action.drawPositions ?? [action.drawPosition];
      structureManipulations[structureId] ??= [];
      structureManipulations[structureId].push(`${name}: ${drawPositions.join('/')}`);
    });
  };

  const tournamentStructureData = tournamentRecord?.events?.flatMap(
    ({ timeItems: eventTimeItems, drawDefinitions = [], extensions, eventType, eventName, eventId, category }) => {
      const flightProfile = extensions?.find((x) => x.name === FLIGHT_PROFILE);
      const flightNumbers = flightProfile?.value?.flights?.map((flight) => ({
        [flight.drawId]: flight.flightNumber,
      }));
      const flightMap: any = flightNumbers && Object.assign({}, ...flightNumbers);
      const drawDeletionsExtension = extensions?.find((x) => x.name === DRAW_DELETIONS);
      const drawDeletionsTimeItem = eventTimeItems?.find((x) => x.itemType === DRAW_DELETIONS);
      const drawDeletionsCount = drawDeletionsExtension?.value?.length ?? drawDeletionsTimeItem?.itemValue ?? 0;

      const mapValues: number[] = Object.values(flightMap ?? {});
      const minFlightNumber = flightMap && Math.min(...mapValues);

      const eventSeedingBasis = getSeedingBasis(eventTimeItems);

      eventStructureReports[eventId] = {
        seedingBasis: eventSeedingBasis ? JSON.stringify(eventSeedingBasis) : undefined,
        totalPositionManipulations: 0,
        maxPositionManipulations: 0,
        generatedDrawsCount: 0,
        drawDeletionsCount,
        tournamentId,
        eventId,
      };

      return (
        // check whether to only pull data from initial flights & ignore all other flights
        drawDefinitions
          .filter((d: any) => !firstFlightOnly || !flightNumbers || flightMap[d.drawId] === minFlightNumber)
          .flatMap((dd) => {
            const {
              matchUpFormat: drawMatchUpFormat,
              tieFormat: drawTieFormat,
              timeItems: drawTimeItems,
              extensions,
              structures,
              drawName,
              drawType,
              drawId,
            } = dd;
            const { matchUpFormatCounts, matchUpsCount, avgConfidence, pctNoRating, avgWTN } = getAvgWTN({
              eventType,
              matchUps,
              drawId,
            });

            const seedingBasis = getSeedingBasis(drawTimeItems) ?? eventSeedingBasis;

            const positionManipulations = getPositionManipulations({ extensions });
            const manipulationsCount = positionManipulations?.length ?? 0;
            updateStructureManipulations({ positionManipulations });

            eventStructureReports[eventId].totalPositionManipulations += manipulationsCount;
            eventStructureReports[eventId].generatedDrawsCount += 1;

            if (manipulationsCount > eventStructureReports[eventId].maxPositionManipulations)
              eventStructureReports[eventId].maxPositionManipulations = manipulationsCount;

            return structures
              ?.filter(
                (s: any) =>
                  (s.stageSequence === 1 || !firstStageSequenceOnly) &&
                  [QUALIFYING, MAIN, CONSOLATION, PLAY_OFF].includes(s.stage),
              )
              .map((s: any) => {
                const finalMatchUp = [MAIN, PLAY_OFF].includes(s.stage)
                  ? findFinalMatchUp(matchUps, s.structureId)
                  : undefined;

                if (s.stage === MAIN) mainStructures.push({ eventName, drawName, structureId: s.structureId });

                const winningSide = getWinningSide(finalMatchUp);
                const winningParticipant = winningSide?.participant as HydratedParticipant;

                const winningTeamId = getWinningTeamId(winningParticipant);
                const individualParticipants = getIndividualParticipants(winningParticipant);

                const winningPersonWTN = getDetailsWTN({
                  participant: individualParticipants?.[0] ?? winningParticipant,
                  eventType,
                });
                const {
                  personId: winningPersonId,
                  personOtherId: winningPersonOtherId,
                  tennisId: winningPersonTennisId,
                  confidence: confidence1,
                  wtnRating: wtnRating1,
                } = winningPersonWTN ?? {};

                const winningPerson2WTN = getDetailsWTN({
                  participant: individualParticipants?.[1],
                  eventType,
                });
                const {
                  personId: winningPerson2Id,
                  personOtherId: winningPerson2OtherId,
                  tennisId: winningPerson2TennisId,
                  confidence: confidence2,
                  wtnRating: wtnRating2,
                } = winningPerson2WTN ?? {};

                const { ageCategoryCode, categoryName, subType } = category ?? {};
                const matchUpFormat = s.matchUpFormat ?? drawMatchUpFormat;
                const matchUpsInitialFormat = matchUpFormatCounts[matchUpFormat] ?? 0;
                const pctInitialMatchUpFormat = (matchUpsInitialFormat / matchUpsCount) * 100;

                const { tieFormatName: drawTieFormatName, tieFormatDesc: drawTieFormatDesc } =
                  getTieFormatDesc(drawTieFormat);
                const { tieFormatName: structureTieFormatName, tieFormatDesc: structureTieFormatDesc } =
                  getTieFormatDesc(s.tieFormat);

                const equivalentTieFormatDesc = drawTieFormatDesc === structureTieFormatDesc;
                const tieFormatName = !equivalentTieFormatDesc && structureTieFormatName;
                const tieFormatDesc = s.tieFormat && !equivalentTieFormatDesc && structureTieFormatDesc;

                const manipulations =
                  positionManipulations?.filter(filteStructreManipulations(s.structureId))?.length ?? 0;

                return {
                  ...extensionValues,
                  tournamentId,
                  eventId,
                  structureId: s.structureId,
                  drawId,
                  eventType,
                  category: subType,
                  categoryName,
                  ageCategoryCode,
                  flightNumber: flightMap?.[drawId],
                  drawType,
                  stage: s.stage,
                  seedingBasis: seedingBasis ? JSON.stringify(seedingBasis) : undefined,
                  winningPersonId,
                  winningPersonOtherId,
                  winningPersonTennisId,
                  winningPersonWTNrating: wtnRating1,
                  winningPersonWTNconfidence: confidence1,
                  winningPerson2Id,
                  winningPerson2OtherId,
                  winningPerson2TennisId,
                  winningPerson2WTNrating: wtnRating2,
                  winningPerson2WTNconfidence: confidence2,
                  winningTeamId,
                  positionManipulations: manipulations,
                  pctNoRating,
                  matchUpFormat,
                  pctInitialMatchUpFormat,
                  matchUpsCount,
                  drawTieFormatName,
                  drawTieFormatDesc,
                  tieFormatName,
                  tieFormatDesc,
                  avgConfidence,
                  avgWTN,
                };
              });
          })
      );
    },
  );

  mainStructures.forEach(({ eventName, drawName, structureId }) => {
    if (structureManipulations[structureId]?.length)
      flightReports.push({ eventName, drawName, actions: structureManipulations[structureId] });
  });

  return {
    eventStructureReports: Object.values(eventStructureReports),
    structureReports: tournamentStructureData,
    flightReports,
  };
}

function getPositionManipulations({ extensions }) {
  return extensions?.find(({ name }) => name === POSITION_ACTIONS)?.value?.slice(1);
}

function findFinalMatchUp(matchUps: any[], structureId: string) {
  return matchUps.find(
    (matchUp) => matchUp.structureId === structureId && matchUp.finishingRound === 1 && matchUp.winningSide,
  );
}

function getWinningSide(finalMatchUp: any): (Side & { participant?: Participant }) | undefined {
  if (!finalMatchUp?.sides) return undefined;
  return finalMatchUp.sides.find((side: any) => side.sideNumber === finalMatchUp.winningSide) as Side & {
    participant?: Participant;
  };
}

function getWinningTeamId(winningParticipant: HydratedParticipant | undefined): string | undefined {
  return winningParticipant?.participantType === TEAM_PARTICIPANT ? winningParticipant.participantId : undefined;
}

function getIndividualParticipants(winningParticipant: HydratedParticipant | undefined): HydratedParticipant[] {
  return winningParticipant?.participantType === PAIR ? (winningParticipant.individualParticipants ?? []) : [];
}
