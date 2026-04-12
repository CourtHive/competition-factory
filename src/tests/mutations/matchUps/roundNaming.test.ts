import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getStructureMatchUps } from '@Query/structure/getStructureMatchUps';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { constantToString } from '@Tools/strings';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { expect, it } from 'vitest';

import { POLICY_ROUND_NAMING_DEFAULT } from '@Fixtures/policies/POLICY_ROUND_NAMING_DEFAULT';
import { DrawDefinition } from '@Types/tournamentTypes';
import {
  SINGLE_ELIMINATION,
  FEED_IN,
  FIRST_MATCH_LOSER_CONSOLATION,
  MAIN,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

it('can return matchUps with roundNames from an SINGLE_ELIMINATION structure', () => {
  const drawDefinition = newDrawDefinition();

  const structure = generateDrawTypeAndModifyDrawDefinition({
    drawType: SINGLE_ELIMINATION,
    drawDefinition,
    drawSize: 16,
  })?.structures?.[0];
  expect(structure?.structureName).toEqual(constantToString(MAIN));
  const result = attachPolicies({
    policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  const structureId = structure?.structureId;
  const { matchUps } = getAllStructureMatchUps({
    inContext: true,
    drawDefinition,
    structure,
  });
  expect(matchUps.length).toEqual(15);

  let { upcomingMatchUps } = getStructureMatchUps({
    requireParticipants: false,
    drawDefinition,
    structureId,
  });
  expect(upcomingMatchUps?.length).toEqual(8);

  // requireParticipants defaults to true and no matches can be considered upcoming if no participants assigned
  ({ upcomingMatchUps } = getStructureMatchUps({
    drawDefinition,
    structureId,
  }));
  expect(upcomingMatchUps?.length).toEqual(0);

  matchUps.forEach((matchUp) => {
    const { abbreviatedRoundName, finishingRound, roundNumber, roundName } = matchUp;
    if (finishingRound === 1) expect(abbreviatedRoundName).toEqual('F');
    if (finishingRound === 2) expect(abbreviatedRoundName).toEqual('SF');
    if (finishingRound === 3) expect(abbreviatedRoundName).toEqual('QF');
    if (finishingRound === 4) expect(abbreviatedRoundName).toEqual('R16');
    if (finishingRound === 1) expect(roundName).toEqual('Final');
    if (finishingRound === 2) expect(roundName).toEqual('Semifinal');
    if (finishingRound === 3) expect(roundName).toEqual('Quarterfinal');
    if (finishingRound === 4) expect(roundName).toEqual('R16');

    if (roundNumber === 1) expect(roundName).toEqual('R16');
    if (roundNumber === 2) expect(roundName).toEqual('Quarterfinal');
    if (roundNumber === 3) expect(roundName).toEqual('Semifinal');
    if (roundNumber === 4) expect(roundName).toEqual('Final');
  });
});

it('can return matchUps with roundNames from a FIRST_MATCH_LOSER_CONSOLATION structure', () => {
  const drawDefinition = newDrawDefinition();

  let result = generateDrawTypeAndModifyDrawDefinition({
    drawType: FIRST_MATCH_LOSER_CONSOLATION,
    drawDefinition,
    drawSize: 16,
  });
  const consolationStructure = result?.structures?.[1];
  const mainStructure = result?.structures?.[0];
  expect(mainStructure?.structureName).toEqual(constantToString(MAIN));
  result = attachPolicies({
    policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  const structureId = mainStructure?.structureId;
  let { matchUps } = getAllStructureMatchUps({
    structure: mainStructure,
    inContext: true,
    drawDefinition,
  });
  expect(matchUps.length).toEqual(15);

  let { upcomingMatchUps } = getStructureMatchUps({
    requireParticipants: false,
    drawDefinition,
    structureId,
  });
  expect(upcomingMatchUps?.length).toEqual(8);

  // requireParticipants defaults to true and no matches can be considered upcoming if no participants assigned
  ({ upcomingMatchUps } = getStructureMatchUps({
    drawDefinition,
    structureId,
  }));
  expect(upcomingMatchUps?.length).toEqual(0);

  matchUps.forEach((matchUp) => {
    const { finishingRound, roundNumber, roundName } = matchUp;
    if (finishingRound === 1) expect(roundName).toEqual('Final');
    if (finishingRound === 2) expect(roundName).toEqual('Semifinal');
    if (finishingRound === 3) expect(roundName).toEqual('Quarterfinal');
    if (finishingRound === 4) expect(roundName).toEqual('R16');

    if (roundNumber === 1) expect(roundName).toEqual('R16');
    if (roundNumber === 2) expect(roundName).toEqual('Quarterfinal');
    if (roundNumber === 3) expect(roundName).toEqual('Semifinal');
    if (roundNumber === 4) expect(roundName).toEqual('Final');
  });

  ({ matchUps } = getAllStructureMatchUps({
    structure: consolationStructure,
    inContext: true,
    drawDefinition,
  }));

  matchUps.forEach((matchUp) => {
    const { abbreviatedRoundName, finishingRound, roundNumber, roundName } = matchUp;
    if (finishingRound === 1) expect(abbreviatedRoundName).toEqual('C-F');
    if (finishingRound === 2) expect(abbreviatedRoundName).toEqual('C-SF');
    if (finishingRound === 3) expect(abbreviatedRoundName).toEqual('C-QF');

    if (roundNumber === 1) expect(abbreviatedRoundName).toEqual('C-QF-Q');
    if (roundNumber === 2) expect(abbreviatedRoundName).toEqual('C-QF');
    if (roundNumber === 3) expect(abbreviatedRoundName).toEqual('C-SF');
    if (roundNumber === 4) expect(abbreviatedRoundName).toEqual('C-F');
    if (roundNumber === 4) expect(roundName).toEqual('C-Final');
  });
});

it('can return matchUps with roundNames from a FEED_IN structure and identify feedRounds', () => {
  const drawDefinition = newDrawDefinition();
  const structure = generateDrawTypeAndModifyDrawDefinition({
    drawType: FEED_IN,
    drawDefinition,
    drawSize: 12,
  })?.structures?.[0];
  expect(structure?.structureName).toEqual(constantToString(MAIN));
  const result = attachPolicies({
    policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  const structureId = structure?.structureId;
  const { matchUps } = getAllStructureMatchUps({
    inContext: true,
    drawDefinition,
    structure,
  });
  expect(matchUps.length).toEqual(11);

  const { upcomingMatchUps } = getStructureMatchUps({
    drawDefinition,
    structureId,
    requireParticipants: false,
  });
  expect(upcomingMatchUps?.length).toEqual(4);

  const { roundProfile } = getRoundMatchUps({ matchUps });
  expect(roundProfile?.[2].feedRound).toEqual(true);

  matchUps.forEach((matchUp) => {
    const { abbreviatedRoundName, feedRound, finishingRound, roundNumber, roundName } = matchUp;
    if (roundNumber === 1) expect(abbreviatedRoundName).toEqual('QF-Q');
    if (roundNumber === 2) {
      expect(abbreviatedRoundName).toEqual('QF');
      expect(feedRound).toEqual(true);
    }
    if (roundNumber === 3) expect(abbreviatedRoundName).toEqual('SF');
    if (roundNumber === 4) expect(abbreviatedRoundName).toEqual('F');
    if (roundNumber === 4) expect(roundName).toEqual('Final');

    if (finishingRound === 1) expect(abbreviatedRoundName).toEqual('F');
    if (finishingRound === 2) expect(abbreviatedRoundName).toEqual('SF');
    if (finishingRound === 3) expect(abbreviatedRoundName).toEqual('QF');
    if (finishingRound === 4) expect(abbreviatedRoundName).toEqual('QF-Q');
  });
});

it('can return matchUps with roundNames from a OLYMPIC structure', () => {
  const drawDefinition: DrawDefinition = newDrawDefinition();

  let result = generateDrawTypeAndModifyDrawDefinition({
    drawType: OLYMPIC,
    drawDefinition,
    drawSize: 16,
  });
  expect(result.success).toEqual(true);
  expect(result.structures?.length).toEqual(4);

  const structures = drawDefinition?.structures ?? [];
  expect(structures.length).toEqual(4);

  result = attachPolicies({
    policyDefinitions: POLICY_ROUND_NAMING_DEFAULT,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  const { matchUps } = getAllDrawMatchUps({
    requireParticipants: false,
    drawDefinition,
  });
  matchUps?.forEach((matchUp) => {
    const { abbreviatedRoundName, finishingRound, roundNumber, roundName, structureName } = matchUp;
    if (roundNumber === 1 && structureName === 'East') {
      expect(roundName).toEqual('E-R16');
      expect(finishingRound).toEqual(4);
    }
    if (roundNumber === 2 && structureName === 'East') expect(abbreviatedRoundName).toEqual('E-QF');
    if (roundNumber === 3 && structureName === 'East') expect(abbreviatedRoundName).toEqual('E-SF');
    if (roundNumber === 4 && structureName === 'East') {
      expect(abbreviatedRoundName).toEqual('E-F');
      expect(finishingRound).toEqual(1);
    }

    if (roundNumber === 1 && structureName === 'West') expect(abbreviatedRoundName).toEqual('W-QF');
    if (roundNumber === 2 && structureName === 'West') expect(abbreviatedRoundName).toEqual('W-SF');
    if (roundNumber === 3 && structureName === 'West') expect(abbreviatedRoundName).toEqual('W-F');

    if (roundNumber === 1 && structureName === 'North') expect(abbreviatedRoundName).toEqual('N-SF');
    if (roundNumber === 2 && structureName === 'North') expect(abbreviatedRoundName).toEqual('N-F');

    if (roundNumber === 1 && structureName === 'South') expect(abbreviatedRoundName).toEqual('S-SF');
    if (roundNumber === 2 && structureName === 'South') expect(abbreviatedRoundName).toEqual('S-F');
  });
});
