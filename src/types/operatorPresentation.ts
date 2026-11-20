/**
 * Version one of the read-only presentation facet of an operator document.
 * CFS must wrap it with verified audience, source revision and time validity before delivery.
 * These DTOs carry no records, action eligibility, mutation payloads or transport/session behavior.
 */
export type OperatorSidePresentation = {
  readonly sideNumber: 1 | 2;
  readonly participantId?: string;
  readonly name?: string;
  readonly seed?: string;
  readonly bye: boolean;
  readonly qualifier: boolean;
  readonly isWinner: boolean;
};

export type OperatorMatchPresentation = {
  readonly matchUpId: string;
  readonly roundPosition?: number;
  readonly status?: string;
  readonly scoreText: string;
  readonly hasScore: boolean;
  readonly isUpset: boolean;
  readonly sides: readonly OperatorSidePresentation[];
  readonly schedule?: {
    readonly date?: string;
    readonly time?: string;
    readonly court?: string;
    readonly venue?: string;
  };
};

export type OperatorRoundPresentation = {
  readonly roundNumber: number;
  readonly name?: string;
  readonly feedRound: boolean;
  readonly matches: readonly OperatorMatchPresentation[];
};

export type OperatorDrawPresentation = {
  readonly schemaVersion: 'operator-presentation.v1';
  readonly drawId: string;
  readonly structureId: string;
  readonly rounds: readonly OperatorRoundPresentation[];
};
