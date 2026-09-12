## Context

See proposal.md. The extension currently injects only a PrairieTest link. Official PrairieLearn access rules confirm PrairieTest can be the authority for exam scheduling/access, but this repository has no verified reservation API contract. Workspace documentation likewise does not establish a universal student-visible shutdown timestamp.

## Goals / Non-Goals

**Goals:** Make source discovery a release gate, use minimal student-visible fields, distinguish server lifecycle from local inactivity, and preserve platform shutdown behavior.

**Non-Goals:** Private API reverse engineering, credential capture, reservation mutation, workspace keepalive, file inspection, or guaranteed save detection.

## Decisions

### 1. Split discovery adapters from enabled features
Record sanitized HTML/network evidence, origin/auth behavior, field mapping, and freshness in fixtures and a maintainer note. Production adapters are enabled only for recognized contracts. Unknown responses return unsupported, never empty-success.

### 2. Prefer page-context authenticated reads
Use already authenticated, student-visible pages and same-origin fetch only where the browser normally permits it. Any new PrairieTest host permission requires a separate manifest/privacy review and explicit adapter allowlist.

### 3. Normalize reservation identity and retention
Derive identity from a stable reservation identifier when visible, otherwise a bounded exam/start tuple. Cache display fields only and purge shortly after end. Do not store student identifiers or full history.

### 4. Separate authoritative and local workspace clocks
An adapter may emit an absolute lifecycle deadline with provenance. Otherwise a local interaction clock produces differently styled reminder copy. Neither path sends traffic or synthesizes activity.

## Risks / Trade-offs

- [No stable reservation source exists] → Ship no widget and retain link-only behavior; discovery tasks remain an explicit gate.
- [Host permission increases review/privacy scope] → Add only after evidence and document exact use.
- [Local inactivity differs from server inactivity] → Never label it as shutdown time.
- [Timers create false assurance] → Refresh on visibility and state changes and show source/freshness.

## Migration Plan

Complete source discovery first. Implement adapters/tests only for verified contracts, then cache/UI, then workspace authoritative timer, and finally optional local reminders. Rollback removes permissions/adapters, clears bounded caches/timers, and retains the navigation link.

