/** How a matrix cell is held to the rules. */
export type MatrixEntry =
  | { status: 'conformance'; cases: string[] } // test files of independent cases, written from the rule
  | { status: 'refused'; reason: string } // point and game input refused by design
  | { status: 'missing' }; // no independent case yet
