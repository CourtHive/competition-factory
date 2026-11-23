export function generateAddress(addressAttributes) {
  const { cities, states, postalCodes, nationalityCode, participantIndex } = addressAttributes;
  return {
    postalCode: postalCodes?.[participantIndex],
    state: states?.[participantIndex],
    city: cities?.[participantIndex],
    countryCode: nationalityCode,
  };
}
