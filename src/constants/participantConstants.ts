export type SignedInStatusUnion = typeof SIGNED_IN | typeof SIGNED_OUT;
export const SIGN_IN_STATUS = 'SIGN_IN_STATUS';
export const SIGNED_OUT = 'SIGNED_OUT';
export const SIGNED_IN = 'SIGNED_IN';

export type PaymentStatusUnion = typeof PAID | typeof UNPAID | typeof PARTIAL | typeof WAIVED | typeof REFUNDED;
export const PAYMENT_STATUS = 'PAYMENT_STATUS';
export const REFUNDED = 'REFUNDED';
export const PARTIAL = 'PARTIAL';
export const WAIVED = 'WAIVED';
export const UNPAID = 'UNPAID';
export const PAID = 'PAID';

export const paymentStatusValues: PaymentStatusUnion[] = [PAID, UNPAID, PARTIAL, WAIVED, REFUNDED];

export const TEAM_PARTICIPANT = 'TEAM';
export const INDIVIDUAL = 'INDIVIDUAL';
export const GROUP = 'GROUP';
export const PAIR = 'PAIR';
export const TEAM = 'TEAM';

// a lineUp warning: the individual assigned is on no team in the event, so is not on the roster of the team
// whose lineUp it joins. Allowed; a player on ANOTHER team's roster is refused (SHARED_INDIVIDUAL_PARTICIPANT)
export const NOT_ON_TEAM_ROSTER = 'NOT_ON_TEAM_ROSTER';

export const participantTypes = {
  TEAM_PARTICIPANT,
  INDIVIDUAL,
  GROUP,
  TEAM,
  PAIR,
} as const;

export const participantConstants = {
  INDIVIDUAL,
  GROUP,
  PAIR,
  TEAM,

  SIGN_IN_STATUS,
  SIGNED_OUT,
  SIGNED_IN,

  NOT_ON_TEAM_ROSTER,

  PAYMENT_STATUS,
  REFUNDED,
  PARTIAL,
  WAIVED,
  UNPAID,
  PAID,
} as const;
