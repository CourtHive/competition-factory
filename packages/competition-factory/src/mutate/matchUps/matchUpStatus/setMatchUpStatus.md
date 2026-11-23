# setMatchUpStatus pseudocode

1. Check for missing parameters (drawDefinition)
2. Check validity of matchUpStatus and matchUpStatus/winningSide combination
3. Get matchUpsMap and inContextDrawMatchUps (optimization)
4. Find matchUp and inContextMatchUp
5. Check validity of matchUpStatus considering assigned drawPositions
6. Get winner/loser position targets
   - IF matchUpType === TEAM, get targets for TEAM, not INDIVIDUAL/PAIR matchUp
7. IF matchUp is part of TEAM matchUp, check for TEAM projected winning side to determine if scoring INDIVIDUAL/PAIR matchUp would have downstream effects
8. Modify matchUp scheduling information (if any schedule information is part of parameters)

## Double Walkovers

1. When a DOUBLE_WALKOVER matchUpStatus is assigned the subsequent winnerMatchUp receives a WALKOVER matchUpStatus
   - This implies that the factory must allow a matchUp with NO (or one) drawPosition(s) to have a matchUpStatus other than TO_BE_PLAYED
2. When a DOUBLE_WALKOVER matchUpStatus is assigned the subsequent loserMatchUp, if present, receives a BYE matchUpStatus
3. When a participant is advanced into a matchUp which already has a WALKOVER matchUpStatus:
   a. IF there are no other drawPositions, the participant is advanced further
   b. IF there is already a drawPosition, then it must be assumed that a DOUBLE_WALKOVER has been removed and the matchUpStatus becomes TO_BE_PLAYED
4. A DOUBLE_WALKOVER may NOT be removed if there is a downstream matchUp with a score
