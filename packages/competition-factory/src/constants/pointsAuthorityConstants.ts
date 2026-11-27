// Authorities that can issue ranking points.
//
// Stamped onto each emitted PointAward (copied from the source policy at
// award time) so federated rank lists — Tennis Europe consuming ATP + ITF
// alongside its own events being the canonical case — can filter and
// weight awards by their issuing authority without re-joining to policy
// metadata.
//
// Vocabulary aligns with TierClassification.system (ATP, WTA, ITF_JUNIOR,
// PPA, …) so that a tournament's tier system and the authority of the
// points it awards line up for the common single-authority case.
//
// The constants below are the KNOWN authorities, not a closed list: a provider
// may stamp its own label. `KnownPointsAuthority` is the closed union of the
// constants; `PointsAuthority` admits any string while still autocompleting them.

export const ATP = 'ATP';
export const WTA = 'WTA';
export const ITF = 'ITF';
export const ITF_JUNIOR = 'ITF_JUNIOR';
export const ITF_WHEELCHAIR = 'ITF_WHEELCHAIR';
export const TENNIS_EUROPE = 'TENNIS_EUROPE';
export const USTA = 'USTA';
export const LTA = 'LTA';
export const FFT = 'FFT';
export const DTB = 'DTB';
export const PPA = 'PPA';
export const BWF = 'BWF';
export const UTR = 'UTR';

// Back-compat default for legacy awards / policies that pre-date this field.
export const UNSPECIFIED = 'UNSPECIFIED';

export const POINTS_AUTHORITIES = [
  ATP,
  WTA,
  ITF,
  ITF_JUNIOR,
  ITF_WHEELCHAIR,
  TENNIS_EUROPE,
  USTA,
  LTA,
  FFT,
  DTB,
  PPA,
  BWF,
  UTR,
  UNSPECIFIED,
] as const;

/** The authorities this package names: the members of `POINTS_AUTHORITIES`. */
export type KnownPointsAuthority = (typeof POINTS_AUTHORITIES)[number];

/**
 * The authority that issues a policy's points: one of the known authorities, or a provider's own label.
 * `(string & {})` keeps editor completion for the known names while admitting any string.
 */
export type PointsAuthority = KnownPointsAuthority | (string & {});

export const pointsAuthorityConstants = {
  ATP,
  WTA,
  ITF,
  ITF_JUNIOR,
  ITF_WHEELCHAIR,
  TENNIS_EUROPE,
  USTA,
  LTA,
  FFT,
  DTB,
  PPA,
  BWF,
  UTR,
  UNSPECIFIED,
  POINTS_AUTHORITIES,
} as const;
