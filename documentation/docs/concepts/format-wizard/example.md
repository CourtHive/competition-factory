---
title: Worked Example
draft: true
---

> **Stub.** Placeholder for an end-to-end worked example (Phase 1.C onward). Will walk through a realistic participant pool, show the wizard inputs, and display the resulting ranked plan table with commentary.

## Planned content

- Sample tournament: ~24 participants with a representative rating spread (mix of 4.0–6.5)
- TD constraints: 4 courts × 2 days × 8 hours, min-matches floor of 3, target competitive 65%, LIGHT consolation appetite
- Governance: provider-config caps allow SE / RR / Swiss / Compass
- Resulting `distribution` block (histogram, mean/std/IQR, gaps detected)
- Top 5 ranked plans rendered as a table:
  - rank, score, strategy, variant, total matches, predicted competitive %, min/effective floor, court-hours required, warnings
- Per-plan deep dive: which structure went on which flight, why the score landed where it did, what would change if the TD bumped courts to 5 or relaxed the floor

## Notes

- This page is the documentation companion to the TMX wizard's "Show details" view. UI screenshots will be added as Phase 1.C lands.
- A second worked example with a bimodal rating distribution (juniors + adults) will demonstrate how `NATURAL_CLUSTER` flighting lifts plans relative to `EQUAL_BAND`.
