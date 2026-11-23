import { BOTTOM_UP, TOP_DOWN, LOSER, WINNER } from '@Constants/drawDefinitionConstants';

export function doubleEliminationLinks({ mainStructure, consolationStructure, deciderStructure }) {
  const consolationMatchUps = consolationStructure.matchUps;

  // roundsFed are those rounds which are generated with drawPositions (not undefined or undefined)
  const roundsFed = consolationMatchUps.reduce((rf, matchUp) => {
    const drawPositions = (matchUp.drawPositions ?? []).filter(Boolean);
    return drawPositions.length && !rf.includes(matchUp.roundNumber) ? rf.concat(matchUp.roundNumber) : rf;
  }, []);

  const mainFinalRound = mainStructure.matchUps.reduce((finalRound, matchUp) => {
    return !finalRound || matchUp.roundNumber > finalRound ? matchUp.roundNumber : finalRound;
  }, undefined);

  const consolationFinalRound = consolationStructure.matchUps.reduce((finalRound, matchUp) => {
    return !finalRound || matchUp.roundNumber > finalRound ? matchUp.roundNumber : finalRound;
  }, undefined);

  const fedRounds = roundsFed.map((roundNumber, i) => {
    const roundsFedIndex = roundsFed.indexOf(roundNumber);
    const feedProfile = roundsFedIndex % 2 ? TOP_DOWN : BOTTOM_UP;
    const sourceRoundNumber = 1 + i;

    return {
      linkType: LOSER,
      source: {
        roundNumber: sourceRoundNumber,
        structureId: mainStructure.structureId,
      },
      target: {
        feedProfile,
        roundNumber,
        structureId: consolationStructure.structureId,
      },
    };
  });

  const finalistsLink = {
    linkType: WINNER,
    source: {
      roundNumber: consolationFinalRound,
      structureId: consolationStructure.structureId,
    },
    target: {
      feedProfile: TOP_DOWN,
      roundNumber: mainFinalRound,
      structureId: mainStructure.structureId,
    },
  };

  const deciderLinks = [
    {
      linkType: WINNER,
      source: {
        roundNumber: mainFinalRound,
        structureId: mainStructure.structureId,
      },
      target: {
        feedProfile: TOP_DOWN,
        roundNumber: 1,
        structureId: deciderStructure.structureId,
      },
    },
    {
      linkType: LOSER,
      source: {
        roundNumber: mainFinalRound,
        structureId: mainStructure.structureId,
      },
      target: {
        feedProfile: TOP_DOWN,
        roundNumber: 1,
        structureId: deciderStructure.structureId,
      },
    },
  ];

  return [...fedRounds, finalistsLink, ...deciderLinks];
}
