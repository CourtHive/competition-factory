import { coercedGender } from '@Helpers/coercedGender';
import { isMixed } from '@Validators/isMixed';
import { isAny } from '@Validators/isAny';

// constants and types
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';

// Selects participants (by stage) from a supplied pool for the preset-participant
// mocks flow. Filters by participantType, gender (when the event is gendered),
// and excludes participants already consumed by earlier events
// (`allUniqueParticipantIds`). Pure selection — no mutation.

export function getStageParticipants({
  allUniqueParticipantIds,
  stageParticipantsCount,
  eventParticipantType,
  targetParticipants,
  gender,
}: {
  allUniqueParticipantIds: string[];
  stageParticipantsCount: { [key: string]: number };
  eventParticipantType: string;
  targetParticipants?: any[];
  gender?: string;
}) {
  const mainParticipantsCount = stageParticipantsCount[MAIN] || 0;
  const qualifyingParticipantsCount = stageParticipantsCount[QUALIFYING] || 0;

  const participantMap = new Map((targetParticipants ?? []).map((p) => [p.participantId, p]));
  const matchesGender = genderMatcher(gender, participantMap);

  // Single gender/type-filtered pool, sliced per stage. QUALIFYING takes the
  // first N; MAIN takes the next M — matching the original slice offsets.
  const available = (targetParticipants ?? [])
    .filter(({ participantType }) => participantType === eventParticipantType)
    .filter(({ participantId }) => !allUniqueParticipantIds.includes(participantId))
    .filter(matchesGender);

  const stageParticipants = {
    QUALIFYING: available.slice(0, qualifyingParticipantsCount),
    MAIN: available.slice(qualifyingParticipantsCount, qualifyingParticipantsCount + mainParticipantsCount),
  };

  return { stageParticipants };
}

/**
 * Returns a predicate that keeps participants matching the event gender.
 * Ungendered / MIXED / ANY events accept everyone (no-op — preserves the
 * pre-gender-filter behavior). PAIRs match when their constituent individuals
 * all match. Mirrors the gender check in `addEventEntries`.
 */
function genderMatcher(gender: string | undefined, participantMap: Map<string, any>) {
  if (!gender || isMixed(gender) || isAny(gender)) return () => true;
  const target = coercedGender(gender);
  return (participant: any): boolean => {
    if (participant.participantType === PAIR) {
      const memberIds: string[] = participant.individualParticipantIds ?? [];
      return (
        memberIds.length > 0 && memberIds.every((id) => coercedGender(participantMap.get(id)?.person?.sex) === target)
      );
    }
    if (participant.participantType === INDIVIDUAL) {
      return coercedGender(participant.person?.sex) === target;
    }
    return true;
  };
}
