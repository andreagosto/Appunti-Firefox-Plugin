/**
 * Background script per Appunti - Foglio Rapido.
 * - Gestisce la Sidebar nativa di Firefox.
 * - Mantiene l'elenco univoco delle fonti (sources: [{ url }]), aggiungendo un URL solo se non è già presente.
 * - Accoda ogni nuovo blocco copiato sempre in fondo agli altri.
 */
(function () {
  "use strict";

  const DEFAULT_STATE = {
    noteText: "",
    noteHtml: "",
    sources: [],
    convertHtmlToMd: true,
    askBlockNote: false,
    customShortcut: "Alt+A"
  };

  let stateCache = { ...DEFAULT_STATE };

  function migrateLegacyInlineSources(noteText, existingSources) {
    const sources = Array.isArray(existingSources) ? [...existingSources] : [];
    if (typeof noteText !== "string" || !noteText.startsWith("## Fonti\n")) {
      return { cleanNoteText: noteText || "", migratedSources: sources };
    }

    const headerRegex = /^## Fonti\n((?:- .*\n)+)(?:\n*---\n*)?/;
    const match = noteText.match(headerRegex);
    if (!match) {
      return { cleanNoteText: noteText, migratedSources: sources };
    }

    const lines = match[1].split("\n").filter(Boolean);
    for (const line of lines) {
      const m = line.match(/\]\((https?:\/\/[^\s)]+)\)/i) || line.match(/(https?:\/\/\S+)/i);
      if (m && m[1]) {
        const url = m[1].trim();
        if (!sources.some((s) => s.url === url)) {
          sources.push({ url });
        }
      }
    }

    const cleanNoteText = noteText.slice(match[0].length);
    return { cleanNoteText, migratedSources: sources };
  }

  async function cleanupAllOpenTabs() {
    try {
      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id) continue;
        browser.tabs
          .executeScript(tab.id, {
            code: `
              (function() {
                var h = document.getElementById("appunti-firefox-plugin-host");
                if (h) h.remove();
                var s = document.getElementById("appunti-firefox-layout-style");
                if (s) s.remove();
                document.documentElement.style.removeProperty("margin-right");
              })();
            `
          })
          .catch(() => {});
      }
    } catch (_) {}
  }

  async function initStorage() {
    const stored = await browser.storage.local.get(DEFAULT_STATE);
    const { cleanNoteText, migratedSources } = migrateLegacyInlineSources(
      stored.noteText,
      stored.sources
    );

    stateCache = {
      ...DEFAULT_STATE,
      ...stored,
      noteText: cleanNoteText,
      sources: migratedSources
    };

    await browser.storage.local.set(stateCache);
    cleanupAllOpenTabs();
  }

  initStorage();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      if (key in stateCache) {
        stateCache[key] = change.newValue;
      }
    }
  });

  browser.contextMenus.create({
    id: "appunti-append-selection",
    title: "Invia selezione agli Appunti",
    contexts: ["selection"]
  });

  function formatBlockWithOptionalNote(content, userNote) {
    const cleanNote = (userNote || "").trim();
    if (!cleanNote) {
      return content;
    }
    return `${content}\n\n**nota:** *${cleanNote}*`;
  }

  /**
   * Accoda sempre il nuovo blocco in fondo agli altri appunti.
   */
  async function appendSnippetToNote(payload) {
    const current = await browser.storage.local.get(DEFAULT_STATE);
    const originalText = typeof current.noteText === "string" ? current.noteText.trim() : "";
    const sources = Array.isArray(current.sources) ? [...current.sources] : [];

    const rawContent = current.convertHtmlToMd
      ? (payload.markdown || payload.plainText || "")
      : (payload.plainText || "");

    const trimmed = rawContent.trim();
    if (!trimmed) return null;

    // 1. Aggiungi fonte univoca se non esiste già
    const pageUrl = (payload.pageUrl || "").trim();
    if (pageUrl && /^https?:\/\//i.test(pageUrl)) {
      if (!sources.some((s) => s.url === pageUrl)) {
        sources.push({ url: pageUrl });
      }
    }

    const userNote = (payload.userNote || "").trim();

    // Se la Sidebar è aperta, le invia direttamente il blocco da appendere in fondo
    try {
      const sidebarRes = await browser.runtime.sendMessage({
        type: "APPUNTI_SIDEBAR_APPEND_SNIPPET",
        payload: {
          content: trimmed,
          userNote,
          sources
        }
      });
      if (sidebarRes && sidebarRes.handled) {
        return sidebarRes;
      }
    } catch (_) {
      // Sidebar chiusa: aggiorniamo direttamente lo storage in fondo
    }

    const snippet = formatBlockWithOptionalNote(trimmed, userNote);
    const newText = originalText ? `${originalText}\n\n${snippet}` : snippet;

    await browser.storage.local.set({
      noteText: newText,
      noteHtml: "",
      sources,
      lastInsertedAt: Date.now()
    });

    return {
      newText,
      insertedSnippet: snippet
    };
  }

  async function triggerCaptureFromActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab || !activeTab.id) return;

    try {
      await browser.tabs.sendMessage(activeTab.id, {
        type: "APPUNTI_START_CAPTURE_FLOW"
      });
    } catch (err) {
      console.warn("Impossibile avviare la cattura dal tab attivo:", err);
    }
  }

  browser.browserAction.onClicked.addListener(() => {
    if (browser.sidebarAction && browser.sidebarAction.toggle) {
      browser.sidebarAction.toggle();
    }
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === "append-selection") {
      triggerCaptureFromActiveTab();
    }
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "appunti-append-selection") return;

    if (tab && tab.id) {
      try {
        await browser.tabs.sendMessage(tab.id, {
          type: "APPUNTI_START_CAPTURE_FLOW"
        });
        return;
      } catch (_) {}
    }

    if (info.selectionText) {
      await appendSnippetToNote({
        plainText: info.selectionText,
        markdown: info.selectionText,
        pageTitle: tab ? tab.title : "",
        pageUrl: info.pageUrl || (tab ? tab.url : ""),
        userNote: ""
      });
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return undefined;

    if (message.type === "APPUNTI_INSERT_SELECTION") {
      return appendSnippetToNote(message.payload);
    }

    if (message.type === "APPUNTI_TRIGGER_CAPTURE_FROM_TAB") {
      return triggerCaptureFromActiveTab();
    }

    return undefined;
  });
})();
