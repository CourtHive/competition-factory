import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

export const toBePlayed = {
  matchUpStatus: TO_BE_PLAYED,
  matchUpStatusCodes: [],
  // cleared with the codes: an unwound matchUp must not keep provenance for an exit that is gone
  sideExitProvenance: undefined,
  score: {
    scoreStringSide1: '',
    scoreStringSide2: '',
    sets: undefined,
  },
  matchUpFormat: undefined,
  winningSide: undefined,
};
