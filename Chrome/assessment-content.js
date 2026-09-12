(function () {
  "use strict";

  if (!location.pathname.match(/\/pl\/course_instance\/\d+\/assessment_instance\/\d+\/?$/)) return;

  // Strip HTML to plain text, replacing <img> tags with [image]
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const img of doc.querySelectorAll("img")) {
      img.replaceWith("[image]");
    }
    // Add spacing around block elements
    for (const el of doc.querySelectorAll("p, br, li, h1, h2, h3, h4, h5, h6")) {
      el.prepend("\n");
    }
    return doc.body.textContent.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Fetch with concurrency limit
  async function fetchWithLimit(urls, limit, onProgress) {
    const results = new Array(urls.length);
    let index = 0;
    let done = 0;

    async function worker() {
      while (index < urls.length) {
        const i = index++;
        try {
          const res = await fetch(urls[i], { credentials: "include" });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          results[i] = await res.text();
        } catch {
          results[i] = null;
        }
        done++;
        onProgress(done, urls.length);
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(limit, urls.length); i++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }

  function parseQuestionPage(html) {
    if (!html) return null;
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Try the JSON blob first (active/unlocked questions)
    const dataEl = doc.querySelector(".question-data");
    if (dataEl) {
      try {
        const json = JSON.parse(decodeURIComponent(atob(dataEl.textContent.trim())));
        const params = json.variant?.params ?? {};
        const text = params.text ? htmlToText(params.text) : null;
        if (text) return { text, answers: Array.isArray(params.answers) ? params.answers : null };
      } catch {
        // fall through to DOM fallback
      }
    }

    // Fallback: scrape rendered HTML directly (locked/completed questions)
    const body = doc.querySelector(".question-body");
    if (body) {
      // Remove input elements so we don't capture form noise
      for (const el of body.querySelectorAll("input, button, .input-group")) el.remove();
      const text = htmlToText(body.innerHTML);
      return text ? { text, answers: null } : null;
    }

    return null;
  }

  function buildOutput(title, items) {
    const lines = [`=== ${title} ===`];
    let qNum = 0;

    for (const item of items) {
      if (item.type === "group") {
        lines.push("", `[${item.name}]`);
      } else {
        qNum++;
        lines.push("");
        lines.push(`Q${qNum}. ${item.title}`);
        if (item.data?.text) {
          lines.push(item.data.text);
        } else {
          lines.push("[question content unavailable]");
        }
        if (item.data?.answers?.length) {
          lines.push("");
          for (const a of item.data.answers) {
            lines.push(`  ${a.key}) ${a.text}`);
          }
        }
      }
    }

    return lines.join("\n");
  }

  function errorReason(err) {
    const name = typeof err?.name === "string" ? err.name.trim() : "";
    const message = typeof err?.message === "string" ? err.message.trim() : "";
    const reason = name && message ? `${name}: ${message}` : name || message || String(err);
    return reason.length > 64 ? `${reason.slice(0, 61)}...` : reason;
  }

  function injectButton() {
    if (document.querySelector(".pl-copy-questions-btn")) return;

    const header = document.querySelector(".card-header.bg-primary");
    if (!header) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-light ms-auto pl-copy-questions-btn";
    btn.textContent = "Copy Questions";
    btn.style.flexShrink = "0";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.appendChild(btn);

    let pendingOutput = null;
    let retrieving = false;

    function showTemporaryStatus(message, nextLabel) {
      btn.textContent = message;
      btn.disabled = false;
      setTimeout(() => {
        if (btn.textContent === message) btn.textContent = nextLabel;
      }, 2500);
    }

    btn.addEventListener("click", async () => {
      if (retrieving) return;

      if (pendingOutput !== null) {
        btn.disabled = true;
        try {
          await navigator.clipboard.writeText(pendingOutput);
          pendingOutput = null;
          showTemporaryStatus("Copied!", "Copy Questions");
        } catch (err) {
          showTemporaryStatus(`Copy failed: ${errorReason(err)}`, "Copy to clipboard");
        }
        return;
      }

      retrieving = true;
      btn.disabled = true;
      btn.textContent = "Loading...";

      try {
        // Collect questions and groups from the table
        const table = document.querySelector('table[aria-label="Questions"]');
        if (!table) {
          showTemporaryStatus("No questions found", "Copy Questions");
          return;
        }

        const items = [];
        for (const row of table.querySelectorAll("tbody tr")) {
          const groupHeader = row.querySelector("th[colspan]");
          if (groupHeader) {
            items.push({ type: "group", name: groupHeader.textContent.trim() });
            continue;
          }
          const link = row.querySelector('td a[href*="/instance_question/"]');
          if (!link) continue;
          const href = link.getAttribute("href");
          const url = href.startsWith("http") ? href : `${location.origin}${href}`;
          items.push({ type: "question", title: link.textContent.trim(), url });
        }

        const questions = items.filter((item) => item.type === "question");
        const urls = questions.map((question) => question.url);
        if (urls.length === 0) {
          showTemporaryStatus("No questions found", "Copy Questions");
          return;
        }

        btn.textContent = `Copying... (0/${urls.length})`;
        const htmlPages = await fetchWithLimit(urls, 5, (done, total) => {
          btn.textContent = `Copying... (${done}/${total})`;
        });

        questions.forEach((question, index) => {
          question.data = parseQuestionPage(htmlPages[index]);
        });

        if (!questions.some((question) => question.data)) {
          showTemporaryStatus("Failed: no question content available", "Copy Questions");
          return;
        }

        const assessmentTitle =
          document.querySelector(".card-header.bg-primary h1")?.textContent.trim() ?? "Assessment";
        pendingOutput = buildOutput(assessmentTitle, items);
        btn.textContent = "Copy to clipboard";
        btn.disabled = false;
      } catch (err) {
        showTemporaryStatus(`Failed: ${errorReason(err)}`, "Copy Questions");
      } finally {
        retrieving = false;
      }
    });
  }

  injectButton();
})();
