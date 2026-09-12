## Purpose

Surfaces upcoming student PrairieTest reservations only from a verified authenticated source and otherwise retains a safe navigation-only fallback.

## ADDED Requirements

### Requirement: Reservation integration has a verified source gate
The extension SHALL enable reservation display only for documented student-visible fields obtained through an authorized same-user browser session and SHALL disable the widget when that contract cannot be verified.

#### Scenario: Supported reservation source is available
- **WHEN** the authenticated source returns a recognized reservation shape
- **THEN** the extension normalizes only documented student-visible fields

#### Scenario: Source is unsupported
- **WHEN** the source is unavailable, ambiguous, cross-origin blocked, or structurally unrecognized
- **THEN** the extension shows no inferred reservation and retains the PrairieTest navigation link

### Requirement: Upcoming reservations show bounded details
The extension SHALL show the exam label, scheduled start and end when present, location or mode when present, status, and direct PrairieTest destination without exposing unrelated reservation history or identifiers.

#### Scenario: Future reservation exists
- **WHEN** a supported reservation begins in the configured upcoming horizon
- **THEN** it appears in Upcoming and the popup ordered with other time-bound items

#### Scenario: Reservation time changes
- **WHEN** a later refresh returns a changed reservation time
- **THEN** the existing item updates rather than duplicating

### Requirement: Reservation data remains local and minimal
The extension SHALL store only fields needed for display, deduplication, freshness, and navigation and SHALL remove expired cached reservations after a bounded retention period.

#### Scenario: Reservation expires
- **WHEN** its end time and retention period pass
- **THEN** the cached reservation is removed from tracker storage

