## Context

See proposal.md. Content scripts currently run broadly but have no stable question identity layer. PrairieLearn question surfaces may include plain inputs, rich editors, Monaco, workspace frames, and dynamically replaced question content; native actions remain the authority for validation and submission.

## Goals / Non-Goals

**Goals:** Invoke only native visible controls, avoid editor conflicts, create stable local study identities, and isolate private notes from all existing sync paths.

**Non-Goals:** Answer automation, auto-submission, cloud note sync, reading hidden attempt rules, or rendering untrusted Markdown as HTML.

## Decisions

### 1. Use guarded action discovery
Page adapters return at most one visible enabled action for each semantic command. Capture shortcuts only when modifier/key rules match, composition is inactive, and no nested component consumed the event. Dispatch a normal click rather than reconstructing forms.

### 2. Make confirmation wrap both mouse and keyboard paths
When enabled and risk is observable, intercept the native activation once, show a tracker dialog with the parsed facts, then resume through a reentrancy guard. Unknown risk never invents a warning.

### 3. Define a versioned composite identity
Prefer stable origin/course-instance/assessment-instance/question identifiers from URL or page data; fall back only to normalized canonical paths that survive reload. Do not merge ambiguous identities.

### 4. Store structured bookmarks and text notes separately
Use versioned `storage.local` records and message allowlists. Notes autosave after debounce and render as plain text; export creates a local JSON/text file. Alternative: sync storage; rejected because notes may be sensitive and quotas/replication change the privacy promise.

## Risks / Trade-offs

- [Shortcut causes unintended submission] → Default shortcuts off until onboarding, require exact action discovery, and test editor/composition cases.
- [DOM labels vary] → Adapter fixtures and no-op fallback.
- [Local storage loss] → Provide export and clearly state local-only persistence.
- [Question URLs expire] → Preserve stale entries and let users repair/remove them.

## Migration Plan

Add identity/storage schemas and fixtures; ship bookmark/note UI; then add navigation shortcuts; enable submission shortcut and confirmations after real-page acceptance. Rollback unregisters handlers/UI and leaves exportable local records intact.

