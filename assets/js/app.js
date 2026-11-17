/* ============ 研报速览 · 交互逻辑 ============ */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const state = {
    notes: [],
    pdfs: [],
    meta: null,
    activeNoteCat: '全部',
    activeIndustry: '全部',
    activeBroker: '全部',
    noteQuery: '',
    pdfQuery: '',
  };

  // ---------- Markdown 渲染（轻量、无依赖） ----------
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function inlineFormat(text) {
    let s = escapeHtml(text);
    // 行内代码
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 加粗
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // 链接
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // 话题标签 #xxx （中文场景，行内 #号）
    s = s.replace(/(^|[\s，。、])#([^\s#，。、]{1,20})/g, '$1<span class="hash">#$2</span>');
    return s;
  }

  function renderMarkdown(md) {
    const lines = md.split('\n');
    const out = [];
    let listType = null; // 'ul' | 'ol'
    let inCode = false;
    let codeBuf = [];

    function closeList() {
      if (listType) { out.push(`</${listType}>`); listType = null; }
    }

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // 代码块
      if (/^\s*```/.test(line)) {
        if (inCode) {
          out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
          inCode = false; codeBuf = [];
        } else { closeList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      const trimmed = line.trim();
      if (!trimmed) { closeList(); continue; }

      // 分隔线
      if (/^[-=]{3,}$/.test(trimmed)) { closeList(); out.push('<hr>'); continue; }

      // 标题
      const h = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        closeList();
        const level = h[1].length;
        const txt = h[2];
        const id = 'sec-' + i;
        out.push(`<h${level} id="${id}">${inlineFormat(txt)}</h${level}>`);
        continue;
      }

      // 无序列表（支持 - / * / • / ①等无需匹配）
      const ul = trimmed.match(/^[-*•]\s+(.+)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul'; }
        out.push(`<li>${inlineFormat(ul[1])}</li>`);
        continue;
      }

      // 有序列表
      const ol = trimmed.match(/^\d+[.、)]\s*(.+)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol'; }
        out.push(`<li>${inlineFormat(ol[1])}</li>`);
        continue;
      }

      // 普通段落（合并连续行）
      closeList();
      let para = [trimmed];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (!next || /^(#{1,4})\s|^\s*```|^[-*•]\s|^\d+[.、)]|^[-=]{3,}$/.test(next)) break;
        para.push(next);
        i++;
      }
      out.push(`<p>${inlineFormat(para.join(' '))}</p>`);
    }
    closeList();
    if (inCode) out.push('<pre><code>' + escapeHtml(codeBuf.join('\n')) + '</code></pre>');
    return out.join('\n');
  }

  // ---------- 数据加载 ----------
  async function loadData() {
    const [notesRes, pdfsRes, metaRes] = await Promise.all([
      fetch('data/notes.json'),
      fetch('data/pdfs.json'),
      fetch('data/meta.json'),
    ]);
    if (!notesRes.ok || !pdfsRes.ok || !metaRes.ok) throw new Error('数据文件加载失败');
    state.notes = await notesRes.json();
    state.pdfs = await pdfsRes.json();
    state.meta = await metaRes.json();
  }

  // ---------- Hero 统计 ----------
  function renderStats() {
    const m = state.meta;
    if (!m) return;
    $('#heroDate').textContent = `📅 ${formatDate(m.reportDate)} · 每日研报速览`;
    $('#statNotes').textContent = m.noteCount;
    $('#statPdfs').textContent = m.pdfCount;
    $('#statIndustries').textContent = m.industries ? m.industries.length : '—';
    $('#statBrokers').textContent = m.brokers ? m.brokers.length : '—';
    $('#aboutMeta').textContent = `数据日期：${formatDate(m.reportDate)} · 数据生成于 ${m.generatedAt}`;
  }

  function formatDate(s) {
    if (!s) return '';
    const parts = s.split('-');
    return parts.length === 3 ? `${parts[0]}年${+parts[1]}月${+parts[2]}日` : s;
  }

  // ---------- 纪要筛选标签 ----------
  function renderNoteFilters() {
    const counts = {};
    state.notes.forEach(n => { counts[n.category] = (counts[n.category] || 0) + 1; });
    const cats = ['全部', ...Object.keys(counts)];
    const box = $('#notesFilters');
    box.innerHTML = '';
    cats.forEach(cat => {
      const num = cat === '全部' ? state.notes.length : counts[cat];
      const btn = document.createElement('button');
      btn.className = 'filter-chip' + (state.activeNoteCat === cat ? ' active' : '');
      btn.innerHTML = `${cat}<span class="chip-num">${num}</span>`;
      btn.addEventListener('click', () => { state.activeNoteCat = cat; renderNoteFilters(); renderNotes(); });
      box.appendChild(btn);
    });
  }

  // ---------- 纪要卡片 ----------
  function getExcerpt(content) {
    // 去掉第一行日期说明和标题标记
    let text = content
      .replace(/^.{0,40}·\s*第\s*\d+\/\d+\s*段[^\n]*\n?/, '')
      .replace(/^#{1,4}\s+.+$/gm, '')
      .replace(/\*\*/g, '')
      .replace(/[#*`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 160) || '点击查看完整内容';
  }

  function renderNotes() {
    let list = state.notes.filter(n => state.activeNoteCat === '全部' || n.category === state.activeNoteCat);
    if (state.noteQuery) {
      const q = state.noteQuery.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }
    $('#notesCount').textContent = `共 ${list.length} 条`;
    const grid = $('#notesGrid');
    const empty = $('#notesEmpty');
    if (!list.length) { grid.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    grid.innerHTML = list.map(n => `
      <article class="note-card" data-id="${n.id}">
        <div class="note-card-top">
          <span class="note-cat cat-${n.category}">${n.category}</span>
          <span class="note-time">${n.time}</span>
        </div>
        <h3 class="note-card-title">${escapeHtml(n.title)}</h3>
        <p class="note-card-excerpt">${escapeHtml(getExcerpt(n.content))}</p>
        <div class="note-card-foot">
          <span>${n.sections.length ? n.sections.length + ' 个专题 · ' : ''}${(n.charCount / 1000).toFixed(1)}k 字</span>
          <span class="read-more">阅读全文 →</span>
        </div>
      </article>
    `).join('');
    $$('.note-card', grid).forEach(el => el.addEventListener('click', () => openReader(+el.dataset.id)));
  }

  // ---------- 阅读弹窗 ----------
  let currentNote = null;
  function openReader(id) {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    currentNote = n;
    $('#readerCat').textContent = n.category;
    $('#readerTime').textContent = n.time;
    $('#readerCat').className = 'reader-cat cat-' + n.category;

    // 正文（去掉第一条日期说明行，单独美化）
    let body = n.content;
    let dateNote = '';
    const dm = body.match(/^([^\n]*·\s*第\s*\d+\/\d+\s*段[^\n]*)\n?/);
    if (dm) { dateNote = dm[1]; body = body.slice(dm[0].length); }

    const content = $('#readerContent');
    content.innerHTML =
      `<h1>${escapeHtml(n.title)}</h1>` +
      (dateNote ? `<div class="date-note">${escapeHtml(dateNote)}</div>` : '') +
      renderMarkdown(body);

    // 目录
    const toc = $('#readerToc');
    const heads = $$('h2, h3', content);
    if (heads.length) {
      toc.innerHTML = '<div class="toc-title">本文目录</div>' + heads.map((h, i) =>
        `<a class="toc-item" data-target="${h.id}">${escapeHtml(h.textContent)}</a>`
      ).join('');
      $$('.toc-item', toc).forEach(a => a.addEventListener('click', () => {
        const target = document.getElementById(a.dataset.target);
        if (target) {
          const top = target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 16;
          content.scrollTo({ top, behavior: 'smooth' });
          $$('.toc-item', toc).forEach(x => x.classList.remove('active'));
          a.classList.add('active');
        }
      }));
    } else {
      toc.innerHTML = '<div class="toc-title">本文目录</div><div class="toc-item" style="opacity:.5">无小标题</div>';
    }

    content.scrollTop = 0;
    $('#readingProgress').style.width = '0%';
    $('#readerOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeReader() {
    $('#readerOverlay').hidden = true;
    currentNote = null;
    if ($('#pdfOverlay').hidden) document.body.style.overflow = '';
  }

  // ---------- 研报筛选 ----------
  function renderPdfsFilters() {
    // 行业
    const inds = ['全部', ...(state.meta.industries || [])];
    const indBox = $('#industryFilters');
    indBox.innerHTML = inds.map(ind => {
      const cnt = ind === '全部' ? state.pdfs.length : state.pdfs.filter(p => p.industry === ind).length;
      return `<button class="filter-chip ${state.activeIndustry === ind ? 'active' : ''}" data-ind="${escapeAttr(ind)}">${ind}<span class="chip-num">${cnt}</span></button>`;
    }).join('');
    $$('.filter-chip', indBox).forEach(btn => btn.addEventListener('click', () => {
      state.activeIndustry = btn.dataset.ind; renderPdfsFilters(); renderPdfs();
    }));

    // 机构
    const brs = ['全部', ...(state.meta.brokers || [])];
    const brBox = $('#brokerFilters');
    brBox.innerHTML = brs.map(br => {
      const cnt = br === '全部' ? state.pdfs.length : state.pdfs.filter(p => p.broker === br).length;
      return `<button class="filter-chip ${state.activeBroker === br ? 'active' : ''}" data-br="${escapeAttr(br)}">${br}<span class="chip-num">${cnt}</span></button>`;
    }).join('');
    $$('.filter-chip', brBox).forEach(btn => btn.addEventListener('click', () => {
      state.activeBroker = btn.dataset.br; renderPdfsFilters(); renderPdfs();
    }));
  }

  function escapeAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function renderPdfs() {
    let list = state.pdfs.filter(p =>
      (state.activeIndustry === '全部' || p.industry === state.activeIndustry) &&
      (state.activeBroker === '全部' || p.broker === state.activeBroker)
    );
    if (state.pdfQuery) {
      const q = state.pdfQuery.toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.industry.toLowerCase().includes(q) || (p.broker || '').toLowerCase().includes(q));
    }
    $('#pdfsCount').textContent = `共 ${list.length} 份`;
    const box = $('#pdfsList');
    const empty = $('#pdfsEmpty');
    if (!list.length) { box.innerHTML = ''; empty.hidden = false; return; }
    empty.hidden = true;
    box.innerHTML = list.map(p => `
      <div class="pdf-item">
        <div class="pdf-icon"></div>
        <div class="pdf-main">
          <div class="pdf-title" title="${escapeAttr(p.title)}">${escapeHtml(p.title)}</div>
          <div class="pdf-meta">
            <span class="industry-tag">${escapeHtml(p.industry)}</span>
            ${p.broker ? `<span class="broker-tag">${escapeHtml(p.broker)}</span>` : ''}
            <span>${p.sizeMB} MB</span>
          </div>
        </div>
        <div class="pdf-actions">
          <button class="pdf-btn" data-preview="${escapeAttr(p.url)}" data-title="${escapeAttr(p.title)}">预览</button>
          <a class="pdf-btn primary" href="${escapeAttr(p.url)}" download="${escapeAttr(p.filename)}">下载</a>
        </div>
      </div>
    `).join('');
    $$('[data-preview]', box).forEach(btn => btn.addEventListener('click', () => openPdf(btn.dataset.preview, btn.dataset.title)));
  }

  // ---------- PDF 预览 ----------
  function openPdf(url, title) {
    $('#pdfViewerTitle').textContent = title;
    $('#pdfFrame').src = url;
    $('#pdfOpenBtn').href = url;
    $('#pdfDownloadBtn').href = url;
    $('#pdfDownloadBtn').setAttribute('download', title + '.pdf');
    $('#pdfOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closePdf() {
    $('#pdfOverlay').hidden = true;
    $('#pdfFrame').src = '';
    if ($('#readerOverlay').hidden) document.body.style.overflow = '';
  }

  // ---------- 标签切换 ----------
  function switchTab(tab) {
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- 主题 ----------
  function initTheme() {
    const saved = localStorage.getItem('yb-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    $('#themeToggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('yb-theme', next);
    });
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

    // 阅读进度
    $('#readerContent').addEventListener('scroll', e => {
      const el = e.target;
      const pct = el.scrollHeight > el.clientHeight ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100 : 100;
      $('#readingProgress').style.width = pct + '%';
    });

    // ESC 关闭
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (!$('#pdfOverlay').hidden) closePdf(); else if (!$('#readerOverlay').hidden) closeReader(); }
    });

    // 回到顶部 & header 阴影
    const header = $('#siteHeader');
    const backTop = $('#backToTop');
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
    try {
      await loadData();
      renderStats();
      renderNoteFilters();
      renderNotes();
      renderPdfsFilters();
      renderPdfs();
    } catch (err) {
      console.error(err);
      $('#notesGrid').innerHTML = '<div class="loading-state">数据加载失败，请刷新页面重试。<br><small>' + escapeHtml(err.message) + '</small></div>';
      $('#pdfsList').innerHTML = '<div class="loading-state">数据加载失败，请刷新页面重试。</div>';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
