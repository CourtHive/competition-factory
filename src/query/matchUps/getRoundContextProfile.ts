import { isLucky } from '@Query/drawDefinition/isLucky';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { getRoundMatchUps } from './getRoundMatchUps';

// constants and types
import { POLICY_ROUND_NAMING_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_NAMING_DEFAULT';
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { RoundProfile, ResultType } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type GetRoundContextProfileArgs = {
  drawDefinition?: DrawDefinition;
  matchUps: HydratedMatchUp[];
  roundNamingPolicy: any;
  structure: Structure;
};
export function getRoundContextProfile({
  roundNamingPolicy,
  drawDefinition,
  structure,
  matchUps,
}: GetRoundContextProfileArgs): ResultType & {
  roundNamingProfile?: {
    [key: string]: { roundName: string; abbreviatedRoundName: string };
  };
  roundMatchUps?: { [roundNumber: string]: HydratedMatchUp[] };
  roundProfile?: RoundProfile;
} {
  const { roundProfile, roundMatchUps } = getRoundMatchUps({ matchUps });
  const { structureAbbreviation, stage } = structure;

  const isAdHocStructure = isAdHoc({ structure });
  const isLuckyStructure = isLucky({ structure });

  const isRoundRobin = structure.structures;
  const roundNamingProfile = {};

  const defaultRoundNamingPolicy = POLICY_ROUND_NAMING_DEFAULT[POLICY_TYPE_ROUND_NAMING];

  const isQualifying = structure.stage === QUALIFYING;
  const qualifyingStageSequences: number = isQualifying
    ? Math.max(
        ...(drawDefinition?.structures ?? [])
          .filter((structure) => structure.stage === QUALIFYING)
          .map(({ stageSequence }) => stageSequence ?? 1),
        0,
      )
    : 0;

  const preQualifyingSequence =
    (structure.stageSequence ?? 1) < qualifyingStageSequences ? (structure.stageSequence ?? 1) : '';

  const preQualifyingAffix = preQualifyingSequence
    ? roundNamingPolicy?.affixes?.preQualifying || defaultRoundNamingPolicy.affixes.preQualifying || ''
    : '';

  const roundNamingMap = roundNamingPolicy?.roundNamingMap || (defaultRoundNamingPolicy.roundNamingMap ?? {});

  const abbreviatedRoundNamingMap =
    roundNamingPolicy?.abbreviatedRoundNamingMap || (defaultRoundNamingPolicy.abbreviatedRoundNamingMap ?? {});

  const preFeedAffix = roundNamingPolicy?.affixes?.preFeedRound || defaultRoundNamingPolicy.affixes.preFeedRound;

  const roundNumberAffix = roundNamingPolicy?.affixes?.roundNumber || defaultRoundNamingPolicy.affixes.roundNumber;

  const namingConventions = roundNamingPolicy?.namingConventions || defaultRoundNamingPolicy.namingConventions;
  const roundNameFallback = namingConventions.round;

  const stageInitial = stage && stage !== MAIN ? stage[0] : '';
  const stageConstants = roundNamingPolicy?.stageConstants || defaultRoundNamingPolicy.stageConstants;
  const stageIndicator = (stage && stageConstants?.[stage]) || stageInitial;
  const stageConstant = `${preQualifyingAffix}${stageIndicator}${preQualifyingSequence}`;

  const roundProfileKeys = roundProfile ? Object.keys(roundProfile) : [];
  const qualifyingAffix = isQualifying && stageConstants?.[QUALIFYING] ? `${stageConstants?.[QUALIFYING]}-` : '';

  if (isRoundRobin || isAdHocStructure || isLuckyStructure) {
    Object.assign(
      roundNamingProfile,
      ...roundProfileKeys.map((key) => {
        const roundName = `${qualifyingAffix}${roundNameFallback} ${key}`;
        const abbreviatedRoundName = `${roundNumberAffix}${key}`;
        return { [key]: { roundName, abbreviatedRoundName } };
      }),
    );
  } else {
    const qualifyingFinishgMap =
      isQualifying && (roundNamingPolicy?.qualifyingFinishMap || (defaultRoundNamingPolicy?.qualifyingFinishMap ?? {}));

    Object.assign(
      roundNamingProfile,
      ...roundProfileKeys.map((round) => {
        if (!roundProfile?.[round]) return undefined;
        const { matchUpsCount, preFeedRound } = roundProfile[round];
        const participantsCount = matchUpsCount * 2;

        const sizedRoundName =
          qualifyingFinishgMap?.[roundProfile?.[round].finishingRound] ||
          (qualifyingFinishgMap && `${roundNumberAffix}${participantsCount}`) ||
          roundNamingMap[matchUpsCount] ||
          `${roundNumberAffix}${participantsCount}`;

        const suffix = preFeedRound ? `-${preFeedAffix}` : '';
        const profileRoundName = `${sizedRoundName}${suffix}`;

        const roundName = [stageConstant, structureAbbreviation, profileRoundName].filter(Boolean).join('-');

        const sizedAbbreviation = abbreviatedRoundNamingMap[matchUpsCount] || `${roundNumberAffix}${participantsCount}`;
        const profileAbbreviation = `${sizedAbbreviation}${suffix}`;
        const abbreviatedRoundName = [stageConstant, structureAbbreviation, profileAbbreviation]
          .filter(Boolean)
          .join('-');

        return { [round]: { abbreviatedRoundName, roundName } };
      }),
    );
  }

  return { roundNamingProfile, roundProfile, roundMatchUps };
}
