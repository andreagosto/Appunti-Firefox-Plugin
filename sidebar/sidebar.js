/**
 * Sidebar script for Appunti - Quick Notes.
 * - Full i18n support (English & Italian via browser.i18n).
 * - Displays unique sources at the top (single line per source, truncated href, distinct background).
 * - Appends every newly captured block at the bottom.
 * - Renders personal notes with "note:" / "nota:" in bold followed by italic text.
 * - Subtle neutral highlight on mouseover for both block and note.
 * - Double-click on any block (or note) opens the minimal "Note" modal (Cancel / OK).
 * - Exports Markdown (.md) opening the system Save As folder picker.
 */
(function () {
  "use strict";

  const DEFAULT_STATE = {
    noteText: "",
    sources: [],
    convertHtmlToMd: true,
    askBlockNote: false,
    customShortcut: "Alt+A"
  };

  let state = { ...DEFAULT_STATE };
  let isRecordingShortcut = false;
  let isLocalTyping = false;
  let activeModalTarget = null;

  const els = {
    settingsBtn: document.getElementById("settingsBtn"),
    settingsBar: document.getElementById("settingsBar"),
    sourcesSection: document.getElementById("sourcesSection"),
    sourcesList: document.getElementById("sourcesList"),
    noteModalBackdrop: document.getElementById("noteModalBackdrop"),
    noteModalInput: document.getElementById("noteModalInput"),
    noteModalCancelBtn: document.getElementById("noteModalCancelBtn"),
    noteModalOkBtn: document.getElementById("noteModalOkBtn"),
    shortcutBtn: document.getElementById("shortcutBtn"),
    chkHtmlToMd: document.getElementById("chkHtmlToMd"),
    chkAskBlockNote: document.getElementById("chkAskBlockNote"),
    noteEditor: document.getElementById("noteEditor"),
    toastMsg: document.getElementById("toastMsg"),
    charCount: document.getElementById("charCount"),
    shortcutHint: document.getElementById("shortcutHint"),
    copyBtn: document.getElementById("copyBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    clearBtn: document.getElementById("clearBtn")
  };

  function t(key, substitutions, fallback = "") {
    try {
      const msg = browser.i18n.getMessage(key, substitutions);
      return msg || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function applyLocalization() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = t(key);
      if (val) el.textContent = val;
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      const val = t(key);
      if (val) el.setAttribute("title", val);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = t(key);
      if (val) el.setAttribute("data-placeholder", val);
    });

    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      const val = t(key);
      if (val) el.setAttribute("aria-label", val);
    });

    const notePrefix = t("notePrefix", null, "note: ");
    document.documentElement.style.setProperty("--note-prefix", JSON.stringify(notePrefix));
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

  function showToast(msg) {
    els.toastMsg.textContent = msg;
    els.toastMsg.classList.add("visible");
    clearTimeout(els.toastMsg._timer);
    els.toastMsg._timer = setTimeout(() => {
      els.toastMsg.classList.remove("visible");
    }, 1400);
  }

  function createNoteElement(noteText) {
    const noteEl = document.createElement("div");
    noteEl.className = "appunti-user-note";
    noteEl.setAttribute("contenteditable", "false");
    noteEl.setAttribute("data-note", noteText);
    noteEl.textContent = noteText;
    return noteEl;
  }

  function createBlockElement(contentText) {
    const blockEl = document.createElement("div");
    blockEl.className = "appunti-block";
    blockEl.textContent = contentText;
    return blockEl;
  }

  /**
   * Reconstructs the visual editor DOM nodes from saved Markdown text
   * using safe DOM APIs (supports both `**note:**` and `**nota:**` and legacy ```nota```).
   */
  function renderMarkdownIntoEditor(rawText) {
    els.noteEditor.replaceChildren();
    if (!rawText || !rawText.trim()) return;

    const parts = rawText.split(/(```nota\n[\s\S]*?\n```|\*\*(?:nota|note):\*\*\s*\*[^\n]+\*)/g);
    const fragment = document.createDocumentFragment();

    for (const part of parts) {
      if (!part) continue;
      const legacyMatch = part.match(/^```nota\n([\s\S]*?)\n```$/);
      const inlineMdMatch = part.match(/^\*\*(?:nota|note):\*\*\s*\*([\s\S]*?)\*$/);
      if (legacyMatch || inlineMdMatch) {
        const noteContent = (legacyMatch ? legacyMatch[1] : inlineMdMatch[1]).trim();
        if (noteContent) {
          fragment.appendChild(createNoteElement(noteContent));
        }
      } else {
        const paragraphs = part.replace(/^\n+|\n+$/g, "").split(/\n{2,}/);
        for (const p of paragraphs) {
          const trimmed = p.trim();
          if (!trimmed) continue;
          fragment.appendChild(createBlockElement(trimmed));
        }
      }
    }

    els.noteEditor.appendChild(fragment);
  }

  function serializeEditorToMarkdown() {
    const blocks = [];
    const kw = t("noteMarkdownKeyword", null, "note");

    function walkNodes(parent) {
      for (const node of Array.from(parent.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const tVal = (node.nodeValue || "").trim();
          if (tVal) blocks.push(tVal);
          continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.classList.contains("appunti-user-note")) {
          const noteText = (node.getAttribute("data-note") || node.textContent || "").trim();
          if (noteText) {
            blocks.push(`**${kw}:** *${noteText}*`);
          }
          continue;
        }

        if (node.classList.contains("appunti-block") || node.tagName === "DIV" || node.tagName === "P") {
          if (node.querySelector && node.querySelector(".appunti-user-note")) {
            walkNodes(node);
          } else {
            const tVal = (node.innerText || node.textContent || "").trim();
            if (tVal) blocks.push(tVal);
          }
          continue;
        }

        const fallback = (node.innerText || node.textContent || "").trim();
        if (fallback) blocks.push(fallback);
      }
    }

    walkNodes(els.noteEditor);
    return blocks.join("\n\n");
  }

  function updateCharCountDisplay(len) {
    const suffix = t("charCountSuffix", null, "chars");
    els.charCount.textContent = `${len} ${suffix}`;
  }

  function updateStatsAndPersist() {
    const md = serializeEditorToMarkdown();
    state.noteText = md;
    updateCharCountDisplay(md.length);

    browser.storage.local.set({
      noteText: md
    });
  }

  function appendSnippetAtBottom(contentText, userNote) {
    const blockEl = createBlockElement(contentText);
    els.noteEditor.appendChild(blockEl);

    let lastEl = blockEl;
    if (userNote) {
      const noteEl = createNoteElement(userNote);
      els.noteEditor.appendChild(noteEl);
      lastEl = noteEl;
    }

    lastEl.scrollIntoView({ behavior: "smooth", block: "end" });
    updateStatsAndPersist();
  }

  function renderSourcesList() {
    const sources = Array.isArray(state.sources) ? state.sources : [];
    els.sourcesList.replaceChildren();

    if (sources.length === 0) {
      els.sourcesSection.classList.remove("has-sources");
      return;
    }

    els.sourcesSection.classList.add("has-sources");
    const removeTitle = t("removeSourceTitle", null, "Remove source");

    sources.forEach((src, idx) => {
      const url = typeof src === "string" ? src : src.url;
      if (!url) return;

      const row = document.createElement("div");
      row.className = "source-row";

      const link = document.createElement("a");
      link.className = "source-link";
      link.href = url;
      link.textContent = url;
      link.title = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      const removeBtn = document.createElement("button");
      removeBtn.className = "source-remove-btn";
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.title = removeTitle;
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const updated = sources.filter((_, i) => i !== idx);
        browser.storage.local.set({ sources: updated });
      });

      row.appendChild(link);
      row.appendChild(removeBtn);
      els.sourcesList.appendChild(row);
    });
  }

  function buildFullExportMarkdown() {
    const sources = Array.isArray(state.sources) ? state.sources : [];
    const body = serializeEditorToMarkdown().trim();

    if (sources.length === 0) {
      return body;
    }

    const heading = t("sourcesMarkdownHeading", null, "Sources");
    const sourceLines = sources
      .map((s) => (typeof s === "string" ? s : s.url))
      .filter(Boolean)
      .map((url) => `- <${url}>`)
      .join("\n");

    return `## ${heading}\n${sourceLines}\n\n---\n\n${body}`;
  }

  function openNoteModalForElement(targetEl) {
    if (!targetEl) return;

    if (targetEl.classList.contains("appunti-user-note")) {
      activeModalTarget = {
        mode: "edit-note-el",
        noteEl: targetEl
      };
      els.noteModalInput.value = targetEl.getAttribute("data-note") || targetEl.textContent || "";
    } else {
      const blockEl = targetEl.closest(".appunti-block") || targetEl;
      const nextEl = blockEl.nextElementSibling;
      if (nextEl && nextEl.classList.contains("appunti-user-note")) {
        activeModalTarget = {
          mode: "edit-note-el",
          noteEl: nextEl
        };
        els.noteModalInput.value = nextEl.getAttribute("data-note") || nextEl.textContent || "";
      } else {
        activeModalTarget = {
          mode: "attach-to-block",
          blockEl
        };
        els.noteModalInput.value = "";
      }
    }

    els.noteModalBackdrop.classList.add("open");
    setTimeout(() => {
      els.noteModalInput.focus();
      els.noteModalInput.select();
    }, 10);
  }

  function closeBlockNoteModal() {
    activeModalTarget = null;
    els.noteModalBackdrop.classList.remove("open");
    els.noteModalInput.value = "";
  }

  function saveBlockNoteFromModal() {
    if (!activeModalTarget) {
      closeBlockNoteModal();
      return;
    }

    const noteVal = els.noteModalInput.value.trim();

    if (activeModalTarget.mode === "edit-note-el") {
      const noteEl = activeModalTarget.noteEl;
      if (noteVal) {
        noteEl.setAttribute("data-note", noteVal);
        noteEl.textContent = noteVal;
      } else {
        noteEl.remove();
      }
    } else if (activeModalTarget.mode === "attach-to-block" && noteVal) {
      const blockEl = activeModalTarget.blockEl;
      const noteEl = createNoteElement(noteVal);
      if (blockEl && blockEl.parentNode === els.noteEditor) {
        blockEl.insertAdjacentElement("afterend", noteEl);
      } else {
        els.noteEditor.appendChild(noteEl);
      }
    }

    closeBlockNoteModal();
    updateStatsAndPersist();
    showToast(noteVal ? t("toastNoteSaved", null, "Note saved!") : t("toastNoteRemoved", null, "Note removed"));
  }

  function renderStateFromStorage() {
    renderSourcesList();

    if (!isLocalTyping) {
      const currentSerialized = serializeEditorToMarkdown();
      if (currentSerialized !== (state.noteText || "").trim()) {
        renderMarkdownIntoEditor(state.noteText || "");
      }
    }

    const mdLen = (state.noteText || "").length;
    updateCharCountDisplay(mdLen);
    els.shortcutBtn.textContent = state.customShortcut || "Alt+A";
    const hintPrefix = t("shortcutHintPrefix", null, "Shortcut:");
    els.shortcutHint.textContent = `${hintPrefix} ${state.customShortcut || "Alt+A"}`;
    els.chkHtmlToMd.checked = Boolean(state.convertHtmlToMd);
    els.chkAskBlockNote.checked = Boolean(state.askBlockNote);
  }

  els.noteEditor.addEventListener("dblclick", (e) => {
    const sel = window.getSelection();
    if (sel) sel.collapseToStart();

    let target = e.target;
    if (target === els.noteEditor) {
      target = els.noteEditor.lastElementChild;
    }
    if (!target) return;
    openNoteModalForElement(target);
  });

  function clearNoteHoverHighlight() {
    const highlighted = els.noteEditor.querySelectorAll(".linked-highlight");
    for (const el of highlighted) {
      el.classList.remove("linked-highlight");
    }
  }

  els.noteEditor.addEventListener("mouseover", (e) => {
    clearNoteHoverHighlight();
    if (!e.target || !e.target.closest) return;

    const noteEl = e.target.closest(".appunti-user-note");
    if (noteEl) {
      noteEl.classList.add("linked-highlight");
      let prev = noteEl.previousElementSibling;
      while (prev && prev.classList.contains("appunti-user-note")) {
        prev = prev.previousElementSibling;
      }
      if (prev && prev.classList.contains("appunti-block")) {
        prev.classList.add("linked-highlight");
      }
      return;
    }

    const blockEl = e.target.closest(".appunti-block");
    if (blockEl) {
      blockEl.classList.add("linked-highlight");
      let next = blockEl.nextElementSibling;
      while (next && next.classList.contains("appunti-user-note")) {
        next.classList.add("linked-highlight");
        next = next.nextElementSibling;
      }
    }
  });

  els.noteEditor.addEventListener("mouseleave", clearNoteHoverHighlight);

  els.noteEditor.addEventListener("input", () => {
    isLocalTyping = true;

    const md = serializeEditorToMarkdown();
    state.noteText = md;
    updateCharCountDisplay(md.length);

    browser.storage.local
      .set({
        noteText: md
      })
      .finally(() => {
        isLocalTyping = false;
      });
  });

  browser.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return undefined;

    if (message.type === "APPUNTI_SIDEBAR_APPEND_SNIPPET") {
      const { content, userNote, sources } = message.payload;
      if (Array.isArray(sources)) {
        state.sources = sources;
        browser.storage.local.set({ sources });
        renderSourcesList();
      }
      appendSnippetAtBottom(content, userNote);
      showToast(t("toastAddedBottom", null, "Added to notes!"));
      return Promise.resolve({ handled: true });
    }

    return undefined;
  });

  els.noteModalOkBtn.addEventListener("click", saveBlockNoteFromModal);
  els.noteModalCancelBtn.addEventListener("click", closeBlockNoteModal);
  els.noteModalBackdrop.addEventListener("click", (e) => {
    if (e.target === els.noteModalBackdrop) closeBlockNoteModal();
  });

  els.noteModalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveBlockNoteFromModal();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeBlockNoteModal();
    }
  });

  els.settingsBtn.addEventListener("click", () => {
    els.settingsBar.classList.toggle("open");
    els.settingsBtn.classList.toggle("active");
  });

  els.shortcutBtn.addEventListener("click", () => {
    isRecordingShortcut = !isRecordingShortcut;
    if (isRecordingShortcut) {
      els.shortcutBtn.classList.add("recording");
      els.shortcutBtn.textContent = t("settingRecordingShortcut", null, "Press keys... (Esc)");
    } else {
      els.shortcutBtn.classList.remove("recording");
      els.shortcutBtn.textContent = state.customShortcut || "Alt+A";
    }
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (!isRecordingShortcut) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        isRecordingShortcut = false;
        els.shortcutBtn.classList.remove("recording");
        els.shortcutBtn.textContent = state.customShortcut || "Alt+A";
        return;
      }

      const combo = eventToShortcutString(e);
      if (!combo) return;

      isRecordingShortcut = false;
      els.shortcutBtn.classList.remove("recording");
      browser.storage.local.set({ customShortcut: combo });
      showToast(t("toastShortcutSet", [combo], `Shortcut: ${combo}`));
    },
    true
  );

  els.chkHtmlToMd.addEventListener("change", () => {
    browser.storage.local.set({ convertHtmlToMd: els.chkHtmlToMd.checked });
  });

  els.chkAskBlockNote.addEventListener("change", () => {
    browser.storage.local.set({ askBlockNote: els.chkAskBlockNote.checked });
  });

  els.copyBtn.addEventListener("click", async () => {
    const fullContent = buildFullExportMarkdown();
    try {
      await navigator.clipboard.writeText(fullContent);
      showToast(t("toastCopied", null, "Notes and sources copied!"));
    } catch (_) {
      showToast(t("toastCopyError", null, "Copy error"));
    }
  });

  els.downloadBtn.addEventListener("click", async () => {
    const fullContent = buildFullExportMarkdown();
    const blob = new Blob([fullContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const prefix = t("defaultFilenamePrefix", null, "notes");
    const defaultFilename = `${prefix}-${dateStr}.md`;

    try {
      if (browser.downloads && browser.downloads.download) {
        await browser.downloads.download({
          url,
          filename: defaultFilename,
          saveAs: true
        });
        showToast(t("toastExportStarted", null, "Export started"));
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultFilename;
        a.click();
        showToast(t("toastDownloaded", null, ".md file downloaded!"));
      }
    } catch (_) {
      // Cancelled by user
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  });

  els.clearBtn.addEventListener("click", () => {
    if (!els.noteEditor.textContent.trim() && (!state.sources || state.sources.length === 0)) return;
    if (confirm(t("confirmClear", null, "Do you really want to clear all notes and sources?"))) {
      els.noteEditor.replaceChildren();
      browser.storage.local.set({
        noteText: "",
        sources: []
      });
      showToast(t("toastCleared", null, "Notes cleared"));
    }
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, change] of Object.entries(changes)) {
      state[key] = change.newValue;
    }
    renderStateFromStorage();
  });

  applyLocalization();

  browser.storage.local.get(DEFAULT_STATE).then((stored) => {
    state = { ...DEFAULT_STATE, ...stored };
    renderMarkdownIntoEditor(state.noteText || "");
    renderStateFromStorage();
  });
})();
