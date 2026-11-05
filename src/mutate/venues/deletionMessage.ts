import { SCHEDULED_MATCHUPS } from '@Constants/errorConditionConstants';

export function deletionMessage({ matchUpsCount = 0 }) {
  const singularPlural = matchUpsCount === 1 ? 'matchUp' : 'matchUps';
  const info = `Schedule would be deleted from ${matchUpsCount} ${singularPlural}; use { force: true }`;
  return {
    error: SCHEDULED_MATCHUPS,
    info,
  };
}
