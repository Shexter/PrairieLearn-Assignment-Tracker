## 1. PrairieTest source gate

- [ ] 1.1 With an authorized test account, inspect student-visible PrairieTest pages/network behavior and record origin, authentication, fields, freshness, pagination, and failure states without capturing credentials or personal identifiers.
- [ ] 1.2 Decide from evidence whether a stable supported source exists; document a link-only outcome if it does not, and do not proceed with production reservation parsing in that case.
- [ ] 1.3 Capture sanitized fixtures for upcoming, changed, cancelled/completed, empty, signed-out, malformed, and unsupported reservation responses/pages.
- [ ] 1.4 If cross-origin access is required, document the exact least-privilege host permission and privacy/store-review impact before changing manifests.

## 2. Reservation integration

- [ ] 2.1 Implement an allowlisted adapter that returns recognized, unsupported, or authentication-required distinctly and extracts only approved display fields.
- [ ] 2.2 Add stable reservation identity, freshness, bounded retention, changed-time replacement, and expired-cache purge tests.
- [ ] 2.3 Integrate successful refresh with background storage without blocking ordinary PrairieLearn deadline refresh when PrairieTest fails.
- [ ] 2.4 Render upcoming reservations in the home card and popup with time, status, optional location/mode, freshness, and exact navigation link.
- [ ] 2.5 Render no inferred empty state for unsupported/auth failures; preserve the existing PrairieTest navigation link and provide actionable status.

## 3. Workspace lifecycle discovery

- [ ] 3.1 Capture sanitized workspace-page fixtures and observe whether an absolute shutdown/expiry or remaining-duration signal is exposed across VS Code/Jupyter variants.
- [ ] 3.2 Define and test authoritative lifecycle adapters; return unsupported when state is absent, stale, malformed, or only inferred from local activity.

## 4. Workspace warnings

- [ ] 4.1 Implement the authoritative countdown with provenance/freshness, visibility-aware updates, lifecycle-change reconciliation, and teardown.
- [ ] 4.2 Add default-off local inactivity reminder preferences with reset on genuine local interaction and copy that never calls it a shutdown timer.
- [ ] 4.3 Add tests proving neither monitoring path sends network requests, synthetic input, keepalive messages, file reads, or saved-work claims.
- [ ] 4.4 Render accessible warning/status UI that does not cover workspace controls at narrow widths or during fullscreen/editor use.

## 5. Verification and release

- [ ] 5.1 Update README/privacy/store permission documentation with verified data sources, cached fields, retention, failure behavior, and workspace non-keepalive limits.
- [ ] 5.2 Run automated, syntax, parity, strict OpenSpec, manifest, and diff checks.
- [ ] 5.3 Verify authorized real PrairieTest refresh/change/error flows and real workspace authoritative/unsupported/inactivity states in Chrome and Firefox; do not mark gated features complete without this evidence.

