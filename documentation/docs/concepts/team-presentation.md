---
title: Team Presentation in CODES
---

CODES separates team identity from tournament presentation. Team/provider administrators own a team's
palette and default named-role assignments. A provider returns these as `Participant.teamColors` with
TEAM details. A tournament imports the complete validated value and can render every team immediately,
including invitationals with dozens of teams. Rendering requires no live provider lookup.

Tournament directors own optional sparse overrides in the tournament DISPLAY extension. They can apply
one event-wide rule to all teams and add individual exceptions. Overrides do not replace or mutate
provider defaults. Refreshing defaults preserves overrides; resetting overrides restores inheritance.
The complete JSON and write rules are in [TEAM branding](./participants.md#team-branding).

| Concern                                        | Owner                       | CODES/presentation representation                                     |
| ---------------------------------------------- | --------------------------- | --------------------------------------------------------------------- |
| Available brand colors                         | Team/provider administrator | `teamColors.palette` with stable IDs                                  |
| Preferred use of colors                        | Team/provider administrator | `teamColors.display.roles` referencing palette IDs                    |
| Event-wide theme decisions                     | Tournament director         | DISPLAY `teamPresentation.roles` with hex values or `{ theme: true }` |
| Individual team exceptions                     | Tournament director         | DISPLAY `teamPresentation.teams[participantId].roles`                 |
| Supported visual regions and readable fallback | Renderer                    | Declared roles and consumer-local theme                               |

The supported vocabulary is `team.surface`, `team.text`, `team.accent`, `score.surface` and `score.text`.
A default may assign any subset; palette size does not determine the number of rendering roles.
Reordering palette entries cannot change an assignment. Descriptive source groups such as Primary,
Secondary or Accent do not impose a rendering hierarchy.

Per-role precedence is theme fallback → imported team default → all-team override → team exception.
Omission inherits. An override `{ theme: true }` explicitly chooses the theme fallback. Missing palette references
are diagnosed and fall back for that role; renderers never guess from array order. Presentation editors
reject dangling references before saving. A provider refresh can remove a referenced color, so consumers
must also handle it safely on read.

Color data is portable; resolved CSS and theme-dependent contrast decisions are not stored on participants.
A clean scorecard header stays plain. A renderer can consume only the roles meaningful for its layout.
Actual text must remain readable, and names/serve/outcome cues must remain usable without color.

The factory owns CODES structure, atomic participant writes and privacy-aware hydration. Provider services
own administrator authorization and durable defaults. Applications own import/refresh workflows and
presentation editing. Relay consumers resolve foregrounds in their own presentation context.
