// Split timeValidation into two simpler regexes for date and time, and combine in logic if needed
// Combine these in your validation logic as needed
export const validDateString = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2]\d|3[0-1])$/;
export const validTimeString = /^((0\d|1\d|2[0-3]):[0-5]\d(:[0-5]\d)?)([.,]\d{3})?$/;

export const dateValidation =
  /^(\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2]\d|3[0-1]))([ T](0\d|1\d|2[0-3]):[0-5]\d(:[0-5]\d)?)?([.,]\d{3})?Z?$/;
export const timeValidation =
  /^(\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2]\d|3[0-1]))?([ T]?(0\d|1\d|2[0-3]):[0-5]\d(:[0-5]\d)?)?([.,]\d{3})?Z?$/;

// Split dateValidation into two simpler regexes for date and time
// Combine these in your validation logic as needed
// Split into two simpler regexes: one for date, one for time, and combine in logic if needed
export const validDate = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const validTime = /^(0\d|1\d|2[0-3]):[0-5]\d(:[0-5]\d)?([.,]\d{3})?Z?$/;
