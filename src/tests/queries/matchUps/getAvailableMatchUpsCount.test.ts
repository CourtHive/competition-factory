import { mocksEngine } from '@Assemblies/engines/mock';
import { tournamentEngine } from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { getMatchUpId } from '@Functions/global/extractors';

const scenarios = [
  { roundsCount: 1, matchUpsToDeleteCount: 6 },
  { roundsCount: 2, matchUpsToDeleteCount: 8 },
];

it.each(scenarios)('can return available matchUps count for AdHoc structures', (scenario) => {
  const { matchUpsToDeleteCount, roundsCount } = scenario;
  const drawSize = 32;
  const drawId = 'did';

  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize, drawId, drawType: AD_HOC, automated: true, roundsCount }],
    setState: true,
  });

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toBe((drawSize / 2) * roundsCount);
  let availableResult = tournamentEngine.getAvailableMatchUpsCount();
  expect(availableResult.error).toEqual(MISSING_DRAW_DEFINITION);
  availableResult = tournamentEngine.getAvailableMatchUpsCount({ drawId });
  expect(availableResult.availableMatchUpsCount).toEqual(0);

  const lastRoundNumber = availableResult.lastRoundNumber;
  matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [lastRoundNumber] } }).matchUps;
  const matchUpIds = matchUps.map(getMatchUpId).slice(0, matchUpsToDeleteCount);
  const deletionResult = tournamentEngine.deleteAdHocMatchUps({
    matchUpIds,
    drawId,
  });
  expect(deletionResult.success).toEqual(true);
  availableResult = tournamentEngine.getAvailableMatchUpsCount({ drawId });
  expect(availableResult.availableMatchUpsCount).toEqual(matchUpsToDeleteCount);
});
