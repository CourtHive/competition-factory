// The import-section header spellings audit-imports may rewrite. Anything else is prose and is left alone.
//
// Repeated words need a separator: a comma or whitespace, never an optional nothing. With `\s*,?\s*` between words,
// the spaces between `type type type …` could be shared out in many ways, and a 24-word header-like comment took
// ~0.8 s and doubled with every two words (CodeQL #223). Requiring a separator leaves one way to match.
export const HEADER_RE =
  /^\/\/\/?\s*(import\s+(all\s+)?relevant\s+)?(constants?|contants|contstants|types?|fixtures)((?:\s*,\s*|\s+)(and\s+)?(constants?|contants|types?|fixtures))*\s*$/i;
