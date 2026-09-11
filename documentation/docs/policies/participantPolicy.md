---
title: Participant Policy
---

A **Participant Policy** specifies which participant attributes will be present on participants returned via factory methods.

:::note
The filters for Array elements are specified as Objects. In the example policy below, `individualParticipants` filters the attributes of all members of the array in the source data
:::

```js
const privacyPolicy = {
  policyName: 'Participant Privacy Policy',
  participant: {
    individualParticipants: {
      participantName: true,
      participantOtherName: true,
      participantId: true,
      participantRole: true,
      participantStatus: true,
      representing: true,
      participantType: true,
      person: {
        addresses: false,
        nationalityCode: true,
        otherNames: true,
        sex: false,
        standardFamilyName: true,
        standardGivenName: true,
      },
    },
    individualParticipantIds: true,
    participantName: true,
    participantOtherName: true,
    participantId: true,
    participantRole: true,
    participantStatus: true,
    representing: true,
    participantType: true,
    person: {
      nationalityCode: true,
      otherNames: true,
      sex: false,
      standardFamilyName: true,
      standardGivenName: true,
    },
  },
};
```

## Where the policy is applied

The filter runs at every **emission boundary** — the point where participants leave the engine — and not at hydration.

This matters because hydration deliberately keeps participants whole: `getScaleValues` reads `timeItems`, participant lookup resolves by `personId`, and gender enforcement reads `person.sex`. A policy denying any of those would silently break context assembly if it were applied upstream. So the policy is applied to the copy that is returned, and to nothing else.

Applying it at the boundary means it holds wherever participants surface, not only on `getParticipants`: hydrated `matchUp.sides[].participant`, `getParticipantSchedules`, `getTournamentMatchUps`, collection assignments in team events, and the `groupInfo` lookup of the TEAM / GROUP / PAIR entities an individual belongs to. `groupInfo` is participant data under a different shape, so a policy denying `participantName` denies it there too.

Two invariants hold everywhere:

- **Filtering attributes never removes a participant.** The returned array has the same length and the same entities as the unfiltered one, whatever the policy denies. Entries are stripped, not dropped.
- **No policy means no filtering, never "filter everything".** An absent `policyDefinitions` returns participants whole.

:::caution
A template array acts as an allow-list, but it is only evaluated for keys the source object actually carries. An attribute absent from the source is never examined, so a rule written to *withhold* something that is sometimes missing fails **open**. Where a value must be withheld unless explicitly permitted, gate it with a predicate at the call site rather than relying on the template alone — this is what `getTournamentInfo` does for `Contact.isPublic`.
:::

## Staff contacts

`tournamentContacts` on [getTournamentInfo](../governors/query-governor#gettournamentinfo) is the one participant population the caller's policy does **not** govern. It is filtered with the bundled `POLICY_PRIVACY_STAFF` instead, because a contact stripped of `participantRoleResponsibilities` is not a contact — a caller supplying a strict competitor policy would otherwise receive a contact list it could not use.

```js
import { fixtures } from 'tods-competition-factory';

const { POLICY_PRIVACY_STAFF } = fixtures.policies;

// the bundled staff policy is used by default
const { tournamentInfo } = engine.getTournamentInfo();

// a provider may supply its own, shaping which ATTRIBUTES are published
const custom = engine.getTournamentInfo({ policyDefinitions: myStaffPolicy });
```

Two independent gates decide what appears:

1. **Who is staff at all** — the factory's staff role list: `ADMINISTRATION`, `DIRECTOR`, `HOSPITALITY`, `MEDIA`, `MEDICAL`, `OFFICIAL`, `PHYSIO`, `SECURITY`, `STRINGER`, `SUPERVISOR`, `TRAINER`, `TRANSPORT`. `COACH`, `CAPTAIN`, `VOLUNTEER`, `SCOREKEEPER`, `TIMEKEEPER` and `OTHER` are excluded — a coach or captain is affiliated with a competitor rather than with the tournament, and publishing them would turn the contact list into a roster.
2. **Which contacts that person consented to publish** — only contacts marked `isPublic === true` survive. Strict equality: absent and `false` both withhold, so opting in has to be deliberate. Appearing in the staff list publishes nothing on its own.

A provider supplying `policyDefinitions` shapes which **attributes** are published; the role list decides **who** is considered staff, and the `isPublic` gate decides **which contacts**.

## Advanced Filtering

- Multible attributes may share the same privacy template via the use of `||` syntax, as shown below.
- Attributes which are strings may be used to filter the array objects in which they appear; e.g. `scaleName: ['WTN']` will cause other `scaleItems` to be filtered out.
- A wildcard may be used to default all object attributes to `true`, except those explicitly defined as `false`.

```js
const privacyPolicy = {
  /* ... */
  ratings: {
    'SINGLES||DOUBLES': {
      scaleName: ['WTN'],
      scaleValue: {
        '*': true,
        confidence: false,
      },
    },
  },
};
```
