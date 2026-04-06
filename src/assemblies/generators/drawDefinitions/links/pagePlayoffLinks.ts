import { LOSER, TOP_DOWN, WINNER } from '@Constants/drawDefinitionConstants';

export function pagePlayoffLinks({ q1Structure, eliminatorStructure, q2Structure, finalStructure }) {
  return [
    // Q1 winner advances directly to Final
    {
      linkType: WINNER,
      source: {
        roundNumber: 1,
        structureId: q1Structure.structureId,
      },
      target: {
        feedProfile: TOP_DOWN,
        roundNumber: 1,
        structureId: finalStructure.structureId,
      },
    },
    // Q1 loser drops to Q2
    {
      linkType: LOSER,
      source: {
        roundNumber: 1,
        structureId: q1Structure.structureId,
      },
      target: {
        feedProfile: TOP_DOWN,
        roundNumber: 1,
        structureId: q2Structure.structureId,
      },
    },
    // Eliminator winner advances to Q2
    {
      linkType: WINNER,
      source: {
        roundNumber: 1,
        structureId: eliminatorStructure.structureId,
      },
      target: {
        feedProfile: TOP_DOWN,
        roundNumber: 1,
        structureId: q2Structure.structureId,
      },
    },
    // Q2 winner advances to Final
    {
      linkType: WINNER,
      source: {
        roundNumber: 1,
        structureId: q2Structure.structureId,
      },
      target: {
        feedProfile: TOP_DOWN,
        roundNumber: 1,
        structureId: finalStructure.structureId,
      },
    },
  ];
}
