## Context

See proposal.md. Both browser packages inject `home-content.js` on all PrairieLearn pages, and the current course-page parser already identifies assessment rows, grouping, score text, status, access text, and URLs. Filtering must augment the live table rather than clone it.

## Goals / Non-Goals

**Goals:** Pure row indexing and filtering, reversible DOM visibility, transparent partial aggregation, and parity across current grouped layouts.

**Non-Goals:** Reordering assessments, changing PrairieLearn search/state, computing an official course grade, or scraping instructor-only configuration.

## Decisions

### 1. Build a non-destructive row index
Index original row/group nodes with normalized searchable text and parsed status, then toggle `hidden`/ARIA state. A MutationObserver invalidates and rebuilds the index through a debounced path. Alternative: rebuild a separate table; rejected because it duplicates links, accessibility semantics, and PrairieLearn state.

### 2. Define Due Soon through the deadline selector
Use open assessments with verified deadlines inside seven days. Active also includes open/in-progress rows with no finite deadline when the page explicitly marks them active. Unknown rows remain visible unless another filter excludes them.

### 3. Treat progress as a provenance-bearing aggregate
Each row result is included or excluded with a reason. Render `secured / observable active points`, excluded count, and bonus contribution. Never silently coerce percentages into points or infer group weights.

### 4. Persist only stable booleans
Store filter booleans by origin/course instance; search stays in the document session to avoid surprising future filtering.

## Risks / Trade-offs

- [DOM variants break grouping] → Add sanitized fixtures and leave unmatched nodes visible.
- [Hidden rows conflict with PrairieLearn updates] → Observe changes, preserve original nodes, and provide reset.
- [Summary is mistaken for final grade] → Use explicit assessment-list wording and incomplete-state messaging.

## Migration Plan

Add pure adapters/tests, inject the toolbar behind supported-page detection, then enable persistence and summary. Rollback removes injected controls and visibility attributes; stored preferences can remain inert or be version-cleared.

