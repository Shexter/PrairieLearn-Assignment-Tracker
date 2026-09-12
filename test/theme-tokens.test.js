const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadThemeTokens() {
  const source = fs.readFileSync("shared/theme-tokens.js", "utf8");
  const context = {
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    parseInt,
    console,
  };
  vm.runInNewContext(source, context);
  return context.PrairieLearnThemeTokens;
}

const themeTokens = loadThemeTokens();

// --- 1.2 Token Definitions and Structure ---

test("tokens are defined as data with tested light and dark colors", () => {
  assert.ok(themeTokens.TOKENS && typeof themeTokens.TOKENS === "object");
  const entries = Object.entries(themeTokens.TOKENS);
  assert.ok(entries.length >= 20, `Expected >= 20 tokens, found ${entries.length}`);

  const hexPattern = /^#[0-9a-fA-F]{6}$/;

  for (const [name, token] of entries) {
    assert.equal(typeof token.light, "string", `Token ${name} missing light color string`);
    assert.equal(typeof token.dark, "string", `Token ${name} missing dark color string`);
    assert.match(token.light, hexPattern, `Token ${name} light color ${token.light} is not a 6-digit hex`);
    assert.match(token.dark, hexPattern, `Token ${name} dark color ${token.dark} is not a 6-digit hex`);
    assert.equal(typeof token.category, "string", `Token ${name} missing category`);
    assert.equal(typeof token.role, "string", `Token ${name} missing role`);
  }
});

test("token coverage includes surfaces, text, borders, links, focus rings, selection, and status states", () => {
  const tokens = themeTokens.TOKENS;

  // Surfaces
  assert.ok(tokens["surface-base"]);
  assert.ok(tokens["surface-card"]);
  assert.ok(tokens["surface-subtle"]);
  assert.ok(tokens["surface-overlay"]);
  assert.ok(tokens["surface-input"]);

  // Text
  assert.ok(tokens["text-primary"]);
  assert.ok(tokens["text-secondary"]);
  assert.ok(tokens["text-muted"]);
  assert.ok(tokens["text-inverse"]);

  // Borders
  assert.ok(tokens["border-default"]);
  assert.ok(tokens["border-subtle"]);
  assert.ok(tokens["border-strong"]);

  // Links
  assert.ok(tokens["link-default"]);
  assert.ok(tokens["link-hover"]);

  // Focus rings
  assert.ok(tokens["focus-ring"]);

  // Selection
  assert.ok(tokens["selection-bg"]);
  assert.ok(tokens["selection-text"]);

  // Status states: success, warning, error, info
  const statuses = ["success", "warning", "error", "info"];
  for (const status of statuses) {
    assert.ok(tokens[`status-${status}-bg`], `Missing status-${status}-bg`);
    assert.ok(tokens[`status-${status}-text`], `Missing status-${status}-text`);
    assert.ok(tokens[`status-${status}-border`], `Missing status-${status}-border`);
  }
});

// --- 1.3 Theme Preference Schema, Migration, and Validation ---

test("theme modes expose Off, On, and Follow System with a positive schema version and default Off", () => {
  assert.equal(themeTokens.SCHEMA_VERSION, 1);
  assert.equal(themeTokens.DEFAULT_THEME_MODE, "off");

  assert.equal(themeTokens.THEME_MODES.OFF, "off");
  assert.equal(themeTokens.THEME_MODES.ON, "on");
  assert.equal(themeTokens.THEME_MODES.FOLLOW_SYSTEM, "system");

  const defaultPref = themeTokens.createDefaultPreference();
  assert.equal(defaultPref.version, 1);
  assert.equal(defaultPref.mode, "off");

  assert.equal(themeTokens.DEFAULT_PREFERENCE.version, 1);
  assert.equal(themeTokens.DEFAULT_PREFERENCE.mode, "off");
});

test("validate() returns structured success for valid preference records", () => {
  const validInputs = [
    { version: 1, mode: "off" },
    { version: 1, mode: "on" },
    { version: 1, mode: "system" },
    { version: 1, mode: "Follow System" },
    { version: 1, mode: "follow-system" },
    { schemaVersion: 1, mode: "off" },
  ];

  for (const input of validInputs) {
    const result = themeTokens.validate(input);
    assert.equal(result.valid, true, `Expected valid for ${JSON.stringify(input)}`);
    assert.equal(Array.from(result.errors).length, 0);
  }
});

test("validate() never throws and returns structured errors for invalid inputs", () => {
  const invalidCases = [
    { input: null, expectedField: "root", expectedCode: "INVALID_TYPE" },
    { input: undefined, expectedField: "root", expectedCode: "INVALID_TYPE" },
    { input: "off", expectedField: "root", expectedCode: "INVALID_TYPE" },
    { input: 42, expectedField: "root", expectedCode: "INVALID_TYPE" },
    { input: [], expectedField: "root", expectedCode: "INVALID_TYPE" },
    { input: {}, expectedField: "version", expectedCode: "MISSING_VERSION" },
    { input: { version: 0, mode: "off" }, expectedField: "version", expectedCode: "INVALID_VERSION" },
    { input: { version: -1, mode: "off" }, expectedField: "version", expectedCode: "INVALID_VERSION" },
    { input: { version: "1", mode: "off" }, expectedField: "version", expectedCode: "INVALID_VERSION" },
    { input: { version: 999, mode: "off" }, expectedField: "version", expectedCode: "UNSUPPORTED_VERSION" },
    { input: { version: 1 }, expectedField: "mode", expectedCode: "MISSING_MODE" },
    { input: { version: 1, mode: 123 }, expectedField: "mode", expectedCode: "INVALID_MODE_TYPE" },
    { input: { version: 1, mode: "neon-glow" }, expectedField: "mode", expectedCode: "INVALID_MODE" },
  ];

  for (const { input, expectedField, expectedCode } of invalidCases) {
    let result;
    assert.doesNotThrow(() => {
      result = themeTokens.validate(input);
    });

    assert.equal(result.valid, false, `Expected invalid for ${JSON.stringify(input)}`);
    assert.ok(Array.isArray(result.errors) || Array.from(result.errors).length > 0);
    const errors = Array.from(result.errors);
    assert.ok(errors.length > 0);
    const matched = errors.find((e) => e.field === expectedField && e.code === expectedCode);
    assert.ok(
      matched,
      `Expected error with field=${expectedField}, code=${expectedCode}, got: ${JSON.stringify(errors)}`
    );
    assert.equal(typeof matched.message, "string");
    assert.equal(typeof matched.toString(), "string");
  }
});

test("migrate() migrates absent, legacy, and corrupt records to default Off or mapped mode", () => {
  // Absent / empty
  const absentResult = themeTokens.migrate(undefined);
  assert.equal(absentResult.version, 1);
  assert.equal(absentResult.mode, "off");

  const nullResult = themeTokens.migrate(null);
  assert.equal(nullResult.version, 1);
  assert.equal(nullResult.mode, "off");

  const emptyResult = themeTokens.migrate({});
  assert.equal(emptyResult.version, 1);
  assert.equal(emptyResult.mode, "off");

  // Boolean legacy values
  const boolTrueResult = themeTokens.migrate(true);
  assert.equal(boolTrueResult.version, 1);
  assert.equal(boolTrueResult.mode, "on");

  const boolFalseResult = themeTokens.migrate(false);
  assert.equal(boolFalseResult.version, 1);
  assert.equal(boolFalseResult.mode, "off");

  // Legacy object flags
  const darkTrueResult = themeTokens.migrate({ darkMode: true });
  assert.equal(darkTrueResult.version, 1);
  assert.equal(darkTrueResult.mode, "on");

  const darkFalseResult = themeTokens.migrate({ darkMode: false });
  assert.equal(darkFalseResult.version, 1);
  assert.equal(darkFalseResult.mode, "off");

  const enabledResult = themeTokens.migrate({ enabled: true });
  assert.equal(enabledResult.version, 1);
  assert.equal(enabledResult.mode, "on");

  // Legacy mode names without version
  const modeDarkResult = themeTokens.migrate({ mode: "dark" });
  assert.equal(modeDarkResult.version, 1);
  assert.equal(modeDarkResult.mode, "on");

  const modeLightResult = themeTokens.migrate({ mode: "light" });
  assert.equal(modeLightResult.version, 1);
  assert.equal(modeLightResult.mode, "off");

  const modeAutoResult = themeTokens.migrate({ mode: "auto" });
  assert.equal(modeAutoResult.version, 1);
  assert.equal(modeAutoResult.mode, "system");

  const modeFollowResult = themeTokens.migrate({ mode: "Follow System" });
  assert.equal(modeFollowResult.version, 1);
  assert.equal(modeFollowResult.mode, "system");

  // Already modern records preserve their mode
  const modernResult = themeTokens.migrate({ version: 1, mode: "on" });
  assert.equal(modernResult.version, 1);
  assert.equal(modernResult.mode, "on");

  // Corrupt data falls back to default Off
  const corruptResult = themeTokens.migrate({ mode: "garbage", unknown: 42 });
  assert.equal(corruptResult.version, 1);
  assert.equal(corruptResult.mode, "off");

  // Every migrated record must pass validate()
  const samples = [absentResult, nullResult, emptyResult, boolTrueResult, darkTrueResult, modernResult, corruptResult];
  for (const sample of samples) {
    const val = themeTokens.validate(sample);
    assert.equal(val.valid, true);
  }
});

test("resolveEffectiveTheme() resolves active theme based on mode and system preference", () => {
  assert.equal(themeTokens.resolveEffectiveTheme({ mode: "off" }, false), "light");
  assert.equal(themeTokens.resolveEffectiveTheme({ mode: "off" }, true), "light");
  assert.equal(themeTokens.resolveEffectiveTheme({ mode: "on" }, false), "dark");
  assert.equal(themeTokens.resolveEffectiveTheme({ mode: "on" }, true), "dark");
  assert.equal(themeTokens.resolveEffectiveTheme({ mode: "system" }, false), "light");
  assert.equal(themeTokens.resolveEffectiveTheme({ mode: "system" }, true), "dark");
  assert.equal(themeTokens.resolveEffectiveTheme(null, true), "light");
});

// --- 4.1 WCAG AA Contrast Checks ---

test("relative luminance and contrast ratio formulas match WCAG 2.1 specifications", () => {
  const whiteLuminance = themeTokens.getRelativeLuminance("#ffffff");
  const blackLuminance = themeTokens.getRelativeLuminance("#000000");

  assert.equal(Math.round(whiteLuminance), 1);
  assert.equal(Math.round(blackLuminance), 0);

  const whiteBlackRatio = themeTokens.getContrastRatio("#ffffff", "#000000");
  assert.equal(Math.round(whiteBlackRatio), 21);

  const whiteWhiteRatio = themeTokens.getContrastRatio("#ffffff", "#ffffff");
  assert.equal(Math.round(whiteWhiteRatio), 1);

  // Symmetry
  const ratio1 = themeTokens.getContrastRatio("#0056b3", "#ffffff");
  const ratio2 = themeTokens.getContrastRatio("#ffffff", "#0056b3");
  assert.equal(ratio1, ratio2);

  // Primary sRGB coefficients: red=0.2126, green=0.7152, blue=0.0722
  const redLum = themeTokens.getRelativeLuminance("#ff0000");
  const greenLum = themeTokens.getRelativeLuminance("#00ff00");
  const blueLum = themeTokens.getRelativeLuminance("#0000ff");
  assert.ok(Math.abs(redLum - 0.2126) < 0.001);
  assert.ok(Math.abs(greenLum - 0.7152) < 0.001);
  assert.ok(Math.abs(blueLum - 0.0722) < 0.001);
});

test("automated WCAG AA contrast checks pass for every token pair in the token table", () => {
  const tokens = themeTokens.TOKENS;
  let totalEvaluatedPairs = 0;

  // The test dynamically iterates the token table; any token added later is automatically tested.
  for (const [tokenName, token] of Object.entries(tokens)) {
    if (!token.against) continue;

    const againstList = Array.isArray(token.against) ? token.against : [token.against];
    assert.ok(againstList.length > 0, `Token ${tokenName} defines empty 'against' array`);

    const minRatio =
      typeof token.minContrast === "number"
        ? token.minContrast
        : token.role === "normal-text"
        ? 4.5
        : 3.0;

    // Normal text requires >= 4.5:1, large text and UI boundaries require >= 3.0:1
    if (token.role === "normal-text") {
      assert.ok(minRatio >= 4.5, `Token ${tokenName} with role normal-text must have threshold >= 4.5:1`);
    } else if (token.role === "large-text" || token.role === "ui-boundary") {
      assert.ok(
        minRatio >= 3.0,
        `Token ${tokenName} with role ${token.role} must have threshold >= 3.0:1`
      );
    }

    for (const bgName of againstList) {
      const bgToken = tokens[bgName];
      assert.ok(bgToken, `Background token '${bgName}' referenced by '${tokenName}' does not exist in TOKENS table`);

      const lightRatio = themeTokens.getContrastRatio(token.light, bgToken.light);
      assert.ok(
        lightRatio >= minRatio,
        `[LIGHT] Contrast failure: ${tokenName} (${token.light}) on ${bgName} (${bgToken.light}) is ${lightRatio.toFixed(
          2
        )}:1, expected >= ${minRatio}:1`
      );

      const darkRatio = themeTokens.getContrastRatio(token.dark, bgToken.dark);
      assert.ok(
        darkRatio >= minRatio,
        `[DARK] Contrast failure: ${tokenName} (${token.dark}) on ${bgName} (${bgToken.dark}) is ${darkRatio.toFixed(
          2
        )}:1, expected >= ${minRatio}:1`
      );

      totalEvaluatedPairs += 1;
    }
  }

  // Ensure significant automated coverage across all semantic domains
  assert.ok(totalEvaluatedPairs >= 30, `Expected at least 30 automated pair checks, evaluated ${totalEvaluatedPairs}`);
});

test("semantic status states (success, warning, error, info) meet AA contrast on both status bg and surface base", () => {
  const statuses = ["success", "warning", "error", "info"];
  const tokens = themeTokens.TOKENS;

  for (const status of statuses) {
    const textToken = tokens[`status-${status}-text`];
    const bgToken = tokens[`status-${status}-bg`];
    const borderToken = tokens[`status-${status}-border`];
    const surfaceBase = tokens["surface-base"];

    // Text on status background (normal text >= 4.5:1)
    const textOnBgLight = themeTokens.getContrastRatio(textToken.light, bgToken.light);
    const textOnBgDark = themeTokens.getContrastRatio(textToken.dark, bgToken.dark);
    assert.ok(textOnBgLight >= 4.5, `status-${status}-text on status-${status}-bg in light mode is ${textOnBgLight.toFixed(2)} < 4.5`);
    assert.ok(textOnBgDark >= 4.5, `status-${status}-text on status-${status}-bg in dark mode is ${textOnBgDark.toFixed(2)} < 4.5`);

    // Text on base surface (normal text >= 4.5:1)
    const textOnBaseLight = themeTokens.getContrastRatio(textToken.light, surfaceBase.light);
    const textOnBaseDark = themeTokens.getContrastRatio(textToken.dark, surfaceBase.dark);
    assert.ok(textOnBaseLight >= 4.5, `status-${status}-text on surface-base in light mode is ${textOnBaseLight.toFixed(2)} < 4.5`);
    assert.ok(textOnBaseDark >= 4.5, `status-${status}-text on surface-base in dark mode is ${textOnBaseDark.toFixed(2)} < 4.5`);

    // Border on base surface (boundary >= 3.0:1)
    const borderOnBaseLight = themeTokens.getContrastRatio(borderToken.light, surfaceBase.light);
    const borderOnBaseDark = themeTokens.getContrastRatio(borderToken.dark, surfaceBase.dark);
    assert.ok(borderOnBaseLight >= 3.0, `status-${status}-border on surface-base in light mode is ${borderOnBaseLight.toFixed(2)} < 3.0`);
    assert.ok(borderOnBaseDark >= 3.0, `status-${status}-border on surface-base in dark mode is ${borderOnBaseDark.toFixed(2)} < 3.0`);
  }
});
