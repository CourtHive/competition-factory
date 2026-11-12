import { planIndividualMerge } from './individualMerge/plan';

// constants and types
import type { IndividualMergeArgs, IndividualMergePreview } from '@Types/individualParticipantMerge';

export function getIndividualParticipantMergePreview(args: IndividualMergeArgs): IndividualMergePreview {
  return planIndividualMerge(args).preview;
}
