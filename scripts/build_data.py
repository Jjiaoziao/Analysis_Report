# -*- coding: utf-8 -*-
"""
研报数据构建脚本（多日期归档版）
用法: python build_data.py
把某一天的 txt + PDF 文件夹解析成结构化数据，写入 data/dates/<日期>.json，
并更新 data/index.json 的日期列表。每运行一次只处理一天，不会影响其它日期。
新增一天数据：只改下面 SOURCE_TXT / SOURCE_PDF_DIR / REPORT_DATE 三个变量再运行即可。
"""
import os
import re
import json
import hashlib
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESKTOP = r"C:\Users\jiaoz\Desktop"
SOURCE_TXT = os.path.join(DESKTOP, "2026-11-16.txt")
SOURCE_PDF_DIR = os.path.join(DESKTOP, "2026-11-16")
REPORT_DATE = "2026-11-16"

# PDF 链接前缀：默认指向仓库里以日期命名的文件夹（不重复上传 PDF）
# 例如 url = "2026-11-16/xxx.pdf"
PDF_URL_PREFIX = REPORT_DATE

DATA_DIR = os.path.join(BASE_DIR, "data")
DATES_DIR = os.path.join(DATA_DIR, "dates")
os.makedirs(DATES_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. 解析 TXT
# ---------------------------------------------------------------------------
EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u2190-\u21FF\u2B00-\u2BFF]"
)


def clean_title(raw: str) -> str:
    t = EMOJI_RE.sub("", raw)
    t = re.sub(r"^#+\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t or "未命名"


def categorize(title: str, idx: int) -> str:
    if "研报纪要" in title:
        return "每日纪要"
    if "复盘报告" in title or "复盘" in title:
        return "市场复盘"
    if "券商纪要" in title or "场深挖" in title:
        return "券商纪要"
    if any(k in title for k in ["周观点", "投资逻辑", "策略", "布局", "配置"]):
        return "投资策略"
    if any(k in title for k in ["批价", "库存", "数据跟踪", "数据库"]):
        return "数据跟踪"
    if any(k in title for k in ["AI", "算力", "机器人", "端侧", "百度", "谷歌", "OpenAI"]):
        return "科技前沿"
    return "行业动态"


def parse_txt(path: str):
    with open(path, encoding="utf-8-sig") as f:
        text = f.read()

    pattern = re.compile(r"^【(\d+)】(\d{2}:\d{2})\s*-\s*(.+)$", re.MULTILINE)
    matches = list(pattern.finditer(text))
    segments = []

    for i, m in enumerate(matches):
        idx = int(m.group(1))
        time = m.group(2)
        raw_title = m.group(3).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip("\n")
        body = re.sub(r"^=+\s*$", "", body, flags=re.MULTILINE).strip("\n")

        title = clean_title(raw_title)
        category = categorize(title, idx)

        date_note = ""
        first_lines = [l for l in body.split("\n") if l.strip()]
        if first_lines and "· 第" in first_lines[0]:
            date_note = first_lines[0].strip()

        sections = []
        for sm in re.finditer(r"^(#{2,4})\s+(.+)$", body, re.MULTILINE):
            sec_title = clean_title(sm.group(2))
            if sec_title and len(sec_title) < 80:
                sections.append({"level": len(sm.group(1)), "title": sec_title})

        segments.append({
            "id": idx,
            "time": time,
            "title": title,
            "rawTitle": raw_title,
            "category": category,
            "dateNote": date_note,
            "sections": sections,
            "content": body,
            "charCount": len(body),
        })
    return segments


# ---------------------------------------------------------------------------
# 2. 解析 PDF 元数据
# ---------------------------------------------------------------------------
BROKERS = [
    "国金证券", "中信证券", "中信建投", "华泰证券", "国泰海通", "国泰君安",
    "招商证券", "广发证券", "海通证券", "申万宏源", "中金公司", "中国银河",
    "兴业证券", "东方证券", "方正证券", "长江证券", "东吴证券", "国信证券",
    "华创证券", "民生证券", "浙商证券", "天风证券", "国盛证券", "开源证券",
    "西部证券", "东北证券", "山西证券", "国元证券", "华西证券", "中原证券",
    "太平洋证券", "财通证券", "东兴证券", "信达证券", "华福证券", "德邦证券",
    "上海证券", "渤海证券", "长城证券", "中银证券", "粤开证券", "万联证券",
    "国海证券", "联讯证券", "湘财证券", "南京证券", "第一创业", "西南证券",
    "华龙证券", "国投证券", "华安证券", "中邮证券", "华宝证券", "华源证券",
    "东海证券", "国联证券", "平安证券", "光大证券", "华鑫证券", "中泰证券",
    "高通", "花旗", "摩根士丹利", "高盛", "摩根大通", "美银", "瑞银", "野村",
    "界面新闻", "财联社", "东方财富", "同花顺",
]
BROKER_RE = re.compile("(" + "|".join(sorted(BROKERS, key=len, reverse=True)) + ")")
BROKER_TEXT_CACHE = {}


def guess_broker_from_filename(name: str) -> str:
    for b in BROKERS:
        if b in name:
            return b
    return ""


def parse_pdfs(pdf_dir: str):
    pdfs = []
    if not os.path.isdir(pdf_dir):
        return pdfs
    for fn in sorted(os.listdir(pdf_dir)):
        if not fn.lower().endswith(".pdf"):
            continue
        path = os.path.join(pdf_dir, fn)
        size = os.path.getsize(path)
        stem = fn[:-4]
        m = re.match(r"^\[([^\]]+)\]\s*(.+)$", stem)
        if m:
            industry, title = m.group(1).strip(), m.group(2).strip()
        else:
            industry, title = "其他", stem
        broker = BROKER_TEXT_CACHE.get(fn, "") or guess_broker_from_filename(fn)
        pdfs.append({
            "id": hashlib.md5(fn.encode("utf-8")).hexdigest()[:10],
            "filename": fn,
            "industry": industry,
            "title": title,
            "broker": broker,
            "size": size,
            "sizeMB": round(size / 1024 / 1024, 2),
            "url": f"{PDF_URL_PREFIX}/{fn}",
        })
    return pdfs


# ---------------------------------------------------------------------------
# 3. 输出（单日文件 + 索引）
# ---------------------------------------------------------------------------
def main():
    import tempfile
    broker_cache_path = os.path.join(tempfile.gettempdir(), "brokers.json")
    if os.path.exists(broker_cache_path):
        with open(broker_cache_path, encoding="utf-8") as f:
            raw = json.load(f)
        for fn, v in raw.items():
            BROKER_TEXT_CACHE[fn] = v.get("broker", "")

    segments = parse_txt(SOURCE_TXT)
    pdfs = parse_pdfs(SOURCE_PDF_DIR)

    cat_count = {}
    for s in segments:
        cat_count[s["category"]] = cat_count.get(s["category"], 0) + 1
    industries = sorted(set(p["industry"] for p in pdfs))

    meta = {
        "reportDate": REPORT_DATE,
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "noteCount": len(segments),
        "pdfCount": len(pdfs),
        "categoryCount": cat_count,
        "industries": industries,
        "brokers": sorted(set(p["broker"] for p in pdfs if p["broker"])),
    }

    day_data = {
        "date": REPORT_DATE,
        "meta": meta,
        "notes": segments,
        "pdfs": pdfs,
    }
    day_path = os.path.join(DATES_DIR, f"{REPORT_DATE}.json")
    with open(day_path, "w", encoding="utf-8") as f:
        json.dump(day_data, f, ensure_ascii=False, indent=2)

    # 更新索引：保留已有日期，新增/覆盖本次日期
    index_path = os.path.join(DATA_DIR, "index.json")
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)
    else:
        index = {"dates": []}

    dates = [d for d in index.get("dates", []) if d != REPORT_DATE]
    dates.append(REPORT_DATE)
    dates = sorted(set(dates), reverse=True)  # 最新日期在前
    index = {
        "dates": dates,
        "latest": dates[0],
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"[OK] {REPORT_DATE}: 笔记 {len(segments)} 条, PDF {len(pdfs)} 份")
    print(f"[OK] 行业 {len(industries)} 个, 券商 {len(meta['brokers'])} 家")
    print(f"[OK] 单日数据 -> {day_path}")
    print(f"[OK] 日期索引 -> {index_path} (共 {len(dates)} 天: {', '.join(dates)})")


if __name__ == "__main__":
    main()
