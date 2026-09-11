import { getAwardProfile } from '@Query/scales/getAwardProfile';
import { awardProfileLevelLines } from './awardProfileExamples';
import { finishingPositionSort } from './awardTestUtils';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { expect, it } from 'vitest';

// constants
import { POLICY_TYPE_RANKING_POINTS, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { INDIVIDUAL, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const scoringPolicy = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('generates points for lines in team matchUps', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: scoringPolicy,
    completeAllMatchUps: true,
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 8 }],
        eventType: TEAM_EVENT,
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  const teamParticipants = tournamentEngine
    .getParticipants({
      participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
      withRankingProfile: true,
    })
    .participants.sort(finishingPositionSort);

  const participation = teamParticipants[0].draws[0].structureParticipation;

  const awardCriteria = {
    eventType: TEAM_EVENT,
    participation,
  };

  const awardProfiles = [awardProfileLevelLines];
  const { awardProfile } = getAwardProfile({ awardProfiles, ...awardCriteria });
  expect(awardProfile).not.toBeUndefined();

  const policyDefinitions = { [POLICY_TYPE_RANKING_POINTS]: { awardProfiles } };

  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 1 });
  expect(result.success).toEqual(true);

  const { personPoints, teamPoints } = result;

  // personPoints should contain line-based awards for individual players
  const personIds = Object.keys(personPoints);
  expect(personIds.length).toBeGreaterThan(0);

  // each person's awards should have linePoints and collectionPosition
  for (const personId of personIds) {
    const awards = personPoints[personId];
    for (const award of awards) {
      expect(award.linePoints).toBeDefined();
      expect(typeof award.linePoints).toBe('number');
      expect(award.linePoints).toBeGreaterThan(0);
      expect(award.collectionPosition).toBeDefined();
      expect(award.collectionPosition).toBeGreaterThanOrEqual(1);
      expect(award.eventType).toBe(TEAM_EVENT);
      expect(award.drawId).toBeDefined();
    }
  }

  // verify line-based point values at level 1 correspond to the profile
  // level 1: { line: [300, 275, 250, 225, 200, 175] }
  const level1LinePoints = awardProfileLevelLines.perWinPoints.level[1].line;
  const allLinePoints = personIds.flatMap((pid) => personPoints[pid].map((a) => a.linePoints));
  for (const pts of allLinePoints) {
    expect(level1LinePoints).toContain(pts);
  }

  // verify collectionPosition determines the point value
  for (const personId of personIds) {
    for (const award of personPoints[personId]) {
      const expectedPoints = level1LinePoints[award.collectionPosition - 1];
      expect(award.linePoints).toBe(expectedPoints);
    }
  }

  // teamPoints is empty for this profile since it only has line-based perWinPoints
  // (no finishingPositionRanges), so team-level awards are not generated
  expect(teamPoints).toBeDefined();

  // verify lineParticipation appears in structureParticipation for individuals
  const individualParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    withRankingProfile: true,
  }).participants;

  const participantsWithLineData = individualParticipants.filter((p) =>
    p.draws?.some((d) => d.structureParticipation?.some((sp) => sp.lineParticipation?.length)),
  );
  expect(participantsWithLineData.length).toBeGreaterThan(0);

  for (const p of participantsWithLineData) {
    for (const draw of p.draws) {
      for (const sp of draw.structureParticipation || []) {
        for (const lp of sp.lineParticipation || []) {
          expect(lp.collectionPosition).toBeGreaterThanOrEqual(1);
          expect(typeof lp.won).toBe('boolean');
        }
      }
    }
  }
});

it('enforces limit on line positions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: scoringPolicy,
    completeAllMatchUps: true,
    eventProfiles: [
      {
        drawProfiles: [{ drawSize: 4 }],
        eventType: TEAM_EVENT,
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  // level 5: { line: [57, 49, 42, 35, 29, 21], limit: 4 }
  // only lines 1-4 should earn points
  const awardProfiles = [awardProfileLevelLines];
  const policyDefinitions = { [POLICY_TYPE_RANKING_POINTS]: { awardProfiles } };

  result = scaleEngine.getTournamentPoints({ policyDefinitions, level: 5 });
  expect(result.success).toEqual(true);

  const { personPoints } = result;
  const allAwards = Object.values(personPoints).flat() as any[];
  const level5Config = awardProfileLevelLines.perWinPoints.level[5];

  // no award should have a collectionPosition beyond the limit
  for (const award of allAwards) {
    expect(award.collectionPosition).toBeLessThanOrEqual(level5Config.limit);
  }

  // awarded points should only come from lines within the limit
  const validLinePoints = level5Config.line.slice(0, level5Config.limit);
  for (const award of allAwards) {
    expect(validLinePoints).toContain(award.linePoints);
  }
});
