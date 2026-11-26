# -*- coding: utf-8 -*-
"""
研报数据构建脚本（自动扫描与多日期归档版）
用法:
  python scripts/build_data.py                   # 自动扫描项目内所有日期并构建/增量更新
  python scripts/build_data.py --date 2026-11-25 # 仅构建指定日期
  python scripts/build_data.py --force           # 强制重新构建所有日期

数据文件放置规则（任选一种，脚本会自动识别）：
  1. PDF 目录：放在项目根目录下，命名为对应日期，如 2026-11-25/
  2. 总结文本：
     - 推荐：放在 data/dates/2026-11-25.txt
     - 或：放在项目根目录 2026-11-25.txt
     - 或：放在对应日期文件夹内 2026-11-25/2026-11-25.txt
"""
import os
import re
import glob
import json
import hashlib
import argparse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATES_DIR = os.path.join(DATA_DIR, "dates")
os.makedirs(DATES_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. 券商与研究机构库及提取
# ---------------------------------------------------------------------------
BROKERS = [
    "中信建投证券", "中信建投", "中信证券", "华泰证券", "国泰海通", "国泰君安",
    "招商证券", "广发证券", "海通证券", "申万宏源", "中金公司", "中国银河", "中国银河证券",
    "兴业证券", "东方证券", "方正证券", "长江证券", "东吴证券", "国信证券", "国金证券",
    "华创证券", "民生证券", "浙商证券", "天风证券", "国盛证券", "开源证券",
    "西部证券", "东北证券", "山西证券", "国元证券", "华西证券", "中原证券",
    "太平洋证券", "财通证券", "东兴证券", "信达证券", "华福证券", "德邦证券",
    "上海证券", "渤海证券", "长城证券", "中银国际", "中银证券", "粤开证券", "万联证券",
    "国海证券", "联讯证券", "湘财证券", "南京证券", "第一创业", "西南证券",
    "华龙证券", "国投证券", "华安证券", "中邮证券", "华宝证券", "华源证券",
    "东海证券", "国联民生", "国联证券", "平安证券", "光大证券", "华鑫证券", "中泰证券",
    "甬兴证券", "诚通证券", "野村东方国际", "高盛高华", "瑞银证券",
    "花旗", "摩根士丹利", "高盛", "摩根大通", "美银", "瑞银", "野村", "野村证券",
    "麦格理", "巴克莱", "汇丰", "里昂证券", "伯恩斯坦",
    "艾瑞咨询", "灼识咨询", "亿欧智库", "甲子光年", "量子位", "头豹研究院", "赛迪顾问",
    "中国信通院", "克而瑞", "界面新闻", "财联社", "东方财富", "同花顺",
]

BROKER_ALIAS = {
    "中银国际": "中银证券",
    "中信建投证券": "中信建投",
    "中国银河证券": "中国银河",
    "野村证券": "野村",
    "国联民生": "国联证券",
}


def normalize_broker(b: str) -> str:
    return BROKER_ALIAS.get(b, b)


def guess_broker_from_filename(name: str) -> str:
    for b in sorted(BROKERS, key=len, reverse=True):
        if b in name:
            return normalize_broker(b)
    return ""


def extract_broker_from_pdf(pdf_path: str) -> str:
    """尝试使用 PyMuPDF 读取 PDF 前 2 页及末页文本匹配券商与研究机构"""
    try:
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz
        doc = fitz.open(pdf_path)
        pages = [doc[0]]
        if len(doc) > 1:
            pages.append(doc[1])
        if len(doc) > 2:
            pages.append(doc[-1])
        text = "\n".join(page.get_text("text") for page in pages)
        doc.close()
        for b in sorted(BROKERS, key=len, reverse=True):
            if b in text:
                return normalize_broker(b)
    except Exception:
        pass
    return ""


# ---------------------------------------------------------------------------
# 2. 解析 TXT
# ---------------------------------------------------------------------------
EMOJI_RE = re.compile(
    "[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u2190-\u21FF\u2B00-\u2BFF]"
)
WECHAT_STICKER_RE = re.compile(
    r"\[(?:火|火箭|樱花|钻石|玫瑰|爱心|爆竹|烟花|定位|太阳|啤酒|庆祝|礼物|红包|拳头|灯泡|图钉|微笑|發|福|红|闪电|强|赞|握手|合十|加油|鼓掌|机智|吃瓜|呲牙|偷笑)\]"
)


def clean_title(raw: str) -> str:
    t = EMOJI_RE.sub("", raw or "")
    t = WECHAT_STICKER_RE.sub("", t)
    t = re.sub(r"^#+\s*", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t or "未命名"


def clean_section_heading(raw: str) -> str:
    t = clean_title(raw)
    t = re.sub(r"^\d+\s*[.、．)\]]\s*", "", t)
    t = re.sub(r"^【([^】]+)】$", r"\1", t)
    return t.strip() or t


def categorize(title: str, body: str = "") -> str:
    if "研报纪要" in title:
        return "每日纪要"
    if "复盘报告" in title or "复盘" in title:
        return "市场复盘"
    if "券商纪要" in title or "场深挖" in title:
        return "券商纪要"
    if any(k in title for k in ["周观点", "投资逻辑", "策略", "布局", "配置"]):
        return "投资策略"
    if any(k in title for k in ["批价", "库存", "数据跟踪", "数据库", "月报", "周报"]):
        return "数据跟踪"
    if any(k in title for k in ["AI", "算力", "机器人", "端侧", "百度", "谷歌", "OpenAI", "英伟达", "黄仁勋", "光模块", "存储", "HBM", "AIDC", "晶圆", "半导体"]):
        return "科技前沿"
    return "行业动态"


def build_display_meta(title: str, date_note: str, sections: list) -> tuple:
    """
    针对多段式重复标题（如 '研报纪要 20261125' 或 '一、行业投资逻辑'），
    自动提炼有辨识度的卡片主标题 displayTitle 与副标题标签 seriesTag。
    """
    series_tag = ""
    if date_note:
        m_seg = re.search(r"(第\s*\d+/\d+\s*段)", date_note)
        if m_seg:
            series_tag = m_seg.group(1).replace(" ", "")

    # 情况 1：标题形如 "研报纪要 20261125"
    if re.match(r"^研报纪要\s*\d{6,8}$", title):
        if sections:
            lead = clean_section_heading(sections[0]["title"])
            extra = f" 等 {len(sections)} 篇" if len(sections) > 1 and series_tag else ""
            tag = f"研报纪要 · {series_tag}" if series_tag else "研报纪要"
            return lead + extra, tag
        if series_tag:
            return f"{title}（{series_tag}）", "研报纪要"

    # 情况 2：标题形如 "一、行业投资逻辑"
    if re.match(r"^[一二三四五六七八九十]+[、.．]\s*行业投资逻辑$", title) and sections:
        lead = clean_section_heading(sections[0]["title"])
        lead = re.sub(r"【[^】]*】$", "", lead).strip()
        return lead, "行业投资逻辑"

    return title, series_tag


def parse_txt(path: str):
    if not os.path.isfile(path):
        return []
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
        body = re.sub(r"^=+\s*$", "", body, flags=re.MULTILINE)
        body = re.sub(r"^\s*#最新段子#\s*$", "", body, flags=re.MULTILINE)
        body = WECHAT_STICKER_RE.sub("", body).strip("\n")

        title = clean_title(raw_title)
        category = categorize(title, body)

        date_note = ""
        first_lines = [l for l in body.split("\n") if l.strip()]
        if first_lines and "· 第" in first_lines[0]:
            date_note = first_lines[0].strip()

        sections = []
        for sm in re.finditer(r"^(?:(#{2,4})\s+(.+)|\*\*(\d+[、.．]\s*[^*\n]{3,76})\*\*)\s*$", body, re.MULTILINE):
            if sm.group(1):
                sec_title = clean_title(sm.group(2))
                lvl = len(sm.group(1))
            else:
                sec_title = clean_title(sm.group(3))
                lvl = 3
            if sec_title and len(sec_title) < 88:
                sections.append({"level": lvl, "title": sec_title})

        display_title, series_tag = build_display_meta(title, date_note, sections)

        segments.append({
            "id": idx,
            "time": time,
            "title": title,
            "displayTitle": display_title,
            "seriesTag": series_tag,
            "rawTitle": raw_title,
            "category": category,
            "dateNote": date_note,
            "sections": sections,
            "content": body,
            "charCount": len(body),
        })
    return segments


# ---------------------------------------------------------------------------
# 3. 解析 PDF 元数据
# ---------------------------------------------------------------------------
def parse_pdfs(pdf_dir: str, date_str: str, existing_brokers: dict = None):
    pdfs = []
    if not os.path.isdir(pdf_dir):
        return pdfs
    existing_brokers = existing_brokers or {}
    for fn in sorted(os.listdir(pdf_dir)):
        if not fn.lower().endswith(".pdf"):
            continue
        path = os.path.join(pdf_dir, fn)
        if not os.path.isfile(path):
            continue
        try:
            size = os.path.getsize(path)
        except OSError:
            continue
        stem = fn[:-4]
        m = re.match(r"^\[([^\]]+)\]\s*(.+)$", stem)
        if m:
            industry, title = m.group(1).strip(), m.group(2).strip()
        else:
            industry, title = "其他", stem

        broker = existing_brokers.get((fn, size)) or extract_broker_from_pdf(path) or guess_broker_from_filename(fn)
        pdfs.append({
            "id": hashlib.md5(fn.encode("utf-8")).hexdigest()[:10],
            "filename": fn,
            "industry": industry,
            "title": title,
            "broker": broker,
            "size": size,
            "sizeMB": round(size / 1024 / 1024, 2),
            "url": f"{date_str}/{fn}",
        })
    return pdfs


# ---------------------------------------------------------------------------
# 4. 自动寻找文件并构建单日数据
# ---------------------------------------------------------------------------
def find_source_files(date_str: str, custom_txt: str = None, custom_pdf_dir: str = None):
    txt_path = None
    if custom_txt and os.path.isfile(custom_txt):
        txt_path = custom_txt
    else:
        candidates = [
            os.path.join(DATES_DIR, f"{date_str}.txt"),
            os.path.join(BASE_DIR, f"{date_str}.txt"),
            os.path.join(BASE_DIR, date_str, f"{date_str}.txt"),
            os.path.join(os.path.expanduser("~"), "Desktop", f"{date_str}.txt"),
            r"C:\Users\jiaoz\Desktop" + f"\\{date_str}.txt",
        ]
        for c in candidates:
            if os.path.isfile(c):
                txt_path = c
                break

    pdf_dir = None
    if custom_pdf_dir and os.path.isdir(custom_pdf_dir):
        pdf_dir = custom_pdf_dir
    else:
        candidates = [
            os.path.join(BASE_DIR, date_str),
            os.path.join(os.path.expanduser("~"), "Desktop", date_str),
            r"C:\Users\jiaoz\Desktop" + f"\\{date_str}",
        ]
        for c in candidates:
            if os.path.isdir(c):
                pdf_dir = c
                break

    return txt_path, pdf_dir


def build_single_day(date_str: str, txt_path: str, pdf_dir: str):
    """构建单日的 JSON 文件"""
    day_path = os.path.join(DATES_DIR, f"{date_str}.json")
    existing_brokers = {}
    if os.path.isfile(day_path):
        try:
            with open(day_path, encoding="utf-8") as f:
                prev = json.load(f)
                for p in prev.get("pdfs", []):
                    if p.get("filename") and p.get("broker"):
                        existing_brokers[(p["filename"], p.get("size"))] = p["broker"]
        except Exception:
            pass

    segments = parse_txt(txt_path) if txt_path else []
    pdfs = parse_pdfs(pdf_dir, date_str, existing_brokers) if pdf_dir else []
    if not segments and not pdfs:
        if os.path.isfile(day_path):
            print(f"[跳过] {date_str}: 无源文件，保留已有 {day_path}")
            return True
        print(f"[警告] {date_str}: 未找到 TXT 或 PDF 文件，跳过")
        return False

    if not segments and os.path.isfile(day_path):
        try:
            with open(day_path, encoding="utf-8") as f:
                old_data = json.load(f)
                segments = old_data.get("notes", [])
                print(f"[保留] {date_str}: 沿用已有笔记 {len(segments)} 条")
        except Exception:
            pass

    cat_count = {}
    for s in segments:
        cat_count[s["category"]] = cat_count.get(s["category"], 0) + 1
    industries = sorted(set(p["industry"] for p in pdfs))

    meta = {
        "reportDate": date_str,
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "noteCount": len(segments),
        "pdfCount": len(pdfs),
        "categoryCount": cat_count,
        "industries": industries,
        "brokers": sorted(set(p["broker"] for p in pdfs if p["broker"])),
    }

    day_data = {
        "date": date_str,
        "meta": meta,
        "notes": segments,
        "pdfs": pdfs,
    }

    with open(day_path, "w", encoding="utf-8") as f:
        json.dump(day_data, f, ensure_ascii=False, indent=2)

    print(f"[成功] {date_str}: 笔记 {len(segments)} 条, PDF {len(pdfs)} 份, 行业 {len(industries)} 个, 机构 {len(meta['brokers'])} 家")
    return True


def update_global_index():
    """扫描 dates 目录下所有 json 文件并更新 index.json（附带每期统计概览）"""
    json_files = glob.glob(os.path.join(DATES_DIR, "*.json"))
    valid_dates = []
    date_stats = {}

    for f in json_files:
        stem = os.path.splitext(os.path.basename(f))[0]
        if re.match(r"^\d{4}-\d{2}-\d{2}$", stem):
            valid_dates.append(stem)
            try:
                with open(f, encoding="utf-8") as fp:
                    d = json.load(fp)
                    m = d.get("meta", {})
                    date_stats[stem] = {
                        "noteCount": m.get("noteCount", len(d.get("notes", []))),
                        "pdfCount": m.get("pdfCount", len(d.get("pdfs", []))),
                        "industryCount": len(m.get("industries", [])),
                        "brokerCount": len(m.get("brokers", [])),
                    }
            except Exception:
                pass

    valid_dates = sorted(set(valid_dates), reverse=True)
    if not valid_dates:
        print("[警告] 未发现任何日期的 JSON 数据")
        return

    ordered_stats = {dt: date_stats.get(dt, {}) for dt in valid_dates}
    index_path = os.path.join(DATA_DIR, "index.json")
    index_data = {
        "dates": valid_dates,
        "latest": valid_dates[0],
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "stats": ordered_stats,
    }
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)

    print(f"[索引已更新] 共 {len(valid_dates)} 期: {', '.join(valid_dates)}")
    print(f"[最新日期] {valid_dates[0]}")


def discover_dates():
    """自动发现项目中所有可能的日期（根目录下以日期命名的文件夹、dates 下的 txt/json 等）"""
    dates = set()
    for name in os.listdir(BASE_DIR):
        if re.match(r"^\d{4}-\d{2}-\d{2}$", name) and os.path.isdir(os.path.join(BASE_DIR, name)):
            dates.add(name)
    for name in os.listdir(DATES_DIR):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})\.(txt|json)$", name)
        if m:
            dates.add(m.group(1))
    return sorted(dates, reverse=True)


def main():
    parser = argparse.ArgumentParser(description="研报数据自动构建脚本")
    parser.add_argument("--date", type=str, help="指定构建日期，格式如 2026-11-25")
    parser.add_argument("--txt", type=str, help="指定 txt 总结文件路径")
    parser.add_argument("--pdf-dir", type=str, help="指定 pdf 文件夹路径")
    parser.add_argument("--force", action="store_true", help="强制全量重新构建")
    args = parser.parse_args()

    print("=" * 60)
    print("研报速览 · 数据自动构建工具")
    print("=" * 60)

    if args.date:
        target_dates = [args.date]
    else:
        target_dates = discover_dates()
        print(f"[*] 自动发现日期目录/文件: {', '.join(target_dates)}")

    for d in target_dates:
        txt_path, pdf_dir = find_source_files(d, args.txt, args.pdf_dir)
        print(f"\n[处理中] 日期: {d}")
        print(f"  - 总结文本: {txt_path or '未找到'}")
        print(f"  - PDF 目录: {pdf_dir or '未找到'}")
        build_single_day(d, txt_path, pdf_dir)

    print("\n" + "-" * 60)
    update_global_index()
    print("=" * 60)
    print("全部构建完成。")


if __name__ == "__main__":
    main()
