import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants and fixtures
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';

import tournamentRecord from './avoidanceIssue.tods.json';

it.each([1, 2, 3, 4, 5])('Swap Options in candiate generation works as expected', () => {
  tournamentEngine.setState(tournamentRecord);

  const eventId = tournamentRecord.events[0].eventId;
  const { event } = tournamentEngine.getEvent({ eventId });
  const participantIds = event.entries
    .filter(({ entryStatus }) => entryStatus === DIRECT_ACCEPTANCE)
    .map(getParticipantId);

  expect(participantIds.length).toEqual(22);

  const { policyDefinitions: attachedPolicies } = tournamentEngine.getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_AVOIDANCE],
    eventId,
  });

  const policyAttributes = attachedPolicies.avoidance.policyAttributes;
  const keys = policyAttributes.map(({ key }) => key).filter(Boolean);
  expect(keys).toEqual([
    'person.addresses.city',
    'individualParticipants.person.addresses.city',
    'person.addresses.postalCode',
    'individualParticipants.person.addresses.postalCode',
    'person._ustaDistrict.code',
    'individualParticipants.person._ustaDistrict.code',
  ]);

  expect(tournamentRecord.events[0].drawDefinitions.length).toEqual(0);

  const params = {
    seedsCount: 8,
    automated: 'automated',
    matchUpFormat: FORMAT_STANDARD,
    tieFormatName: '',
    drawName: 'Draw',
    drawType: 'SINGLE_ELIMINATION',
    voluntaryConsolation: false,
    drawSize: 32,
    eventId: 'F83DA131-055A-463D-96DD-48D0F0EB23D4',
    policyDefinitions: {
      seeding: {
        policyName: 'USTA',
        duplicateSeedNumbers: true,
        drawSizeProgression: true,
        validSeedPositions: {
          ignore: true,
        },
        seedsCountThresholds: [
          {
            drawSize: 4,
            minimumParticipantCount: 3,
            seedsCount: 2,
          },
          {
            drawSize: 16,
            minimumParticipantCount: 12,
            seedsCount: 4,
          },
          {
            drawSize: 32,
            minimumParticipantCount: 24,
            seedsCount: 8,
          },
          {
            drawSize: 64,
            minimumParticipantCount: 48,
            seedsCount: 16,
          },
          {
            drawSize: 128,
            minimumParticipantCount: 96,
            seedsCount: 32,
          },
          {
            drawSize: 256,
            minimumParticipantCount: 192,
            seedsCount: 64,
          },
        ],
      },
    },
    drawEntries: [
      {
        entryId: 'A2074961-6DF9-47EE-B6A8-3D5BCF6CA48B',
        entryPosition: 1,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'E1761CB0-03A3-4571-9E66-56FB038AFDDD',
      },
      {
        entryId: '54668322-120F-469F-8E1F-BED81BDE1292',
        entryPosition: 2,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'EA2FC5F4-8B31-4654-8543-FA817AD55C2A',
      },
      {
        entryId: 'BF24D849-51B8-4A95-8015-B2B3FF7B4EB7',
        entryPosition: 3,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '02CBCB7F-0384-4753-AD6E-4AEE20E1CBAF',
      },
      {
        entryId: '4294FF2A-AD8E-419C-B068-1EA2EC1B341D',
        entryPosition: 4,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'F2E6F532-D1A6-443C-9971-BC8C7052DC65',
      },
      {
        entryId: '4F2E42AA-6C0F-4E83-AE9C-F0D2544178D9',
        entryPosition: 5,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'F1A99B4B-2030-4E06-B6A5-09EE58379007',
      },
      {
        entryId: '04CF4D6D-4965-4D49-9F3E-A8C586AE6B39',
        entryPosition: 6,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'C352919F-93C2-49ED-A213-F9DDD971A630',
      },
      {
        entryId: '67DF52D4-E02C-4D08-888F-2F9710C56E4D',
        entryPosition: 7,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '14F64B1B-6ED2-4FA6-9222-4EFD83D80610',
      },
      {
        entryId: '868B1207-E0A8-42DB-9517-093BA0A316BF',
        entryPosition: 8,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '7187ED06-0B8C-4ECA-96FD-B3F3BD1B18F3',
      },
      {
        entryId: 'EEA57192-3692-4A7B-A6E9-5A36391AD0CE',
        entryPosition: 9,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'BD4A2DFD-91B6-4437-A76F-37B5282A3497',
      },
      {
        entryId: '27C50FDB-2A5A-42E6-B339-9F427D2BBA68',
        entryPosition: 10,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '701F5384-47FA-4530-8084-849CBE6A6384',
      },
      {
        entryId: '62E146DF-F01B-4646-9B89-AE43F0F34DC3',
        entryPosition: 11,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'CF024F7E-5A2D-4F3A-AD57-27673BF76050',
      },
      {
        entryId: 'F638D63C-711E-4EC3-A036-D04C77AFF139',
        entryPosition: 12,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '3D3C68A9-60C0-44D3-9AF5-20D2290E75A1',
      },
      {
        entryId: '72ED6D36-7589-4F67-A874-19A51718D87D',
        entryPosition: 13,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '0A0DA60F-2007-480F-8A00-026A005879C5',
      },
      {
        entryId: '1D248EF2-99DA-4C1E-B8E3-F28CDB2B7B46',
        entryPosition: 14,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'D815C333-B49C-43B1-AE06-47721C72DE5A',
      },
      {
        entryId: 'C5952246-C8ED-4F85-8611-361E86ADBAFB',
        entryPosition: 15,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '03804E6E-D876-4B52-A94D-57397C8501B1',
      },
      {
        entryId: 'E921F697-4EF6-41A5-8790-222EA5C5B47B',
        entryPosition: 16,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '564AF1E7-B314-4885-B6A6-EAEAEB39D017',
      },
      {
        entryId: 'DD86D7BE-853B-4C12-9CAD-85B17E385812',
        entryPosition: 17,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '01EF887F-2A00-4EDF-8802-66649226E04F',
      },
      {
        entryId: '30EE26E9-BA9B-43B3-8B18-64A46EFC5D7D',
        entryPosition: 18,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'F48B890A-854F-44E8-8A46-A166FD4EC2F7',
      },
      {
        entryId: '105ED917-80B4-4C50-A6B6-F8D98BB697DB',
        entryPosition: 19,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '8C86BF2E-629D-44D0-AB5D-5EFBC5D19507',
      },
      {
        entryId: 'AB636585-E765-419D-8F4B-39F559B4D350',
        entryPosition: 20,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '8AE483E8-93B6-40E8-94F5-7A134303D329',
      },
      {
        entryId: '612D9982-0036-43C9-9A44-718E0E12A55C',
        entryPosition: 21,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: '754FDBD8-DED8-49A7-AE40-8B9E59E6BFA9',
      },
      {
        entryId: '1F42A83E-201A-45C2-85F4-36334F477A10',
        entryPosition: 22,
        entryStatus: 'DIRECT_ACCEPTANCE',
        participantId: 'B2FF50E0-90FF-41A6-B510-ADA6E04C24B8',
      },
    ],
    seedByRanking: false,
    seedingScaleName: 'OPEN',
    ignoreAllowedDrawTypes: true,
    enforcePolicyLimits: false,
  };

  const { drawDefinition } = tournamentEngine.generateDrawDefinition(params);
  const result = tournamentEngine.addDrawDefinition({
    drawDefinition,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { positionAssignments } = tournamentEngine.getPositionAssignments({
    structureId: drawDefinition.structures[0].structureId,
    drawId: drawDefinition.drawId,
  });
  const byePlacements = positionAssignments.filter(({ bye }) => bye);
  const participantPlacements = positionAssignments.filter(({ participantId }) => participantId);
  const notAssigned = positionAssignments.filter((assignment) => !assignment.bye && !assignment.participantId);
  expect(notAssigned.length).toEqual(0);
  expect(byePlacements.length).toEqual(10);
  expect(participantPlacements.length).toEqual(22);
});
