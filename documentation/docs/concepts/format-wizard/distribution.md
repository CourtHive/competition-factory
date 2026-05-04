---
title: Rating Distribution Visualization
draft: true
---

> **Stub.** Placeholder for the rating-distribution component (Phase 1.B). Will document the courthive-components donut/histogram variant used to visualize the participant-pool rating distribution alongside the wizard's plan table.

## Planned content

- Component name and import path (courthive-components)
- Visual reference (screenshot of donut + histogram modes)
- Inputs: `RatingDistributionStats` from `tournamentEngine.suggestFormatPlans` output
- Bin-count heuristic and color tokens
- How the viz changes when the TD adjusts constraints (live recompute)
- Differences from the existing CT donut in courthive-components — the CT donut is retrospective (band proportions of completed matches), this one is predictive / descriptive (rating distribution of a participant pool)

## Open questions

- Should the donut color-grade by predicted competitive band (showing where the wizard expects DECISIVE / ROUTINE / COMPETITIVE matches to land) or stay neutral and let the plan table own that signal?
- Should it support a "compare two pools" overlay mode for collapsed-category vs. segregated runs?
