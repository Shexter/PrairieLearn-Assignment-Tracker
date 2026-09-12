## Purpose

Provides permission-free calendar actions and portable, scoped deadline exports for students who do not use direct Google synchronization.

## ADDED Requirements

### Requirement: Each eligible deadline has calendar actions
The extension SHALL offer Google Calendar and Outlook Web actions for an assessment with a verified future deadline and absolute PrairieLearn URL, and SHALL encode the title, exact deadline, and link without requesting OAuth.

#### Scenario: Student opens a web calendar action
- **WHEN** the student selects Google Calendar or Outlook Web for an eligible assessment
- **THEN** the extension opens a new calendar-compose page populated with the assessment title, deadline, and PrairieLearn link

#### Scenario: Assessment is ineligible
- **WHEN** an assessment lacks a verified future deadline or usable URL
- **THEN** the extension does not offer a web-calendar action for it

### Requirement: ICS export supports explicit scopes
The extension SHALL let the student export all future deadlines, the current course only, or the next seven days and SHALL show the chosen scope before download.

#### Scenario: Current-course export
- **WHEN** the student requests an export from a course page and selects current course
- **THEN** the file contains eligible future deadlines only for that course instance

#### Scenario: Scope has no events
- **WHEN** no eligible deadline matches the chosen scope
- **THEN** the extension reports an empty result and does not download a misleading file

### Requirement: ICS deadlines contain alarms
Every exported event SHALL contain valid RFC 5545 display alarms 24 hours and 2 hours before its deadline, unless the event is already inside an alarm offset at export time.

#### Scenario: Future event receives both alarms
- **WHEN** an event is more than 24 hours away at export time
- **THEN** its ICS event contains distinct negative 24-hour and 2-hour display triggers

#### Scenario: Alarm time has passed
- **WHEN** an event is less than 2 hours away
- **THEN** the export omits past alarm triggers while retaining the event

