import { getBand, getScoreComponents, pctSpread } from '../matchUp/scoreComponents';
import { validMatchUps } from '@Validators/validMatchUp';
import { findPolicy } from '@Acquire/findPolicy';

import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';
import { DEFAULTED, WALKOVER as WALKOVER_STATUS } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { COMPETITIVE, DECISIVE, RETIRED, ROUTINE, WALKOVER } from '@Constants/statsConstants';

export function getMatchUpsStats({ profileBands, tournamentRecord, matchUps }) {
  if (!validMatchUps(matchUps)) return { error: MISSING_MATCHUPS };

  const policy =
    !profileBands &&
    findPolicy({
      policyType: POLICY_TYPE_COMPETITIVE_BANDS,
      tournamentRecord,
    }).policy;

  const bandProfiles =
    profileBands ||
    policy?.profileBands ||
    POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS].profileBands;

  const relevantMatchUps = matchUps.filter(({ winningSide }) => winningSide);

  const walkoverCount = relevantMatchUps.filter(
    ({ matchUpStatus }) => matchUpStatus === WALKOVER_STATUS || matchUpStatus === DEFAULTED,
  ).length;

  const gamesMap = relevantMatchUps.map(getScoreComponents);

  const categorize = (p, spread) => {
    const band = getBand(spread, bandProfiles);
    p[band] += 1;
    return p;
  };

  const pctspd: { [key: string]: number } = pctSpread(gamesMap).reduce((p, c) => categorize(p, c), {
    [COMPETITIVE]: 0,
    [ROUTINE]: 0,
    [DECISIVE]: 0,
    [WALKOVER]: walkoverCount,
  });
  const total: number = Object.keys(pctspd).reduce((a, k) => (pctspd[k] || 0) + a, 0);

  const competitiveBands: any = Object.keys(pctspd).map((k: any) => {
    const value = Number.parseFloat((pctspd[k] / total).toFixed(4));
    return {
      [k]: value * 100,
    };
  });

  const retiredCount = relevantMatchUps.filter(({ matchUpStatus }) => matchUpStatus === RETIRED).length;

  competitiveBands.push({
    [RETIRED]: Number.parseFloat((retiredCount / total).toFixed(4)) * 100,
  });

  return {
    competitiveBands: Object.assign({}, ...competitiveBands),
    ...SUCCESS,
  };
}
