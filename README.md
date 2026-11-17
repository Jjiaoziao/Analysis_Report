# Analysis_Report · 每日研报知识库

一个把每日券商研报系统化沉淀、快速查阅的静态网页。支持研报纪要全文阅读、市场复盘、研报原文在线预览与下载，手机和电脑均可访问。

在线地址（启用 GitHub Pages 后）：`https://Jjiaoziao.github.io/Analysis_Report/`

## 目录结构

```
.
├── index.html              # 网页入口
├── assets/
│   ├── css/style.css       # 样式
│   └── js/app.js           # 交互逻辑
├── data/
│   ├── notes.json          # 纪要数据（脚本生成）
│   ├── pdfs.json           # 研报索引（脚本生成，链接指向日期文件夹）
│   └── meta.json           # 统计元信息（脚本生成）
├── 2026-11-16/             # 原始资料：txt + 57 份研报 PDF
├── scripts/
│   ├── build_data.py       # 数据构建脚本
│   └── deploy.sh           # 一键提交推送脚本
└── .nojekyll               # 让 GitHub Pages 保留静态文件
```

## 功能

- **纪要速览**：33 条 AI 整理的研报纪要 / 市场复盘，按主题分类、全文搜索、弹窗阅读（带目录与阅读进度）
- **研报原文库**：57 份券商研报 PDF，按行业 / 机构筛选，在线预览与下载
- **响应式设计**：桌面双栏、移动端单栏自适应；浅色 / 暗色主题一键切换

## 发布到 GitHub Pages

仓库 → **Settings** → **Pages** → Build and deployment → Source 选 **Deploy from a branch** →
Branch 选 `main`、目录选 `/(root)` → **Save**。约 1–2 分钟后访问上面的在线地址。

## 每日更新数据

1. 新建日期文件夹（如 `2026-11-17/`），把当天的 `2026-11-17.txt` 和 PDF 全部放进去，并提交推送。
2. 修改 `scripts/build_data.py` 顶部三个变量：

```python
SOURCE_TXT = r"C:\Users\jiaoz\Desktop\2026-11-17.txt"
SOURCE_PDF_DIR = r"C:\Users\jiaoz\Desktop\2026-11-17"
REPORT_DATE = "2026-11-17"
```

3. 运行 `python scripts/build_data.py` 重新生成 `data/*.json`（脚本默认直接引用仓库里同名日期文件夹的 PDF，不会重复复制）。
4. `git add . && git commit -m "update: 研报数据" && git push`，约 1 分钟后网页显示最新内容。

> 当前版本一次展示一天的数据。数据层已预留 `reportDate` 字段，后续可扩展为多日期归档 + 日历切换。

## 免责声明

本站内容仅供研究学习参考，不构成任何投资建议。研报版权归原发布机构所有，请勿用于商业用途。
