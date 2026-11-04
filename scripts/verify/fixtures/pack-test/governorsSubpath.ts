/**
 * The `tods-competition-factory/governors` subpath, type-checked against the installed tarball under
 * the `bundler` resolution a client build uses: it must carry the same governors, with the same
 * types, as the package root.
 */

import { queryGovernor as subpathQueryGovernor } from 'tods-competition-factory/governors';
import * as governorsSubpath from 'tods-competition-factory/governors';
import { queryGovernor } from 'tods-competition-factory';

export const sameQueryGovernor: typeof queryGovernor = subpathQueryGovernor;
export const subpathGetParticipants: typeof queryGovernor.getParticipants =
  governorsSubpath.queryGovernor.getParticipants;
