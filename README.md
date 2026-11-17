# Analysis_Report · 每日研报知识库

按日期归档的券商研报知识库。支持左侧栏切换日期、研报纪要全文阅读、市场复盘、研报原文在线预览与下载，手机和电脑均可访问。

在线地址（GitHub Pages）：`https://Jjiaoziao.github.io/Analysis_Report/`

## 功能

- **按日期归档**：左侧栏按日期列出每一天的研报，点击即可切换查看，历史内容随时可查
- **纪要速览**：每日 AI 整理的研报纪要 / 市场复盘，按主题分类、全文搜索、弹窗阅读（带目录与阅读进度）
- **研报原文库**：券商研报 PDF，按行业 / 机构筛选，在线预览与下载
- **响应式**：桌面双栏 + 左侧栏，移动端侧边栏抽屉式展开；浅色 / 暗色主题切换

## 目录结构

```
.
├── index.html              # 网页入口
├── assets/
│   ├── css/style.css       # 样式
│   └── js/app.js           # 交互逻辑（日期切换 / 搜索 / 筛选 / 弹窗）
├── data/
│   ├── index.json          # 日期索引（列出所有可切换日期）
│   └── dates/
│       └── 2026-11-16.json # 某一天的完整数据（meta + notes + pdfs）
├── 2026-11-16/             # 原始资料：当天的 txt + 57 份研报 PDF
├── scripts/build_data.py   # 数据构建脚本
└── .nojekyll
```

## 发布 / 更新

网页由 GitHub Pages 自动发布：仓库 → **Settings** → **Pages** → Source 选 **Deploy from a branch** → Branch `main` / `/(root)` → Save。

### 新增一天的研报

1. 在仓库根目录新建日期文件夹（如 `2026-11-17/`），把当天的 PDF 和 txt 全部放进去。
2. 修改 `scripts/build_data.py` 顶部三个变量：

```python
SOURCE_TXT = r"C:\Users\jiaoz\Desktop\2026-11-17.txt"
SOURCE_PDF_DIR = r"C:\Users\jiaoz\Desktop\2026-11-17"
REPORT_DATE = "2026-11-17"
```

3. 运行 `python scripts/build_data.py` → 自动生成 `data/dates/2026-11-17.json` 并把新日期加入 `data/index.json`（不影响已有日期）。
4. `git add . && git commit -m "update: 研报 2026-11-17" && git push`，约 1 分钟后网页左侧栏出现新日期。

> 说明：PDF 直接引用仓库里的日期文件夹，不重复上传副本；txt 内容已解析进 JSON，网页不直接读取它，但保留作原始存档。

## 免责声明

本站内容仅供研究学习参考，不构成任何投资建议。研报版权归原发布机构所有，请勿用于商业用途。
