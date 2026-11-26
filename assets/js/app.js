/* ==========================================================================
   研报速览 · Apple 风格交互与数据引擎 v6
   支持：ChapterNav 期数导航 / 历史归档检索 / 纪要智能标题消歧 / Markdown 表格渲染 /
        阅读器上下篇无缝切换 / PDF 分栏工作台 / GitHub 原生 TXT 直读兜底
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Jjiaoziao/Analysis_Report/main';
  const GITHUB_REPO_API = 'https://api.github.com/repos/Jjiaoziao/Analysis_Report';
  const KEYS = {
    theme: 'yb-theme-v6',
    fontSize: 'yb-font-v6'
  };
  const DEFAULT_BRIEF_LIMIT = 9;

  const state = {
    sourceMode: 'local', // 'local' | 'github' | 'demo'
    dates: [],
    updatedAt: '',
    dateMetaCache: {}, // { '2026-11-25': { noteCount, pdfCount, industryCount, brokerCount } }
    currentDate: null,
    day: null,

    query: '',
    activeNoteCat: '全部',
    briefsExpanded: false,
    filteredNotes: [],
    activeNoteIndex: -1,

    activeIndustry: '全部',
    activeBroker: '全部',
    filteredPdfs: [],
    activePdf: null,
    railMode: 'industry', // 'industry' | 'all'

    articleSize: 16,
    archiveQuery: ''
  };

  // ---------- 基础工具 ----------
  function storageGet(k, fb) {
    try { const v = localStorage.getItem(k); return v === null ? fb : v; } catch { return fb; }
  }
  function storageSet(k, v) {
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) {
    return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function parseDateParts(s) {
    const p = String(s || '').split('-');
    if (p.length !== 3) return { y: '', m: '', d: s || '' };
    return { y: p[0], m: String(parseInt(p[1], 10)), d: p[2], mm: p[1] };
  }
  function formatFullDateCN(s) {
    const { y, m, d } = parseDateParts(s);
    if (!y) return s || '—';
    return `${y} 年 ${m} 月 ${parseInt(d, 10)} 日`;
  }
  function formatShortDateCN(s) {
    const { m, d } = parseDateParts(s);
    if (!m) return s || '—';
    return `${m}月${parseInt(d, 10)}日`;
  }
  function weekday(s, full = false) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    const shortNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const fullNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return full ? fullNames[d.getDay()] : shortNames[d.getDay()];
  }

  let toastTimer = null;
  function toast(msg) {
    const wrap = $('#toastWrap');
    if (!wrap) return;
    clearTimeout(toastTimer);
    wrap.innerHTML = `<div class="toast">${escapeHtml(msg)}</div>`;
    toastTimer = setTimeout(() => { wrap.innerHTML = ''; }, 2400);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('已复制全文到剪贴板')).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('已复制全文到剪贴板');
    } catch { toast('复制失败'); }
  }

  // ---------- 文本清洗与标题智能提炼（兼容旧 JSON 与实时 TXT 直读） ----------
  const EMOJI_RE = /[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u2190-\u21FF\u2B00-\u2BFF]/g;
  const WECHAT_STICKER_RE = /\[(?:火|火箭|樱花|钻石|玫瑰|爱心|爆竹|烟花|定位|太阳|啤酒|庆祝|礼物|红包|拳头|灯泡|图钉|微笑|發|福|红|闪电|强|赞|握手|合十|加油|鼓掌|机智|吃瓜|呲牙|偷笑)\]/g;

  function cleanTitle(raw) {
    let t = String(raw || '').replace(EMOJI_RE, '').replace(WECHAT_STICKER_RE, '');
    t = t.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
    return t || '未命名';
  }

  function cleanSectionHeading(raw) {
    let t = cleanTitle(raw);
    t = t.replace(/^\d+\s*[.、．)\]]\s*/, '');
    t = t.replace(/^【([^】]+)】$/, '$1');
    return t.trim() || t;
  }

  function enrichNoteMeta(note) {
    const cleanT = cleanTitle(note.title || note.rawTitle || '');
    const sections = Array.isArray(note.sections) ? note.sections : [];
    const dateNote = note.dateNote || '';

    if (note.displayTitle && note.displayTitle !== cleanT) {
      return {
        ...note,
        title: cleanT,
        displayTitle: cleanTitle(note.displayTitle),
        seriesTag: note.seriesTag || ''
      };
    }

    let seriesTag = note.seriesTag || '';
    if (!seriesTag && dateNote) {
      const m = dateNote.match(/(第\s*\d+\/\d+\s*段)/);
      if (m) seriesTag = m[1].replace(/\s+/g, '');
    }

    let displayTitle = cleanT;
    if (/^研报纪要\s*\d{6,8}$/.test(cleanT)) {
      if (sections.length) {
        const lead = cleanSectionHeading(sections[0].title);
        const extra = sections.length > 1 && seriesTag ? ` 等 ${sections.length} 篇` : '';
        displayTitle = lead + extra;
        seriesTag = seriesTag ? `研报纪要 · ${seriesTag}` : '研报纪要';
      } else if (seriesTag) {
        displayTitle = `${cleanT}（${seriesTag}）`;
      }
    } else if (/^[一二三四五六七八九十]+[、.．]\s*行业投资逻辑$/.test(cleanT) && sections.length) {
      displayTitle = cleanSectionHeading(sections[0].title).replace(/【[^】]*】$/, '').trim();
      seriesTag = '行业投资逻辑';
    }

    return {
      ...note,
      title: cleanT,
      displayTitle,
      seriesTag
    };
  }

  function categorize(title) {
    if (title.includes('研报纪要')) return '每日纪要';
    if (title.includes('复盘报告') || title.includes('复盘')) return '市场复盘';
    if (title.includes('券商纪要') || title.includes('场深挖')) return '券商纪要';
    if (['周观点', '投资逻辑', '策略', '布局', '配置'].some(k => title.includes(k))) return '投资策略';
    if (['批价', '库存', '数据跟踪', '数据库', '月报', '周报'].some(k => title.includes(k))) return '数据跟踪';
    if (['AI', '算力', '机器人', '端侧', '百度', '谷歌', 'OpenAI', '英伟达', '黄仁勋', '光模块', '存储', 'HBM', 'AIDC', '半导体'].some(k => title.includes(k))) return '科技前沿';
    return '行业动态';
  }

  function parseRawTxt(text) {
    const pattern = /^【(\d+)】(\d{2}:\d{2})\s*-\s*(.+)$/gm;
    const matches = [];
    let m;
    while ((m = pattern.exec(text)) !== null) {
      matches.push({
        index: m.index,
        end: pattern.lastIndex,
        id: parseInt(m[1], 10),
        time: m[2],
        rawTitle: m[3].trim()
      });
    }
    const segments = [];
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const start = cur.end;
      const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
      let body = text.slice(start, end).replace(/^\n+|\n+$/g, '');
      body = body.replace(/^=+\s*$/gm, '').replace(/^\s*#最新段子#\s*$/gm, '').replace(WECHAT_STICKER_RE, '').trim();

      const title = cleanTitle(cur.rawTitle);
      const category = categorize(title);

      const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
      let dateNote = '';
      if (lines.length && lines[0].includes('· 第')) dateNote = lines[0];

      const sections = [];
      const secRe = /^(?:(#{2,4})\s+(.+)|\*\*(\d+[、.．]\s*[^*\n]{3,76})\*\*)\s*$/gm;
      let sm;
      while ((sm = secRe.exec(body)) !== null) {
        const secTitle = cleanTitle(sm[1] ? sm[2] : sm[3]);
        const lvl = sm[1] ? sm[1].length : 3;
        if (secTitle && secTitle.length < 88) sections.push({ level: lvl, title: secTitle });
      }

      segments.push(enrichNoteMeta({
        id: cur.id,
        time: cur.time,
        title,
        rawTitle: cur.rawTitle,
        category,
        dateNote,
        sections,
        content: body,
        charCount: body.length
      }));
    }
    return segments;
  }

  // ---------- 完整 Markdown 渲染（含 Apple 对比表格与高亮句支持） ----------
  function inlineFormat(text) {
    let s = escapeHtml(String(text || '').replace(WECHAT_STICKER_RE, ''));
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|[\s，。、；：•）(])#([^\s#，。、；：]{2,36})/g, '$1<span class="key-hash">#$2</span>');
    return s;
  }

  function splitTableCells(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map(c => c.trim());
  }

  function isTableDivider(line) {
    const t = line.trim();
    if (!t.includes('|') || !t.includes('-')) return false;
    const cells = splitTableCells(t);
    return cells.length > 0 && cells.every(c => /^:?-{2,}:?$/.test(c));
  }

  function renderMarkdown(md) {
    const cleanMd = String(md || '')
      .replace(/^\s*#最新段子#\s*$/gm, '')
      .replace(WECHAT_STICKER_RE, '');
    const lines = cleanMd.split('\n');
    const out = [];
    let listType = null, inCode = false, codeBuf = [];
    const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        if (inCode) {
          out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
          inCode = false; codeBuf = [];
        } else {
          closeList(); inCode = true;
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      const t = line.trim();
      if (!t) { closeList(); continue; }
      if (/^[-=]{3,}$/.test(t)) { closeList(); out.push('<hr>'); continue; }

      // Markdown 表格块识别
      if (t.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
        closeList();
        const headers = splitTableCells(t);
        const aligns = splitTableCells(lines[i + 1]).map(a => {
          if (a.startsWith(':') && a.endsWith(':')) return 'center';
          if (a.endsWith(':')) return 'right';
          return 'left';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().includes('|')) {
          rows.push(splitTableCells(lines[i]));
          i++;
        }
        i--;

        const thHtml = headers.map((h, idx) => `<th style="text-align:${aligns[idx] || 'left'}">${inlineFormat(h)}</th>`).join('');
        const bodyHtml = rows.map(r => {
          const tds = headers.map((_, idx) => {
            const rawCell = r[idx] ?? '';
            const plain = rawCell.replace(/\*\*/g, '').trim();
            let cls = '';
            if (/^\+\d+(\.\d+)?%?$/.test(plain)) cls = ' class="val-up"';
            else if (/^-\d+(\.\d+)?%?$/.test(plain)) cls = ' class="val-down"';
            return `<td${cls} style="text-align:${aligns[idx] || 'left'}">${inlineFormat(rawCell)}</td>`;
          }).join('');
          return `<tr>${tds}</tr>`;
        }).join('');

        out.push(`<div class="table-scroll"><table class="apple-table"><thead><tr>${thHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
        continue;
      }

      if (/^>\s?(.+)$/.test(t)) {
        closeList();
        out.push(`<blockquote>${inlineFormat(t.replace(/^>\s?/, ''))}</blockquote>`);
        continue;
      }

      const h = t.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        closeList();
        const lvl = Math.min(4, Math.max(2, h[1].length));
        out.push(`<h${lvl} id="sec-${i}">${inlineFormat(h[2])}</h${lvl}>`);
        continue;
      }

      const boldH = t.match(/^\*\*(\d+[、.．]\s*[^*]{3,76})\*\*$/);
      if (boldH) {
        closeList();
        out.push(`<h3 id="sec-${i}">${inlineFormat(boldH[1])}</h3>`);
        continue;
      }

      const ul = t.match(/^[-*•]\s+(.+)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${inlineFormat(ul[1])}</li>`);
        continue;
      }

      const ol = t.match(/^\d+[.、)]\s*(.+)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${inlineFormat(ol[1])}</li>`);
        continue;
      }

      closeList();
      const para = [t];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (!next || /^(#{1,4})\s|^\*\*\d+[、.．]\s*[^*]{3,76}\*\*$|^\s*```|^[-*•]\s|^\d+[.、)]|^[-=]{3,}$|^>\s?/.test(next)) break;
        if (next.includes('|') && i + 2 < lines.length && isTableDivider(lines[i + 2])) break;
        para.push(next);
        i++;
      }
      out.push(`<p>${inlineFormat(para.join(' '))}</p>`);
    }

    closeList();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    return out.join('\n');
  }

  function getExcerpt(content) {
    return String(content || '')
      .replace(/^.{0,44}·\s*第\s*\d+\/\d+\s*段[^\n]*\n?/, '')
      .replace(/^#{1,4}\s+.+$/gm, '')
      .replace(/^[-=]{3,}\s*$/gm, '')
      .replace(/^\|.*\|$/gm, '')
      .replace(/^\s*#最新段子#\s*$/gm, '')
      .replace(WECHAT_STICKER_RE, '')
      .replace(/\*\*|[#*`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 130) || '点击查看完整分析内容';
  }

  // ---------- 数据请求与多源容错 ----------
  async function fetchJson(url, ms = 4500) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  async function fetchText(url, ms = 5000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } finally { clearTimeout(timer); }
  }

  async function probeGithubDirectories() {
    try {
      const items = await fetchJson(`${GITHUB_REPO_API}/contents/`, 3500);
      if (Array.isArray(items)) {
        return items
          .filter(it => it.type === 'dir' && /^\d{4}-\d{2}-\d{2}$/.test(it.name))
          .map(it => it.name)
          .sort()
          .reverse();
      }
    } catch { /* ignore rate limit */ }
    return [];
  }

  async function loadIndex() {
    let foundDates = [];
    let indexObj = null;

    try {
      indexObj = await fetchJson('data/index.json', 3500);
      if (indexObj && Array.isArray(indexObj.dates) && indexObj.dates.length) {
        state.sourceMode = 'local';
        foundDates = indexObj.dates;
      }
    } catch { /* fallback */ }

    if (!foundDates.length) {
      try {
        indexObj = await fetchJson(`${GITHUB_RAW_BASE}/data/index.json`, 4500);
        if (indexObj && Array.isArray(indexObj.dates) && indexObj.dates.length) {
          state.sourceMode = 'github';
          foundDates = indexObj.dates;
        }
      } catch { /* fallback */ }
    }

    if (indexObj) {
      state.updatedAt = indexObj.updatedAt || '';
      if (indexObj.stats && typeof indexObj.stats === 'object') {
        Object.assign(state.dateMetaCache, indexObj.stats);
      }
    }

    // 探测是否有直接上传但尚未构建进 index.json 的新日期文件夹
    if (location.hostname.endsWith('github.io')) {
      try {
        const apiDates = await probeGithubDirectories();
        if (apiDates.length) {
          foundDates = Array.from(new Set([...foundDates, ...apiDates])).sort().reverse();
        }
      } catch { /* ignore */ }
    }

    if (!foundDates.length) {
      state.sourceMode = 'demo';
      $('#demoStrip').hidden = false;
      $('#chapterItems').innerHTML = `<div class="chapternav-loading">未检测到数据索引，请导入本地 JSON。</div>`;
      return;
    }

    $('#demoStrip').hidden = true;
    state.dates = foundDates;

    if (state.updatedAt) {
      $('#footerUpdatedText').textContent = `最近同步：${state.updatedAt}`;
    }

    // 支持 URL Hash 指定日期，如 #date=2026-11-24
    const hashMatch = location.hash.match(/date=(\d{4}-\d{2}-\d{2})/);
    const initialDate = (hashMatch && state.dates.includes(hashMatch[1])) ? hashMatch[1] : state.dates[0];

    renderChapterNav();
    await switchDate(initialDate);
  }

  async function loadDayData(date) {
    let data = null;
    const jsonPaths = state.sourceMode === 'local'
      ? [`data/dates/${date}.json`]
      : [`${GITHUB_RAW_BASE}/data/dates/${date}.json`, `data/dates/${date}.json`];

    for (const p of jsonPaths) {
      try {
        data = await fetchJson(p, 4500);
        if (data) break;
      } catch { /* next */ }
    }

    // Fallback：直接读取原始 .txt 解析
    if (!data) {
      const txtCandidates = [
        `data/dates/${date}.txt`,
        `${date}/${date}.txt`,
        `${date}.txt`,
        `${GITHUB_RAW_BASE}/data/dates/${date}.txt`,
        `${GITHUB_RAW_BASE}/${date}/${date}.txt`
      ];
      for (const tp of txtCandidates) {
        try {
          const txt = await fetchText(tp, 4500);
          if (txt && txt.trim()) {
            const parsedNotes = parseRawTxt(txt);
            data = {
              date,
              meta: { reportDate: date, noteCount: parsedNotes.length, pdfCount: 0, industries: [], brokers: [] },
              notes: parsedNotes,
              pdfs: []
            };
            break;
          }
        } catch { /* next */ }
      }
    }

    // Fallback：通过 GitHub API 动态探测该日期文件夹下的 PDF
    if (data && (!data.pdfs || data.pdfs.length === 0)) {
      try {
        const files = await fetchJson(`${GITHUB_REPO_API}/contents/${date}`, 3500);
        if (Array.isArray(files)) {
          const pdfList = [];
          for (const f of files) {
            if (f.name.toLowerCase().endsWith('.pdf')) {
              const stem = f.name.replace(/\.pdf$/i, '');
              const m = stem.match(/^\[([^\]]+)\]\s*(.+)$/);
              pdfList.push({
                id: f.sha ? f.sha.slice(0, 10) : f.name,
                filename: f.name,
                industry: m ? m[1].trim() : '其他',
                title: m ? m[2].trim() : stem,
                broker: '',
                size: f.size || 0,
                sizeMB: f.size ? Math.round(f.size / 1024 / 10.24) / 100 : 0,
                url: `${date}/${f.name}`
              });
            }
          }
          if (pdfList.length) {
            data.pdfs = pdfList;
            data.meta.pdfCount = pdfList.length;
            data.meta.industries = Array.from(new Set(pdfList.map(p => p.industry))).sort();
          }
        }
      } catch { /* ignore */ }
    }

    return data;
  }

  async function switchDate(date) {
    if (!date) return;
    try {
      const data = await loadDayData(date);
      if (!data) throw new Error('未找到该期数据');

      state.currentDate = date;
      const rawNotes = Array.isArray(data.notes) ? data.notes : [];
      const rawPdfs = Array.isArray(data.pdfs) ? data.pdfs : [];

      state.day = {
        date: data.date || date,
        meta: data.meta || {},
        notes: rawNotes.map(enrichNoteMeta),
        pdfs: state.sourceMode === 'github'
          ? rawPdfs.map(p => ({
              ...p,
              url: p.url && !/^https?:\/\//.test(p.url) ? `${GITHUB_RAW_BASE}/${p.url.replace(/^\.?\//, '')}` : p.url
            }))
          : rawPdfs
      };

      const brokers = Array.from(new Set(state.day.pdfs.map(p => p.broker).filter(Boolean))).sort();
      const industries = Array.from(new Set(state.day.pdfs.map(p => p.industry || '其他'))).sort();
      state.day.meta.brokers = brokers;
      state.day.meta.industries = industries;

      state.dateMetaCache[date] = {
        noteCount: state.day.notes.length,
        pdfCount: state.day.pdfs.length,
        industryCount: industries.length,
        brokerCount: brokers.length
      };

      // 重置筛选状态
      state.activeNoteCat = '全部';
      state.briefsExpanded = false;
      state.activeIndustry = '全部';
      state.activeBroker = '全部';

      renderChapterNav();
      renderHero();
      renderNoteCategoryPills();
      renderBriefs();
      renderReportFilters();
      renderReports();
      updateSearchStatusBar();
    } catch (err) {
      toast('加载失败：' + err.message);
    }
  }

  // ---------- 1. ChapterNav 期数条渲染 ----------
  function renderChapterNav() {
    const box = $('#chapterItems');
    if (!state.dates.length) return;

    const itemsHtml = state.dates.map((d, idx) => {
      const { m, d: dayStr } = parseDateParts(d);
      const isActive = d === state.currentDate;
      const isLatest = idx === 0;
      const meta = state.dateMetaCache[d];
      const subHtml = isLatest
        ? `<span class="chapter-new">最新</span>`
        : `<span class="chapter-sub">${weekday(d)}${meta && meta.pdfCount ? ` · ${meta.pdfCount}份` : ''}</span>`;

      return `
        <button type="button" class="chapter-item ${isActive ? 'active' : ''}" data-date="${escapeAttr(d)}" role="tab" aria-selected="${isActive}">
          <span class="chapter-cal" aria-hidden="true">
            <span class="chapter-cal-month">${m}月</span>
            <span class="chapter-cal-day">${dayStr}</span>
          </span>
          <span class="chapter-label">${formatShortDateCN(d)}</span>
          ${subHtml}
        </button>
      `;
    }).join('');

    const archiveBtnHtml = `
      <button type="button" class="chapter-item" id="chapterAllDatesBtn" aria-label="查看全部历史期数">
        <span class="chapter-archive-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
        </span>
        <span class="chapter-label">全部期数</span>
        <span class="chapter-sub">共 ${state.dates.length} 期</span>
      </button>
    `;

    box.innerHTML = itemsHtml + archiveBtnHtml;

    $$('[data-date]', box).forEach(btn => {
      btn.addEventListener('click', () => {
        const targetDate = btn.dataset.date;
        if (targetDate && targetDate !== state.currentDate) switchDate(targetDate);
      });
    });

    const allBtn = $('#chapterAllDatesBtn');
    if (allBtn) allBtn.addEventListener('click', openArchiveModal);

    requestAnimationFrame(updateChapterPaddles);
  }

  function updateChapterPaddles() {
    const box = $('#chapterItems');
    const prev = $('#chapterPrevPaddle');
    const next = $('#chapterNextPaddle');
    if (!box || !prev || !next) return;
    const hasOverflow = box.scrollWidth > box.clientWidth + 8;
    prev.hidden = !hasOverflow || box.scrollLeft <= 4;
    next.hidden = !hasOverflow || box.scrollLeft + box.clientWidth >= box.scrollWidth - 4;
  }

  // ---------- 2. Hero 概览渲染 ----------
  function renderHero() {
    const d = state.currentDate;
    const idx = state.dates.indexOf(d);
    const isLatest = idx === 0;

    $('#heroDateEyebrow').textContent = `${formatFullDateCN(d)} · ${weekday(d, true)}`;
    $('#heroLatestBadge').hidden = !isLatest;
    $('#heroHeadline').textContent = `${formatShortDateCN(d)}研报速览`;

    // dates 按最新在前排列：prevDayBtn 为较早一期 (idx + 1)，nextDayBtn 为较新一期 (idx - 1)
    $('#prevDayBtn').disabled = idx < 0 || idx >= state.dates.length - 1;
    $('#nextDayBtn').disabled = idx <= 0;

    const notesCnt = state.day.notes.length;
    const pdfsCnt = state.day.pdfs.length;
    const indCnt = (state.day.meta.industries || []).length;
    const brkCnt = (state.day.meta.brokers || []).length;

    $('#statNotes').textContent = notesCnt;
    $('#statPdfs').textContent = pdfsCnt;
    $('#statIndustries').textContent = indCnt;
    $('#statBrokers').textContent = brkCnt;
    $('#statBrokersWrap').hidden = brkCnt === 0;
  }

  // ---------- 3. 今日纪要 Bento 区 ----------
  function renderNoteCategoryPills() {
    const wrap = $('#noteCategoryPills');
    const notes = state.day ? state.day.notes : [];
    if (!notes.length) {
      wrap.innerHTML = '';
      return;
    }

    const counts = {};
    notes.forEach(n => {
      const c = n.category || '行业动态';
      counts[c] = (counts[c] || 0) + 1;
    });

    const preferredOrder = ['每日纪要', '市场复盘', '投资策略', '券商纪要', '科技前沿', '数据跟踪', '行业动态'];
    const orderedCats = Object.keys(counts).sort((a, b) => {
      const ia = preferredOrder.indexOf(a), ib = preferredOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const cats = ['全部', ...orderedCats];
    wrap.innerHTML = cats.map(cat => {
      const cnt = cat === '全部' ? notes.length : counts[cat];
      const active = state.activeNoteCat === cat ? 'active' : '';
      return `<button type="button" class="pill-tab ${active}" data-cat="${escapeAttr(cat)}" role="tab" aria-selected="${state.activeNoteCat === cat}">${escapeHtml(cat)}<span class="pill-tab-num">${cnt}</span></button>`;
    }).join('');

    $$('[data-cat]', wrap).forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeNoteCat = btn.dataset.cat;
        renderNoteCategoryPills();
        renderBriefs();
      });
    });
  }

  function getFilteredNotes() {
    if (!state.day || !Array.isArray(state.day.notes)) return [];
    let list = state.day.notes;
    if (state.activeNoteCat !== '全部') {
      list = list.filter(n => (n.category || '行业动态') === state.activeNoteCat);
    }
    const q = state.query.toLowerCase();
    if (q) {
      list = list.filter(n =>
        (n.displayTitle && n.displayTitle.toLowerCase().includes(q)) ||
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.content && n.content.toLowerCase().includes(q)) ||
        (n.category && n.category.toLowerCase().includes(q))
      );
    }
    return list;
  }

  function renderBriefs() {
    const grid = $('#briefsGrid');
    const moreWrap = $('#briefsMoreWrap');
    const toggleBtn = $('#toggleAllBriefsBtn');

    state.filteredNotes = getFilteredNotes();
    const total = state.filteredNotes.length;

    if (!total) {
      grid.innerHTML = `<div class="loading-card">${state.query ? '没有找到匹配该关键词的纪要' : '当期暂无纪要数据'}</div>`;
      moreWrap.hidden = true;
      return;
    }

    const shouldCollapse = state.activeNoteCat === '全部' && !state.query && total > DEFAULT_BRIEF_LIMIT;
    const visibleList = (shouldCollapse && !state.briefsExpanded)
      ? state.filteredNotes.slice(0, DEFAULT_BRIEF_LIMIT)
      : state.filteredNotes;

    if (shouldCollapse) {
      moreWrap.hidden = false;
      toggleBtn.textContent = state.briefsExpanded
        ? '收起部分纪要 ↑'
        : `展开全部 ${total} 篇纪要 ↓`;
    } else {
      moreWrap.hidden = true;
    }

    grid.innerHTML = visibleList.map((n, idx) => {
      const cat = n.category || '纪要';
      const secCount = Array.isArray(n.sections) ? n.sections.length : 0;
      const charK = ((n.charCount || (n.content || '').length) / 1000).toFixed(1);
      const statParts = [];
      if (secCount > 0) statParts.push(`${secCount} 个小节`);
      statParts.push(`${charK}k 字`);

      // 若有多个子标题，取第 2~3 个作为速览标签（第 1 个常已提炼进标题）
      const topicChips = (secCount > 1 ? n.sections.slice(1, 3) : [])
        .map(s => `<span class="topic-chip">${escapeHtml(cleanSectionHeading(s.title))}</span>`)
        .join('');

      return `
        <article class="bento-card" data-note-idx="${idx}" tabindex="0" role="button" aria-label="阅读纪要：${escapeAttr(n.displayTitle || n.title)}">
          <div class="bento-card-eyebrow">
            <div class="bento-badges">
              <span class="cat-pill" data-cat="${escapeAttr(cat)}">${escapeHtml(cat)}</span>
              ${n.seriesTag ? `<span class="series-micro">${escapeHtml(n.seriesTag)}</span>` : ''}
            </div>
            <span class="bento-time">${escapeHtml(n.time || '')}</span>
          </div>

          <h3 class="bento-title">${escapeHtml(n.displayTitle || n.title)}</h3>
          <p class="bento-excerpt">${escapeHtml(getExcerpt(n.content))}</p>

          ${topicChips ? `<div class="bento-topics">${topicChips}</div>` : ''}

          <div class="bento-foot">
            <span class="bento-stat">${escapeHtml(statParts.join(' · '))}</span>
            <span class="bento-plus" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </span>
          </div>
        </article>
      `;
    }).join('');

    $$('.bento-card', grid).forEach(card => {
      const open = () => openNoteModal(Number(card.dataset.noteIdx));
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  // ---------- 4. 研报原文库 ----------
  function renderReportFilters() {
    const pillsWrap = $('#industryPills');
    const brokerWrap = $('#brokerSelectWrap');
    const brokerSel = $('#brokerSelect');
    const pdfs = state.day ? state.day.pdfs : [];

    if (!pdfs.length) {
      pillsWrap.innerHTML = '';
      brokerWrap.hidden = true;
      return;
    }

    const indCounts = {};
    const brkCounts = {};
    pdfs.forEach(p => {
      const ind = p.industry || '其他';
      indCounts[ind] = (indCounts[ind] || 0) + 1;
      if (p.broker) brkCounts[p.broker] = (brkCounts[p.broker] || 0) + 1;
    });

    const industries = ['全部', ...Object.keys(indCounts).sort()];
    pillsWrap.innerHTML = industries.map(ind => {
      const cnt = ind === '全部' ? pdfs.length : indCounts[ind];
      const active = state.activeIndustry === ind ? 'active' : '';
      return `<button type="button" class="ind-pill ${active}" data-ind="${escapeAttr(ind)}" role="tab" aria-selected="${state.activeIndustry === ind}">${escapeHtml(ind)}<span class="ind-pill-cnt">${cnt}</span></button>`;
    }).join('');

    $$('[data-ind]', pillsWrap).forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeIndustry = btn.dataset.ind;
        renderReportFilters();
        renderReports();
      });
    });

    const brokers = Object.keys(brkCounts).sort();
    if (brokers.length > 0) {
      brokerWrap.hidden = false;
      brokerSel.innerHTML = `<option value="全部">全部机构 (${brokers.length})</option>` +
        brokers.map(b => `<option value="${escapeAttr(b)}" ${state.activeBroker === b ? 'selected' : ''}>${escapeHtml(b)} (${brkCounts[b]})</option>`).join('');
    } else {
      brokerWrap.hidden = true;
    }
  }

  function getFilteredPdfs() {
    if (!state.day || !Array.isArray(state.day.pdfs)) return [];
    let list = state.day.pdfs;
    if (state.activeIndustry !== '全部') {
      list = list.filter(p => (p.industry || '其他') === state.activeIndustry);
    }
    if (state.activeBroker !== '全部') {
      list = list.filter(p => p.broker === state.activeBroker);
    }
    const q = state.query.toLowerCase();
    if (q) {
      list = list.filter(p =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.industry && p.industry.toLowerCase().includes(q)) ||
        (p.broker && p.broker.toLowerCase().includes(q))
      );
    }
    return list;
  }

  function renderReports() {
    const showcase = $('#industryShowcase');
    const emptyState = $('#reportsEmptyState');
    const summaryBadge = $('#reportsSummaryBadge');

    state.filteredPdfs = getFilteredPdfs();
    const total = state.filteredPdfs.length;
    summaryBadge.textContent = `共 ${total} 份 PDF`;

    if (!state.day || !state.day.pdfs.length) {
      showcase.innerHTML = `<div class="loading-card">当期暂无研报 PDF 文件</div>`;
      emptyState.hidden = true;
      return;
    }

    if (!total) {
      showcase.innerHTML = '';
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    const groups = {};
    state.filteredPdfs.forEach(p => {
      const ind = p.industry || '其他';
      if (!groups[ind]) groups[ind] = [];
      groups[ind].push(p);
    });

    const flatRendered = [];
    showcase.innerHTML = Object.entries(groups).map(([ind, items]) => {
      const cardsHtml = items.map(p => {
        const idx = flatRendered.length;
        flatRendered.push(p);

        const dlLink = p.url
          ? `<a class="report-dl-link" href="${escapeAttr(p.url)}" download="${escapeAttr(p.filename || p.title + '.pdf')}" target="_blank" rel="noopener">下载 PDF ↓</a>`
          : '';

        return `
          <article class="report-card" data-pdf-idx="${idx}" tabindex="0" role="button" aria-label="在线阅读研报：${escapeAttr(p.title)}">
            <div class="report-card-body">
              <div class="report-card-eyebrow">
                <span class="report-ind-label">${escapeHtml(ind)}</span>
                ${p.broker ? `<span class="meta-dot">·</span><span class="report-broker-label">${escapeHtml(p.broker)}</span>` : ''}
                ${p.sizeMB ? `<span class="meta-dot">·</span><span>${p.sizeMB} MB</span>` : ''}
              </div>
              <h3 class="report-card-title">${escapeHtml(p.title)}</h3>
            </div>

            <div class="report-card-actions">
              <span class="report-read-btn">阅读原文</span>
              ${dlLink}
            </div>
          </article>
        `;
      }).join('');

      return `
        <div class="industry-group">
          <div class="industry-group-head">
            <h3 class="industry-group-title">${escapeHtml(ind)}</h3>
            <span class="industry-group-count">${items.length} 份报告</span>
          </div>
          <div class="report-cards-grid">${cardsHtml}</div>
        </div>
      `;
    }).join('');

    $$('.report-card', showcase).forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.report-dl-link')) return;
        const pdf = flatRendered[Number(card.dataset.pdfIdx)];
        if (pdf) openPdfStudio(pdf);
      });
      card.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.report-dl-link')) {
          e.preventDefault();
          const pdf = flatRendered[Number(card.dataset.pdfIdx)];
          if (pdf) openPdfStudio(pdf);
        }
      });
    });
  }

  function updateSearchStatusBar() {
    const bar = $('#searchStatusBar');
    const clearInputBtn = $('#searchClearBtn');
    const q = state.query;
    clearInputBtn.hidden = !q;

    if (!q) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    $('#searchStatusText').textContent = `搜索「${q}」：共找到 ${state.filteredNotes.length} 篇纪要、${state.filteredPdfs.length} 份研报原文`;
  }

  // ---------- 弹窗 1：Apple Sheet 纪要深度阅读器 ----------
  function openNoteModal(indexInFiltered) {
    if (indexInFiltered < 0 || indexInFiltered >= state.filteredNotes.length) return;
    state.activeNoteIndex = indexInFiltered;
    const note = state.filteredNotes[indexInFiltered];
    const cat = note.category || '纪要';

    const catEl = $('#drawerCat');
    catEl.textContent = cat;
    catEl.setAttribute('data-cat', cat);
    $('#drawerTime').textContent = `${state.currentDate} ${note.time || ''}`;
    $('#drawerPosBadge').textContent = `${indexInFiltered + 1} / ${state.filteredNotes.length}`;

    $('#prevNoteBtn').disabled = indexInFiltered <= 0;
    $('#nextNoteBtn').disabled = indexInFiltered >= state.filteredNotes.length - 1;

    let body = note.content || '';
    let topDateNote = note.dateNote || '';
    const dm = body.match(/^([^\n]*·\s*第\s*\d+\/\d+\s*段[^\n]*)\n?/);
    if (dm) {
      topDateNote = dm[1].trim();
      body = body.slice(dm[0].length);
    }

    // 若正文首个标题与卡片提炼的主标题完全一致，去掉重复的首行标题
    const shownTitle = note.displayTitle || note.title;
    const leadHeadingMatch = body.match(/^\s*#{1,4}\s+([^\n]+)\n?/);
    if (leadHeadingMatch && cleanTitle(leadHeadingMatch[1]) === cleanTitle(shownTitle)) {
      body = body.slice(leadHeadingMatch[0].length);
    }

    const articleEl = $('#noteArticleContent');
    articleEl.style.setProperty('--article-size', state.articleSize + 'px');

    const eyebrowHtml = (note.seriesTag && note.displayTitle !== note.title)
      ? `<div class="article-series-eyebrow">${escapeHtml(note.title)}</div>`
      : '';
    const dateNoteHtml = topDateNote
      ? `<div class="article-date-note">${escapeHtml(topDateNote)}</div>`
      : '';

    articleEl.innerHTML = `${eyebrowHtml}<h1 id="noteSheetTitle">${escapeHtml(note.displayTitle || note.title)}</h1>${dateNoteHtml}${renderMarkdown(body)}`;

    // 生成左侧目录
    const tocSidebar = $('#noteTocSidebar');
    const tocList = $('#noteTocList');
    const headings = $$('h2, h3', articleEl);
    if (headings.length >= 2) {
      tocSidebar.hidden = false;
      tocList.innerHTML = headings.map((h, i) => `
        <button type="button" class="toc-link level-${h.tagName === 'H3' ? '3' : '2'} ${i === 0 ? 'active' : ''}" data-target="${h.id}">
          ${escapeHtml(h.textContent)}
        </button>
      `).join('');

      $$('[data-target]', tocList).forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(btn.dataset.target);
          const stage = $('#noteScrollStage');
          if (target && stage) {
            state.tocClickLock = Date.now() + 500;
            const top = target.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop - 16;
            stage.scrollTo({ top, behavior: 'smooth' });
            $$('.toc-link', tocList).forEach(x => x.classList.remove('active'));
            btn.classList.add('active');
          }
        });
      });
    } else {
      tocSidebar.hidden = true;
    }

    // 底部上下篇导航卡片
    const pagerEl = $('#notePagerFooter');
    const prevNote = indexInFiltered > 0 ? state.filteredNotes[indexInFiltered - 1] : null;
    const nextNote = indexInFiltered < state.filteredNotes.length - 1 ? state.filteredNotes[indexInFiltered + 1] : null;
    if (prevNote || nextNote) {
      pagerEl.hidden = false;
      pagerEl.innerHTML = `
        ${prevNote ? `<button type="button" class="pager-card prev" id="pagerPrevCard"><span class="pager-label">← 上一篇</span><span class="pager-title">${escapeHtml(prevNote.displayTitle || prevNote.title)}</span></button>` : '<div></div>'}
        ${nextNote ? `<button type="button" class="pager-card next" id="pagerNextCard"><span class="pager-label">下一篇 →</span><span class="pager-title">${escapeHtml(nextNote.displayTitle || nextNote.title)}</span></button>` : '<div></div>'}
      `;
      const pPrev = $('#pagerPrevCard');
      const pNext = $('#pagerNextCard');
      if (pPrev) pPrev.addEventListener('click', () => openNoteModal(indexInFiltered - 1));
      if (pNext) pNext.addEventListener('click', () => openNoteModal(indexInFiltered + 1));
    } else {
      pagerEl.hidden = true;
    }

    const stage = $('#noteScrollStage');
    stage.scrollTop = 0;
    $('#noteProgress').style.width = '0%';
    openBackdrop('#noteModalOverlay');
  }

  function closeNoteModal() {
    closeBackdrop('#noteModalOverlay');
  }

  // ---------- 弹窗 2：PDF 原文阅读工作台 ----------
  function openPdfStudio(pdf) {
    state.activePdf = pdf;
    const sameIndCount = state.day.pdfs.filter(p => (p.industry || '其他') === (pdf.industry || '其他')).length;
    state.railMode = sameIndCount > 1 ? 'industry' : 'all';
    updateRailModeUI();
    selectPdfInStudio(pdf);
    openBackdrop('#pdfModalOverlay');
  }

  function updateRailModeUI() {
    $('#railSameIndBtn').classList.toggle('active', state.railMode === 'industry');
    $('#railAllFilteredBtn').classList.toggle('active', state.railMode === 'all');
  }

  function renderStudioRail() {
    if (!state.activePdf || !state.day) return;
    const ind = state.activePdf.industry || '其他';
    const list = state.railMode === 'industry'
      ? state.day.pdfs.filter(p => (p.industry || '其他') === ind)
      : (state.filteredPdfs.length ? state.filteredPdfs : state.day.pdfs);

    $('#pdfRailCount').textContent = `${list.length} 份`;
    const railBox = $('#pdfRailList');
    railBox.innerHTML = list.map((p, idx) => {
      const isCurrent = p.filename === state.activePdf.filename && p.title === state.activePdf.title;
      return `
        <button type="button" class="rail-pdf-item ${isCurrent ? 'active' : ''}" data-rail-idx="${idx}">
          <span class="rail-pdf-title">${escapeHtml(p.title)}</span>
          <span class="rail-pdf-sub">${escapeHtml([p.industry, p.broker, p.sizeMB ? p.sizeMB + ' MB' : ''].filter(Boolean).join(' · '))}</span>
        </button>
      `;
    }).join('');

    $$('[data-rail-idx]', railBox).forEach(btn => {
      btn.addEventListener('click', () => {
        const chosen = list[Number(btn.dataset.railIdx)];
        if (chosen) selectPdfInStudio(chosen);
      });
    });
  }

  function selectPdfInStudio(pdf) {
    state.activePdf = pdf;
    $('#pdfStageTitle').textContent = pdf.title || '研报原文';
    $('#pdfStageSub').textContent = [pdf.industry || '其他', pdf.broker, pdf.sizeMB ? `${pdf.sizeMB} MB` : ''].filter(Boolean).join(' · ');

    renderStudioRail();

    const frame = $('#pdfFrame');
    const placeholder = $('#pdfPlaceholder');
    const openBtn = $('#pdfOpenNewBtn');
    const dlBtn = $('#pdfDownloadBtn');
    const mobileLink = $('#mobilePdfOpenLink');

    if (pdf.url) {
      const encodedUrl = encodeURI(pdf.url);
      frame.hidden = false;
      placeholder.hidden = true;
      frame.src = encodedUrl;
      openBtn.href = encodedUrl;
      openBtn.hidden = false;
      dlBtn.href = encodedUrl;
      dlBtn.setAttribute('download', pdf.filename || `${pdf.title}.pdf`);
      dlBtn.hidden = false;
      if (mobileLink) mobileLink.href = encodedUrl;
    } else {
      frame.src = '';
      frame.hidden = true;
      placeholder.hidden = false;
      $('#pdfPlaceholderTitle').textContent = pdf.title || '暂无 PDF';
      openBtn.hidden = true;
      dlBtn.hidden = true;
    }
  }

  function closePdfStudio() {
    closeBackdrop('#pdfModalOverlay');
    $('#pdfFrame').src = '';
  }

  // ---------- 弹窗 3：全部历史期数归档面板 ----------
  function openArchiveModal() {
    state.archiveQuery = '';
    $('#archiveSearchInput').value = '';
    renderArchiveList();
    openBackdrop('#archiveModalOverlay');
    setTimeout(() => $('#archiveSearchInput').focus(), 60);
  }

  function closeArchiveModal() {
    closeBackdrop('#archiveModalOverlay');
  }

  function renderArchiveList() {
    const q = state.archiveQuery.toLowerCase();
    const list = state.dates.filter(d => {
      if (!q) return true;
      return d.includes(q) || formatShortDateCN(d).includes(q) || weekday(d).includes(q) || weekday(d, true).includes(q);
    });

    $('#archiveTotalCount').textContent = `${list.length} 期`;
    const box = $('#archiveList');

    if (!list.length) {
      box.innerHTML = `<div class="loading-card">没有匹配的期数</div>`;
      return;
    }

    box.innerHTML = list.map(d => {
      const isActive = d === state.currentDate;
      const isLatest = d === state.dates[0];
      const meta = state.dateMetaCache[d];
      const statStr = meta
        ? `${meta.pdfCount ?? 0} 份研报 · ${meta.noteCount ?? 0} 篇纪要`
        : '点击切换查阅';

      return `
        <button type="button" class="archive-row ${isActive ? 'active' : ''}" data-arch-date="${escapeAttr(d)}">
          <div class="archive-row-left">
            <span class="archive-row-date">${d}</span>
            <span class="archive-row-wk">${weekday(d)}</span>
            ${isLatest ? `<span class="hero-new-tag">最新</span>` : ''}
          </div>
          <span class="archive-row-right">${escapeHtml(statStr)}</span>
        </button>
      `;
    }).join('');

    $$('[data-arch-date]', box).forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.archDate;
        closeArchiveModal();
        if (d && d !== state.currentDate) switchDate(d);
      });
    });
  }

  // ---------- 模态框公共控制 ----------
  function openBackdrop(sel) {
    const el = $(sel);
    if (!el) return;
    el.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeBackdrop(sel) {
    const el = $(sel);
    if (!el) return;
    el.hidden = true;
    if ($('#noteModalOverlay').hidden && $('#pdfModalOverlay').hidden && $('#archiveModalOverlay').hidden) {
      document.body.style.overflow = '';
    }
  }

  // ---------- 主题与偏好设置 ----------
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      $('#metaThemeColor').setAttribute('content', '#161617');
    } else {
      document.documentElement.removeAttribute('data-theme');
      $('#metaThemeColor').setAttribute('content', '#fbfbfd');
    }
  }

  function initPrefs() {
    const savedTheme = storageGet(KEYS.theme, 'light');
    applyTheme(savedTheme);
    const fs = parseFloat(storageGet(KEYS.fontSize, '16'));
    if (!isNaN(fs) && fs >= 13 && fs <= 21) state.articleSize = fs;
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    // 主题切换
    $('#themeToggle').addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      applyTheme(next);
      storageSet(KEYS.theme, next);
    });

    // 导航“期数归档”
    $('#openArchiveNavBtn').addEventListener('click', openArchiveModal);
    $('#closeArchiveModalBtn').addEventListener('click', closeArchiveModal);
    $('#archiveModalOverlay').addEventListener('click', e => { if (e.target === $('#archiveModalOverlay')) closeArchiveModal(); });
    $('#archiveSearchInput').addEventListener('input', e => {
      state.archiveQuery = e.target.value.trim();
      renderArchiveList();
    });

    // ChapterNav 左右滚动按钮
    const chItems = $('#chapterItems');
    $('#chapterPrevPaddle').addEventListener('click', () => { chItems.scrollBy({ left: -280, behavior: 'smooth' }); });
    $('#chapterNextPaddle').addEventListener('click', () => { chItems.scrollBy({ left: 280, behavior: 'smooth' }); });
    chItems.addEventListener('scroll', updateChapterPaddles, { passive: true });
    window.addEventListener('resize', updateChapterPaddles, { passive: true });

    // Hero 前后期数快速切换
    $('#prevDayBtn').addEventListener('click', () => {
      const idx = state.dates.indexOf(state.currentDate);
      if (idx >= 0 && idx < state.dates.length - 1) switchDate(state.dates[idx + 1]);
    });
    $('#nextDayBtn').addEventListener('click', () => {
      const idx = state.dates.indexOf(state.currentDate);
      if (idx > 0) switchDate(state.dates[idx - 1]);
    });

    // 全站搜索与清空
    const clearSearch = () => {
      state.query = '';
      $('#searchInput').value = '';
      renderBriefs();
      renderReports();
      updateSearchStatusBar();
    };
    $('#searchInput').addEventListener('input', e => {
      state.query = e.target.value.trim();
      renderBriefs();
      renderReports();
      updateSearchStatusBar();
    });
    $('#searchClearBtn').addEventListener('click', clearSearch);
    $('#clearSearchStatusBtn').addEventListener('click', clearSearch);

    // 展开/收起全部纪要
    $('#toggleAllBriefsBtn').addEventListener('click', () => {
      state.briefsExpanded = !state.briefsExpanded;
      renderBriefs();
      if (!state.briefsExpanded) {
        $('#section-briefs').scrollIntoView({ behavior: 'smooth' });
      }
    });

    // 研报机构筛选与重置
    $('#brokerSelect').addEventListener('change', e => {
      state.activeBroker = e.target.value;
      renderReports();
    });
    $('#resetFiltersBtn').addEventListener('click', () => {
      state.activeIndustry = '全部';
      state.activeBroker = '全部';
      state.query = '';
      $('#searchInput').value = '';
      renderBriefs();
      renderReportFilters();
      renderReports();
      updateSearchStatusBar();
    });

    // 纪要阅读器弹窗事件
    $('#closeNoteModalBtn').addEventListener('click', closeNoteModal);
    $('#noteModalOverlay').addEventListener('click', e => { if (e.target === $('#noteModalOverlay')) closeNoteModal(); });
    $('#prevNoteBtn').addEventListener('click', () => openNoteModal(state.activeNoteIndex - 1));
    $('#nextNoteBtn').addEventListener('click', () => openNoteModal(state.activeNoteIndex + 1));
    $('#fontDecBtn').addEventListener('click', () => {
      state.articleSize = Math.max(13, state.articleSize - 1);
      $('#noteArticleContent').style.setProperty('--article-size', state.articleSize + 'px');
      storageSet(KEYS.fontSize, String(state.articleSize));
    });
    $('#fontIncBtn').addEventListener('click', () => {
      state.articleSize = Math.min(21, state.articleSize + 1);
      $('#noteArticleContent').style.setProperty('--article-size', state.articleSize + 'px');
      storageSet(KEYS.fontSize, String(state.articleSize));
    });
    $('#copyNoteBtn').addEventListener('click', () => {
      const n = state.filteredNotes[state.activeNoteIndex];
      if (n) copyText(`${n.displayTitle || n.title}\n\n${n.content}`);
    });
    $('#noteScrollStage').addEventListener('scroll', e => {
      const el = e.target;
      const pct = el.scrollHeight > el.clientHeight ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100 : 100;
      $('#noteProgress').style.width = pct + '%';

      // 目录滚动高亮同步
      const tocSidebar = $('#noteTocSidebar');
      if (!tocSidebar.hidden && (!state.tocClickLock || Date.now() > state.tocClickLock)) {
        const heads = $$('h2, h3', $('#noteArticleContent'));
        const stageTop = el.getBoundingClientRect().top;
        let currentId = heads[0] ? heads[0].id : '';
        for (const h of heads) {
          if (h.getBoundingClientRect().top - stageTop <= 96) currentId = h.id;
        }
        $$('.toc-link', tocSidebar).forEach(link => {
          link.classList.toggle('active', link.dataset.target === currentId);
        });
      }
    }, { passive: true });

    // PDF 工作台事件
    $('#closePdfModalBtn').addEventListener('click', closePdfStudio);
    $('#pdfModalOverlay').addEventListener('click', e => { if (e.target === $('#pdfModalOverlay')) closePdfStudio(); });
    $('#toggleRailBtn').addEventListener('click', () => $('#pdfRail').classList.toggle('collapsed'));
    $('#railSameIndBtn').addEventListener('click', () => { state.railMode = 'industry'; updateRailModeUI(); renderStudioRail(); });
    $('#railAllFilteredBtn').addEventListener('click', () => { state.railMode = 'all'; updateRailModeUI(); renderStudioRail(); });

    // 本地离线导入 JSON 兜底
    $('#importJsonBtn').addEventListener('click', () => $('#jsonFileInput').click());
    $('#jsonFileInput').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const d = parsed.date || '本地预览';
          state.dates = [d];
          state.currentDate = d;
          state.day = {
            date: d,
            meta: parsed.meta || {},
            notes: (parsed.notes || []).map(enrichNoteMeta),
            pdfs: parsed.pdfs || []
          };
          $('#demoStrip').hidden = true;
          renderChapterNav();
          renderHero();
          renderNoteCategoryPills();
          renderBriefs();
          renderReportFilters();
          renderReports();
          toast('已加载本地 JSON 数据');
        } catch {
          toast('JSON 文件格式无法解析');
        }
      };
      reader.readAsText(file);
    });

    // 回到顶部与滚动监听
    const topBtn = $('#backToTopBtn');
    window.addEventListener('scroll', () => {
      topBtn.classList.toggle('visible', window.scrollY > 460);
    }, { passive: true });
    topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 全局键盘快捷键
    document.addEventListener('keydown', e => {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.key === '/' && !inInput) {
        e.preventDefault();
        $('#searchInput').focus();
      } else if (e.key === 'Escape') {
        if (!$('#pdfModalOverlay').hidden) closePdfStudio();
        else if (!$('#noteModalOverlay').hidden) closeNoteModal();
        else if (!$('#archiveModalOverlay').hidden) closeArchiveModal();
        else if (inInput) document.activeElement.blur();
      } else if (!$('#noteModalOverlay').hidden && !inInput) {
        if (e.key === 'ArrowLeft' && state.activeNoteIndex > 0) {
          e.preventDefault();
          openNoteModal(state.activeNoteIndex - 1);
        } else if (e.key === 'ArrowRight' && state.activeNoteIndex < state.filteredNotes.length - 1) {
          e.preventDefault();
          openNoteModal(state.activeNoteIndex + 1);
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPrefs();
    bindEvents();
    loadIndex();
  });
})();
