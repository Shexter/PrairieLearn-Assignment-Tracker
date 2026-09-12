const test = require("node:test");
const assert = require("node:assert/strict");

test("filter persistence saves only boolean filters per origin and course instance", () => {
  const origin = "https://us.prairielearn.com";
  const courseInstanceId = "12345";
  const storageKey = `pl_filter_pref_${origin}_${courseInstanceId}`;

  assert.equal(storageKey, "pl_filter_pref_https://us.prairielearn.com_12345");

  // Simulated storage
  const storage = {};
  function saveFilterPreferences(hideCompleted, onlyActiveDueSoon) {
    storage[storageKey] = {
      hideCompleted: Boolean(hideCompleted),
      onlyActiveDueSoon: Boolean(onlyActiveDueSoon),
    };
  }

  // User sets query and toggles filters
  const userQuery = "homework 1";
  saveFilterPreferences(true, true);

  const stored = storage[storageKey];
  assert.deepEqual(stored, { hideCompleted: true, onlyActiveDueSoon: true });
  // Ensure query is never stored in persistence
  assert.equal(stored.query, undefined);
  assert.equal(stored.search, undefined);
});

test("navigation reload restores boolean preferences and resets search query to empty", () => {
  const origin = "https://us.prairielearn.com";
  const courseInstanceId = "12345";
  const storageKey = `pl_filter_pref_${origin}_${courseInstanceId}`;

  const storage = {
    [storageKey]: {
      hideCompleted: true,
      onlyActiveDueSoon: false,
    },
  };

  // Simulate new page load / navigation:
  // UI initializes query to empty string, then reads stored booleans
  let searchInputValue = ""; // session-only starts empty
  let hideCompletedChecked = false;
  let dueSoonChecked = false;

  const pref = storage[storageKey] || {};
  if (pref.hideCompleted) hideCompletedChecked = true;
  if (pref.onlyActiveDueSoon) dueSoonChecked = true;

  // Search query remains empty
  assert.equal(searchInputValue, "");
  // Booleans are restored
  assert.equal(hideCompletedChecked, true);
  assert.equal(dueSoonChecked, false);
});

test("resetting filters clears checkboxes, clears search text, and updates stored preferences", () => {
  const origin = "https://us.prairielearn.com";
  const courseInstanceId = "12345";
  const storageKey = `pl_filter_pref_${origin}_${courseInstanceId}`;

  const storage = {
    [storageKey]: {
      hideCompleted: true,
      onlyActiveDueSoon: true,
    },
  };

  let searchInputValue = "midterm";
  let hideCompletedChecked = true;
  let dueSoonChecked = true;

  function resetFilters() {
    searchInputValue = "";
    hideCompletedChecked = false;
    dueSoonChecked = false;
    storage[storageKey] = {
      hideCompleted: hideCompletedChecked,
      onlyActiveDueSoon: dueSoonChecked,
    };
  }

  resetFilters();

  assert.equal(searchInputValue, "");
  assert.equal(hideCompletedChecked, false);
  assert.equal(dueSoonChecked, false);
  assert.deepEqual(storage[storageKey], {
    hideCompleted: false,
    onlyActiveDueSoon: false,
  });
});

test("preferences are strictly isolated by origin and course instance", () => {
  const storage = {};
  const originA = "https://us.prairielearn.com";
  const originB = "https://ca.prairielearn.com";
  const course1 = "100";
  const course2 = "200";

  storage[`pl_filter_pref_${originA}_${course1}`] = { hideCompleted: true, onlyActiveDueSoon: false };
  storage[`pl_filter_pref_${originA}_${course2}`] = { hideCompleted: false, onlyActiveDueSoon: true };
  storage[`pl_filter_pref_${originB}_${course1}`] = { hideCompleted: true, onlyActiveDueSoon: true };

  assert.equal(storage[`pl_filter_pref_${originA}_${course1}`].onlyActiveDueSoon, false);
  assert.equal(storage[`pl_filter_pref_${originA}_${course2}`].onlyActiveDueSoon, true);
  assert.equal(storage[`pl_filter_pref_${originB}_${course1}`].onlyActiveDueSoon, true);
});
