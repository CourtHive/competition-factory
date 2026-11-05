// NOTE: this template doubles as the ATTRIBUTE WHITELIST — `modifyCourt` derives
// `validAttributes` from `Object.keys(courtTemplate())`, so an attribute missing here is
// silently dropped from a modification rather than rejected. Any new Court field belongs here.
export const courtTemplate = () => ({
  altitude: undefined,
  courtId: undefined,
  courtName: '',
  courtDimensions: undefined,
  discipline: undefined,
  latitude: undefined,
  longitude: undefined,
  surfaceCategory: undefined,
  surfaceType: undefined,
  surfacedDate: undefined,
  indoorOutdoor: undefined,
  floodlit: undefined,
  dateAvailability: [],
  onlineResources: [],
  pace: undefined,
  notes: undefined,
});

export default courtTemplate;
