import { getAllowedDrawTypes, getAppliedPolicies } from '@Assemblies/governors/queryGovernor';
import { decorateResult } from '@Functions/global/decorateResult';
import { checkValidEntries } from '@Validators/checkValidEntries';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { getDrawTypeCoercion } from './getDrawTypeCoercion';
import { getCoercedDrawType } from './getCoercedDrawType';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { ensureInt } from '@Tools/ensureInt';
import { nextPowerOf2 } from '@Tools/math';

// constants and types
import { POLICY_TYPE_MATCHUP_ACTIONS, POLICY_TYPE_SEEDING } from '@Constants/policyConstants';
import { INVALID_DRAW_TYPE, MISSING_DRAW_SIZE } from '@Constants/errorConditionConstants';
import { QUALIFIER, STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import POLICY_SEEDING_DEFAULT from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { DrawTypeUnion, Entry } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  AD_HOC,
  DOUBLE_ELIMINATION,
  FEED_IN,
  MAIN,
  ROUND_ROBIN,
  ROUND_ROBIN_WITH_PLAYOFF,
  SWISS,
} from '@Constants/drawDefinitionConstants';

export function validateAndDeriveDrawValues(params): ResultType & {
  policyDefinitions?: PolicyDefinitions;
  appliedPolicies?: PolicyDefinitions;
  drawType?: DrawTypeUnion;
  enforceGender?: boolean;
  seedingProfile?: string;
  drawSize?: number;
} {
  const stack = 'validateAndDeriveDrawValues';
  const { appliedPolicies, policyDefinitions } = getPolicies(params);
  const enforceGender = getEnforceGender({ ...params, policyDefinitions, appliedPolicies });
  const consideredEntries = getConsideredEntries(params);

  const entriesAreValid = checkEntriesAreValid({ ...params, consideredEntries, appliedPolicies });
  if (entriesAreValid?.error) return decorateResult({ result: entriesAreValid, stack });

  const drawSize = getDerivedDrawSize({ ...params, consideredEntries });
  const drawTypeResult = getDrawType({ ...params, appliedPolicies, policyDefinitions, drawSize });
  if (drawTypeResult.error) return decorateResult({ result: drawTypeResult, stack });
  const drawType: DrawTypeUnion | undefined = drawTypeResult.drawType;

  if (Number.isNaN(drawSize) && !isAdHocType(drawType)) {
    return decorateResult({
      result: { error: MISSING_DRAW_SIZE },
      stack,
    });
  }

  const seedingPolicy = policyDefinitions?.[POLICY_TYPE_SEEDING] ?? appliedPolicies?.[POLICY_TYPE_SEEDING];
  const seedingProfile =
    params.seedingProfile ??
    seedingPolicy?.seedingProfile?.drawTypes?.[drawType ?? ''] ??
    seedingPolicy?.seedingProfile;

  // extend policyDefinitions only if a seedingProfile was specified in params
  if (params.seedingProfile) {
    if (!policyDefinitions[POLICY_TYPE_SEEDING]) {
      policyDefinitions[POLICY_TYPE_SEEDING] = {
        ...POLICY_SEEDING_DEFAULT[POLICY_TYPE_SEEDING],
      };
    }
    policyDefinitions[POLICY_TYPE_SEEDING].seedingProfile = seedingProfile;
  }

  const drawTypeAllowed = checkDrawTypeIsAllowed({ ...params, drawType });
  if (drawTypeAllowed?.error) return decorateResult({ result: drawTypeAllowed, stack });

  return { drawSize, drawType, enforceGender, seedingProfile, appliedPolicies, policyDefinitions };
}

function getDrawType(params): ResultType & { drawType?: DrawTypeUnion } {
  const { policyDefinitions, appliedPolicies, enforceMinimumDrawSize = true, drawSize } = params;
  const drawTypeCoercion =
    params.drawTypeCoercion ??
    getDrawTypeCoercion({
      drawType: params.drawType,
      policyDefinitions,
      appliedPolicies,
    });

  const coercedDrawType = getCoercedDrawType({
    drawType: params.drawType,
    enforceMinimumDrawSize,
    drawTypeCoercion,
    drawSize,
  });
  if (coercedDrawType.error) return coercedDrawType;
  return { drawType: coercedDrawType.drawType };
}

export function getFilteredEntries(entries?: Entry[]) {
  return entries?.filter(
    (entry) => entry.entryStatus && [...STRUCTURE_SELECTED_STATUSES, QUALIFIER].includes(entry.entryStatus),
  );
}
function getConsideredEntries({ considerEventEntries = true, drawEntries, eventEntries, qualifyingOnly }) {
  return (
    (qualifyingOnly && []) ||
    getFilteredEntries(drawEntries) ||
    (considerEventEntries ? eventEntries : [])
  ).filter(({ entryStage }) => !entryStage || entryStage === MAIN);
}

function getPolicies(params) {
  const { tournamentRecord, event } = params;
  const appliedPolicies = {
    ...params?.appliedPolicies,
    ...getAppliedPolicies({
      tournamentRecord,
      event,
    }).appliedPolicies,
  };

  const policyDefinitions = makeDeepCopy(params.policyDefinitions ?? {}, false, true);
  return { appliedPolicies, policyDefinitions };
}

function getEnforceGender({ enforceGender, policyDefinitions, appliedPolicies }) {
  return (
    enforceGender ??
    policyDefinitions?.[POLICY_TYPE_MATCHUP_ACTIONS]?.participants?.enforceGender ??
    appliedPolicies?.[POLICY_TYPE_MATCHUP_ACTIONS]?.participants?.enforceGender
  );
}

function checkEntriesAreValid(params) {
  const { consideredEntries, appliedPolicies, policyDefinitions, enforceGender, participantMap, participants, event } =
    params;
  // entries participantTypes must correspond with eventType
  // this is only possible if the event is provided
  return (
    event &&
    participants &&
    checkValidEntries({
      consideredEntries,
      policyDefinitions,
      appliedPolicies,
      participantMap,
      enforceGender,
      participants,
      event,
    })
  );
}

function getDerivedDrawSize(params) {
  const derivedDrawSize =
    !params.drawSize &&
    params.consideredEntries.length &&
    ![AD_HOC, DOUBLE_ELIMINATION, FEED_IN, ROUND_ROBIN, ROUND_ROBIN_WITH_PLAYOFF, SWISS].includes(
      params.drawType ?? '',
    ) &&
    nextPowerOf2(params.consideredEntries.length);

  // coersion of drawSize and seedsCount to integers
  return derivedDrawSize || (params.drawSize && ensureInt(params.drawSize)) || false; // required for isNaN check
}

function checkDrawTypeIsAllowed(params) {
  const { tournamentRecord, event, ignoreAllowedDrawTypes, drawType } = params;
  const allowedDrawTypes =
    !ignoreAllowedDrawTypes &&
    tournamentRecord &&
    getAllowedDrawTypes({
      tournamentRecord,
      categoryType: event?.category?.categoryType,
      categoryName: event?.category?.categoryName,
    });
  if (allowedDrawTypes?.length && !allowedDrawTypes.includes(drawType)) {
    return { error: INVALID_DRAW_TYPE };
  }

  return { ...SUCCESS };
}
