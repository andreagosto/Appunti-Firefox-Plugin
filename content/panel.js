/**
 * Content script per le pagine web:
 * 1) Sostituisce eventuali istanze o nodi DOM di versioni precedenti (anche senza dover ricaricare la scheda).
 * 2) Ascolta la shortcut libera (es. Alt+A) per catturare il testo selezionato.
 * 3) Se attivo nelle impostazioni, mostra il popup essenziale ("Nota", input, Annulla / OK).
 *    Le scritte dei pulsanti sono renderizzate via CSS content: attr(data-label) così Google Translate
 *    non può tradurle in "arabo".
 */
(function () {
  "use strict";

  // Disattiva eventuali listener di versioni precedenti rimaste nella pagina
  if (typeof window.__AppuntiCleanupPreviousInstance === "function") {
    try {
      window.__AppuntiCleanupPreviousInstance();
    } catch (_) {}
  }

  function cleanupLegacyDomElements() {
    const idsToRemove = [
      "appunti-firefox-plugin-host",
      "appunti-firefox-layout-style",
      "appunti-firefox-note-prompt"
    ];
    for (const id of idsToRemove) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
    document.documentElement.style.removeProperty("margin-right");
  }

  cleanupLegacyDomElements();

  const DEFAULT_SETTINGS = {
    askBlockNote: false,
    customShortcut: "Alt+A"
  };

  let settings = { ...DEFAULT_SETTINGS };
  let promptHost = null;
  let promptShadow = null;
  let activeCapturePayload = null;
  let isPromptOpen = false;
  let destroyed = false;

  function t(key, fallback) {
    try {
      const msg = browser.i18n.getMessage(key);
      return msg || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function eventToShortcutString(e) {
    const modifiers = [];
    if (e.ctrlKey) modifiers.push("Ctrl");
    if (e.altKey) modifiers.push("Alt");
    if (e.shiftKey) modifiers.push("Shift");
    if (e.metaKey) modifiers.push("Meta");

    const ignoredKeys = ["Control", "Alt", "Shift", "Meta", "AltGraph", "Dead", "Process"];
    if (ignoredKeys.includes(e.key)) return null;

    let mainKey = e.key;
    if (mainKey === " ") {
      mainKey = "Space";
    } else if (mainKey.length === 1) {
      mainKey = mainKey.toUpperCase();
    } else if (e.code && e.code.startsWith("Key")) {
      mainKey = e.code.slice(3).toUpperCase();
    } else if (e.code && e.code.startsWith("Digit")) {
      mainKey = e.code.slice(5);
    }

    return [...modifiers, mainKey].join("+");
  }

  function matchesShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const pressed = eventToShortcutString(e);
    if (!pressed) return false;
    return pressed.toLowerCase() === shortcutStr.trim().toLowerCase();
  }

  function ensurePromptDom() {
    if (promptHost && document.documentElement.contains(promptHost)) return;

    const existing = document.getElementById("appunti-firefox-note-prompt");
    if (existing) existing.remove();

    promptHost = document.createElement("div");
    promptHost.id = "appunti-firefox-note-prompt";
    promptHost.setAttribute("translate", "no");
    promptHost.className = "notranslate";
    promptHost.style.cssText =
      "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
    promptShadow = promptHost.attachShadow({ mode: "open" });

    const titleLabel = t("noteModalTitle", "Nota").replace(/"/g, "&quot;");
    const cancelLabel = t("btnCancel", "Annulla").replace(/"/g, "&quot;");
    const okLabel = t("btnOk", "OK").replace(/"/g, "&quot;");

    // Usiamo ::before { content: attr(data-label) } per tutti i testi dell'interfaccia:
    // in questo modo non esistono TextNode nel DOM e Google Translate non può alterarli!
    promptShadow.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        * {
          box-sizing: border-box;
        }
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.25);
          display: none;
          align-items: flex-start;
          justify-content: center;
          padding-top: 16vh;
          pointer-events: auto;
        }
        .backdrop.open {
          display: flex;
        }
        .modal {
          width: min(360px, 90vw);
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 9px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
          overflow: hidden;
          color: #1f2937;
        }
        .modal-header {
          padding: 8px 12px;
          background: #f3f4f6;
          border-bottom: 1px solid #e5e7eb;
          font-size: 13px;
          font-weight: 700;
          color: #1f2937;
        }
        .modal-header::before {
          content: attr(data-label);
        }
        .modal-body {
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .note-input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 7px 9px;
          font-size: 13px;
          font-family: inherit;
          color: #111827;
          background: #ffffff;
          outline: none;
        }
        .note-input:focus {
          border-color: #6b7280;
          box-shadow: 0 0 0 2px rgba(107, 114, 128, 0.2);
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
        }
        .btn {
          border-radius: 6px;
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid #d1d5db;
          background: #ffffff;
          color: #374151;
        }
        .btn::before {
          content: attr(data-label);
        }
        .btn-primary {
          background: #374151;
          border-color: #1f2937;
          color: #ffffff;
        }
        .btn-primary:hover {
          background: #1f2937;
        }
      </style>

      <div class="backdrop notranslate" id="backdrop" translate="no">
        <div class="modal notranslate" role="dialog" aria-modal="true" translate="no">
          <div class="modal-header" data-label="${titleLabel}"></div>
          <div class="modal-body">
            <input
              type="text"
              class="note-input"
              id="noteInput"
              autocomplete="off"
            />
            <div class="actions">
              <button class="btn" id="cancelBtn" type="button" data-label="${cancelLabel}"></button>
              <button class="btn btn-primary" id="confirmBtn" type="button" data-label="${okLabel}"></button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(promptHost);

    const backdrop = promptShadow.getElementById("backdrop");
    const noteInput = promptShadow.getElementById("noteInput");
    const cancelBtn = promptShadow.getElementById("cancelBtn");
    const confirmBtn = promptShadow.getElementById("confirmBtn");

    function closePrompt() {
      isPromptOpen = false;
      activeCapturePayload = null;
      backdrop.classList.remove("open");
      noteInput.value = "";
    }

    function submitPrompt() {
      if (!activeCapturePayload) {
        closePrompt();
        return;
      }
      const userNote = noteInput.value.trim();
      const payloadToSend = {
        ...activeCapturePayload,
        userNote
      };
      closePrompt();
      browser.runtime.sendMessage({
        type: "APPUNTI_INSERT_SELECTION",
        payload: payloadToSend
      });
    }

    noteInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitPrompt();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePrompt();
      }
    });

    cancelBtn.addEventListener("click", closePrompt);
    confirmBtn.addEventListener("click", submitPrompt);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closePrompt();
    });
  }

  async function startCaptureFlow() {
    if (destroyed) return;
    if (!window.__AppuntiSelectionToMd) return;
    const extracted = window.__AppuntiSelectionToMd.extractPageSelection();
    if (!extracted) return;

    // Legge sempre lo stato aggiornato direttamente dallo storage (così funziona subito anche se cambiato da poco)
    try {
      const fresh = await browser.storage.local.get(DEFAULT_SETTINGS);
      settings = { ...DEFAULT_SETTINGS, ...fresh };
    } catch (_) {}

    if (!settings.askBlockNote) {
      browser.runtime.sendMessage({
        type: "APPUNTI_INSERT_SELECTION",
        payload: { ...extracted, userNote: "" }
      });
      return;
    }

    ensurePromptDom();
    activeCapturePayload = extracted;
    isPromptOpen = true;

    const backdrop = promptShadow.getElementById("backdrop");
    const noteInput = promptShadow.getElementById("noteInput");

    noteInput.value = "";
    backdrop.classList.add("open");

    setTimeout(() => {
      noteInput.focus();
    }, 10);
  }

  function onWindowKeyDown(e) {
    if (destroyed || isPromptOpen) return;
    if (matchesShortcut(e, settings.customShortcut)) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) {
        e.preventDefault();
        e.stopPropagation();
        startCaptureFlow();
      }
    }
  }

  window.addEventListener("keydown", onWindowKeyDown, true);

  function onRuntimeMessage(message) {
    if (destroyed || !message || !message.type) return undefined;
    if (message.type === "APPUNTI_START_CAPTURE_FLOW") {
      startCaptureFlow();
      return Promise.resolve({ ok: true });
    }
    return undefined;
  }

  browser.runtime.onMessage.addListener(onRuntimeMessage);

  function onStorageChanged(changes, area) {
    if (destroyed || area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in settings) {
        settings[key] = change.newValue;
      }
    }
  }

  browser.storage.onChanged.addListener(onStorageChanged);

  window.__AppuntiCleanupPreviousInstance = function () {
    destroyed = true;
    window.removeEventListener("keydown", onWindowKeyDown, true);
    try {
      browser.runtime.onMessage.removeListener(onRuntimeMessage);
      browser.storage.onChanged.removeListener(onStorageChanged);
    } catch (_) {}
    cleanupLegacyDomElements();
  };

  browser.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
    if (!destroyed) {
      settings = { ...DEFAULT_SETTINGS, ...stored };
    }
  });
})();
