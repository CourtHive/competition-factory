import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_MATCHUP_ACTIONS } from '@Constants/policyConstants';
import { INVALID_GENDER } from '@Constants/errorConditionConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';
import { COLLEGE_D3 } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

// A collection whose gender changes is checked against the event's gender, as an added collection is: a FEMALE
// collection in a MALE TEAM event is refused whether it is added or changed.

function teamEvent(gender = MALE) {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, gender, tieFormatName: COLLEGE_D3 }],
    setState: true,
  });
  return drawId;
}

// the tieFormat in force for the draw: a change made through the draw is stored on it
const tieFormatOf = (drawId: string) => tournamentEngine.getTieFormat({ drawId }).tieFormat;
const singlesOf = (drawId: string) =>
  tieFormatOf(drawId).collectionDefinitions.find(({ matchUpType }) => matchUpType === 'SINGLES');

it('refuses a changed collection whose gender is not the event gender', () => {
  const drawId = teamEvent();
  const { collectionId } = singlesOf(drawId);
  const before = tieFormatOf(drawId);

  let result: any = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'Women singles',
    gender: FEMALE,
    collectionId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_GENDER);
  expect(tieFormatOf(drawId)).toEqual(before);

  // the gender that matches the event's is accepted
  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'Men singles',
    gender: MALE,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(singlesOf(drawId).gender).toEqual(MALE);
});

it('refuses it through modifyTieFormat, which changes each existing collection', () => {
  const drawId = teamEvent();
  const before = tieFormatOf(drawId);
  const modifiedTieFormat = structuredClone(before);
  const singles = modifiedTieFormat.collectionDefinitions.find(({ matchUpType }) => matchUpType === 'SINGLES');
  singles.gender = FEMALE;

  const result: any = tournamentEngine.modifyTieFormat({ modifiedTieFormat, drawId });
  expect(result.error).toEqual(INVALID_GENDER);
  expect(tieFormatOf(drawId)).toEqual(before);
});

it('accepts it when gender is not enforced, and leaves a format stored that way open to other edits', () => {
  const drawId = teamEvent();
  const { collectionId } = singlesOf(drawId);

  let result: any = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'Women singles',
    enforceGender: false,
    gender: FEMALE,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(singlesOf(drawId).gender).toEqual(FEMALE);

  // the gender is not changed, so it is not checked again
  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'Singles',
    gender: FEMALE,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(singlesOf(drawId).collectionName).toEqual('Singles');
});

it('follows the matchUpActions policy that turns enforcement off', () => {
  const drawId = teamEvent();
  const { collectionId } = singlesOf(drawId);
  let result: any = tournamentEngine.attachPolicies({
    policyDefinitions: { [POLICY_TYPE_MATCHUP_ACTIONS]: { participants: { enforceGender: false } } },
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'Women singles',
    gender: FEMALE,
    collectionId,
    drawId,
  });
  expect(result.success).toEqual(true);
});

it('refuses MIXED singles in a MIXED event', () => {
  const drawId = teamEvent(MIXED);
  const { collectionId } = singlesOf(drawId);

  const result: any = tournamentEngine.modifyCollectionDefinition({
    collectionName: 'Mixed singles',
    gender: MIXED,
    collectionId,
    drawId,
  });
  expect(result.error).toEqual(INVALID_GENDER);
});
