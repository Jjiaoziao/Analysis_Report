/* ============ 研报速览 · 可伸拉左侧栏 + 极简阅读交互 v5 ============ */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Jjiaoziao/Analysis_Report/main';
  const GITHUB_REPO_API = 'https://api.github.com/repos/Jjiaoziao/Analysis_Report';
  const KEYS = {
    theme: 'yb-theme-v5',
    fontSize: 'yb-font-v5',
    sidebarWidth: 'yb-sidebar-w',
    sidebarCollapsed: 'yb-sidebar-collapsed'
  };

  // 内置示例数据（断网或本地预览完全无数据时兜底）
  const DEMO_DATA = {
    dates: ['2026-11-17', '2026-11-16'],
    days: {}
  };

  const state = {
    sourceMode: 'local', // 'local' | 'github' | 'demo'
    dates: [],
    dateMetaCache: {}, // { '2026-11-17': { noteCount, pdfCount } }
    dateFilter: '',
    currentDate: null,
    day: null,
    activeIndustry: '全部',
    query: '',
    briefCollapsed: false,
    articleSize: 15.5,
    activeNote: null,
    activePdf: null,
    railPdfs: []
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
  function formatDate(s) {
    if (!s) return '—';
    const p = s.split('-');
    return p.length === 3 ? `${p[0]}.${p[1]}.${p[2]}` : s;
  }
  function weekday(s) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }
  function toast(msg) {
    const wrap = $('#toastWrap');
    wrap.innerHTML = `<div class="toast">${escapeHtml(msg)}</div>`;
    setTimeout(() => { wrap.innerHTML = ''; }, 2400);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('已复制内容')).catch(() => fallbackCopy(text));
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
      toast('已复制内容');
    } catch { toast('复制失败'); }
  }

  // ---------- 前端原生 TXT 实时解析引擎（实现“直接读上传的原始文件”） ----------
  const EMOJI_RE = /[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u27BF\uFE0F\u2190-\u21FF\u2B00-\u2BFF]/g;
  function cleanTitle(raw) {
    let t = raw.replace(EMOJI_RE, '');
    t = t.replace(/^#+\s*/, '');
    t = t.replace(/\s+/g, ' ').trim();
    return t || '未命名';
  }
  function categorize(title) {
    if (title.includes('研报纪要')) return '每日纪要';
    if (title.includes('复盘报告') || title.includes('复盘')) return '市场复盘';
    if (title.includes('券商纪要') || title.includes('场深挖')) return '券商纪要';
    if (['周观点', '投资逻辑', '策略', '布局', '配置'].some(k => title.includes(k))) return '投资策略';
    if (['批价', '库存', '数据跟踪', '数据库'].some(k => title.includes(k))) return '数据跟踪';
    if (['AI', '算力', '机器人', '端侧', '百度', '谷歌', 'OpenAI'].some(k => title.includes(k))) return '科技前沿';
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
      body = body.replace(/^=+\s*$/gm, '').trim();

      const title = cleanTitle(cur.rawTitle);
      const category = categorize(title);

      const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
      let dateNote = '';
      if (lines.length && lines[0].includes('· 第')) {
        dateNote = lines[0];
      }

      const sections = [];
      const secRe = /^(#{2,4})\s+(.+)$/gm;
      let sm;
      while ((sm = secRe.exec(body)) !== null) {
        const secTitle = cleanTitle(sm[2]);
        if (secTitle && secTitle.length < 80) {
          sections.push({ level: sm[1].length, title: secTitle });
        }
      }

      segments.push({
        id: cur.id,
        time: cur.time,
        title,
        rawTitle: cur.rawTitle,
        category,
        dateNote,
        sections,
        content: body,
        charCount: body.length
      });
    }
    return segments;
  }

  // ---------- Markdown 渲染 ----------
  function inlineFormat(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|[\s，。、])#([^\s#，。、]{1,24})/g, '$1<span class="hash">#$2</span>');
    return s;
  }
  function renderMarkdown(md) {
    const lines = String(md || '').split('\n');
    const out = [];
    let listType = null, inCode = false, codeBuf = [];
    const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        if (inCode) { out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>'); inCode = false; codeBuf = []; }
        else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }
      const t = line.trim();
      if (!t) { closeList(); continue; }
      if (/^[-=]{3,}$/.test(t)) { closeList(); out.push('<hr>'); continue; }
      if (/^>\s?(.+)$/.test(t)) { closeList(); out.push(`<blockquote>${inlineFormat(t.replace(/^>\s?/, ''))}</blockquote>`); continue; }
      const h = t.match(/^(#{1,4})\s+(.+)$/);
      if (h) { closeList(); out.push(`<h${h[1].length} id="h-${i}">${inlineFormat(h[2])}</h${h[1].length}>`); continue; }
      const ul = t.match(/^[-*•]\s+(.+)$/);
      if (ul) { if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; } out.push(`<li>${inlineFormat(ul[1])}</li>`); continue; }
      const ol = t.match(/^\d+[.、)]\s*(.+)$/);
      if (ol) { if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; } out.push(`<li>${inlineFormat(ol[1])}</li>`); continue; }
      closeList();
      const para = [t];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (!next || /^(#{1,4})\s|^\s*```|^[-*•]\s|^\d+[.、)]|^[-=]{3,}$|^>\s?/.test(next)) break;
        para.push(next); i++;
      }
      out.push(`<p>${inlineFormat(para.join(' '))}</p>`);
    }
    closeList();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    return out.join('\n');
  }
  function getExcerpt(content) {
    return String(content || '')
      .replace(/^.{0,40}·\s*第\s*\d+\/\d+\s*段[^\n]*\n?/, '')
      .replace(/^#{1,4}\s+.+$/gm, '')
      .replace(/\*\*|[#*`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 110) || '点击阅读完整总结';
  }

  // ---------- 数据加载与智能容错 ----------
  async function fetchJson(url, ms = 4000) {
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

  // 尝试通过 GitHub API 自动探测用户直接上传的新文件夹
  async function probeGithubDirectories() {
    try {
      const items = await fetchJson(`${GITHUB_REPO_API}/contents/`, 3500);
      if (Array.isArray(items)) {
        const discovered = [];
        for (const item of items) {
          if (item.type === 'dir' && /^\d{4}-\d{2}-\d{2}$/.test(item.name)) {
            discovered.push(item.name);
          }
        }
        return discovered.sort().reverse();
      }
    } catch { /* ignore rate limits */ }
    return [];
  }

  async function loadIndex() {
    let foundDates = [];

    // 1. 尝试读本地 data/index.json
    try {
      const idx = await fetchJson('data/index.json', 3000);
      if (idx && Array.isArray(idx.dates) && idx.dates.length) {
        state.sourceMode = 'local';
        foundDates = idx.dates;
      }
    } catch { /* fallback */ }

    // 2. 若本地无，尝试读 GitHub RAW data/index.json
    if (!foundDates.length) {
      try {
        const idx = await fetchJson(`${GITHUB_RAW_BASE}/data/index.json`, 4000);
        if (idx && Array.isArray(idx.dates) && idx.dates.length) {
          state.sourceMode = 'github';
          foundDates = idx.dates;
        }
      } catch { /* fallback */ }
    }

    // 3. 动态探测：如果有新上传但还没写入 index.json 的目录，合并进来
    try {
      const apiDates = await probeGithubDirectories();
      if (apiDates.length) {
        const merged = Array.from(new Set([...foundDates, ...apiDates]));
        merged.sort().reverse();
        foundDates = merged;
      }
    } catch { /* ignore */ }

    // 4. 兜底
    if (!foundDates.length) {
      foundDates = DEMO_DATA.dates.slice();
      state.sourceMode = 'demo';
      $('#demoStrip').hidden = false;
    } else {
      $('#demoStrip').hidden = true;
    }

    state.dates = foundDates;
    renderSidebarDates();
    if (state.dates.length) {
      await switchDate(state.dates[0]);
    }
  }

  // 加载某一天的数据（支持 .json 优先 + 自动 fallback 直接解析 .txt）
  async function loadDayData(date) {
    let data = null;

    // A. 尝试加载 data/dates/{date}.json
    const jsonPaths = state.sourceMode === 'local'
      ? [`data/dates/${date}.json`]
      : [`${GITHUB_RAW_BASE}/data/dates/${date}.json`, `data/dates/${date}.json`];

    for (const p of jsonPaths) {
      try {
        data = await fetchJson(p, 4000);
        if (data) break;
      } catch { /* try next */ }
    }

    // B. 若未找到 json，直接尝试加载原始上传的 txt 文件实时解析！
    if (!data) {
      const txtCandidates = [
        `data/dates/${date}.txt`,
        `${date}/${date}.txt`,
        `${date}.txt`,
        `${GITHUB_RAW_BASE}/data/dates/${date}.txt`,
        `${GITHUB_RAW_BASE}/${date}/${date}.txt`,
        `${GITHUB_RAW_BASE}/${date}.txt`
      ];
      for (const tp of txtCandidates) {
        try {
          const txt = await fetchText(tp, 4000);
          if (txt && txt.trim()) {
            const parsedNotes = parseRawTxt(txt);
            data = {
              date,
              meta: {
                reportDate: date,
                noteCount: parsedNotes.length,
                pdfCount: 0,
                industries: [],
                brokers: []
              },
              notes: parsedNotes,
              pdfs: []
            };
            toast(`已直接读取原始文本：${date}.txt`);
            break;
          }
        } catch { /* continue */ }
      }
    }

    // C. 尝试通过 GitHub API 直接读取上传文件夹中的所有 PDF 文件（实现真正零配置上传）
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

    return data || DEMO_DATA.days[date];
  }

  async function switchDate(date) {
    if (!date) return;
    try {
      const data = await loadDayData(date);
      if (!data) throw new Error('数据不存在');

      state.currentDate = date;
      state.day = {
        date: data.date || date,
        meta: data.meta || {},
        notes: Array.isArray(data.notes) ? data.notes : [],
        pdfs: Array.isArray(data.pdfs) ? data.pdfs : []
      };

      // 调整 PDF 线上 URL
      if (state.sourceMode === 'github' && state.day.pdfs) {
        state.day.pdfs = state.day.pdfs.map(p => ({
          ...p,
          url: p.url && !/^https?:\/\//.test(p.url) ? `${GITHUB_RAW_BASE}/${p.url.replace(/^\.?\//, '')}` : p.url
        }));
      }

      // 缓存该日期的计数以更新左侧栏 badge
      state.dateMetaCache[date] = {
        noteCount: state.day.notes.length,
        pdfCount: state.day.pdfs.length
      };

      state.activeIndustry = '全部';
      state.query = '';
      $('#searchInput').value = '';
      $('#editionDateTag').textContent = `${formatDate(date)} ${weekday(date)}`;
      $('#briefCountBadge').textContent = `${state.day.notes.length} 条纪要`;

      renderSidebarDates();
      renderBriefs();
      renderIndustryTabs();
      renderReports();

      // 移动端自动收起侧边栏
      closeMobileSidebar();
    } catch (err) {
      toast('加载失败：' + err.message);
    }
  }

  // ---------- 左侧侧边栏渲染与交互 ----------
  function renderSidebarDates() {
    const listEl = $('#dateList');
    const filter = (state.dateFilter || '').toLowerCase().trim();

    let datesToShow = state.dates;
    if (filter) {
      datesToShow = datesToShow.filter(d => {
        const wk = weekday(d).toLowerCase();
        return d.includes(filter) || wk.includes(filter);
      });
    }

    $('#sidebarDateCount').textContent = `${datesToShow.length} 期`;

    if (!datesToShow.length) {
      listEl.innerHTML = `<div class="skeleton-line-sm">无匹配期数</div>`;
      return;
    }

    listEl.innerHTML = datesToShow.map((d, idx) => {
      const isActive = d === state.currentDate;
      const isLatest = idx === 0 && !filter;
      const meta = state.dateMetaCache[d];
      const wk = weekday(d);

      let statText = '';
      if (meta) {
        statText = `<span class="date-item-stat">${meta.pdfCount} 篇研报</span> · <span class="date-item-stat">${meta.noteCount} 条纪要</span>`;
      } else {
        statText = `<span class="date-item-stat">点击查看</span>`;
      }

      return `
        <button type="button" class="date-item ${isActive ? 'active' : ''}" data-date="${escapeAttr(d)}">
          <div class="date-item-top">
            <span class="date-item-date">
              ${d}
              ${isLatest ? `<span class="date-latest-badge">最新</span>` : ''}
            </span>
            <span class="date-item-weekday">${wk}</span>
          </div>
          <div class="date-item-bottom">
            ${statText}
          </div>
        </button>
      `;
    }).join('');

    $$('[data-date]', listEl).forEach(btn => {
      btn.addEventListener('click', () => {
        const d = btn.dataset.date;
        if (d && d !== state.currentDate) switchDate(d);
      });
    });
  }

  // 侧边栏拖拽拉伸
  function initSidebarResizer() {
    const resizer = $('#sidebarResizer');
    const layout = $('#appLayout');
    let startX = 0;
    let startW = 270;

    // 恢复历史宽度
    const savedW = parseInt(storageGet(KEYS.sidebarWidth, '270'), 10);
    if (!isNaN(savedW) && savedW >= 210 && savedW <= 500) {
      document.documentElement.style.setProperty('--sidebar-w', savedW + 'px');
    }

    // 恢复折叠状态
    const collapsed = storageGet(KEYS.sidebarCollapsed, '0') === '1';
    if (collapsed && window.innerWidth > 900) {
      layout.classList.add('sidebar-collapsed');
    }

    resizer.addEventListener('mousedown', e => {
      e.preventDefault();
      startX = e.clientX;
      const currentCssW = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w');
      startW = parseInt(currentCssW, 10) || 270;
      document.body.classList.add('is-resizing');

      const onMouseMove = ev => {
        const delta = ev.clientX - startX;
        let newW = startW + delta;
        newW = Math.max(210, Math.min(newW, 500));
        document.documentElement.style.setProperty('--sidebar-w', newW + 'px');
      };

      const onMouseUp = ev => {
        document.body.classList.remove('is-resizing');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        const finalW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
        storageSet(KEYS.sidebarWidth, String(finalW));
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  function toggleSidebarCollapse() {
    const layout = $('#appLayout');
    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      layout.classList.toggle('mobile-sidebar-open');
    } else {
      const willCollapse = !layout.classList.contains('sidebar-collapsed');
      layout.classList.toggle('sidebar-collapsed', willCollapse);
      storageSet(KEYS.sidebarCollapsed, willCollapse ? '1' : '0');
    }
  }

  function closeMobileSidebar() {
    if (window.innerWidth <= 900) {
      $('#appLayout').classList.remove('mobile-sidebar-open');
    }
  }

  // ---------- 每日 AI 总结卡片渲染 ----------
  function renderBriefs() {
    const grid = $('#aiBriefGrid');
    if (!state.day || !Array.isArray(state.day.notes) || !state.day.notes.length) {
      grid.innerHTML = `<div class="skeleton-line">暂无当日纪要总结</div>`;
      return;
    }

    let notes = state.day.notes;
    const q = state.query.toLowerCase();
    if (q) {
      notes = notes.filter(n =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.content && n.content.toLowerCase().includes(q)) ||
        (n.category && n.category.toLowerCase().includes(q))
      );
    }

    if (!notes.length) {
      grid.innerHTML = `<div class="skeleton-line">没有匹配关键词的纪要</div>`;
      return;
    }

    grid.innerHTML = notes.map((n, idx) => `
      <article class="brief-card" data-note-idx="${idx}">
        <div class="brief-card-top">
          <span class="note-cat-tag">${escapeHtml(n.category || '纪要')}</span>
          <span class="brief-time">${escapeHtml(n.time || '')}</span>
        </div>
        <h3 class="brief-title">${escapeHtml(n.title)}</h3>
        <p class="brief-excerpt">${escapeHtml(getExcerpt(n.content))}</p>
      </article>
    `).join('');

    $$('.brief-card', grid).forEach(card => {
      card.addEventListener('click', () => {
        const n = notes[Number(card.dataset.noteIdx)];
        if (n) openNoteDrawer(n);
      });
    });
  }

  // ---------- 行业分类 Tabs ----------
  function renderIndustryTabs() {
    const tabsContainer = $('#industryTabs');
    if (!state.day || !Array.isArray(state.day.pdfs)) {
      tabsContainer.innerHTML = '';
      return;
    }

    const counts = {};
    for (const p of state.day.pdfs) {
      const ind = p.industry || '其他';
      counts[ind] = (counts[ind] || 0) + 1;
    }

    const industries = ['全部', ...Object.keys(counts).sort()];
    tabsContainer.innerHTML = industries.map(ind => {
      const cnt = ind === '全部' ? state.day.pdfs.length : counts[ind] || 0;
      const active = ind === state.activeIndustry ? 'active' : '';
      return `
        <button type="button" class="ind-tab ${active}" data-ind="${escapeAttr(ind)}" role="tab">
          ${escapeHtml(ind)}<span class="ind-tab-cnt">${cnt}</span>
        </button>
      `;
    }).join('');

    $$('[data-ind]', tabsContainer).forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeIndustry = btn.dataset.ind;
        renderIndustryTabs();
        renderReports();
      });
    });
  }

  // ---------- 研报列表渲染 ----------
  function renderReports() {
    const container = $('#industryGroups');
    const empty = $('#emptyState');
    if (!state.day || !Array.isArray(state.day.pdfs) || !state.day.pdfs.length) {
      container.innerHTML = `<div class="skeleton-line">暂无研报原文</div>`;
      empty.hidden = true;
      $('#reportsCount').textContent = '0 份研报';
      return;
    }

    let pdfs = state.day.pdfs;
    if (state.activeIndustry !== '全部') {
      pdfs = pdfs.filter(p => (p.industry || '其他') === state.activeIndustry);
    }
    const q = state.query.toLowerCase();
    if (q) {
      pdfs = pdfs.filter(p =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.broker && p.broker.toLowerCase().includes(q)) ||
        (p.industry && p.industry.toLowerCase().includes(q))
      );
    }

    $('#reportsCount').textContent = `${pdfs.length} 份研报`;

    if (!pdfs.length) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    // 按行业分组
    const groups = {};
    for (const p of pdfs) {
      const ind = p.industry || '其他';
      if (!groups[ind]) groups[ind] = [];
      groups[ind].push(p);
    }

    const flatList = [];
    container.innerHTML = Object.entries(groups).map(([ind, items]) => {
      const cardsHtml = items.map(p => {
        const idx = flatList.length;
        flatList.push(p);
        const dlHtml = p.url
          ? `<a class="dl-icon-btn" href="${escapeAttr(p.url)}" download="${escapeAttr(p.filename || p.title + '.pdf')}" title="下载 PDF" aria-label="下载 PDF" target="_blank" rel="noopener">
               <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
             </a>`
          : '';
        return `
          <article class="pdf-card" data-pdf-idx="${idx}">
            <div class="pdf-card-main">
              <h3 class="pdf-card-title">${escapeHtml(p.title)}</h3>
              <div class="pdf-card-meta">
                ${p.broker ? `<span class="pdf-broker">${escapeHtml(p.broker)}</span>` : ''}
                <span>${p.sizeMB || '—'} MB</span>
              </div>
            </div>
            <div class="pdf-card-cta">
              <span class="read-pill">阅读原文</span>
              ${dlHtml}
            </div>
          </article>
        `;
      }).join('');

      return `
        <div class="industry-chapter">
          <div class="industry-chapter-head">
            <h2 class="industry-chapter-title">${escapeHtml(ind)}</h2>
            <span class="industry-chapter-count">${items.length} 份</span>
          </div>
          <div class="pdf-grid">${cardsHtml}</div>
        </div>
      `;
    }).join('');

    $$('.pdf-card', container).forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.dl-icon-btn')) return;
        const p = flatList[Number(card.dataset.pdfIdx)];
        if (p) openPdfWorkspace(p);
      });
    });
  }

  // ---------- AI 总结抽屉 ----------
  function openNoteDrawer(note) {
    state.activeNote = note;
    $('#drawerCat').textContent = note.category || 'AI 总结';
    $('#drawerTime').textContent = `${formatDate(state.currentDate)} ${note.time || ''}`;
    $('#noteDrawerContent').innerHTML = `<h1>${escapeHtml(note.title)}</h1>` + renderMarkdown(note.content);
    $('#noteDrawerContent').style.setProperty('--article-size', state.articleSize + 'px');

    const toc = $('#noteDrawerToc');
    const heads = $$('h2, h3', $('#noteDrawerContent'));
    if (heads.length > 1) {
      toc.hidden = false;
      toc.innerHTML = heads.map(h => `<button type="button" class="toc-chip" data-toc="${h.id}">${escapeHtml(h.textContent)}</button>`).join('');
      $$('[data-toc]', toc).forEach(btn => btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.toc);
        const scrollBox = $('#noteDrawerScroll');
        if (target) {
          const top = target.getBoundingClientRect().top - scrollBox.getBoundingClientRect().top + scrollBox.scrollTop - 16;
          scrollBox.scrollTo({ top, behavior: 'smooth' });
        }
      }));
    } else {
      toc.hidden = true;
    }

    $('#noteDrawerScroll').scrollTop = 0;
    $('#noteProgress').style.width = '0%';
    $('#noteDrawerOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeNoteDrawer() {
    $('#noteDrawerOverlay').hidden = true;
    if ($('#pdfWorkspaceOverlay').hidden) document.body.style.overflow = '';
  }

  // ---------- PDF 阅读工作台 ----------
  function openPdfWorkspace(pdf) {
    const ind = pdf.industry || '综合研究';
    state.railPdfs = state.day.pdfs.filter(p => (p.industry || '综合研究') === ind);
    $('#pdfRailIndustry').textContent = ind;
    $('#pdfRailCount').textContent = `${state.railPdfs.length} 份`;
    selectPdfInWorkspace(pdf);
    $('#pdfWorkspaceOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function selectPdfInWorkspace(pdf) {
    state.activePdf = pdf;
    $('#pdfStageTitle').textContent = pdf.title || '研报原文';
    $('#pdfStageSub').textContent = [pdf.industry || '综合研究', pdf.broker, pdf.sizeMB ? pdf.sizeMB + ' MB' : ''].filter(Boolean).join(' · ');

    $('#pdfRailList').innerHTML = state.railPdfs.map((p, idx) => `
      <button type="button" class="rail-item ${p.title === pdf.title ? 'active' : ''}" data-rail-idx="${idx}">
        <div class="rail-item-title">${escapeHtml(p.title)}</div>
        <div class="rail-item-sub">${escapeHtml(p.broker || '')}${p.broker ? ' · ' : ''}${p.sizeMB} MB</div>
      </button>
    `).join('');
    $$('[data-rail-idx]', $('#pdfRailList')).forEach(btn => btn.addEventListener('click', () => {
      const target = state.railPdfs[Number(btn.dataset.railIdx)];
      if (target) selectPdfInWorkspace(target);
    }));

    const frame = $('#pdfFrame');
    const placeholder = $('#pdfPlaceholder');
    const openBtn = $('#pdfOpenNewBtn');
    const dlBtn = $('#pdfDownloadBtn');

    if (pdf.url) {
      frame.hidden = false;
      placeholder.hidden = true;
      frame.src = pdf.url;
      openBtn.href = pdf.url;
      openBtn.hidden = false;
      dlBtn.href = pdf.url;
      dlBtn.setAttribute('download', pdf.filename || pdf.title + '.pdf');
      dlBtn.hidden = false;
    } else {
      frame.src = '';
      frame.hidden = true;
      placeholder.hidden = false;
      $('#pdfPlaceholderTitle').textContent = pdf.title || '示例研报条目';
      openBtn.hidden = true;
      dlBtn.hidden = true;
    }
  }

  function closePdfWorkspace() {
    $('#pdfWorkspaceOverlay').hidden = true;
    $('#pdfFrame').src = '';
    if ($('#noteDrawerOverlay').hidden) document.body.style.overflow = '';
  }

  // ---------- 初始化与事件监听 ----------
  function initPrefs() {
    const theme = storageGet(KEYS.theme, '');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    const fs = parseFloat(storageGet(KEYS.fontSize, '15.5'));
    if (!isNaN(fs) && fs >= 13 && fs <= 20) state.articleSize = fs;
  }

  function bindEvents() {
    $('#brandBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 侧边栏收起 / 展开
    $('#collapseSidebarBtn').addEventListener('click', toggleSidebarCollapse);
    $('#menuBtn').addEventListener('click', toggleSidebarCollapse);
    $('#sidebarBackdrop').addEventListener('click', closeMobileSidebar);

    // 侧边栏快速筛选
    $('#dateFilterInput').addEventListener('input', e => {
      state.dateFilter = e.target.value.trim();
      renderSidebarDates();
    });

    // 主题切换
    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      storageSet(KEYS.theme, next);
      $('#themeLabel').textContent = next === 'dark' ? '浅色模式' : '深色模式';
    });
    const currentTheme = document.documentElement.getAttribute('data-theme');
    $('#themeLabel').textContent = currentTheme === 'dark' ? '浅色模式' : '深色模式';

    // 全局搜索
    $('#searchInput').addEventListener('input', e => {
      state.query = e.target.value.trim();
      renderBriefs();
      renderReports();
    });

    $('#toggleBriefBtn').addEventListener('click', () => {
      state.briefCollapsed = !state.briefCollapsed;
      $('#aiBriefBody').hidden = state.briefCollapsed;
      $('#toggleBriefBtn').textContent = state.briefCollapsed ? '展开' : '收起';
      $('#toggleBriefBtn').setAttribute('aria-expanded', String(!state.briefCollapsed));
    });

    $('#resetFilterBtn').addEventListener('click', () => {
      state.activeIndustry = '全部';
      state.query = '';
      $('#searchInput').value = '';
      renderBriefs();
      renderIndustryTabs();
      renderReports();
    });

    // AI 总结抽屉事件
    $('#closeNoteDrawer').addEventListener('click', closeNoteDrawer);
    $('#noteDrawerOverlay').addEventListener('click', e => { if (e.target === $('#noteDrawerOverlay')) closeNoteDrawer(); });
    $('#fontDecBtn').addEventListener('click', () => {
      state.articleSize = Math.max(13, state.articleSize - 1);
      $('#noteDrawerContent').style.setProperty('--article-size', state.articleSize + 'px');
      storageSet(KEYS.fontSize, String(state.articleSize));
    });
    $('#fontIncBtn').addEventListener('click', () => {
      state.articleSize = Math.min(20, state.articleSize + 1);
      $('#noteDrawerContent').style.setProperty('--article-size', state.articleSize + 'px');
      storageSet(KEYS.fontSize, String(state.articleSize));
    });
    $('#copyNoteBtn').addEventListener('click', () => {
      if (state.activeNote) copyText(`${state.activeNote.title}\n\n${state.activeNote.content}`);
    });
    $('#noteDrawerScroll').addEventListener('scroll', e => {
      const el = e.target;
      const pct = el.scrollHeight > el.clientHeight ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100 : 100;
      $('#noteProgress').style.width = pct + '%';
    });

    // PDF 阅读工作台事件
    $('#closePdfWorkspace').addEventListener('click', closePdfWorkspace);
    $('#pdfWorkspaceOverlay').addEventListener('click', e => { if (e.target === $('#pdfWorkspaceOverlay')) closePdfWorkspace(); });
    $('#toggleRailBtn').addEventListener('click', () => $('#pdfRail').classList.toggle('collapsed'));

    // 快捷键
    document.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        $('#searchInput').focus();
      } else if (e.key === 'Escape') {
        if (!$('#pdfWorkspaceOverlay').hidden) closePdfWorkspace();
        else if (!$('#noteDrawerOverlay').hidden) closeNoteDrawer();
        else if ($('#appLayout').classList.contains('mobile-sidebar-open')) closeMobileSidebar();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebarCollapse();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPrefs();
    initSidebarResizer();
    bindEvents();
    loadIndex();
  });
})();
