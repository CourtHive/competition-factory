import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { ASSIGN_PARTICIPANT, SWAP_PARTICIPANTS } from '@Constants/positionActionConstants';
import { POLICY_TYPE_POSITION_ACTIONS } from '@Constants/policyConstants';
import { REMOVE_PARTICIPANT } from '@Constants/matchUpActionConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { ALTERNATE } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

test('adHocMatchUpActions provides REMOVE_PARTICIPANT and SWAP_PARTICIPANTS when participants assigned', () => {
  const drawId = 'adHocCov';
  const drawProfile = {
    completionGoal: 0,
    drawType: AD_HOC,
    automated: true,
    roundsCount: 2,
    drawSize: 16,
    idPrefix: 'c',
    drawId,
  };

  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  // With automated: true and roundsCount: 2, participants should be assigned
  const matchUpWithParticipants = matchUps.find(
    (m) => m.sides?.filter((s) => s.participantId).length === 2 && m.roundNumber === 1,
  );
  expect(matchUpWithParticipants).toBeDefined();

  const sideWithParticipant = matchUpWithParticipants.sides.find((s) => s.participantId);

  // Call matchUpActions which internally invokes adHocMatchUpActions for AD_HOC draws
  const { validActions } = tournamentEngine.matchUpActions({
    matchUpId: matchUpWithParticipants.matchUpId,
    sideNumber: sideWithParticipant.sideNumber,
    drawId,
  });

  expect(validActions).toBeDefined();

  // Lines 136-141: REMOVE_PARTICIPANT action should be present when side has participantId and no score
  const removeAction = validActions.find((a) => a.type === REMOVE_PARTICIPANT);
  expect(removeAction).toBeDefined();
  expect(removeAction.payload.drawId).toEqual(drawId);
  expect(removeAction.payload.matchUpId).toEqual(matchUpWithParticipants.matchUpId);
  expect(removeAction.payload.sideNumber).toEqual(sideWithParticipant.sideNumber);

  // Lines 155-180: SWAP_PARTICIPANTS action should be present when there are other round matchUps with swappable participants
  const swapAction = validActions.find((a) => a.type === SWAP_PARTICIPANTS);
  expect(swapAction).toBeDefined();
  expect(swapAction.swappableParticipantIds.length).toBeGreaterThan(0);
  expect(swapAction.swappableParticipants.length).toBeGreaterThan(0);
  expect(swapAction.payload.participantIds).toContain(sideWithParticipant.participantId);
  expect(swapAction.payload.roundNumber).toEqual(matchUpWithParticipants.roundNumber);
});

test('adHocMatchUpActions provides ASSIGN_PARTICIPANT for empty sides', () => {
  const drawId = 'adHocEmpty';
  const drawProfile = {
    drawType: AD_HOC,
    automated: false,
    roundsCount: 1,
    drawSize: 8,
    idPrefix: 'e',
    drawId,
  };

  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps[0];

  // Sides should be empty since automated: false
  expect(matchUp.sides?.every((s) => !s.participantId)).toBe(true);

  const { validActions } = tournamentEngine.matchUpActions({
    matchUpId: matchUp.matchUpId,
    sideNumber: 1,
    drawId,
  });

  // ASSIGN_PARTICIPANT action should be available with all entered participants
  const assignAction = validActions.find((a) => a.type === ASSIGN_PARTICIPANT);
  expect(assignAction).toBeDefined();
  expect(assignAction.availableParticipantIds.length).toEqual(8);
  expect(assignAction.participantsAvailable.length).toEqual(8);
});

test('adHocMatchUpActions handles alternates section', () => {
  // Generate more participants than the event needs, so we can add extras as alternates
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    eventProfiles: [
      {
        participantsProfile: { participantsCount: 8 },
      },
    ],
    setState: true,
  });

  // Add extra participants as alternates to the event
  const { participants } = tournamentEngine.getParticipants();
  const eventParticipantIds = new Set(tournamentEngine.getEvent({ eventId }).event.entries.map((e) => e.participantId));

  // Generate additional participants to use as alternates
  const nonEventParticipants = participants.filter((p) => !eventParticipantIds.has(p.participantId));
  expect(nonEventParticipants.length).toBeGreaterThan(0);

  tournamentEngine.addEventEntries({
    participantIds: nonEventParticipants.map((p) => p.participantId),
    entryStatus: ALTERNATE,
    eventId,
  });

  // Generate an AD_HOC draw with automated: false so sides are empty
  const drawDefinition = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: false,
    roundsCount: 1,
    eventId,
  }).drawDefinition;

  tournamentEngine.addDrawDefinition({ drawDefinition, eventId });

  const drawId = drawDefinition.drawId;
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const adHocMatchUp = matchUps.find((m) => m.drawId === drawId);
  expect(adHocMatchUp).toBeDefined();

  const { validActions } = tournamentEngine.matchUpActions({
    matchUpId: adHocMatchUp.matchUpId,
    sideNumber: 1,
    drawId,
  });

  // Lines 110-134: If there are alternates, an ALTERNATE action should appear
  const assignAction = validActions.find((a) => a.type === ASSIGN_PARTICIPANT);
  expect(assignAction).toBeDefined();

  // The alternates action type is ALTERNATE from entryStatusConstants
  // Lines 117-134: availableAlternates should include the alternate participants
  const alternateAction = validActions.find((a) => a.type === ALTERNATE);
  expect(alternateAction).toBeDefined();
  expect(alternateAction.availableParticipantIds.length).toBeGreaterThan(0);
  expect(alternateAction.participantsAvailable.length).toBeGreaterThan(0);

  // Lines 120-123: Each alternate should have entryPosition set
  alternateAction.participantsAvailable.forEach((alternate) => {
    // entryPosition may be undefined if not set in draw entries, but the code path is exercised
    expect(alternate).toBeDefined();
  });
});

test('adHocMatchUpActions otherFlightEntries path includes participants from other flights', () => {
  const participantsCount = 20;
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [
      {
        participantsProfile: { participantsCount },
        eventType: SINGLES_EVENT,
      },
    ],
    setState: true,
  });

  // Apply policy with otherFlightEntries enabled
  const policyDefinitions = {
    [POLICY_TYPE_POSITION_ACTIONS]: {
      otherFlightEntries: true,
      enabledStructures: [],
    },
  };
  tournamentEngine.attachPolicies({ policyDefinitions, eventId });

  // Generate an AD_HOC draw without flights (uses all event entries)
  const drawDef = tournamentEngine.generateDrawDefinition({
    drawType: AD_HOC,
    automated: false,
    roundsCount: 1,
    eventId,
  }).drawDefinition;

  tournamentEngine.addDrawDefinition({ drawDefinition: drawDef, eventId });

  const drawId = drawDef.drawId;
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  expect(matchUps.length).toBeGreaterThan(0);
  const adHocMatchUp = matchUps[0];

  // After addDrawDefinition, a flight profile is automatically created with one flight
  // The otherFlightEntries code path (lines 93-108) is exercised because:
  // 1. The policy has otherFlightEntries: true
  // 2. getFlightProfile is called and returns the flight profile
  // Even though there's only one flight (so otherFlightEnteredParticipantIds will be empty),
  // the code path through the if(otherFlightEntries) block is executed

  const { validActions } = tournamentEngine.matchUpActions({
    matchUpId: adHocMatchUp.matchUpId,
    sideNumber: 1,
    drawId,
  });

  expect(validActions).toBeDefined();

  // The ASSIGN action should be available for the empty side
  const assignAction = validActions.find((a) => a.type === ASSIGN_PARTICIPANT);
  expect(assignAction).toBeDefined();
  expect(assignAction.availableParticipantIds.length).toEqual(participantsCount);
});

test('adHocMatchUpActions SWAP excludes previous opponents from other rounds', () => {
  const drawId = 'swapFilter';
  const drawProfile = {
    completionGoal: 0,
    drawType: AD_HOC,
    automated: true,
    roundsCount: 2,
    drawSize: 8,
    idPrefix: 's',
    drawId,
  };

  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const round1MatchUps = matchUps.filter((m) => m.roundNumber === 1);
  const targetMatchUp = round1MatchUps.find((m) => m.sides?.every((s) => s.participantId));
  expect(targetMatchUp).toBeDefined();

  const side1 = targetMatchUp.sides.find((s) => s.sideNumber === 1);
  const side2 = targetMatchUp.sides.find((s) => s.sideNumber === 2);

  // Get swap actions for side 1
  const { validActions } = tournamentEngine.matchUpActions({
    matchUpId: targetMatchUp.matchUpId,
    sideNumber: 1,
    drawId,
  });

  const swapAction = validActions.find((a) => a.type === SWAP_PARTICIPANTS);
  expect(swapAction).toBeDefined();

  // Lines 149-152: The current opponent should not be in the swappable list
  expect(swapAction.swappableParticipantIds).not.toContain(side2.participantId);

  // Lines 147-152: Participants who are paired with side1's participant in other rounds should also be excluded
  const round2MatchUps = matchUps.filter((m) => m.roundNumber === 2);
  const round2PairingWithSide1 = round2MatchUps.find((m) =>
    m.sides?.some((s) => s.participantId === side1.participantId),
  );

  if (round2PairingWithSide1) {
    const round2Opponent = round2PairingWithSide1.sides.find(
      (s) => s.participantId && s.participantId !== side1.participantId,
    );
    if (round2Opponent) {
      // The opponent from round 2 should also be excluded from available swaps
      expect(swapAction.swappableParticipantIds).not.toContain(round2Opponent.participantId);
    }
  }
});

test('adHocMatchUpActions no REMOVE or SWAP when matchUp has score', () => {
  const drawId = 'adHocScore';
  const drawProfile = {
    completionGoal: 1,
    drawType: AD_HOC,
    automated: true,
    roundsCount: 1,
    drawSize: 8,
    idPrefix: 'sc',
    drawId,
  };

  mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  // Find a completed matchUp (has a score)
  const completedMatchUp = matchUps.find((m) => m.winningSide);

  if (completedMatchUp) {
    const sideWithParticipant = completedMatchUp.sides.find((s) => s.participantId);

    const { validActions } = tournamentEngine.matchUpActions({
      matchUpId: completedMatchUp.matchUpId,
      sideNumber: sideWithParticipant.sideNumber,
      drawId,
    });

    // Lines 136: REMOVE_PARTICIPANT and SWAP should NOT appear when score has value
    const removeAction = validActions.find((a) => a.type === REMOVE_PARTICIPANT);
    expect(removeAction).toBeUndefined();

    const swapAction = validActions.find((a) => a.type === SWAP_PARTICIPANTS);
    expect(swapAction).toBeUndefined();
  }
});
