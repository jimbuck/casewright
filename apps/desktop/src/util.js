/* Casewright — shared utilities: inline markdown render + word diff */
(function () {
  const e = React.createElement;

  // ---- render the inline-formatting whitelist to React nodes ----
  // allowed: **bold**  *italic*  ~~strike~~  `code`  [text](url)
  function renderInline(text, keyPrefix = "k") {
    if (text == null) return null;
    const out = [];
    let i = 0, k = 0;
    const rx = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(~~([^~]+)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
    let m, last = 0;
    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const key = keyPrefix + "-" + (k++);
      if (m[1]) out.push(e("strong", { key }, m[2]));
      else if (m[3]) out.push(e("em", { key }, m[4]));
      else if (m[5]) out.push(e("s", { key }, m[6]));
      else if (m[7]) out.push(e("code", { key, className: "md-code" }, m[8]));
      else if (m[9]) out.push(e("a", { key, href: m[11], className: "md-link",
        onClick: (ev) => ev.preventDefault() }, m[10]));
      last = rx.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  // wrap a selection in markers inside a textarea/input
  function wrapSelection(el, before, after = before) {
    const s = el.selectionStart, en = el.selectionEnd;
    const v = el.value;
    const sel = v.slice(s, en) || "text";
    const next = v.slice(0, s) + before + sel + after + v.slice(en);
    return { value: next, selStart: s + before.length, selEnd: s + before.length + sel.length };
  }

  // strip blocked block-level constructs (headings, lists, quotes, fences, rules)
  function sanitizeInline(text) {
    return text
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")      // headings
      .replace(/^\s*>\s?/gm, "")                // blockquotes
      .replace(/^\s*[-*+]\s+/gm, "")            // bullets
      .replace(/^\s*\d+\.\s+/gm, "")            // ordered
      .replace(/^\s*(```|~~~).*$/gm, "")        // fences
      .replace(/^\s*([-*_])\1{2,}\s*$/gm, "");  // hr
  }
  function hasBlockConstructs(text) {
    return /(^\s{0,3}#{1,6}\s)|(^\s*>\s)|(^\s*[-*+]\s)|(^\s*\d+\.\s)|(```)/m.test(text || "");
  }

  // ---- word-level diff (LCS) → tokens {v, t:'same'|'add'|'del'} ----
  function wordDiff(a, b) {
    const aw = (a || "").split(/(\s+)/), bw = (b || "").split(/(\s+)/);
    const n = aw.length, m = bw.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let x = n - 1; x >= 0; x--)
      for (let y = m - 1; y >= 0; y--)
        dp[x][y] = aw[x] === bw[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
    const del = [], add = [];
    let x = 0, y = 0;
    while (x < n && y < m) {
      if (aw[x] === bw[y]) { del.push({ v: aw[x], t: "same" }); add.push({ v: bw[y], t: "same" }); x++; y++; }
      else if (dp[x + 1][y] >= dp[x][y + 1]) { del.push({ v: aw[x], t: "del" }); x++; }
      else { add.push({ v: bw[y], t: "add" }); y++; }
    }
    while (x < n) del.push({ v: aw[x++], t: "del" });
    while (y < m) add.push({ v: bw[y++], t: "add" });
    return { del, add };
  }

  function slug(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
  }

  window.CWUtil = { renderInline, wrapSelection, sanitizeInline, hasBlockConstructs, wordDiff, slug };
})();
