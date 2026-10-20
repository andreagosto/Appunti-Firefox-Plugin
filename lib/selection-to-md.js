/**
 * Utility per estrarre la selezione corrente del documento sia come testo semplice
 * sia convertita da HTML a Markdown pulito.
 */
(function () {
  "use strict";

  function resolveUrl(href) {
    if (!href) return "";
    try {
      return new URL(href, document.baseURI).href;
    } catch (_) {
      return href;
    }
  }

  function escapeMdText(text) {
    return text.replace(/\s+/g, " ");
  }

  function serializeTable(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll("tr"));
    if (!rows.length) return "";

    const matrix = rows.map((tr) =>
      Array.from(tr.children)
        .filter((c) => c.tagName === "TD" || c.tagName === "TH")
        .map((cell) => nodeToMd(cell, { inline: true }).trim().replace(/\|/g, "\\|").replace(/\n+/g, " "))
    );

    const colCount = Math.max(...matrix.map((r) => r.length), 0);
    if (colCount === 0) return "";

    const normalized = matrix.map((r) => {
      const copy = r.slice();
      while (copy.length < colCount) copy.push("");
      return copy;
    });

    const header = `| ${normalized[0].join(" | ")} |`;
    const divider = `| ${normalized[0].map(() => "---").join(" | ")} |`;
    const body = normalized
      .slice(1)
      .map((r) => `| ${r.join(" | ")} |`)
      .join("\n");

    return `\n\n${header}\n${divider}${body ? "\n" + body : ""}\n\n`;
  }

  function nodeToMd(node, ctx = { listDepth: 0, inline: false }) {
    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      const val = node.nodeValue || "";
      if (ctx.inPre) return val;
      return escapeMdText(val);
    }

    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      return "";
    }

    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return Array.from(node.childNodes)
        .map((child) => nodeToMd(child, ctx))
        .join("");
    }

    const tag = node.tagName.toLowerCase();

    // Ignora elementi non visibili o di script/stile
    if (["script", "style", "noscript", "template", "svg", "iframe"].includes(tag)) {
      return "";
    }

    const childrenMd = (overrideCtx = {}) =>
      Array.from(node.childNodes)
        .map((child) => nodeToMd(child, { ...ctx, ...overrideCtx }))
        .join("");

    switch (tag) {
      case "br":
        return ctx.inline ? " " : "\n";

      case "hr":
        return ctx.inline ? " --- " : "\n\n---\n\n";

      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const level = Number(tag.slice(1));
        const prefix = "#".repeat(level);
        const text = childrenMd({ inline: true }).trim();
        return text ? `\n\n${prefix} ${text}\n\n` : "";
      }

      case "p":
      case "div":
      case "section":
      case "article":
      case "header":
      case "footer":
      case "main": {
        const inner = childrenMd().trim();
        if (!inner) return "";
        return ctx.inline ? `${inner} ` : `\n\n${inner}\n\n`;
      }

      case "strong":
      case "b": {
        const inner = childrenMd({ inline: true }).trim();
        return inner ? `**${inner}**` : "";
      }

      case "em":
      case "i": {
        const inner = childrenMd({ inline: true }).trim();
        return inner ? `*${inner}*` : "";
      }

      case "del":
      case "s":
      case "strike": {
        const inner = childrenMd({ inline: true }).trim();
        return inner ? `~~${inner}~~` : "";
      }

      case "mark": {
        const inner = childrenMd({ inline: true }).trim();
        return inner ? `==${inner}==` : "";
      }

      case "code": {
        if (ctx.inPre) {
          return node.textContent || "";
        }
        const inner = (node.textContent || "").trim();
        if (!inner) return "";
        const tick = inner.includes("`") ? "``" : "`";
        return `${tick}${inner}${tick}`;
      }

      case "pre": {
        const codeEl = node.querySelector("code");
        let lang = "";
        if (codeEl && codeEl.className) {
          const m = codeEl.className.match(/language-([\w-]+)/i) || codeEl.className.match(/lang-([\w-]+)/i);
          if (m) lang = m[1];
        }
        const raw = (codeEl || node).textContent || "";
        return `\n\n\`\`\`${lang}\n${raw.replace(/\n+$/, "")}\n\`\`\`\n\n`;
      }

      case "blockquote": {
        const inner = childrenMd().trim();
        if (!inner) return "";
        const quoted = inner
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n");
        return `\n\n${quoted}\n\n`;
      }

      case "a": {
        const href = resolveUrl(node.getAttribute("href"));
        const text = childrenMd({ inline: true }).trim() || href;
        if (!href || href.startsWith("javascript:")) return text;
        return `[${text}](${href})`;
      }

      case "img": {
        const src = resolveUrl(node.getAttribute("src"));
        const alt = (node.getAttribute("alt") || "immagine").trim();
        if (!src) return "";
        return `![${alt}](${src})`;
      }

      case "ul":
      case "ol": {
        const isOrdered = tag === "ol";
        const startAttr = parseInt(node.getAttribute("start") || "1", 10);
        const items = Array.from(node.children).filter((el) => el.tagName && el.tagName.toLowerCase() === "li");
        const lines = items.map((li, idx) => {
          const indent = "  ".repeat(ctx.listDepth || 0);
          const bullet = isOrdered ? `${startAttr + idx}. ` : "- ";
          const itemContent = nodeToMd(li, { ...ctx, listDepth: (ctx.listDepth || 0) + 1 }).trim();
          return `${indent}${bullet}${itemContent}`;
        });
        return `\n${lines.join("\n")}\n`;
      }

      case "li": {
        return childrenMd().trim().replace(/\n{2,}/g, "\n  ");
      }

      case "table": {
        return serializeTable(node);
      }

      default:
        return childrenMd();
    }
  }

  function cleanMarkdown(md) {
    return md
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Estrae la selezione corrente della pagina (testo semplice + markdown).
   * Ritorna null se non c'è testo selezionato.
   */
  function extractPageSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      return null;
    }

    const plainText = sel.toString().trim();
    if (!plainText) {
      return null;
    }

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < sel.rangeCount; i++) {
      fragment.appendChild(sel.getRangeAt(i).cloneContents());
    }

    const markdown = cleanMarkdown(nodeToMd(fragment));

    return {
      plainText,
      markdown: markdown || plainText,
      pageTitle: document.title || location.hostname,
      pageUrl: location.href
    };
  }

  window.__AppuntiSelectionToMd = {
    extractPageSelection,
    nodeToMd,
    cleanMarkdown
  };
})();
