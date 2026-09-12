(function () {
  'use strict';

  if (!location.pathname.match(/\/pl\/course_instance\/\d+\/instance_question\/\d+/)) return;

  const RESTING_LABEL = 'Screenshot';
  const RESET_DELAY_MS = 2500;

  // Failure modes are reported separately: the spec requires "this browser cannot put
  // images on the clipboard" to read differently from "the write was refused", and a
  // capture that came back blank must never reach the clipboard at all.
  const OUTCOMES = {
    success: { label: 'Copied!', detail: 'Question copied to the clipboard as a PNG.' },
    unsupported: {
      label: 'No image clipboard',
      detail: 'This browser cannot put images on the clipboard. Firefox needs version 127 or newer.',
    },
    refused: {
      label: 'Clipboard refused',
      detail: 'The browser refused the clipboard write.',
    },
    'capture-failed': {
      label: 'Capture failed',
      detail: 'The question panel could not be captured.',
    },
    unfaithful: {
      label: 'Capture unfaithful',
      detail: 'The capture came back blank or malformed, so nothing was copied to the clipboard.',
    },
  };

  function clipboardImageSupport() {
    if (typeof ClipboardItem === 'undefined') return false;
    if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function') return false;
    if (typeof ClipboardItem.supports === 'function') {
      try {
        if (!ClipboardItem.supports('image/png')) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  // An html2canvas run that silently produces an empty or uniform bitmap is the failure
  // mode design Decision 3 calls out: report it rather than copying a broken image.
  function canvasIsFaithful(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return false;

    let pixels;
    try {
      const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
      if (!ctx || typeof ctx.getImageData !== 'function') return true;
      pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch {
      // Pixel inspection is unavailable (tainted canvas, no 2d context); the non-zero
      // size check above is all we can assert, so do not fail an otherwise good capture.
      return true;
    }
    if (!pixels || pixels.length < 4) return false;

    for (let i = 4; i < pixels.length; i += 4) {
      if (
        pixels[i] !== pixels[0]
        || pixels[i + 1] !== pixels[1]
        || pixels[i + 2] !== pixels[2]
        || pixels[i + 3] !== pixels[3]
      ) {
        return true;
      }
    }
    // Every pixel is identical: fully transparent, or a flat block of one colour.
    return false;
  }

  function isRefusal(error) {
    const name = error && error.name;
    return name === 'NotAllowedError' || name === 'SecurityError';
  }

  function isUnsupported(error) {
    const name = error && error.name;
    return name === 'NotSupportedError' || name === 'DataError' || name === 'TypeError';
  }

  async function capture(panel) {
    if (!clipboardImageSupport()) return 'unsupported';

    let canvas;
    try {
      canvas = await html2canvas(panel, {
        // Keep the control out of its own screenshot. Excluding it from the
        // render beats hiding it: the live DOM is untouched, so the panel does
        // not reflow mid-capture and the button keeps its "Capturing..." state.
        ignoreElements: (element) => element.classList?.contains('pl-screenshot-btn'),
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio || 1,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      });
    } catch {
      return 'capture-failed';
    }

    if (!canvasIsFaithful(canvas)) return 'unfaithful';

    let blob;
    try {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch {
      return 'capture-failed';
    }
    if (!blob) return 'capture-failed';

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (error) {
      if (isUnsupported(error)) return 'unsupported';
      if (isRefusal(error)) return 'refused';
      return 'refused';
    }

    return 'success';
  }

  function injectScreenshotButton() {
    const panel = document.querySelector('.question-block')
      || document.querySelector('.question-body')?.closest('.card')
      || document.querySelector('.card');
    if (!panel) return;

    const header = panel.querySelector('.card-header');
    if (!header) return;

    // Guard against double-inject (home-content.js also runs on all PL pages)
    if (header.querySelector('.pl-screenshot-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-light ms-2 pl-screenshot-btn';
    btn.style.flexShrink = '0';
    btn.textContent = RESTING_LABEL;
    btn.dataset.plState = 'resting';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.appendChild(btn);

    btn.addEventListener('click', () => {
      if (btn.disabled) return;

      btn.disabled = true;
      btn.textContent = 'Capturing...';
      btn.dataset.plState = 'capturing';
      btn.title = 'Capturing the question panel...';

      // Exposed so tests can await one capture deterministically.
      btn.plCapturePromise = capture(panel).then((outcome) => {
        const result = OUTCOMES[outcome] || OUTCOMES['capture-failed'];
        btn.textContent = result.label;
        btn.dataset.plState = outcome;
        btn.title = result.detail;
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = RESTING_LABEL;
          btn.dataset.plState = 'resting';
          btn.title = '';
        }, RESET_DELAY_MS);
        return outcome;
      });
    });
  }

  injectScreenshotButton();
})();
