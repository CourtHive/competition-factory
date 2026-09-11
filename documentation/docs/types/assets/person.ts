export const person = {
  addresses: '{\\"type\\":\\"object\\",\\"object\\":\\"address\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  birthDate: '{\\"type\\":\\"string\\",\\"required\\":\\"true\\",\\"note\\":\\"\'YYYY-MM-DD\'\\"}',
  birthYear:
    '{\\"type\\":\\"number\\",\\"required\\":\\"false\\",\\"note\\":\\"year-precision DOB; age/category falls back to this when birthDate absent\\"}',
  biographicalInformation:
    '{\\"type\\":\\"object\\",\\"object\\":\\"biographicalInformation\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  contacts: '{\\"type\\":\\"object\\",\\"object\\":\\"contact\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  nationalityCode: '{\\"type\\":\\"enum\\",\\"enum\\": \\"ISO3166-3\\",\\"required\\":\\"false\\"}',
  nativeFamilyName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  nativeGivenName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  onlineResources:
    '{\\"type\\":\\"object\\",\\"object\\":\\"onlineResource\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  otherNames: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  parentOrganisationId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  passportFamilyName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  passportGivenName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  personId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  personOtherIds: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  previousNames: '{\\"type\\":\\"string\\",\\"array\\":\\"true\\",\\"required\\":\\"false\\"}',
  sex: '{\\"type\\":\\"enum\\",\\"enum\\": \\"\\",\\"required\\":\\"false\\"}',
  standardFamilyName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  standardGivenName: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  tennisId: '{\\"type\\":\\"string\\",\\"required\\":\\"false\\"}',
  wheelchair: '{\\"type\\":\\"boolean\\",\\"required\\":\\"false\\"}',
};

export default person;
