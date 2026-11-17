/* ============ 研报速览 · 交互逻辑 v2 ============ */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const state = {
    dates: [],           // ['2026-11-16', ...]
    currentDate: null,
    day: null,           // { date, meta, notes, pdfs }
    activeNoteCat: '全部',
    activeIndustry: '全部',
    activeBroker: '全部',
    noteQuery: '',
    pdfQuery: '',
  };

  // ---------- Markdown 渲染 ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function inlineFormat(text) {
    let s = escapeHtml(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|[\s，。、])#([^\s#，。、]{1,20})/g, '$1<span class="hash">#$2</span>');
    return s;
  }
  function renderMarkdown(md) {
    const lines = md.split('\n');
    const out = [];
    let listType = null, inCode = false, codeBuf = [];
    function closeList() { if (listType) { out.push(`</${listType}>`); listType = null; } }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) {
        if (inCode) { out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>'); inCode = false; codeBuf = []; }
        else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }
      const trimmed = line.trim();
      if (!trimmed) { closeList(); continue; }
      if (/^[-=]{3,}$/.test(trimmed)) { closeList(); out.push('<hr>'); continue; }
      const h = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        closeList();
        out.push(`<h${h[1].length} id="sec-${i}">${inlineFormat(h[2])}</h${h[1].length}>`);
        continue;
      }
      const ul = trimmed.match(/^[-*•]\s+(.+)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${inlineFormat(ul[1])}</li>`); continue;
      }
      const ol = trimmed.match(/^\d+[.、)]\s*(.+)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${inlineFormat(ol[1])}</li>`); continue;
      }
      closeList();
      const para = [trimmed];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (!next || /^(#{1,4})\s|^\s*```|^[-*•]\s|^\d+[.、)]|^[-=]{3,}$/.test(next)) break;
        para.push(next); i++;
      }
      out.push(`<p>${inlineFormat(para.join(' '))}</p>`);
    }
    closeList();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    return out.join('\n');
  }

  // ---------- 日期格式化 ----------
  function formatDate(s) {
    if (!s) return '';
    const p = s.split('-');
    return p.length === 3 ? `${p[0]}.${p[1]}.${p[2]}` : s;
  }
  function weekday(s) {
    const d = new Date(s + 'T00:00:00');
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()] || '';
  }

  // ---------- 加载索引 + 切换日期 ----------
  async function loadIndex() {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error('日期索引加载失败');
    const idx = await res.json();
    state.dates = idx.dates || [];
    if (!state.dates.length) throw new Error('暂无日期数据');
    renderDateList();
    await switchDate(state.dates[0]);
  }

  function renderDateList() {
    $('#dateCount').textContent = state.dates.length + ' 天';
    $('#dateList').innerHTML = state.dates.map(d =>
      `<button class="date-item ${d === state.currentDate ? 'active' : ''}" data-date="${d}">
        <span class="date-icon">📅</span>
        <span class="date-info"><span class="date-main">${formatDate(d)}</span><span class="date-sub">${weekday(d)} · 研报归档</span></span>
      </button>`
    ).join('');
    $$('.date-item', $('#dateList')).forEach(btn => btn.addEventListener('click', () => {
      switchDate(btn.dataset.date);
      closeSidebar();
    }));
  }

  async function switchDate(date) {
    if (!date || date === state.currentDate) return;
    $('#notesGrid').innerHTML = '<div class="loading-state">正在加载 ' + formatDate(date) + ' 的纪要…</div>';
    $('#pdfsList').innerHTML = '<div class="loading-state">正在加载研报库…</div>';
    try {
      const res = await fetch(`data/dates/${date}.json`);
      if (!res.ok) throw new Error('该日期数据不存在');
      state.day = await res.json();
      state.currentDate = date;
      state.activeNoteCat = '全部';
      state.activeIndustry = '全部';
      state.activeBroker = '全部';
      state.noteQuery = ''; state.pdfQuery = '';
      $('#notesSearch').value = ''; $('#pdfsSearch').value = '';

      $('#currentDate').textContent = formatDate(date) + ' ' + weekday(date);
      renderDateList();
      renderStats();
      renderNoteFilters();
      renderNotes();
      renderPdfsFilters();
      renderPdfs();
    } catch (err) {
      console.error(err);
      $('#notesGrid').innerHTML = '<div class="loading-state">加载失败：' + escapeHtml(err.message) + '</div>';
    }
  }

  // ---------- 概览统计 ----------
  function renderStats() {
    const m = state.day.meta;
    $('#statNotes').textContent = m.noteCount;
    $('#statPdfs').textContent = m.pdfCount;
    $('#statIndustries').textContent = m.industries ? m.industries.length : '—';
    $('#statBrokers').textContent = m.brokers ? m.brokers.length : '—';
    $('#aboutMeta').textContent = `数据日期：${formatDate(state.currentDate)} · 生成于 ${m.generatedAt}`;
  }

  // ---------- 纪要 ----------
  function renderNoteFilters() {
    const counts = {};
    state.day.notes.forEach(n => { counts[n.category] = (counts[n.category] || 0) + 1; });
    const cats = ['全部', ...Object.keys(counts)];
    $('#notesFilters').innerHTML = cats.map(cat => {
      const num = cat === '全部' ? state.day.notes.length : counts[cat];
      return `<button class="filter-chip ${state.activeNoteCat === cat ? 'active' : ''}" data-cat="${escapeAttr(cat)}">${cat}<span class="chip-num">${num}</span></button>`;
    }).join('');
    $$('.filter-chip', $('#notesFilters')).forEach(btn => btn.addEventListener('click', () => {
      state.activeNoteCat = btn.dataset.cat; renderNoteFilters(); renderNotes();
    }));
  }
  function getExcerpt(content) {
    let text = content
      .replace(/^.{0,40}·\s*第\s*\d+\/\d+\s*段[^\n]*\n?/, '')
      .replace(/^#{1,4}\s+.+$/gm, '').replace(/\*\*/g, '').replace(/[#*`>]/g, '')
      .replace(/\s+/g, ' ').trim();
    return text.slice(0, 160) || '点击查看完整内容';
  }
  function renderNotes() {
    let list = state.day.notes.filter(n => state.activeNoteCat === '全部' || n.category === state.activeNoteCat);
    if (state.noteQuery) {
      const q = state.noteQuery.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }
    $('#notesCount').textContent = `共 ${list.length} 条`;
    const grid = $('#notesGrid'), empty = $('#notesEmpty');
    if (!list.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    grid.innerHTML = list.map(n => `
      <article class="note-card" data-id="${n.id}">
        <div class="note-card-top"><span class="note-cat cat-${n.category}">${n.category}</span><span class="note-time">${n.time}</span></div>
        <h3 class="note-card-title">${escapeHtml(n.title)}</h3>
        <p class="note-card-excerpt">${escapeHtml(getExcerpt(n.content))}</p>
        <div class="note-card-foot"><span>${n.sections.length ? n.sections.length + ' 个专题 · ' : ''}${(n.charCount / 1000).toFixed(1)}k 字</span><span class="read-more">阅读全文 →</span></div>
      </article>`).join('');
    $$('.note-card', grid).forEach(el => el.addEventListener('click', () => openReader(+el.dataset.id)));
  }

  // ---------- 阅读弹窗 ----------
  function openReader(id) {
    const n = state.day.notes.find(x => x.id === id);
    if (!n) return;
    $('#readerCat').textContent = n.category;
    $('#readerTime').textContent = formatDate(state.currentDate) + ' ' + n.time;
    $('#readerCat').className = 'reader-cat cat-' + n.category;
    let body = n.content, dateNote = '';
    const dm = body.match(/^([^\n]*·\s*第\s*\d+\/\d+\s*段[^\n]*)\n?/);
    if (dm) { dateNote = dm[1]; body = body.slice(dm[0].length); }
    const content = $('#readerContent');
    content.innerHTML = `<h1>${escapeHtml(n.title)}</h1>` + (dateNote ? `<div class="date-note">${escapeHtml(dateNote)}</div>` : '') + renderMarkdown(body);
    const toc = $('#readerToc');
    const heads = $$('h2, h3', content);
    toc.innerHTML = '<div class="toc-title">本文目录</div>' + (heads.length
      ? heads.map(h => `<a class="toc-item" data-target="${h.id}">${escapeHtml(h.textContent)}</a>`).join('')
      : '<div class="toc-item" style="opacity:.5">无小标题</div>');
    $$('.toc-item', toc).forEach(a => a && a.dataset.target && a.addEventListener('click', () => {
      const target = document.getElementById(a.dataset.target);
      if (!target) return;
      content.scrollTo({ top: target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 16, behavior: 'smooth' });
      $$('.toc-item', toc).forEach(x => x.classList.remove('active'));
      a.classList.add('active');
    }));
    content.scrollTop = 0;
    $('#readingProgress').style.width = '0%';
    showOverlay('#readerOverlay');
  }
  function closeReader() { hideOverlay('#readerOverlay'); }

  // ---------- 研报库 ----------
  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function renderPdfsFilters() {
    const pdfs = state.day.pdfs;
    const inds = ['全部', ...(state.day.meta.industries || [])];
    $('#industryFilters').innerHTML = inds.map(ind => {
      const cnt = ind === '全部' ? pdfs.length : pdfs.filter(p => p.industry === ind).length;
      return `<button class="filter-chip ${state.activeIndustry === ind ? 'active' : ''}" data-ind="${escapeAttr(ind)}">${ind}<span class="chip-num">${cnt}</span></button>`;
    }).join('');
    $$('.filter-chip', $('#industryFilters')).forEach(btn => btn.addEventListener('click', () => {
      state.activeIndustry = btn.dataset.ind; renderPdfsFilters(); renderPdfs();
    }));
    const brs = ['全部', ...(state.day.meta.brokers || [])];
    $('#brokerFilters').innerHTML = brs.map(br => {
      const cnt = br === '全部' ? pdfs.length : pdfs.filter(p => p.broker === br).length;
      return `<button class="filter-chip ${state.activeBroker === br ? 'active' : ''}" data-br="${escapeAttr(br)}">${br}<span class="chip-num">${cnt}</span></button>`;
    }).join('');
    $$('.filter-chip', $('#brokerFilters')).forEach(btn => btn.addEventListener('click', () => {
      state.activeBroker = btn.dataset.br; renderPdfsFilters(); renderPdfs();
    }));
  }
  function renderPdfs() {
    const pdfs = state.day.pdfs;
    let list = pdfs.filter(p =>
      (state.activeIndustry === '全部' || p.industry === state.activeIndustry) &&
      (state.activeBroker === '全部' || p.broker === state.activeBroker));
    if (state.pdfQuery) {
      const q = state.pdfQuery.toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.industry.toLowerCase().includes(q) || (p.broker || '').toLowerCase().includes(q));
    }
    $('#pdfsCount').textContent = `共 ${list.length} 份`;
    const box = $('#pdfsList'), empty = $('#pdfsEmpty');
    if (!list.length) { box.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    box.innerHTML = list.map(p => `
      <div class="pdf-item">
        <div class="pdf-icon"></div>
        <div class="pdf-main">
          <div class="pdf-title" title="${escapeAttr(p.title)}">${escapeHtml(p.title)}</div>
          <div class="pdf-meta"><span class="industry-tag">${escapeHtml(p.industry)}</span>${p.broker ? `<span class="broker-tag">${escapeHtml(p.broker)}</span>` : ''}<span>${p.sizeMB} MB</span></div>
        </div>
        <div class="pdf-actions">
          <button class="pdf-btn" data-preview="${escapeAttr(p.url)}" data-title="${escapeAttr(p.title)}">预览</button>
          <a class="pdf-btn primary" href="${escapeAttr(p.url)}" download="${escapeAttr(p.filename)}">下载</a>
        </div>
      </div>`).join('');
    $$('[data-preview]', box).forEach(btn => btn.addEventListener('click', () => openPdf(btn.dataset.preview, btn.dataset.title)));
  }

  // ---------- PDF 预览 ----------
  function openPdf(url, title) {
    $('#pdfViewerTitle').textContent = title;
    $('#pdfFrame').src = url;
    $('#pdfOpenBtn').href = url;
    $('#pdfDownloadBtn').href = url;
    $('#pdfDownloadBtn').setAttribute('download', title + '.pdf');
    showOverlay('#pdfOverlay');
  }
  function closePdf() { hideOverlay('#pdfOverlay'); $('#pdfFrame').src = ''; }

  // ---------- 弹窗显隐（内联样式兜底，避开 CSS 缓存问题） ----------
  function showOverlay(sel) {
    const el = $(sel);
    el.hidden = false;
    el.style.setProperty('display', 'flex', 'important');
    document.body.style.overflow = 'hidden';
  }
  function hideOverlay(sel) {
    const el = $(sel);
    el.hidden = true;
    el.style.setProperty('display', 'none', 'important');
    if ($('#readerOverlay').hidden && $('#pdfOverlay').hidden) document.body.style.overflow = '';
  }

  // ---------- 侧边栏（移动端） ----------
  function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('show'); }
  function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('show'); }

  // ---------- 标签切换 ----------
  function switchTab(tab) {
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- 主题 ----------
  function initTheme() {
    const saved = localStorage.getItem('yb-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    updateThemeLabel();
    $('#themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('yb-theme', next);
      updateThemeLabel();
    });
  }
  function updateThemeLabel() {
    const cur = document.documentElement.getAttribute('data-theme');
    $('#themeLabel').textContent = cur === 'dark' ? '切换浅色模式' : '切换深色模式';
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    $('#notesSearch').addEventListener('input', e => { state.noteQuery = e.target.value.trim(); renderNotes(); });
    $('#pdfsSearch').addEventListener('input', e => { state.pdfQuery = e.target.value.trim(); renderPdfs(); });
    $('#readerClose').addEventListener('click', closeReader);
    $('#readerOverlay').addEventListener('click', e => { if (e.target === $('#readerOverlay')) closeReader(); });
    $('#pdfViewerClose').addEventListener('click', closePdf);
    $('#pdfOverlay').addEventListener('click', e => { if (e.target === $('#pdfOverlay')) closePdf(); });
    $('#readerContent').addEventListener('scroll', e => {
      const el = e.target;
      const pct = el.scrollHeight > el.clientHeight ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100 : 100;
      $('#readingProgress').style.width = pct + '%';
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#pdfOverlay').hidden) closePdf(); else if (!$('#readerOverlay').hidden) closeReader(); else closeSidebar(); }
    });
    $('#menuBtn').addEventListener('click', openSidebar);
    $('#sidebarBackdrop').addEventListener('click', closeSidebar);

    const header = $('#topbar'), backTop = $('#backToTop');
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      header.classList.toggle('scrolled', y > 10);
      backTop.classList.toggle('show', y > 400);
    }, { passive: true });
    backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // ---------- 启动 ----------
  async function init() {
    initTheme();
    bindEvents();
    // 首屏兜底：确保弹窗初始隐藏（避免缓存 CSS 导致默认显示）
    ['#readerOverlay', '#pdfOverlay'].forEach(sel => $(sel).style.setProperty('display', 'none', 'important'));
    try {
      await loadIndex();
    } catch (err) {
      console.error(err);
      $('#dateList').innerHTML = '<div class="loading-state-sm">加载失败</div>';
      $('#notesGrid').innerHTML = '<div class="loading-state">数据加载失败，请刷新重试。<br><small>' + escapeHtml(err.message) + '</small></div>';
      $('#pdfsList').innerHTML = '<div class="loading-state">数据加载失败，请刷新重试。</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
