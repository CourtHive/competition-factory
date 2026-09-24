import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { modifySeedAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { participantInEntries } from '@Query/drawDefinition/entryGetter';
import { isValidSeedPosition } from '@Query/drawDefinition/seedGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, SeedingBasisUnion, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { SeedingProfile } from '@Types/factoryTypes';
import {
  INVALID_DRAW_POSITION_FOR_SEEDING,
  INVALID_PARTICIPANT_ID,
  INVALID_SEED_NUMBER,
} from '@Constants/errorConditionConstants';

type AssignSeedArgs = {
  provisionalPositioning?: boolean;
  tournamentRecord?: Tournament;
  seedingProfile?: SeedingProfile;
  drawDefinition: DrawDefinition;
  participantId: string;
  seedBlockInfo?: any;
  structureId: string;
  seedNumber: number;
  /** Why the seed was awarded; see {@link SeedingBasisEnum}. Absent leaves any existing basis alone. */
  seedingBasis?: SeedingBasisUnion;
  seedValue?: string | number;
  eventId?: string;
  event?: Event;
};
export function assignSeed({
  provisionalPositioning,
  tournamentRecord,
  drawDefinition,
  seedingProfile,
  participantId,
  seedBlockInfo,
  structureId,
  seedingBasis,
  seedNumber,
  seedValue,
  eventId,
  event,
}: AssignSeedArgs) {
  const stack = 'assignSeed';
  const { structure } = findStructure({ drawDefinition, structureId });
  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  const seedAssignments = getStructureSeedAssignments({
    provisionalPositioning,
    drawDefinition,
    structure,
  }).seedAssignments as any;
  const seedNumbers = seedAssignments.map((assignment) => assignment.seedNumber);

  const validParticipantId = participantInEntries({
    drawDefinition,
    participantId,
  });

  if (participantId && !validParticipantId)
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_ID },
      context: { participantId },
      stack,
    });

  const flightsCount = event ? getFlightProfile({ event }).flightProfile?.flights?.length : 0;
  const flighted = flightsCount && flightsCount > 1;

  const relevantAssignment = positionAssignments?.find((assignment) => assignment.participantId === participantId);
  const assignedDrawPosition = relevantAssignment?.drawPosition;

  if (assignedDrawPosition) {
    const positionIsValid = isValidSeedPosition({
      drawPosition: assignedDrawPosition,
      drawDefinition,
      seedBlockInfo,
      structureId,
      seedNumber,
    });
    if (!positionIsValid)
      return decorateResult({
        result: { error: INVALID_DRAW_POSITION_FOR_SEEDING },
        context: { assignedDrawPosition },
        info: 'invalid seed position',
        stack,
      });
  }

  if (!seedNumbers.includes(seedNumber)) {
    seedAssignments.push({ seedNumber, seedValue, seedingBasis });
  }

  let success;
  seedAssignments.forEach((assignment) => {
    // ensure that this participantId is not assigned to any other seedNumber
    if (assignment.participantId === participantId && assignment.seedNumber !== seedNumber) {
      assignment.participantId = undefined;
    }
    // assign participantId to target seedNumber
    if (assignment.seedNumber === seedNumber) {
      assignment.participantId = participantId;
      if (!seedingProfile?.groupSeedingThreshold && !flighted) assignment.seedValue = seedValue ?? seedNumber;
      // An absent basis means "the ordinary one", which is also what an untouched assignment
      // already says — so an omitted param must not erase a basis a prior call recorded.
      if (seedingBasis) assignment.seedingBasis = seedingBasis;
      success = true;
    }
  });

  if (success) {
    modifySeedAssignmentsNotice({
      tournamentId: tournamentRecord?.tournamentId,
      drawDefinition,
      structure,
      eventId,
    });
    return { ...SUCCESS };
  }

  return decorateResult({ result: { error: INVALID_SEED_NUMBER }, stack });
}
