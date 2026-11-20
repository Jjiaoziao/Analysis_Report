# -*- coding: utf-8 -*-
"""
研报数据构建脚本（自动扫描与多日期归档版）
用法:
  python scripts/build_data.py              # 自动扫描项目内所有日期并构建/增量更新
  python scripts/build_data.py --date 2026-11-17 # 仅构建指定日期
  python scripts/build_data.py --force      # 强制重新构建所有日期

数据文件放置规则（任选一种，脚本会自动识别）：
  1. PDF 目录：放在项目根目录下，命名为对应日期，如 2026-11-17/
  2. 总结文本：
     - 推荐：放在 data/dates/2026-11-17.txt
     - 或：放在项目根目录 2026-11-17.txt
     - 或：放在对应日期文件夹内 2026-11-17/2026-11-17.txt
"""
import os
import re
import sys
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
# 1. 券商库与提取
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
    "东海证券", "国联证券", "平安证券", "光大证券", "华鑫证券", "中泰证券",
    "花旗", "摩根士丹利", "高盛", "摩根大通", "美银", "瑞银", "野村", "野村证券",
    "麦格理", "巴克莱", "汇丰", "里昂证券",
    "界面新闻", "财联社", "东方财富", "同花顺",
]
BROKER_RE = re.compile("(" + "|".join(sorted(BROKERS, key=len, reverse=True)) + ")")


def guess_broker_from_filename(name: str) -> str:
    for b in sorted(BROKERS, key=len, reverse=True):
        if b in name:
            return b
    return ""


def extract_broker_from_pdf(pdf_path: str) -> str:
    """尝试使用 PyMuPDF 读取 PDF 前 2 页及末页文本匹配券商机构"""
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
        for b in sorted(BROKERS, key=len, reverse=True):
            if b in text:
                if b == "中银国际": return "中银证券"
                if b == "中信建投证券": return "中信建投"
                if b == "中国银河证券": return "中国银河"
                return b
    except Exception:
        pass
    return ""


# ---------------------------------------------------------------------------
# 2. 解析 TXT
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
# 3. 解析 PDF 元数据
# ---------------------------------------------------------------------------
def parse_pdfs(pdf_dir: str, date_str: str):
    pdfs = []
    if not os.path.isdir(pdf_dir):
        return pdfs
    for fn in sorted(os.listdir(pdf_dir)):
        if not fn.lower().endswith(".pdf"):
            continue
        path = os.path.join(pdf_dir, fn)
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

        # 优先从 PDF 首页正文提取券商，其次推断文件名
        broker = extract_broker_from_pdf(path) or guess_broker_from_filename(fn)
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
    # 查找 txt
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

    # 查找 pdf 目录
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
    segments = parse_txt(txt_path) if txt_path else []
    pdfs = parse_pdfs(pdf_dir, date_str) if pdf_dir else []

    # 如果既没有 txt 也没有 pdf，检查是否已有已有 json，避免覆盖
    day_path = os.path.join(DATES_DIR, f"{date_str}.json")
    if not segments and not pdfs:
        if os.path.isfile(day_path):
            print(f"[跳过] {date_str}: 无源文件，保留已有 {day_path}")
            return True
        else:
            print(f"[警告] {date_str}: 未找到 TXT 或 PDF 文件，跳过")
            return False

    # 若 txt_path 为空但已有 json，可尝试保留旧笔记
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

    print(f"[成功] {date_str}: 笔记 {len(segments)} 条, PDF {len(pdfs)} 份, 券商 {len(meta['brokers'])} 家 -> {day_path}")
    return True


def update_global_index():
    """扫描 dates 目录下所有 json 文件并更新 index.json"""
    json_files = glob.glob(os.path.join(DATES_DIR, "*.json"))
    valid_dates = []
    for f in json_files:
        stem = os.path.splitext(os.path.basename(f))[0]
        if re.match(r"^\d{4}-\d{2}-\d{2}$", stem):
            valid_dates.append(stem)

    valid_dates = sorted(set(valid_dates), reverse=True)
    if not valid_dates:
        print("[警告] 未发现任何日期的 JSON 数据")
        return

    index_path = os.path.join(DATA_DIR, "index.json")
    index_data = {
        "dates": valid_dates,
        "latest": valid_dates[0],
        "updatedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)

    print(f"[索引已更新] 共 {len(valid_dates)} 期: {', '.join(valid_dates)}")
    print(f"[最新日期] {valid_dates[0]}")


def discover_dates():
    """自动发现项目中所有可能的日期（根目录下以日期命名的文件夹、dates 下的 txt/json 等）"""
    dates = set()
    # 根目录下的日期文件夹
    for name in os.listdir(BASE_DIR):
        if re.match(r"^\d{4}-\d{2}-\d{2}$", name) and os.path.isdir(os.path.join(BASE_DIR, name)):
            dates.add(name)
    # data/dates 下的 txt 与 json
    for name in os.listdir(DATES_DIR):
        m = re.match(r"^(\d{4}-\d{2}-\d{2})\.(txt|json)$", name)
        if m:
            dates.add(m.group(1))
    return sorted(dates, reverse=True)


# ---------------------------------------------------------------------------
# 5. 主入口
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="研报数据自动构建脚本")
    parser.add_argument("--date", type=str, help="指定构建日期，格式如 2026-11-17")
    parser.add_argument("--txt", type=str, help="指定 txt 总结文件路径")
    parser.add_argument("--pdf-dir", type=str, help="指定 pdf 文件夹路径")
    parser.add_argument("--force", action="store_true", help="强制全量重新构建")
    args = parser.parse_args()

    print("=" * 60)
    print("🚀 研报速览 · 数据自动构建工具")
    print("=" * 60)

    # 1. 如果指定了单日期
    if args.date:
        target_dates = [args.date]
    else:
        target_dates = discover_dates()
        print(f"[*] 自动发现日期目录/文件: {', '.join(target_dates)}")

    # 2. 依次构建每个日期
    for d in target_dates:
        txt_path, pdf_dir = find_source_files(d, args.txt, args.pdf_dir)
        print(f"\n[处理中] 日期: {d}")
        print(f"  - 总结文本: {txt_path or '未找到'}")
        print(f"  - PDF 目录: {pdf_dir or '未找到'}")
        build_single_day(d, txt_path, pdf_dir)

    # 3. 更新全局 index.json
    print("\n" + "-" * 60)
    update_global_index()
    print("=" * 60)
    print("✅ 全部构建完成！可直接在浏览器或 GitHub Pages 预览。")


if __name__ == "__main__":
    main()
