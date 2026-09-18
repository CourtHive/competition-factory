<!--
Target branch: `dev`, not `master`. See CONTRIBUTING.md.
PR title: a conventional-commit subject (`fix:`, `feat:`, `docs:`, `test:`, `chore:`) —
squash-merge uses it as the commit subject and release-please reads it.
-->

## What this changes

<!-- The behaviour before and after. If it fixes an issue, `Closes #NNN`. -->

## Why

<!-- The problem this solves. For a bug: what produced the wrong result, and why the
     previous code produced it. -->

## Verification

<!-- How you know it works. A test name, a reproduction that now passes, measured
     numbers — not "tested locally". -->

---

- [ ] A test covers the change (or it is docs/chore only)
- [ ] `pnpm check-types && pnpm lint && pnpm format && pnpm test --run` is clean
- [ ] Breaking change? `BREAKING CHANGE:` footer **and** an entry in `documentation/docs/migration-<next major>.0.0.md`
- [ ] Public surface change? The documentation moved with it
