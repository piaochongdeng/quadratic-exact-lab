/*!
 * quadratic-exact-lab · markdown.js  (v1.4.2)
 * ------------------------------------------------------------------
 * 一个够用且克制的 Markdown 渲染器，专为「数学报告」场景设计：
 *   · 支持 标题 / 段落 / 有序·无序列表（含嵌套）/ 表格 / 引用 / 分隔线 / 代码块
 *   · 支持 $行内公式$ 与 $$行间公式$$（交给 KaTeX 排版）
 *   · 先把公式抽成占位符，再做 HTML 转义与行内标记，因此公式绝不被误伤
 * 无第三方依赖；KaTeX 以参数注入，未注入时退化为等宽文本。
 * ------------------------------------------------------------------
 */
(function (global, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.Markdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PH = '\u0001';   /* 占位符定界符，正文中不会出现 */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createRenderer(katex) {
    var mathCount = 0;

    function renderMath(tex, display) {
      mathCount++;
      if (katex && typeof katex.renderToString === 'function') {
        try {
          return katex.renderToString(tex, {
            displayMode: !!display,
            throwOnError: false,
            strict: false,
            trust: false
          });
        } catch (err) { /* 落回纯文本 */ }
      }
      return '<code class="math-fallback">' + escapeHtml(tex) + '</code>';
    }

    /* ---------- 行内渲染 ---------- */
    function inline(text, store) {
      /* 1. 先保护行内公式 */
      text = text.replace(/\$([^$\n]+?)\$/g, function (m, tex) {
        store.push({ tex: tex, display: false });
        return PH + (store.length - 1) + PH;
      });
      /* 2. HTML 转义（此时正文里已不含公式） */
      text = escapeHtml(text);
      /* 3. 行内代码 */
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
      /* 4. 强调 */
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>');
      /* 5. 链接（只允许安全协议） */
      text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
        var safe = /^(https?:|mailto:|#)/i.test(href);
        return safe
          ? '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>'
          : escapeHtml(label);
      });
      return text;
    }

    function restore(html, store) {
      return html.replace(new RegExp(PH + '(\\d+)' + PH, 'g'), function (m, idx) {
        var item = store[Number(idx)];
        return item ? renderMath(item.tex, item.display) : '';
      });
    }

    /* ---------- 表格 ---------- */
    function splitRow(line) {
      var s = line.trim();
      if (s.charAt(0) === '|') s = s.slice(1);
      if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
      return s.split('|').map(function (c) { return c.trim(); });
    }

    function isDelimiterRow(line) {
      if (line.indexOf('-') < 0) return false;
      var cells = splitRow(line);
      if (!cells.length) return false;
      return cells.every(function (c) { return /^:?-{1,}:?$/.test(c.replace(/\s/g, '')); });
    }

    /* ---------- 列表 ---------- */
    function renderList(items, store) {
      /* items: [{ indent, ordered, text }]，用缩进决定层级 */
      var html = '', stack = [];
      items.forEach(function (item) {
        var level = item.indent;
        if (!stack.length) {
          stack.push({ level: level, ordered: item.ordered });
          html += item.ordered ? '<ol>' : '<ul>';
        } else if (level > stack[stack.length - 1].level) {
          stack.push({ level: level, ordered: item.ordered });
          html += item.ordered ? '<ol>' : '<ul>';
        } else {
          while (stack.length > 1 && level < stack[stack.length - 1].level) {
            html += stack.pop().ordered ? '</ol>' : '</ul>';
          }
          if (level > stack[stack.length - 1].level) {
            stack.push({ level: level, ordered: item.ordered });
            html += item.ordered ? '<ol>' : '<ul>';
          }
        }
        html += '<li>' + restore(inline(item.text, store), store) + '</li>';
      });
      while (stack.length) html += stack.pop().ordered ? '</ol>' : '</ul>';
      return html;
    }

    /* ---------- 主渲染 ---------- */
    function render(src) {
      mathCount = 0;
      var store = [];
      var lines = String(src === null || src === undefined ? '' : src).replace(/\r\n?/g, '\n').split('\n');
      var out = [];
      var i = 0;

      while (i < lines.length) {
        var line = lines[i];

        if (/^\s*$/.test(line)) { i++; continue; }

        /* 代码块 */
        var fence = /^\s*```\s*([\w-]*)\s*$/.exec(line);
        if (fence) {
          var lang = fence[1];
          var buf = [];
          i++;
          while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
          i++; /* 跳过结束栅栏 */
          out.push('<pre class="md-code"' + (lang ? ' data-lang="' + escapeHtml(lang) + '"' : '') + '><code>' +
            escapeHtml(buf.join('\n')) + '</code></pre>');
          continue;
        }

        /* 行间公式（单行 $$...$$ 或跨行） */
        if (/^\s*\$\$/.test(line)) {
          var body = line.replace(/^\s*\$\$/, '');
          if (/\$\$\s*$/.test(body)) {
            /* 单行形式：$$ ... $$ —— 必须推进游标，否则死循环 */
            body = body.replace(/\$\$\s*$/, '');
            i++;
          } else {
            var acc = [body];
            i++;
            while (i < lines.length && !/\$\$\s*$/.test(lines[i])) { acc.push(lines[i]); i++; }
            if (i < lines.length) { acc.push(lines[i].replace(/\$\$\s*$/, '')); i++; }
            body = acc.join('\n');
          }
          out.push('<div class="md-math-display">' + renderMath(body.trim(), true) + '</div>');
          continue;
        }

        /* 标题 */
        var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
        if (h) {
          var lv = h[1].length;
          out.push('<h' + lv + ' class="md-h' + lv + '">' + restore(inline(h[2], store), store) + '</h' + lv + '>');
          i++;
          continue;
        }

        /* 分隔线 */
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr class="md-hr">'); i++; continue; }

        /* 引用 */
        if (/^\s*>\s?/.test(line)) {
          var quote = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quote.push(lines[i].replace(/^\s*>\s?/, ''));
            i++;
          }
          out.push('<blockquote class="md-quote">' + render(quote.join('\n')) + '</blockquote>');
          continue;
        }

        /* 表格 */
        if (line.indexOf('|') >= 0 && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
          var head = splitRow(line);
          var aligns = splitRow(lines[i + 1]).map(function (c) {
            c = c.replace(/\s/g, '');
            var left = c.charAt(0) === ':', right = c.charAt(c.length - 1) === ':';
            return left && right ? 'center' : (right ? 'right' : (left ? 'left' : ''));
          });
          i += 2;
          var rows = [];
          while (i < lines.length && lines[i].indexOf('|') >= 0 && !/^\s*$/.test(lines[i])) {
            rows.push(splitRow(lines[i]));
            i++;
          }
          var thtml = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
          head.forEach(function (c, ci) {
            thtml += '<th' + (aligns[ci] ? ' style="text-align:' + aligns[ci] + '"' : '') + '>' +
              restore(inline(c, store), store) + '</th>';
          });
          thtml += '</tr></thead><tbody>';
          rows.forEach(function (r) {
            thtml += '<tr>';
            head.forEach(function (c, ci) {
              thtml += '<td' + (aligns[ci] ? ' style="text-align:' + aligns[ci] + '"' : '') + '>' +
                restore(inline(r[ci] === undefined ? '' : r[ci], store), store) + '</td>';
            });
            thtml += '</tr>';
          });
          thtml += '</tbody></table></div>';
          out.push(thtml);
          continue;
        }

        /* 列表 */
        var li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
        if (li) {
          var items = [];
          while (i < lines.length) {
            var m2 = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
            if (!m2) break;
            items.push({ indent: Math.floor(m2[1].replace(/\t/g, '  ').length / 2), ordered: /\d/.test(m2[2]), text: m2[3] });
            i++;
          }
          out.push(renderList(items, store));
          continue;
        }

        /* 段落 */
        var para = [];
        while (i < lines.length && !/^\s*$/.test(lines[i]) &&
               !/^(#{1,6})\s+/.test(lines[i]) &&
               !/^\s*>\s?/.test(lines[i]) &&
               !/^\s*```/.test(lines[i]) &&
               !/^\s*\$\$/.test(lines[i]) &&
               !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
               !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])) {
          para.push(lines[i]);
          i++;
        }
        if (!para.length) { para.push(lines[i]); i++; }
        /* 先换行、再还原公式：KaTeX 输出的 HTML（尤其是拉长的根号 SVG）自带换行，
           还原之后再替换换行符会把 <br> 塞进 <path d="..."> 里，
           浏览器就会报「Expected path command」。 */
        out.push('<p class="md-p">' + restore(inline(para.join('\n'), store).replace(/\n/g, '<br>'), store) + '</p>');
      }

      return out.join('\n');
    }

    return { render: render, escapeHtml: escapeHtml, mathCount: function () { return mathCount; } };
  }

  return { createRenderer: createRenderer, escapeHtml: escapeHtml };
});
