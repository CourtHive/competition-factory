import { generateRoundRobinWithPlayOff } from './drawTypes/roundRobin/generateRoundRobinWithPlayoff';
import { firstRoundLoserConsolation } from './drawTypes/firstRoundLoserConsolation';
import { generateDoubleElimination } from './drawTypes/doubleEliminattion';
import { generateCurtisConsolation } from './drawTypes/curtisConsolation';
import { generatePlayoffStructures } from './drawTypes/playoffStructures';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { generateRoundRobin } from './drawTypes/roundRobin/roundRobin';
import structureTemplate from '../templates/structureTemplate';
import { feedInChampionship } from './drawTypes/feedInChamp';
import { treeMatchUps } from './drawTypes/eliminationTree';
import { constantToString } from '@Tools/strings';
import { feedInMatchUps } from './feedInMatchUps';
import { luckyDraw } from './drawTypes/luckyDraw';

// constants
import { POLICY_TYPE_FEED_IN } from '@Constants/policyConstants';
import { ErrorType } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
// prettier-ignore
import {
  MAIN, PLAY_OFF, FICQF, FICSF, MFIC, AD_HOC, CURTIS, FICR16, COMPASS,
  PLAYOFF, OLYMPIC, FEED_IN, ROUND_ROBIN,
  COMPASS_ATTRIBUTES, OLYMPIC_ATTRIBUTES,
  SINGLE_ELIMINATION, DOUBLE_ELIMINATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  ROUND_ROBIN_WITH_PLAYOFF,
  FEED_IN_CHAMPIONSHIP,
  WIN_RATIO,
  LUCKY_DRAW,
} from '@Constants/drawDefinitionConstants';

export function getGenerators(params): { generators?: any; error?: ErrorType } {
  const { playoffAttributes, stageSequence = 1, stage = MAIN, tieFormat, matchUpType, drawSize, uuids } = params;

  const getPrefixedStructureId = () => {
    if (!params.isMock && !params.idPrefix) return undefined;
    const drawId = params.drawDefinition.drawId;
    return `${drawId}-s-0`;
  };
  const structureId = params.structureId || getPrefixedStructureId() || uuids?.pop();

  const appliedPolicies = params.appliedPolicies ?? getAppliedPolicies(params);
  const feedPolicy = params.policyDefinitions?.[POLICY_TYPE_FEED_IN] || appliedPolicies?.[POLICY_TYPE_FEED_IN];

  // disable feeding from MAIN final unless policy specifies
  params.skipRounds = params.skipRounds || (drawSize <= 4 && (feedPolicy?.feedFromMainFinal ? 0 : 1)) || 0;

  const structureName = params.structureName ?? playoffAttributes?.['0']?.name ?? constantToString(MAIN);

  const singleElimination = () => {
    const { matchUps } = treeMatchUps(params);
    const structure = structureTemplate({
      stageSequence,
      structureName,
      matchUpType,
      structureId,
      tieFormat,
      matchUps,
      stage,
    });

    return { structures: [structure], links: [], ...SUCCESS };
  };

  const generators = {
    [AD_HOC]: () => {
      const structure = structureTemplate({
        finishingPosition: WIN_RATIO,
        stageSequence,
        structureName,
        matchUps: [],
        matchUpType,
        structureId,
        stage,
      });

      return { structures: [structure], links: [], ...SUCCESS };
    },
    [LUCKY_DRAW]: () => {
      const { matchUps } = luckyDraw(params);
      const structure = structureTemplate({
        stageSequence,
        structureName,
        matchUpType,
        structureId,
        matchUps,
        stage,
      });

      return { structures: [structure], links: [], ...SUCCESS };
    },
    [SINGLE_ELIMINATION]: () => singleElimination(),
    [DOUBLE_ELIMINATION]: () => generateDoubleElimination(params),
    [COMPASS]: () =>
      generatePlayoffStructures({
        ...params,
        childStage: PLAY_OFF,
        roundOffsetLimit: 3,
        playoffAttributes: playoffAttributes ?? COMPASS_ATTRIBUTES,
      }),
    [OLYMPIC]: () =>
      generatePlayoffStructures({
        ...params,
        childStage: PLAY_OFF,
        roundOffsetLimit: 2,
        playoffAttributes: playoffAttributes ?? OLYMPIC_ATTRIBUTES,
      }),
    [PLAYOFF]: () => {
      return generatePlayoffStructures({ ...params, childStage: PLAY_OFF });
    },

    [FEED_IN]: () => {
      const { matchUps } = feedInMatchUps({ drawSize, uuids, matchUpType });

      const structure = structureTemplate({
        stageSequence,
        structureName,
        matchUpType,
        structureId,
        stage: MAIN,
        tieFormat,
        matchUps,
      });

      return { structures: [structure], links: [], ...SUCCESS };
    },
    [FIRST_ROUND_LOSER_CONSOLATION]: () => firstRoundLoserConsolation(params),
    [FIRST_MATCH_LOSER_CONSOLATION]: () => feedInChampionship({ ...params, feedRounds: 1, fmlc: true }),
    [MFIC]: () => feedInChampionship({ ...params, feedRounds: 1 }),
    [FICSF]: () => feedInChampionship({ ...params, feedsFromFinal: 1 }),
    [FICQF]: () => feedInChampionship({ ...params, feedsFromFinal: 2 }),
    [FICR16]: () => feedInChampionship({ ...params, feedsFromFinal: 3 }),
    [FEED_IN_CHAMPIONSHIP]: () => feedInChampionship(params),
    [CURTIS]: () => generateCurtisConsolation(params),
    [ROUND_ROBIN]: () => generateRoundRobin(params),
    [ROUND_ROBIN_WITH_PLAYOFF]: () => generateRoundRobinWithPlayOff(params),
  };

  return { generators };
}
