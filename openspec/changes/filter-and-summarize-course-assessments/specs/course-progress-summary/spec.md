## Purpose

Summarizes only student-visible course assessment points while communicating missing or unsupported data instead of overstating grade completeness.

## ADDED Requirements

### Requirement: Summary shows observable secured and available points
The extension SHALL total parseable secured points and parseable active available points and SHALL label the result as an assessment-list summary rather than an official course grade.

#### Scenario: All visible rows are parseable
- **WHEN** every included active assessment exposes earned and maximum points
- **THEN** the summary shows the exact secured total, available total, and derived percentage

#### Scenario: Some rows lack points
- **WHEN** one or more included rows lack a parseable earned or maximum value
- **THEN** the summary identifies the excluded row count and marks the aggregate incomplete

### Requirement: Exceptional scoring remains explicit
The extension SHALL preserve bonus values above 100%, exclude closed or unavailable rows from active available points, and SHALL not infer drops, weights, or target pools not present in the page.

#### Scenario: Bonus credit is visible
- **WHEN** an assessment visibly awards points above its ordinary maximum
- **THEN** secured points preserve that value and the summary explains the bonus contribution


### Requirement: Mean percentage when no row yields points
The extension SHALL report a mean of student-visible assessment percentages when no included row exposes a convertible point pair, SHALL state that the figure is a mean of percentages rather than a points total, and SHALL NOT weight, infer maxima, or present the mean as a course grade.

#### Scenario: Course page exposes percentages only
- **WHEN** every included row shows a percentage with no earned or maximum points
- **THEN** the summary shows the mean of those percentages, the count of rows it averaged, and wording identifying it as an unweighted mean of visible percentages

#### Scenario: Rows never attempted
- **WHEN** an included row reports no attempt rather than a percentage
- **THEN** that row is excluded from the mean and counted separately, so an untouched assessment never lowers the average

#### Scenario: Points are available after all
- **WHEN** at least one included row exposes a convertible point pair
- **THEN** the points total takes precedence and the mean percentage is not presented as the headline figure

#### Scenario: Nothing is measurable
- **WHEN** no row yields either points or a percentage
- **THEN** the summary states that no progress figure can be derived and names the excluded row count, rather than showing a zero
