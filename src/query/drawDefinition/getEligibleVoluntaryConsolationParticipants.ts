import { getPolicyDefinitions } from '../extensions/getAppliedPolicies';
import { allEventMatchUps } from '../matchUps/getAllEventMatchUps';
import { allDrawMatchUps } from '../matchUps/getAllDrawMatchUps';
import { getStageEntries } from './stageGetter';

// constants and types
import { MAIN, PLAY_OFF, QUALIFYING, VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { ErrorType, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_VOLUNTARY_CONSOLATION } from '@Constants/policyConstants';
import { UNGROUPED, WITHDRAWN } from '@Constants/entryStatusConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedSide } from '@Types/hydrated';
import {
  DrawDefinition,
  Event,
  MatchUpStatusUnion,
  Participant,
  StageTypeUnion,
  Tournament,
} from '@Types/tournamentTypes';

type GetEligibleVoluntaryConsolationParticipantsArgs = {
  excludedMatchUpStatuses?: MatchUpStatusUnion[];
  policyDefinitions?: PolicyDefinitions;
  includeEventParticipants?: boolean;
  includeQualifyingStage?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  finishingRoundLimit?: number;
  roundNumberLimit?: number;
  matchUpsLimit?: number;
  requirePlay?: boolean;
  requireLoss?: boolean;
  allEntries?: boolean;
  winsLimit?: number;
  event?: Event;
};

export function getEligibleVoluntaryConsolationParticipants({
  excludedMatchUpStatuses = [],
  includeEventParticipants, // boolean - consider event entries rather than draw entries (if event is present)
  includeQualifyingStage,
  finishingRoundLimit,
  policyDefinitions,
  roundNumberLimit,
  tournamentRecord,
  drawDefinition,
  matchUpsLimit,
  requirePlay,
  requireLoss,
  allEntries, // boolean - consider all entries, regardless of whether placed in draw
  winsLimit,
  event,
}: GetEligibleVoluntaryConsolationParticipantsArgs): {
  eligibleParticipants?: Participant[];
  losingParticipantIds?: string[];
  error?: ErrorType;
} {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const stages: StageTypeUnion[] = [MAIN, PLAY_OFF];
  if (includeQualifyingStage) stages.push(QUALIFYING);

  const matchUps = fetchMatchUps({
    includeEventParticipants,
    tournamentRecord,
    drawDefinition,
    stages,
    event,
  });

  const voluntaryConsolationEntries = getStageEntries({
    stage: VOLUNTARY_CONSOLATION,
    drawDefinition,
  });
  const voluntaryConsolationEntryIds = new Set(voluntaryConsolationEntries.map(({ participantId }) => participantId));

  const resolvedPolicy = resolvePolicy({
    excludedMatchUpStatuses,
    includeEventParticipants,
    finishingRoundLimit,
    policyDefinitions,
    roundNumberLimit,
    tournamentRecord,
    drawDefinition,
    matchUpsLimit,
    requirePlay,
    requireLoss,
    allEntries,
    winsLimit,
    event,
  });

  const { participantMatchUps, losingParticipants, matchUpParticipants, participantWins } =
    buildParticipantMatchUpData({
      excludedMatchUpStatuses: resolvedPolicy.excludedMatchUpStatuses,
      finishingRoundLimit: resolvedPolicy.finishingRoundLimit,
      roundNumberLimit: resolvedPolicy.roundNumberLimit,
      requirePlay: resolvedPolicy.requirePlay,
      matchUps,
    });

  const losingParticipantIds = Object.keys(losingParticipants);

  const consideredParticipants = getConsideredParticipants({
    includeEventParticipants: resolvedPolicy.includeEventParticipants,
    requireLoss: resolvedPolicy.requireLoss,
    requirePlay: resolvedPolicy.requirePlay,
    allEntries: resolvedPolicy.allEntries,
    matchUpParticipants,
    losingParticipants,
    tournamentRecord,
    drawDefinition,
    event,
  });

  const losingParticipantIdSet = new Set(losingParticipantIds);

  const eligibleParticipants = consideredParticipants
    .filter((participant: any) => {
      return isParticipantEligible({
        voluntaryConsolationEntryIds,
        losingParticipantIdSet,
        participantMatchUps,
        participantWins,
        resolvedPolicy,
        participant,
      });
    })
    .map((participant: any) => {
      return {
        ...participant,
        individualParticipants: participant.individualParticipantIds?.map((participantId) =>
          tournamentRecord?.participants?.find((individual) => individual.participantId === participantId),
        ),
      };
    });

  return { eligibleParticipants, losingParticipantIds, ...SUCCESS };
}


function isParticipantEligible({
  voluntaryConsolationEntryIds,
  losingParticipantIdSet,
  participantMatchUps,
  participantWins,
  resolvedPolicy,
  participant,
}) {
  const pid = participant.participantId;
  const lossOk = resolvedPolicy.requireLoss ? losingParticipantIdSet.has(pid) : true;
  const playOk = resolvedPolicy.requirePlay ? (participantMatchUps[pid] || 0) >= 0 : true;
  const winsOk = resolvedPolicy.winsLimit ? (participantWins[pid] || 0) <= resolvedPolicy.winsLimit : true;
  const matchUpsOk = resolvedPolicy.matchUpsLimit ? participantMatchUps[pid] <= resolvedPolicy.matchUpsLimit : true;
  const notSelected = !voluntaryConsolationEntryIds.has(pid);
  return lossOk && playOk && winsOk && matchUpsOk && notSelected;
}

function fetchMatchUps({ includeEventParticipants, tournamentRecord, drawDefinition, stages, event }) {
  const eventMatchUpFilters = event?.eventType ? { matchUpTypes: [event.eventType] } : undefined;
  const drawMatchUpFilters = drawDefinition?.matchUpType ? { matchUpTypes: [drawDefinition.matchUpType] } : undefined;

  if (includeEventParticipants && event) {
    return (
      allEventMatchUps({
        contextFilters: { stages },
        matchUpFilters: eventMatchUpFilters,
        tournamentRecord,
        inContext: true,
        event,
      })?.matchUps ?? []
    );
  }

  return (
    allDrawMatchUps({
      contextFilters: { stages },
      matchUpFilters: drawMatchUpFilters,
      tournamentRecord,
      inContext: true,
      drawDefinition,
    })?.matchUps ?? []
  );
}

function resolvePolicy({
  excludedMatchUpStatuses,
  includeEventParticipants,
  finishingRoundLimit,
  policyDefinitions,
  roundNumberLimit,
  tournamentRecord,
  drawDefinition,
  matchUpsLimit,
  requirePlay,
  requireLoss,
  allEntries,
  winsLimit,
  event,
}) {
  const resolvedPolicyDefs =
    policyDefinitions ??
    getPolicyDefinitions({
      policyTypes: [POLICY_TYPE_VOLUNTARY_CONSOLATION],
      tournamentRecord,
      drawDefinition,
      event,
    }).policyDefinitions;

  const policy = resolvedPolicyDefs?.[POLICY_TYPE_VOLUNTARY_CONSOLATION];

  const resolvedExcludedMatchUpStatuses =
    (excludedMatchUpStatuses.length && excludedMatchUpStatuses) || policy?.excludedMatchUpStatuses || [];

  return {
    includeEventParticipants: includeEventParticipants ?? policy?.includeEventParticipants,
    finishingRoundLimit: finishingRoundLimit ?? policy?.finishingRoundLimit,
    excludedMatchUpStatuses: resolvedExcludedMatchUpStatuses,
    roundNumberLimit: roundNumberLimit ?? policy?.roundNumberLimit,
    matchUpsLimit: matchUpsLimit ?? policy?.matchUpsLimit,
    requirePlay: requirePlay ?? policy?.requirePlay ?? true,
    requireLoss: requireLoss ?? policy?.requireLoss ?? true,
    allEntries: allEntries ?? policy?.allEntries,
    winsLimit: winsLimit ?? policy?.winsLimit,
  };
}

function buildParticipantMatchUpData({
  excludedMatchUpStatuses,
  finishingRoundLimit,
  roundNumberLimit,
  requirePlay,
  matchUps,
}) {
  const participantMatchUps = {};
  const losingParticipants = {};
  const matchUpParticipants = {};
  const participantWins = {};

  const excludedSet = new Set(excludedMatchUpStatuses);

  for (const matchUp of matchUps) {
    if (!isMatchUpRelevant({ matchUp, requirePlay, finishingRoundLimit, roundNumberLimit })) continue;

    processMatchUpSides({
      matchUp,
      requirePlay,
      excludedSet,
      participantMatchUps,
      losingParticipants,
      matchUpParticipants,
      participantWins,
    });
  }

  return { participantMatchUps, losingParticipants, matchUpParticipants, participantWins };
}

function isMatchUpRelevant({ matchUp, requirePlay, finishingRoundLimit, roundNumberLimit }) {
  if (
    requirePlay &&
    matchUp.winningSide &&
    ![1, 2].includes(matchUp.winningSide) &&
    matchUp.matchUpStatus !== DOUBLE_WALKOVER
  )
    return false;
  if (matchUp.finishingRound && finishingRoundLimit && matchUp.finishingRound >= finishingRoundLimit) return false;
  if (matchUp.finishingRound && roundNumberLimit && matchUp.finishingRound <= roundNumberLimit) return false;
  return true;
}

function processMatchUpSides({
  matchUp,
  requirePlay,
  excludedSet,
  participantMatchUps,
  losingParticipants,
  matchUpParticipants,
  participantWins,
}) {
  const losingSide = matchUp.sides?.find(
    ({ sideNumber }) => matchUp.winningSide && sideNumber === 3 - matchUp.winningSide,
  ) as HydratedSide;
  const winningSide = matchUp.sides?.find(
    ({ sideNumber }) => matchUp.winningSide && sideNumber === matchUp.winningSide,
  ) as HydratedSide;

  matchUp.sides?.forEach((side: HydratedSide) => {
    const participantId = side?.participant?.participantId;
    if (participantId) {
      matchUpParticipants[participantId] = side.participant;
      if (matchUp.matchUpStatus === DOUBLE_WALKOVER && !requirePlay) {
        losingParticipants[participantId] = side.participant;
        if (!participantMatchUps[participantId]) participantMatchUps[participantId] = 0;
        if (!matchUp.matchUpStatus || !excludedSet.has(matchUp.matchUpStatus))
          participantMatchUps[participantId] += 1;
      }
    }
  });

  if (losingSide?.participant) {
    const participantId = losingSide.participant.participantId;
    losingParticipants[participantId] = losingSide.participant;
    if (!participantMatchUps[participantId]) participantMatchUps[participantId] = 0;
    if (matchUp.matchUpStatus && !excludedSet.has(matchUp.matchUpStatus))
      participantMatchUps[participantId] += 1;
  }

  if (winningSide?.participant) {
    const participantId = winningSide.participant.participantId;
    if (!participantWins[participantId]) participantWins[participantId] = 0;
    participantWins[participantId] += 1;
    if (!participantMatchUps[participantId]) participantMatchUps[participantId] = 0;
    if (matchUp.matchUpStatus && !excludedSet.has(matchUp.matchUpStatus))
      participantMatchUps[participantId] += 1;
  }
}

function getConsideredParticipants({
  includeEventParticipants,
  matchUpParticipants,
  losingParticipants,
  tournamentRecord,
  drawDefinition,
  requireLoss,
  requirePlay,
  allEntries,
  event,
}) {
  const considerEntered = tournamentRecord?.participants && !requirePlay && !requireLoss && allEntries;

  let entriesSource;
  if (includeEventParticipants && event) {
    entriesSource = event.entries;
  } else {
    entriesSource = drawDefinition.entries;
  }

  const excludedStatuses = new Set([WITHDRAWN, UNGROUPED]);
  const enteredParticipantIds = considerEntered
    ? (entriesSource ?? [])
        .filter((entry: any) => !excludedStatuses.has(entry.entryStatus))
        .map(({ participantId }) => participantId)
    : [];

  if (considerEntered) {
    const enteredSet = new Set(enteredParticipantIds);
    return (tournamentRecord?.participants ?? []).filter(({ participantId }) => enteredSet.has(participantId));
  }

  if (requireLoss) {
    return Object.values(losingParticipants);
  }

  return Object.values(matchUpParticipants);
}
