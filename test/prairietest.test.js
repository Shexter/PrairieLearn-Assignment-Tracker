const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");

const ptRuntime = require("../Chrome/prairietest-content.js");

const FIXTURE_PATH = "test/fixtures/prairietest-home.html";

test("prairietest: parses real home fixture with registered exam reservation", { skip: !fs.existsSync(FIXTURE_PATH) }, () => {
  const html = fs.readFileSync(FIXTURE_PATH, "utf8");
  const dom = new JSDOM(html, { url: "https://us.prairietest.com/pt" });
  const { reservations, unreservedExams } = ptRuntime.parsePrairieTestDocument(
    dom.window.document,
    "https://us.prairietest.com"
  );

  assert.equal(reservations.length, 1);
  assert.equal(unreservedExams.length, 0);

  const res = reservations[0];
  assert.equal(res.id, "3625432");
  assert.equal(res.title, "CPSC 313 (2026W1): CPSC 313 Quiz 0");
  assert.equal(res.courseLabel, "CPSC 313 (2026W1)");
  assert.equal(res.examTitle, "CPSC 313 Quiz 0");
  assert.equal(res.startDate, "2026-09-16T20:00:00.000Z");
  assert.equal(res.endDate, "2026-09-16T20:50:00.000Z");
  assert.equal(res.durationMinutes, 50);
  assert.ok(res.location.includes("ICCS 014"), `expected ICCS 014 in ${res.location}`);
  assert.ok(res.location.includes("Basement of ICCS building"), `expected basement in ${res.location}`);
  assert.ok(res.sessionDetails.includes("50min"), `expected 50min in ${res.sessionDetails}`);
  assert.equal(res.absoluteUrl, "https://us.prairietest.com/pt/student/reservation/3625432");
});

test("prairietest: calculateReservationDeadline sets deadline 1 day before exam window", () => {
  // Monday Sep 21, 2026 at 10:00 AM UTC
  const examStart = "2026-09-21T10:00:00.000Z";
  const deadline = ptRuntime.calculateReservationDeadline(examStart);
  assert.ok(deadline instanceof Date);

  // Expected: Sunday Sep 20, 2026
  const deadlineIso = deadline.toISOString();
  assert.ok(deadlineIso.startsWith("2026-09-20"), `expected Sep 20, got ${deadlineIso}`);
  assert.equal(deadline.getUTCHours(), 23);
  assert.equal(deadline.getUTCMinutes(), 59);
  assert.equal(deadline.getUTCSeconds(), 59);
});

test("prairietest: parses unreserved exam and calculates reservation deadline", () => {
  const fakeHtml = `
    <main id="content">
      <div class="card my-4">
        <div class="card-header bg-primary text-white">
          <h2>Exams available for reservations</h2>
        </div>
        <ul class="list-group list-group-flush">
          <li class="list-group-item">
            <div class="row">
              <div class="col-6">
                <a href="/pt/student/exam/4567">CPSC 313 (2026W1): CPSC 313 Quiz 1</a>
              </div>
              <div class="col-6">
                <span data-format-date='{"date":"2026-09-21T17:00:00.000Z","timezone":"Canada/Pacific"}'>
                  Mon, Sep 21, 10am (PDT)
                </span>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </main>
  `;

  const dom = new JSDOM(fakeHtml, { url: "https://us.prairietest.com/pt" });
  const { unreservedExams } = ptRuntime.parsePrairieTestDocument(
    dom.window.document,
    "https://us.prairietest.com"
  );

  assert.equal(unreservedExams.length, 1);
  const unres = unreservedExams[0];
  assert.equal(unres.title, "CPSC 313 (2026W1): CPSC 313 Quiz 1");
  assert.equal(unres.reserveUrl, "https://us.prairietest.com/pt/student/exam/4567");
  assert.ok(unres.reserveDeadline, "must have calculated deadline");
  assert.ok(unres.reserveDeadline.startsWith("2026-09-20"), `expected Sep 20, got ${unres.reserveDeadline}`);
  assert.ok(unres.reserveDeadlineFormatted.includes("Sep 20"), `expected Sep 20 in ${unres.reserveDeadlineFormatted}`);
});

test("prairietest: buildGoogleCalendarComposeUrl creates valid Google Calendar link", () => {
  const res = {
    title: "CPSC 313 (2026W1): CPSC 313 Quiz 0",
    startDate: "2026-09-16T20:00:00.000Z",
    endDate: "2026-09-16T20:50:00.000Z",
    location: "ORCA: ICCS 014 (Basement of ICCS building)",
    sessionDetails: "50min, In-person, No accommodations",
    absoluteUrl: "https://us.prairietest.com/pt/student/reservation/3625432",
  };

  const urlStr = ptRuntime.buildGoogleCalendarComposeUrl(res);
  assert.ok(urlStr);
  const url = new URL(urlStr);
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.pathname, "/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), "Exam: CPSC 313 (2026W1): CPSC 313 Quiz 0");
  assert.equal(url.searchParams.get("dates"), "20260916T200000Z/20260916T205000Z");
  assert.equal(url.searchParams.get("location"), "ORCA: ICCS 014 (Basement of ICCS building)");
  assert.ok(url.searchParams.get("details").includes("https://us.prairietest.com/pt/student/reservation/3625432"));
});

test("prairietest: buildOutlookWebComposeUrl creates valid Outlook compose link", () => {
  const res = {
    title: "CPSC 313 Quiz 0",
    startDate: "2026-09-16T20:00:00.000Z",
    endDate: "2026-09-16T20:50:00.000Z",
    location: "ORCA: ICCS 014",
    sessionDetails: "50min, In-person",
    absoluteUrl: "https://us.prairietest.com/pt/student/reservation/3625432",
  };

  const urlStr = ptRuntime.buildOutlookWebComposeUrl(res);
  assert.ok(urlStr);
  const url = new URL(urlStr);
  assert.equal(url.origin, "https://outlook.live.com");
  assert.equal(url.searchParams.get("rru"), "addevent");
  assert.equal(url.searchParams.get("subject"), "Exam: CPSC 313 Quiz 0");
  assert.equal(url.searchParams.get("startdt"), "2026-09-16T20:00:00.000Z");
  assert.equal(url.searchParams.get("enddt"), "2026-09-16T20:50:00.000Z");
  assert.equal(url.searchParams.get("location"), "ORCA: ICCS 014");
});

test("prairietest: buildIcsContent generates valid iCalendar format with location and alarms", () => {
  const res = {
    id: "3625432",
    title: "CPSC 313 (2026W1): CPSC 313 Quiz 0",
    startDate: "2026-09-16T20:00:00.000Z",
    endDate: "2026-09-16T20:50:00.000Z",
    durationMinutes: 50,
    location: "ORCA: ICCS 014 (Basement of ICCS building)",
    sessionDetails: "50min, In-person, No accommodations",
    absoluteUrl: "https://us.prairietest.com/pt/student/reservation/3625432",
  };

  const ics = ptRuntime.buildIcsContent([res], new Date("2026-09-14T20:00:00.000Z").getTime());
  assert.ok(ics.includes("BEGIN:VCALENDAR"));
  assert.ok(ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("UID:pt-3625432@prairietest-tracker"));
  assert.ok(ics.includes("DTSTART:20260916T200000Z"));
  assert.ok(ics.includes("DTEND:20260916T205000Z"));
  assert.ok(ics.includes("SUMMARY:Exam: CPSC 313 (2026W1): CPSC 313 Quiz 0"));
  assert.ok(ics.includes("LOCATION:ORCA: ICCS 014 (Basement of ICCS building)"));
  assert.ok(ics.includes("TRIGGER:-PT24H"));
  assert.ok(ics.includes("TRIGGER:-PT2H"));
  assert.ok(ics.includes("END:VEVENT"));
  assert.ok(ics.includes("END:VCALENDAR"));
});

test("prairietest: UI injections add card header controls and row buttons", { skip: !fs.existsSync(FIXTURE_PATH) }, () => {
  const html = fs.readFileSync(FIXTURE_PATH, "utf8");
  const dom = new JSDOM(html, { url: "https://us.prairietest.com/pt" });
  const doc = dom.window.document;

  const { reservations } = ptRuntime.parsePrairieTestDocument(doc, "https://us.prairietest.com");
  const card = doc.querySelectorAll(".card")[1]; // Exam reservations card
  ptRuntime.injectReservationsCardActions(card, reservations);

  const actions = card.querySelector("#pl-pt-reservations-card-actions");
  assert.ok(actions, "must inject reservations card header action container");
  assert.ok(actions.textContent.includes("Add All to Calendar"), "must have Add All button");

  const row = card.querySelector("li.list-group-item");
  ptRuntime.injectReservationRowActions(row, reservations[0]);

  const rowBtn = row.querySelector(".pl-pt-row-calendar-btn");
  assert.ok(rowBtn, "must inject row calendar button");
  assert.ok(rowBtn.textContent.includes("Add to Calendar"));
});

test("prairietest: injectUnreservedWarningBanner creates alert for unreserved exams", () => {
  const dom = new JSDOM(`<main id="content"><div class="card"></div></main>`);
  const doc = dom.window.document;
  const unreserved = [
    {
      title: "CPSC 313 Quiz 1",
      reserveUrl: "https://us.prairietest.com/pt/student/exam/123",
      reserveDeadlineFormatted: "Sun, Sep 20, 11:59 PM",
    },
  ];

  ptRuntime.injectUnreservedWarningBanner(doc.getElementById("content"), unreserved);
  const banner = doc.getElementById("pl-pt-unreserved-warning-banner");
  assert.ok(banner, "must inject warning banner");
  assert.ok(banner.textContent.includes("Action Required: You have 1 unreserved exam!"));
  assert.ok(banner.textContent.includes("CPSC 313 Quiz 1"));
  assert.ok(banner.textContent.includes("Reserve by: Sun, Sep 20, 11:59 PM"));
  assert.ok(banner.querySelector('a[href="https://us.prairietest.com/pt/student/exam/123"]'));
});

test("prairietest: parseSingleReservationPage correctly parses reservation detail view", () => {
  const detailHtml = `
    <!doctype html>
    <html>
      <head><title>Reservation #3625432 — PrairieTest</title></head>
      <body>
        <main id="content" class="container">
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb">
              <li class="breadcrumb-item"><a href="/pt">Home</a></li>
              <li class="breadcrumb-item active">CPSC 313 (2026W1): CPSC 313 Quiz 0</li>
            </ol>
          </nav>
          <div class="card">
            <div class="card-header bg-primary text-white">
              <h2>Reservation details</h2>
            </div>
            <div class="card-body">
              <table class="table">
                <tbody>
                  <tr>
                    <th>Exam</th>
                    <td>CPSC 313 (2026W1): CPSC 313 Quiz 0</td>
                  </tr>
                  <tr>
                    <th>Date</th>
                    <td>
                      <span class="js-format-date-friendly-live-update"
                            data-format-date='{"date":"2026-09-16T20:00:00.000Z","timezone":"Canada/Pacific"}'>
                        Wed, Sep 16, 1pm (PDT)
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>Location</th>
                    <td>ORCA: ICCS 014<br><small class="text-muted">Basement of ICCS building</small></td>
                  </tr>
                  <tr>
                    <th>Duration</th>
                    <td>50 minutes</td>
                  </tr>
                </tbody>
              </table>
              <div class="d-flex gap-2 mt-3">
                <a href="/pt/student/reservation/3625432/edit" class="btn btn-secondary">Change reservation</a>
                <button type="button" class="btn btn-danger">Cancel reservation</button>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `;

  const dom = new JSDOM(detailHtml, { url: "https://us.prairietest.com/pt/student/reservation/3625432" });
  const res = ptRuntime.parseSingleReservationPage(
    dom.window.document,
    "https://us.prairietest.com/pt/student/reservation/3625432"
  );

  assert.ok(res, "reservation must be parsed");
  assert.equal(res.id, "3625432");
  assert.equal(res.title, "CPSC 313 (2026W1): CPSC 313 Quiz 0");
  assert.equal(res.courseLabel, "CPSC 313 (2026W1)");
  assert.equal(res.examTitle, "CPSC 313 Quiz 0");
  assert.equal(res.startDate, "2026-09-16T20:00:00.000Z");
  assert.equal(res.endDate, "2026-09-16T20:50:00.000Z");
  assert.equal(res.durationMinutes, 50);
  assert.ok(res.location.includes("ICCS 014"));
  assert.ok(res.location.includes("Basement of ICCS building"));
  assert.equal(res.absoluteUrl, "https://us.prairietest.com/pt/student/reservation/3625432");
});

test("prairietest: injectSingleReservationActions injects dropdown into reservation detail card", () => {
  const detailHtml = `
    <main id="content">
      <div class="card">
        <div class="card-header bg-primary text-white">
          <h2>Reservation</h2>
        </div>
        <div class="card-body">
          <div class="actions d-flex gap-2">
            <button class="btn btn-secondary">Change reservation</button>
          </div>
        </div>
      </div>
    </main>
  `;

  const dom = new JSDOM(detailHtml, { url: "https://us.prairietest.com/pt/student/reservation/3625432" });
  const doc = dom.window.document;
  const header = doc.querySelector(".card-header");

  const res = {
    id: "3625432",
    title: "CPSC 313 Quiz 0",
    startDate: "2026-09-16T20:00:00.000Z",
    endDate: "2026-09-16T20:50:00.000Z",
    durationMinutes: 50,
    location: "ORCA: ICCS 014",
    absoluteUrl: "https://us.prairietest.com/pt/student/reservation/3625432",
  };

  ptRuntime.injectSingleReservationActions(header, res);

  const container = header.querySelector("#pl-pt-single-reservation-actions");
  assert.ok(container, "must inject single reservation action container");
  assert.ok(container.textContent.includes("Add to Calendar"), "must contain Add to Calendar button");

  // Verify dropdown menu has options
  const dropdownMenu = container.querySelector(".dropdown-menu");
  assert.ok(dropdownMenu, "must have dropdown menu");
  assert.ok(dropdownMenu.textContent.includes("Google Calendar"));
  assert.ok(dropdownMenu.textContent.includes("Outlook Web"));
  assert.ok(dropdownMenu.textContent.includes("Download .ics"));
  assert.ok(dropdownMenu.textContent.includes("Sync Google Calendar"));
});

