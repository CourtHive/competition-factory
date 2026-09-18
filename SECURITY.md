# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a suspected vulnerability.**

Email **[charles@courthive.com](mailto:charles@courthive.com)** with:

- what the issue is and which version you found it on,
- a reproduction — the smallest input or call sequence that demonstrates it,
- what an attacker gets out of it.

You can expect an acknowledgement within a few days. If the report is confirmed, you will be told
when a fix is released, and credited in the release notes unless you would rather not be.

## Supported versions

Security fixes are released against the **latest published minor of the current major**. Older
majors are not patched; the upgrade path for each is documented in the migration guide shipped with
that major.

## Scope

`tods-competition-factory` is a **library with zero runtime dependencies**. It performs no network
I/O, opens no sockets, reads no filesystem, and holds no credentials — it transforms tournament
records it is handed. That shape rules out whole vulnerability classes, and it means the realistic
issues are these:

- **Untrusted input handled unsafely** — a tournament record, policy definition, `matchUpFormat`
  code or scoring string that causes unbounded recursion, catastrophic backtracking, prototype
  pollution, or a crash in a consuming process.
- **Data exposure across boundaries** — a query or publishing method returning records, participant
  personal information, or unpublished results to a caller that should not receive them. The
  publishing and embargo surface is the part of this library where a defect has real-world
  consequences, so reports there are especially welcome.
- **A supply-chain problem in the published package** — anything unexpected in what npm serves.

Out of scope here: deployments that consume the factory. A vulnerability in a CourtHive application
or server belongs to that repository — but if you are unsure, send it to the address above anyway
and it will be routed.
