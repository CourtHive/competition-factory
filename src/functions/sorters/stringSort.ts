// Pinned to 'en'. An unqualified `localeCompare` resolves against the HOST's
// default locale, and locales genuinely disagree about where accented
// characters belong: Swedish, Finnish and Danish collation sort ö/ä/å AFTER z,
// while English sorts them with o/a. So the same data sorted on a server in
// Stockholm came out in a different order than in New York, with nothing in the
// code to point at.
//
// No behaviour change for the current callers, which sort ASCII identifiers and
// enum constants — participantId and matchUpId pair keys, collectionIds, gender
// constants — where every locale agrees. The pin closes a trap rather than
// fixing a live defect: a helper named `stringSort` invites use on human names,
// and tennis surnames carry diacritics constantly.
//
// That the ordering was undetermined is visible in this function's own tests,
// which fed it 'café'/'cafe'/'cafè' and 'ñ'/'n'/'o' and could only assert that
// the result had three elements. They assert the order now.
const collator = new Intl.Collator('en');

export function stringSort(a, b) {
  return collator.compare(a || '', b || '');
}
