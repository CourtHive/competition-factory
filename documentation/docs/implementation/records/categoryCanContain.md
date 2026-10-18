---
title: categoryCanContain
---

# categoryCanContain

:::warning 8.0.0 engine API transition

This method is a **candidate for removal from production governors and engine exports at 8.0.0**. Its 7.x route has not been removed. Final removal and standalone package-export decisions require the per-method review and external-integrator confirmation described in the [transition index](/docs/implementation/engine-api-transition-8).

:::

## Source-local contract

The declaration below is copied from the pinned source revision; referenced types are defined there. It is an implementation signature, not a package import example.

```text
export function categoryCanContain({ childCategory, withDetails, category }: CategoryCanContainArgs);
```

## Engine effects

**State writes:** not yet assessed. **Notices:** not yet assessed. Governor query/mutate placement is not proof of purity; review the implementation and engine path before deciding exposure.

## Consumer evidence

The refreshed source-name scan found no name mentions in the scanned product source files. This does not establish external-integrator non-use. The manifest records repository revisions and scan exclusions. External-integrator confirmation is pending.

## Availability and ownership

- **Production governor declarations:** `eventGovernor`, `queryGovernor`.
- **Standalone package API after 8.0.0:** decision pending; this page does not establish a supported import.
- **Implementation:** [`src/query/event/categoryCanContain.ts` — `categoryCanContain`](https://github.com/CourtHive/competition-factory/blob/8c2aaca6801734223ef1e0a8127872344373fbd5/src/query/event/categoryCanContain.ts). Source paths and aliases are not package import paths.
- **Replacement workflow:** not yet established; no supported replacement is promised.
- **Test-only adapters:** may exercise this implementation independently of production engine exports; this is not evidence of product use.

## Preserved 7.x reference

The passages below preserve the existing governor documentation. **Engine examples describe 7.x availability, not an 8.x replacement.** Source contracts take precedence where an explicitly noted correction applies.

### From governors/event-governor.md

Validates whether a child category can be contained within a parent category based on age ranges, rating ranges, and ball type constraints.

```js
const result = engine.categoryCanContain({
  category,
  childCategory,
  withDetails: true,
});
```

**Returns:** a flat object with truthy `valid` or violation flags such as `invalidAgeMin`, `invalidAgeMax`, `invalidAgeMinDate`, `invalidAgeMaxDate`, `invalidRatingRange` and `invalidBallType`. False-valued fields are omitted. There is no nested `details` property. When `withDetails` is true, `categoryDetails` and `childCategoryDetails` are also included.

**Validation Rules:**

1. **Age Range Validation:**
   - Child ageMin must be greater than or equal to parent ageMin
   - Child ageMax must be less than or equal to parent ageMax
   - Child age range must fit within parent age range

2. **Age Date Validation:**
   - Child ageMinDate must be less than or equal to parent ageMaxDate
   - Child ageMaxDate must be greater than or equal to parent ageMinDate

3. **Rating Range Validation:**
   - Only checked if both categories have same ratingType
   - Child ratingMin must be greater than or equal to parent ratingMin
   - Child ratingMax must be less than or equal to parent ratingMax
   - Child rating range must fit within parent rating range

4. **Ball Type Validation:**
   - If both specify ballType, they must match

**Use Cases:**

- Validating flight/division categories within event
- Checking if sub-event category is compatible with main event
- Enforcing hierarchical category constraints
- Building category selection UIs with validation

**Example:**

```js
// Parent event: U18 with rating 3.0-4.5
const parentCategory = {
  categoryName: 'U18',
  ageMax: 18,
  ratingType: 'NTRP',
  ratingMin: 3.0,
  ratingMax: 4.5,
};

// Flight category: U16 with rating 3.5-4.0
const flightCategory = {
  categoryName: 'U16 Flight A',
  ageMax: 16,
  ratingType: 'NTRP',
  ratingMin: 3.5,
  ratingMax: 4.0,
};

const result = engine.categoryCanContain({
  category: parentCategory,
  childCategory: flightCategory,
  withDetails: true,
});

console.log(result.valid); // true - fits within constraints
```

---

## Related documentation

- [governors/event-governor.md](/docs/governors/event-governor)
- [migration.md](/docs/migration)
- [tools/tools-overview.md](/docs/tools/tools-overview)
