/* ============ 研报速览 · 极简阅读优先交互 v4 ============ */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Jjiaoziao/Analysis_Report/main';
  const KEYS = { theme: 'yb-theme-v4', fontSize: 'yb-font-v4' };

  // 内置示例数据（仅预览环境无法读取仓库 data/ 时启用；部署到 GitHub Pages 自动读真实数据）
  const DEMO_DATA = {
    dates: ['2026-11-18', '2026-11-16'],
    days: {
      '2026-11-18': {
        date: '2026-11-18',
        meta: {
          noteCount: 3,
          pdfCount: 8,
          industries: ['人工智能', '半导体', '新能源', '医药生物', '宏观策略'],
          brokers: ['中信证券', '中金公司', '华泰证券', '国泰君安', '招商证券'],
          generatedAt: '2026-11-18 18:30'
        },
        notes: [
          {
            id: 1,
            category: '市场复盘',
            time: '17:45',
            title: 'AI 算力链与国产半导体领涨，两市成交额重回活跃区间',
            charCount: 2240,
            content: '## 盘面核心\n今日市场延续结构性修复节奏，**AI 算力基础设施**与**国产半导体设备**成为领涨主线，交投情绪明显回暖。\n\n## 重点关注\n- **光模块与液冷**：海外云厂商资本开支指引保持高景气，800G/1.6T 高速光模块与液冷散热订单能见度延续至明年。\n- **半导体设备**：晶圆厂扩产稳步推进，薄膜沉积、刻蚀与量检测设备国产替代弹性突出。\n\n#AI算力 #半导体'
          },
          {
            id: 2,
            category: '投资策略',
            time: '16:10',
            title: '四季度跨年配置：高景气科技成长与高股息红利哑铃平衡',
            charCount: 1980,
            content: '## 配置思路\n建议维持**哑铃型配置**：进攻端围绕 AI 端侧硬件、智能驾驶与人形机器人供应链；防御端配置现金流稳健的公用事业与能源红利。\n\n> 聚焦业绩兑现度与产业趋势，回避纯题材博弈。#投资策略'
          },
          {
            id: 3,
            category: '券商纪要',
            time: '13:30',
            title: '海外大储与电网设备纪要：北美数据中心用电拉动变压器出海',
            charCount: 1820,
            content: '## 海外需求超预期\n北美、中东与欧洲电网现代化改造叠加 AI 数据中心用电激增，大型储能与高压变压器招标维持高增长，国内头部厂商交付周期与毛利率优势显著。#新能源 #储能'
          }
        ],
        pdfs: [
          { title: '人工智能行业深度：1.6T 光模块与液冷算力底座演进全景', industry: '人工智能', broker: '中信证券', sizeMB: 3.4, url: '', filename: 'AI_算力与液冷深度.pdf' },
          { title: '端侧 AI 硬件产业链梳理：AI 眼镜与 AI PC 供应链价值量拆解', industry: '人工智能', broker: '国泰君安', sizeMB: 2.3, url: '', filename: '端侧AI硬件产业链.pdf' },
          { title: '半导体设备行业专题：先进制程扩产周期下的国产替代弹性测算', industry: '半导体', broker: '中金公司', sizeMB: 2.8, url: '', filename: '半导体设备国产替代.pdf' },
          { title: '存储芯片行业周报：HBM 产能排期与企业级 SSD 价格追踪', industry: '半导体', broker: '中信证券', sizeMB: 1.7, url: '', filename: '存储芯片行业周报.pdf' },
          { title: '海外大储与电网设备出海：数据中心电力需求拉动新周期', industry: '新能源', broker: '华泰证券', sizeMB: 4.1, url: '', filename: '海外大储与电网出海.pdf' },
          { title: '固态电池产业化进程跟踪：半固态装车提速与关键材料突破', industry: '新能源', broker: '华泰证券', sizeMB: 2.9, url: '', filename: '固态电池产业化跟踪.pdf' },
          { title: '创新药行业跟踪：ADC 与双抗出海 BD 交易复盘与管线展望', industry: '医药生物', broker: '招商证券', sizeMB: 3.0, url: '', filename: '创新药出海复盘.pdf' },
          { title: '四季度宏观经济与大类资产配置展望：政策落地与盈利修复', industry: '宏观策略', broker: '中金公司', sizeMB: 5.2, url: '', filename: '四季度宏观策略展望.pdf' }
        ]
      },
      '2026-11-16': {
        date: '2026-11-16',
        meta: {
          noteCount: 2,
          pdfCount: 5,
          industries: ['智能驾驶', '人形机器人', '人工智能', '宏观策略'],
          brokers: ['华泰证券', '国泰君安', '中金公司', '招商证券'],
          generatedAt: '2026-11-16 19:10'
        },
        notes: [
          {
            id: 101,
            category: '科技前沿',
            time: '18:10',
            title: '高阶智驾平权提速：端到端大模型下沉至 15 万级主流车型',
            charCount: 2100,
            content: '## 产业拐点\n头部车企将城市 NOA 下放至 15–20 万元主力价格带，域控制器、大算力智驾芯片与线控底盘迎来放量周期。#智能驾驶'
          },
          {
            id: 102,
            category: '券商纪要',
            time: '15:20',
            title: '人形机器人量产前夜：丝杠、减速器与灵巧手降本路径',
            charCount: 1850,
            content: '## 核心零部件\n行星滚柱丝杠、空心杯电机与六维力传感器占整机 BOM 比重高，国产精密制造企业切入头部供应链进程加快。#人形机器人'
          }
        ],
        pdfs: [
          { title: '智能驾驶深度报告：城市 NOA 下沉周期与域控芯片格局', industry: '智能驾驶', broker: '华泰证券', sizeMB: 3.8, url: '', filename: '智能驾驶深度报告.pdf' },
          { title: '汽车线控底盘行业专题：高阶智驾必备执行层升级', industry: '智能驾驶', broker: '中金公司', sizeMB: 3.1, url: '', filename: '汽车线控底盘专题.pdf' },
          { title: '人形机器人产业链全景：丝杠与灵巧手量产降本测算', industry: '人形机器人', broker: '国泰君安', sizeMB: 4.5, url: '', filename: '人形机器人产业链全景.pdf' },
          { title: '大模型多模态应用商业化进展：Agent 工作流落地调研', industry: '人工智能', broker: '中金公司', sizeMB: 2.6, url: '', filename: '多模态Agent商业化.pdf' },
          { title: '全球流动性与汇率月度跟踪报告', industry: '宏观策略', broker: '招商证券', sizeMB: 2.1, url: '', filename: '全球流动性月报.pdf' }
        ]
      }
    }
  };

  const state = {
    sourceMode: 'local',
    dates: [],
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
  function shortDate(s) {
    if (!s) return '';
    const p = s.split('-');
    return p.length === 3 ? `${p[1]}.${p[2]}` : s;
  }
  function weekday(s) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? '' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }
  function toast(msg) {
    const wrap = $('#toastWrap');
    wrap.innerHTML = `<div class="toast">${escapeHtml(msg)}</div>`;
    setTimeout(() => { wrap.innerHTML = ''; }, 2000);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('已复制总结全文')).catch(() => fallbackCopy(text));
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
      toast('已复制总结全文');
    } catch { toast('复制失败'); }
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

  // ---------- 数据加载 ----------
  async function fetchJson(url, ms = 4000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  async function loadIndex() {
    try {
      const idx = await fetchJson('data/index.json', 3000);
      if (idx && Array.isArray(idx.dates) && idx.dates.length) {
        state.sourceMode = 'local';
        state.dates = idx.dates;
        $('#demoStrip').hidden = true;
        renderDates();
        await switchDate(state.dates[0]);
        return;
      }
    } catch { /* fallback */ }

    try {
      const idx = await fetchJson(`${GITHUB_RAW_BASE}/data/index.json`, 4000);
      if (idx && Array.isArray(idx.dates) && idx.dates.length) {
        state.sourceMode = 'github';
        state.dates = idx.dates;
        $('#demoStrip').hidden = true;
        renderDates();
        await switchDate(state.dates[0]);
        return;
      }
    } catch { /* fallback */ }

    state.sourceMode = 'demo';
    state.dates = DEMO_DATA.dates.slice();
    $('#demoStrip').hidden = false;
    renderDates();
    await switchDate(state.dates[0]);
  }

  async function switchDate(date) {
    if (!date) return;
    try {
      let data;
      if (state.sourceMode === 'local') {
        data = await fetchJson(`data/dates/${date}.json`, 5000);
      } else if (state.sourceMode === 'github') {
        data = await fetchJson(`${GITHUB_RAW_BASE}/data/dates/${date}.json`, 5000);
        if (data && Array.isArray(data.pdfs)) {
          data.pdfs = data.pdfs.map(p => ({
            ...p,
            url: p.url && !/^https?:\/\//.test(p.url) ? `${GITHUB_RAW_BASE}/${p.url.replace(/^\.?\//, '')}` : p.url
          }));
        }
      } else {
        data = DEMO_DATA.days[date];
      }
      if (!data) throw new Error('数据不存在');

      state.currentDate = date;
      state.day = {
        date: data.date || date,
        notes: Array.isArray(data.notes) ? data.notes : [],
        pdfs: Array.isArray(data.pdfs) ? data.pdfs : []
      };
      state.activeIndustry = '全部';
      state.query = '';
      $('#searchInput').value = '';
      $('#editionDateTag').textContent = `${formatDate(date)} ${weekday(date)}`;
      $('#dateMenu').hidden = true;
      $('#dateMoreBtn').setAttribute('aria-expanded', 'false');

      renderDates();
      renderBriefs();
      renderIndustryTabs();
      renderReports();
    } catch (err) {
      toast('加载失败：' + err.message);
    }
  }

  // ---------- 顶部日期切换 ----------
  function renderDates() {
    const visible = state.dates.slice(0, 4);
    const overflow = state.dates.slice(4);
    $('#datePills').innerHTML = visible.map((d, i) => `
      <button type="button" class="date-pill ${d === state.currentDate ? 'active' : ''}" data-date="${escapeAttr(d)}">
        ${shortDate(d)}${i === 0 ? ' 最新' : ''}
      </button>
    `).join('');
    $$('[data-date]', $('#datePills')).forEach(b => b.addEventListener('click', () => switchDate(b.dataset.date)));

    const moreWrap = $('#dateMoreWrap');
    if (overflow.length) {
      moreWrap.hidden = false;
      $('#dateMenu').innerHTML = state.dates.map(d => `
        <button type="button" class="date-menu-item ${d === state.currentDate ? 'active' : ''}" data-date="${escapeAttr(d)}">
          <span>${formatDate(d)}</span><span>${weekday(d)}</span>
        </button>
      `).join('');
      $$('[data-date]', $('#dateMenu')).forEach(b => b.addEventListener('click', () => switchDate(b.dataset.date)));
    } else {
      moreWrap.hidden = true;
    }
  }

  // ---------- 1. 每日 AI 总结（顶部精简区） ----------
  function renderBriefs() {
    const section = $('#aiBriefSection');
    const q = state.query.toLowerCase();
    const notes = state.day.notes.filter(n =>
      !q ||
      String(n.title || '').toLowerCase().includes(q) ||
      String(n.content || '').toLowerCase().includes(q) ||
      String(n.category || '').toLowerCase().includes(q)
    );
    if (!state.day.notes.length) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    const grid = $('#aiBriefGrid');
    if (!notes.length) {
      grid.innerHTML = '<div class="skeleton-line" style="padding:18px 0">当日 AI 总结中无匹配关键词</div>';
      return;
    }
    grid.innerHTML = notes.map(n => `
      <article class="brief-card" data-note-id="${n.id}">
        <div class="brief-card-top">
          <span class="note-cat-tag">${escapeHtml(n.category || 'AI 总结')}</span>
          <span class="brief-time">${escapeHtml(n.time || '')}</span>
        </div>
        <h2 class="brief-title">${escapeHtml(n.title)}</h2>
        <p class="brief-excerpt">${escapeHtml(getExcerpt(n.content))}</p>
      </article>
    `).join('');

    $$('.brief-card', grid).forEach(card => card.addEventListener('click', () => {
      const n = state.day.notes.find(x => x.id === Number(card.dataset.noteId));
      if (n) openNoteDrawer(n);
    }));
  }

  // ---------- 2. 按行业分类研报原文 ----------
  function getIndustries() {
    const map = new Map();
    state.day.pdfs.forEach(p => {
      const ind = p.industry || '综合研究';
      map.set(ind, (map.get(ind) || 0) + 1);
    });
    return Array.from(map.entries()); // [[industry, count], ...]
  }

  function renderIndustryTabs() {
    const entries = getIndustries();
    const total = state.day.pdfs.length;
    const tabs = [['全部', total], ...entries];
    $('#industryTabs').innerHTML = tabs.map(([ind, cnt]) => `
      <button type="button" class="ind-tab ${state.activeIndustry === ind ? 'active' : ''}" data-ind="${escapeAttr(ind)}" role="tab" aria-selected="${state.activeIndustry === ind}">
        ${escapeHtml(ind === '全部' ? '全部行业' : ind)}<span class="ind-tab-cnt">${cnt}</span>
      </button>
    `).join('');

    $$('.ind-tab', $('#industryTabs')).forEach(btn => btn.addEventListener('click', () => {
      state.activeIndustry = btn.dataset.ind;
      renderIndustryTabs();
      renderReports();
    }));
  }

  function renderReports() {
    const q = state.query.toLowerCase();
    const filtered = state.day.pdfs.filter(p => {
      const ind = p.industry || '综合研究';
      const matchInd = state.activeIndustry === '全部' || ind === state.activeIndustry;
      const matchQ = !q ||
        String(p.title || '').toLowerCase().includes(q) ||
        ind.toLowerCase().includes(q) ||
        String(p.broker || '').toLowerCase().includes(q);
      return matchInd && matchQ;
    });

    $('#reportsCount').textContent = `共 ${filtered.length} 份研报`;
    const container = $('#industryGroups');
    const empty = $('#emptyState');

    if (!filtered.length) {
      container.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    // 按行业分组渲染
    const grouped = new Map();
    filtered.forEach(p => {
      const ind = p.industry || '综合研究';
      if (!grouped.has(ind)) grouped.set(ind, []);
      grouped.get(ind).push(p);
    });

    let globalIdx = 0;
    const flatList = [];
    container.innerHTML = Array.from(grouped.entries()).map(([ind, items]) => {
      const cardsHtml = items.map(p => {
        const idx = globalIdx++;
        flatList.push(p);
        const dlHtml = p.url
          ? `<a class="dl-icon-btn" href="${escapeAttr(p.url)}" download="${escapeAttr(p.filename || p.title + '.pdf')}" title="下载 PDF" aria-label="下载 PDF">
               <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
             </a>`
          : `<button type="button" class="dl-icon-btn" data-demo-dl="${idx}" title="下载 PDF" aria-label="下载 PDF">
               <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
             </button>`;
        return `
          <article class="pdf-card" data-pdf-idx="${idx}">
            <div class="pdf-card-main">
              <h3 class="pdf-card-title">${escapeHtml(p.title)}</h3>
              <div class="pdf-card-meta">
                ${p.broker ? `<span class="pdf-broker">${escapeHtml(p.broker)}</span>` : ''}
                <span>${p.sizeMB} MB</span>
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
    $$('[data-demo-dl]', container).forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        toast('示例条目无真实文件，部署至 GitHub Pages 后即可直接下载');
      });
    });
  }

  // ---------- AI 总结抽屉 ----------
  function openNoteDrawer(note) {
    state.activeNote = note;
    $('#drawerCat').textContent = note.category || 'AI 总结';
    $('#drawerTime').textContent = `${formatDate(state.currentDate)} ${note.time || ''}`;

    let body = String(note.content || '');
    const dm = body.match(/^([^\n]*·\s*第\s*\d+\/\d+\s*段[^\n]*)\n?/);
    if (dm) body = body.slice(dm[0].length);

    const article = $('#noteDrawerContent');
    article.style.setProperty('--article-size', state.articleSize + 'px');
    article.innerHTML = `<h1>${escapeHtml(note.title)}</h1>` + renderMarkdown(body);

    const heads = $$('h2, h3', article);
    const toc = $('#noteDrawerToc');
    if (heads.length >= 2) {
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

  // ---------- 沉浸式分栏 PDF 阅读工作台 ----------
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

    // 更新左侧同行业列表高亮
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

  // ---------- 本地 JSON 导入（预览） ----------
  function handleJsonImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (!parsed || (!Array.isArray(parsed.notes) && !Array.isArray(parsed.pdfs))) {
          throw new Error('请上传 data/dates/YYYY-MM-DD.json');
        }
        const d = parsed.date || file.name.replace(/\.json$/i, '') || '本地数据';
        DEMO_DATA.days[d] = parsed;
        if (!state.dates.includes(d)) state.dates.unshift(d);
        state.sourceMode = 'demo';
        switchDate(d);
        toast('已导入：' + d);
      } catch (err) {
        toast('导入失败：' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  // ---------- 初始化与事件 ----------
  function initPrefs() {
    const theme = storageGet(KEYS.theme, '');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    const fs = parseFloat(storageGet(KEYS.fontSize, '15.5'));
    if (!isNaN(fs) && fs >= 13 && fs <= 20) state.articleSize = fs;
  }

  function bindEvents() {
    $('#brandBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    $('#themeToggle').addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      storageSet(KEYS.theme, next);
    });

    $('#dateMoreBtn').addEventListener('click', e => {
      e.stopPropagation();
      const menu = $('#dateMenu');
      const open = menu.hidden;
      menu.hidden = !open;
      $('#dateMoreBtn').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('#dateMoreWrap')) {
        $('#dateMenu').hidden = true;
        $('#dateMoreBtn').setAttribute('aria-expanded', 'false');
      }
    });

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

    // 导入 JSON
    $('#importJsonBtn').addEventListener('click', () => $('#jsonFileInput').click());
    $('#jsonFileInput').addEventListener('change', e => handleJsonImport(e.target.files[0]));

    // 快捷键
    document.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        $('#searchInput').focus();
      } else if (e.key === 'Escape') {
        if (!$('#pdfWorkspaceOverlay').hidden) closePdfWorkspace();
        else if (!$('#noteDrawerOverlay').hidden) closeNoteDrawer();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPrefs();
    bindEvents();
    loadIndex();
  });
})();
