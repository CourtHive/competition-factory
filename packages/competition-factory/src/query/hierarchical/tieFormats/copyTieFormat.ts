import { makeDeepCopy } from '@Tools/makeDeepCopy';

// types
import { TieFormat } from '@Types/tournamentTypes';

export function copyTieFormat(tieFormat: TieFormat): TieFormat;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function copyTieFormat(tieFormat?: TieFormat): TieFormat | undefined;
// eslint-disable-next-line no-redeclare -- overload implementation
export function copyTieFormat(tieFormat?: TieFormat) {
  if (!tieFormat) return undefined;
  return makeDeepCopy(tieFormat, false, true);
}
