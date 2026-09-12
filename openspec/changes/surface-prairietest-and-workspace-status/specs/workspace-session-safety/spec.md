## Purpose

Warns students about observable workspace lifecycle deadlines or local inactivity without generating traffic that interferes with PrairieLearn shutdown behavior.

## ADDED Requirements

### Requirement: Authoritative timers require observable lifecycle state
The extension SHALL show a shutdown countdown only when the current workspace page exposes a trustworthy absolute deadline or remaining duration and SHALL identify its source as PrairieLearn state.

#### Scenario: Shutdown deadline is observable
- **WHEN** the workspace page exposes a valid future lifecycle deadline
- **THEN** the extension displays and updates a countdown to that deadline

#### Scenario: Shutdown deadline is absent
- **WHEN** no trustworthy lifecycle deadline is observable
- **THEN** the extension does not invent or estimate a shutdown countdown

### Requirement: Local inactivity reminders are clearly distinguished
When enabled, the extension SHALL measure only local page interaction time and SHALL label the result as a tracker reminder, not the server's workspace shutdown timer.

#### Scenario: Local inactivity threshold is reached
- **WHEN** the student has not interacted with the workspace page for the configured interval
- **THEN** the extension reminds the student to save or commit work without claiming shutdown is imminent

### Requirement: Workspace monitoring is non-invasive
The extension SHALL NOT send keepalive traffic, inspect workspace file contents, simulate activity, or claim work is saved.

#### Scenario: Reminder timer runs
- **WHEN** lifecycle or inactivity monitoring is active
- **THEN** it performs no network request and no synthetic input into the workspace

