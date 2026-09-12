## Purpose

Provides private, local, opt-in desktop reminders for unfinished PrairieLearn deadlines with predictable scheduling and deduplication.

## ADDED Requirements

### Requirement: Notifications require explicit opt-in
The extension SHALL keep deadline notifications disabled by default and SHALL request notification permission only after the student enables them.

#### Scenario: Default installation
- **WHEN** the extension runs before notification opt-in
- **THEN** it schedules no deadline alarms and displays no deadline notifications

### Requirement: Eligible deadlines schedule bounded reminders
The extension SHALL schedule at most one 24-hour and one 6-hour reminder per incomplete verified future deadline and SHALL replace stale schedules after refresh.

#### Scenario: Deadline changes
- **WHEN** a refreshed assessment has a different verified deadline
- **THEN** old alarms are removed and only alarms for the new deadline remain

#### Scenario: Work becomes complete
- **WHEN** a refreshed assessment reaches 100%
- **THEN** its pending deadline alarms are removed

### Requirement: Notifications identify and open the assessment
Each reminder SHALL identify the course and assessment, state the remaining time, and open the stored assessment URL when selected without exposing answer or note content.

#### Scenario: Student selects a reminder
- **WHEN** the student selects a valid deadline notification
- **THEN** the exact PrairieLearn assessment opens in a browser tab

