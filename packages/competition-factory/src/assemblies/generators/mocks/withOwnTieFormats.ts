import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { isObject } from '@Tools/objects';

type Profile = Record<string, any>;

/**
 * The call's params with every tieFormat object its profiles carry replaced by the generator's own copy.
 *
 * A profile's tieFormat belongs to the caller. The generators complete the tieFormat they work from (counting the team
 * members a profile needs mints the missing collectionIds onto it), and that write must land on a copy: written to the
 * caller's object it reached every later record built from the same object, a published `fixtures.tieFormats.*`
 * included, and those records shared collectionIds. One object named by several profiles gets one copy, so those
 * profiles still share its collections as they did before.
 */
export function withOwnTieFormats<T extends Profile>(params: T): T {
  if (!isObject(params)) return params;
  const copies = new Map<object, object>();

  const ownTieFormat = (tieFormat: object) => {
    if (!copies.has(tieFormat)) copies.set(tieFormat, makeDeepCopy(tieFormat, false, true));
    return copies.get(tieFormat);
  };

  const ownProfile = (profile: Profile): Profile => {
    if (!isObject(profile)) return profile;
    const tieFormat = isObject(profile.tieFormat) ? ownTieFormat(profile.tieFormat) : undefined;
    const drawProfiles = Array.isArray(profile.drawProfiles) ? ownProfiles(profile.drawProfiles) : undefined;
    if (!tieFormat && drawProfiles === profile.drawProfiles) return profile;
    return { ...profile, ...(tieFormat && { tieFormat }), ...(drawProfiles && { drawProfiles }) };
  };

  const ownProfiles = (profiles: Profile[]) => {
    const owned = profiles.map(ownProfile);
    return owned.some((profile, index) => profile !== profiles[index]) ? owned : profiles;
  };

  const owned: Profile = { ...params };
  let changed = false;
  for (const key of ['drawProfiles', 'eventProfiles', 'leagueProfiles']) {
    if (!Array.isArray(params[key])) continue;
    owned[key] = ownProfiles(params[key]);
    changed ||= owned[key] !== params[key];
  }
  return (changed ? owned : params) as T;
}
