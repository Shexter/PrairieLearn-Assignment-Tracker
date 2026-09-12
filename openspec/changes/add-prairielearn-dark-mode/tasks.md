## 1. Visual inventory and foundation

- [ ] 1.1 Capture sanitized light-mode fixtures/screenshots for home, course, assessment, question, gradebook, modal, MathJax, plot, Monaco, workspace, success/warning/error, and narrow layouts.
- [x] 1.2 Inventory upstream semantic variables/selectors and define tested light/dark tokens for surfaces, text, borders, links, focus, selection, and statuses.
- [x] 1.3 Add a theme preference schema for Off, On, and Follow System with migration and default-Off tests.

## 2. Theme bootstrap and core surfaces

- [ ] 2.1 Add the minimal early theme bootstrap and manifest CSS/script ordering for both browsers, ensuring one root attribute and no duplicate style nodes.
- [ ] 2.2 Implement core shell, navigation, card, table, form, button, dropdown, modal, alert, badge, tooltip, and tracker component styles under the scoped theme.
- [ ] 2.3 Add popup and in-page theme controls with keyboard labels, live system-theme response, cross-tab preference propagation, and immediate disable.
- [ ] 2.4 Add a bounded MutationObserver for dynamic supported surfaces with teardown and no whole-document restyling loop.

## 3. Specialized content

- [ ] 3.1 Implement/test MathJax-compatible colors without blanket inversion, checking inline/display math, errors, selection, and print behavior.
- [ ] 3.2 Implement a supported Monaco/editor adapter using native theme integration without changing contents, model, cursor, undo, or tokenization.
- [ ] 3.3 Add explicit safe rules or exclusions for images, plots, SVG/canvas, iframes, workspace panels, and custom question elements.

## 4. Accessibility and regressions

- [x] 4.1 Add automated WCAG AA contrast checks for every tracker-controlled token pair and semantic state.
- [ ] 4.2 Add tests for focus visibility, link distinction, disabled controls, text selection, browser/system changes, client navigation, dynamic modals, and duplicate prevention.
- [ ] 4.3 Extend Chrome/Firefox parity, manifest, syntax, and packaging checks for every theme asset.

## 5. Browser acceptance and documentation

- [ ] 5.1 Inspect side-by-side screenshots at desktop and narrow widths across the complete fixture matrix; record and fix unreadable or flashing surfaces.
- [ ] 5.2 In real Chrome and Firefox PrairieLearn pages, verify question input, MathJax, plots, Monaco/workspace typing/selection/undo, modals, system changes, and immediate Off restoration.
- [ ] 5.3 Update README/privacy/support documentation with modes, exclusions, troubleshooting, and no-network behavior.
- [ ] 5.4 Run the full automated suite, strict OpenSpec validation, and `git diff --check`.

