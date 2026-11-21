import { getCollectionPositionAssignments } from '@Query/hierarchical/tieFormats/getCollectionPositionAssignments';
import { addDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getTieMatchUpContext } from '@Query/hierarchical/tieFormats/getTieMatchUpContext';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import { checkTeamMembership, getTeamMemberships } from './teamMembership';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getParticipants } from '@Query/participants/getParticipants';
import { decorateResult } from '@Functions/global/decorateResult';
import { planReplacementLineUp } from './planReplacementLineUp';
import { validateLineUp } from '@Validators/validateTeamLineUp';
import { replacementEffects } from './planReplacementEffects';
import { planReplacementPair } from './planReplacementPair';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { LINEUPS } from '@Constants/extensionConstants';
import { ensuredDualSides } from './ensureSideLineUps';
import { addNotice } from '@Global/state/globalState';
import { planFieldWrite } from '@Mutate/planCommit';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { unique } from '@Tools/arrays';

// constants and types
import { CollectionAssignment, DrawDefinition, Event, TeamCompetitor, Tournament } from '@Types/tournamentTypes';
import POLICY_MATCHUP_ACTIONS_DEFAULT from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import { LineUp, PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { coercedGender } from '@Helpers/coercedGender';
import { SUCCESS } from '@Constants/resultConstants';
import { isGendered } from '@Validators/isGendered';
import { DOUBLES } from '@Constants/matchUpTypes';
import {
  EXISTING_PARTICIPANT,
  INVALID_PARTICIPANT,
  INVALID_PARTICIPANT_TYPE,
  MISSING_PARTICIPANT_ID,
  NOT_FOUND,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type ReplaceTieMatchUpParticipantIdArgs = {
  policyDefinitions?: PolicyDefinitions;
  existingParticipantId: string;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  newParticipantId: string;
  enforceGender?: boolean;
  substitution?: boolean;
  tieMatchUpId: string;
  event: Event;
};

export function replaceTieMatchUpParticipantId(params: ReplaceTieMatchUpParticipantIdArgs): ResultType & {
  participantRemoved?: string;
  participantAdded?: string;
  modifiedLineUp?: LineUp;
} {
  const matchUpContext = getTieMatchUpContext({ ...params, requireResolvedMatchUpType: true });
  if (matchUpContext.error) return matchUpContext;
  const stack = 'replaceTieMatchUpParticipantid';

  const { existingParticipantId, tournamentRecord, newParticipantId, drawDefinition, substitution, event } = params;

  if (!existingParticipantId || !newParticipantId)
    return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });

  if (existingParticipantId === newParticipantId) return { ...SUCCESS };

  const {
    inContextDualMatchUp,
    inContextTieMatchUp,
    collectionPosition,
    collectionId,
    dualMatchUp,
    tieMatchUp,
    tieFormat,
  } = matchUpContext;

  const matchUpType = inContextTieMatchUp?.matchUpType;

  const side = inContextTieMatchUp?.sides?.find(
    (side) =>
      side.participant?.participantId === existingParticipantId ||
      side.participant?.individualParticipantIds?.includes(existingParticipantId),
  );
  if (!side) return { error: PARTICIPANT_NOT_FOUND };

  const validationError = validateParticipantsAndGender({
    existingParticipantId,
    inContextTieMatchUp,
    newParticipantId,
    tournamentRecord,
    drawDefinition,
    params,
    event,
    stack,
  });
  if (validationError) return validationError;

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    event,
  });

  const matchUpActionsPolicy =
    params.policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

  const substitutionProcessCodes = matchUpActionsPolicy?.processCodes?.substitution;

  const sides = ensuredDualSides({
    contextSides: inContextDualMatchUp?.sides,
    rawSides: dualMatchUp?.sides,
    lineUps: firstClassOrExtension({ element: drawDefinition, attribute: 'lineUps', name: LINEUPS }),
  });
  const dualMatchUpSide = dualMatchUp && sides?.find(({ sideNumber }) => sideNumber === side.sideNumber);

  if (!sides || !dualMatchUpSide) {
    return decorateResult({
      result: {
        sideNumber: side.sideNumber,
        existingParticipantId,
        error: NOT_FOUND,
      },
      stack,
    });
  }

  const allTieIndividualParticipantIds = inContextTieMatchUp?.sides?.flatMap(
    (side: any) => side.participant?.individualParticipantIds || (side.participant?.participantId ?? []),
  );

  if (allTieIndividualParticipantIds?.includes(newParticipantId)) {
    return decorateResult({ result: { error: EXISTING_PARTICIPANT }, stack });
  }

  const teamParticipantId = inContextDualMatchUp?.sides?.find(
    ({ sideNumber }) => sideNumber === side.sideNumber,
  )?.participantId;

  // one player, one team, per event: another team's player is refused; a player on no team joins with a warning
  const membership = checkTeamMembership({
    memberships: getTeamMemberships({ tournamentRecord, event }),
    teamParticipantId,
    individualIds: [newParticipantId],
  });
  if (membership.error) return decorateResult({ result: membership, stack });

  const teamLineUp = dualMatchUpSide.lineUp;

  const modifiedLineUp = buildModifiedLineUp({
    existingParticipantId,
    collectionPosition,
    newParticipantId,
    substitution,
    collectionId,
    teamLineUp,
  });

  const isDoubles = matchUpType === DOUBLES;

  const { assignedParticipantIds: existingIndividualParticipantIds } = getCollectionPositionAssignments({
    lineUp: teamLineUp,
    collectionPosition,
    collectionId,
  });

  const { assignedParticipantIds: individualParticipantIds } = getCollectionPositionAssignments({
    lineUp: modifiedLineUp,
    collectionPosition,
    collectionId,
  });

  const sideIndex = sides.indexOf(dualMatchUpSide);

  const { writes, notices, effects } = replacementEffects();
  writes.push(planFieldWrite(dualMatchUp, 'sides', sides));
  const noticeContext = { tournamentId: tournamentRecord.tournamentId, drawDefinition, event };
  modifyMatchUpNotice({ ...noticeContext, matchUp: dualMatchUp, context: 'ensureSidLineUps' }, effects);
  // Assign to the side installed by the array setter (it may cast each side to a subdocument).
  writes.push(() => {
    dualMatchUp.sides![sideIndex].lineUp = modifiedLineUp;
  });
  let lineUps;
  if (teamParticipantId && tieFormat) {
    if (typeof teamParticipantId !== 'string')
      return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });
    const validation = validateLineUp({ lineUp: modifiedLineUp, tieFormat });
    if (!validation.valid) return decorateResult({ result: validation, stack });
    lineUps = planReplacementLineUp({ drawDefinition, teamParticipantId, modifiedLineUp, writes });
    addDrawNotice({ drawDefinition }, effects);
  }

  const pairResult = isDoubles
    ? planReplacementPair({
        existingIndividualParticipantIds,
        individualParticipantIds,
        tournamentRecord,
        drawDefinition,
        dualMatchUp,
        event,
        sides: sides.map((s, i) => (i === sideIndex ? { ...s, lineUp: modifiedLineUp } : s)),
        lineUps,
        stack,
        writes,
        notices,
      })
    : {};
  if ('error' in pairResult) return pairResult;
  const { getParticipantAdded, participantRemoved } = pairResult;

  planProcessCodes({
    effects,
    writes,
    substitutionProcessCodes,
    tournamentRecord,
    drawDefinition,
    substitution,
    tieMatchUp,
    stack,
    side,
    event,
  });

  modifyMatchUpNotice({ ...noticeContext, matchUp: dualMatchUp, context: stack }, effects);
  for (const write of writes) write();
  for (const notice of notices) addNotice(typeof notice === 'function' ? notice() : notice);
  if (!teamParticipantId || !tieFormat) {
    pushGlobalLog({ method: 'replaceTieMatchUpParticipant', issue: 'team participantId not found' });
  }
  return {
    ...SUCCESS,
    modifiedLineUp,
    participantRemoved,
    participantAdded: getParticipantAdded?.(),
    warnings: membership.warnings,
  };
}

function validateParticipantsAndGender({
  existingParticipantId,
  inContextTieMatchUp,
  newParticipantId,
  tournamentRecord,
  drawDefinition,
  params,
  event,
  stack,
}) {
  const targetParticipants =
    getParticipants({
      tournamentRecord,
      participantFilters: {
        participantIds: [existingParticipantId, newParticipantId],
      },
    })?.participants ?? [];

  if (targetParticipants.length !== 2) return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });
  if (targetParticipants[0].participantType !== targetParticipants[1].participantType)
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_TYPE },
      stack,
    });

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    event,
  });

  const matchUpActionsPolicy =
    params.policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS] ??
    POLICY_MATCHUP_ACTIONS_DEFAULT[POLICY_TYPE_MATCHUP_ACTIONS];

  const newParticipant = targetParticipants.find(({ participantId }) => participantId === newParticipantId);

  const genderEnforced = (params.enforceGender ?? matchUpActionsPolicy?.participants?.enforceGender) !== false;
  if (
    genderEnforced &&
    isGendered(inContextTieMatchUp?.gender) &&
    coercedGender(inContextTieMatchUp?.gender) !== coercedGender(newParticipant?.person?.sex)
  ) {
    return { error: INVALID_PARTICIPANT, info: 'Gender mismatch' };
  }

  return undefined;
}

function buildModifiedLineUp({
  existingParticipantId,
  collectionPosition,
  newParticipantId,
  substitution,
  collectionId,
  teamLineUp,
}) {
  const newParticipantIdInLineUp = teamLineUp?.find(({ participantId }) => newParticipantId === participantId);

  const substitutionOrder = teamLineUp?.reduce(
    (order: number, teamCompetitor: TeamCompetitor) =>
      (teamCompetitor.collectionAssignments ?? []).reduce(
        (max, assignment) => Math.max(max, assignment.substitutionOrder ?? 0),
        order,
      ),
    0,
  );

  const modifiedLineUp =
    teamLineUp?.map((teamCompetitor) => {
      const copy = makeDeepCopy(teamCompetitor, false, true);
      const modifiedCompetitor = copy === teamCompetitor ? { ...copy } : copy;

      if (![existingParticipantId, newParticipantId].includes(modifiedCompetitor.participantId)) {
        return modifiedCompetitor;
      }

      if (!substitution && [existingParticipantId, newParticipantId].includes(modifiedCompetitor.participantId)) {
        modifiedCompetitor.collectionAssignments = modifiedCompetitor.collectionAssignments?.filter(
          (assignment) =>
            !(assignment.collectionPosition === collectionPosition && assignment.collectionId === collectionId),
        );
      }

      if (substitution && existingParticipantId === modifiedCompetitor.participantId) {
        modifiedCompetitor.collectionAssignments = modifiedCompetitor.collectionAssignments?.map((assignment) => {
          if (
            assignment.collectionPosition === collectionPosition &&
            assignment.collectionId === collectionId &&
            assignment.substitutionOrder === undefined
          ) {
            return { ...assignment, substitutionOrder };
          }
          return assignment;
        });
      }

      if (modifiedCompetitor.participantId === newParticipantId) {
        const assignment: CollectionAssignment = { collectionId, collectionPosition };
        if (substitution) {
          assignment.previousParticipantId = existingParticipantId;
          assignment.substitutionOrder = (substitutionOrder ?? 0) + 1;
        }
        modifiedCompetitor.collectionAssignments = [...(modifiedCompetitor.collectionAssignments ?? []), assignment];
      }

      return modifiedCompetitor;
    }) ?? [];

  if (!newParticipantIdInLineUp) {
    const collectionAssignment: CollectionAssignment = { collectionId, collectionPosition };
    if (substitution) {
      collectionAssignment.substitutionOrder = (substitutionOrder ?? 0) + 1;
      collectionAssignment.previousParticipantId = existingParticipantId;
    }
    const assignment = {
      collectionAssignments: [collectionAssignment],
      participantId: newParticipantId,
    };
    modifiedLineUp.push(assignment);
  }

  return modifiedLineUp;
}

function planProcessCodes({
  writes,
  effects,
  substitutionProcessCodes,
  tournamentRecord,
  drawDefinition,
  substitution,
  tieMatchUp,
  stack,
  side,
  event,
}) {
  if (substitution || side.substitutions?.length === 1) {
    if (substitution) {
      if (substitutionProcessCodes && tieMatchUp) {
        writes.push(
          planFieldWrite(
            tieMatchUp,
            'processCodes',
            unique([...(tieMatchUp.processCodes ?? []), ...substitutionProcessCodes]),
          ),
        );
      }
    } else if (tieMatchUp?.processCodes) {
      const codes = tieMatchUp.processCodes;
      const remaining = [...codes];
      for (const code of substitutionProcessCodes ?? []) {
        const index = remaining.lastIndexOf(code);
        remaining.splice(index, 1);
        writes.push(() => {
          codes.splice(index, 1);
        });
      }
    }

    if (tieMatchUp) {
      modifyMatchUpNotice(
        {
          tournamentId: tournamentRecord?.tournamentId,
          matchUp: tieMatchUp,
          context: stack,
          drawDefinition,
          event,
        },
        effects,
      );
    }
  }
}
