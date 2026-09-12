## Purpose

Provides a reversible PrairieLearn-aware dark theme that preserves mathematical, semantic, and code-editor readability across supported student surfaces.

## ADDED Requirements

### Requirement: Theme follows an explicit preference
The extension SHALL support Off, On, and Follow System settings, store the selection locally, and apply system changes live when Follow System is selected.

#### Scenario: System theme changes
- **WHEN** Follow System is selected and the operating-system preference changes
- **THEN** supported PrairieLearn and tracker surfaces update without a reload

### Requirement: Supported surfaces remain readable
The dark theme SHALL meet WCAG AA text contrast for tracker-controlled content and SHALL preserve distinguishable links, focus indicators, tables, forms, alerts, status badges, and disabled states.

#### Scenario: Status color is used
- **WHEN** success, warning, danger, or informational content appears
- **THEN** meaning remains available through text or iconography and not color alone

### Requirement: Math and code avoid destructive inversion
The extension SHALL theme MathJax and supported code editors through scoped colors or native editor theme integration and SHALL NOT blanket-invert rendered math, syntax tokens, or user-authored content.

#### Scenario: Monaco editor is present
- **WHEN** a supported Monaco editor initializes or changes dynamically
- **THEN** the extension applies a compatible editor theme without changing its contents, cursor behavior, or language tokens

### Requirement: Unsafe content has explicit boundaries
The extension SHALL leave unsupported cross-origin frames, images, plots, and custom question content unchanged unless a tested rule exists, and SHALL allow dark mode to be disabled immediately.

#### Scenario: Cross-origin frame is present
- **WHEN** the extension cannot safely style a framed surface
- **THEN** it does not inject into that frame and does not obscure access to its controls

### Requirement: Theme does not duplicate or flash excessively
The extension SHALL keep one theme state per document, handle dynamically added PrairieLearn elements, and minimize visible light-theme flash within browser content-script constraints.

#### Scenario: Client navigation replaces page content
- **WHEN** supported content is replaced without a full document reload
- **THEN** the selected theme remains applied without duplicate style nodes

