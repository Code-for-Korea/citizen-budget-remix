"""과기정통부 AI 예산 원자료(xlsx)를 캠페인 데이터(JSON)로 변환한다.

표준 라이브러리만 쓴다. 사용법:
    python3 scripts/xlsx_to_json.py <원자료.xlsx> campaigns/ai-2027/budget.json

중분류 설명은 campaigns/ai-2027/descriptions.json에서 읽어 합친다.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
YEAR_COLUMNS = {"H": "2023", "I": "2024", "J": "2025", "K": "2026", "L": "2027"}

# 총괄표(PDF)의 대분류 순서. 원자료 표기 → 화면 표기.
GROUPS = [
    ("성능・인프라", "성능·인프라"),
    ("안전・신뢰", "안전·신뢰"),
    ("확산・활용", "확산·활용"),
    ("AI 격차해소", "격차해소"),
    ("AI 글로벌허브, 국제협력", "국제협력"),
    ("경계", "경계"),
]

# 기능구분2 → 공유 링크에 쓰는 짧은 id. 링크 호환을 위해 한번 정한 id는 바꾸지 않는다.
CATEGORY_IDS = {
    "AI 인프라・모델": "infra-model",
    "메가프로젝트(차세대 반도체)": "mega-chip",
    "차세대 기술개발": "next-tech",
    "메가프로젝트(AIDC)": "mega-aidc",
    "메가프로젝트(피지컬AI)": "mega-physical",
    "안전・신뢰": "safety",
    "AI 인재양성": "talent",
    "과학기술xAI": "science",
    "지역AX": "regional",
    "산업AX": "industry",
    "모두의 AI": "ai-for-all",
    "공공AX": "public",
    "AI 격차해소": "divide",
    "AI 글로벌허브, 국제협력": "global",
    "AI 보안": "security",
}


def display(name):
    return name.replace("・", "·").strip()


def strip_code(name):
    return re.sub(r"^\[\d+\]", "", name).strip()


def read_rows(path):
    z = zipfile.ZipFile(path)
    strings = [
        "".join(t.text or "" for t in si.iter("{%s}t" % NS["m"]))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)
    ]
    for name in sorted(z.namelist()):
        if not name.startswith("xl/worksheets/sheet"):
            continue
        rows = []
        for r in ET.fromstring(z.read(name)).findall(".//m:sheetData/m:row", NS):
            row = {}
            for c in r.findall("m:c", NS):
                v = c.find("m:v", NS)
                if v is None:
                    continue
                col = re.sub(r"\d", "", c.get("r"))
                row[col] = strings[int(v.text)] if c.get("t") == "s" else v.text
            rows.append(row)
        if any(row.get("A") == "회계" for row in rows):
            return [row for row in rows if row.get("A", "").startswith("[")]
    raise SystemExit("'회계' 머리행이 있는 시트를 찾지 못했다.")


def amounts(row):
    return {year: int(float(row[col])) if row.get(col) else 0 for col, year in YEAR_COLUMNS.items()}


def main(src, dest):
    descriptions = json.loads((Path(dest).parent / "descriptions.json").read_text(encoding="utf-8"))
    categories = {}
    for row in read_rows(src):
        a = amounts(row)
        if not any(a.values()):
            continue
        key = row["G"]
        if key not in CATEGORY_IDS:
            raise SystemExit(f"모르는 기능구분2: {key}")
        cat = categories.setdefault(key, {
            "id": CATEGORY_IDS[key],
            "group": display(dict(GROUPS)[row["F"]]),
            "name": display(key),
            "amounts": dict.fromkeys(YEAR_COLUMNS.values(), 0),
            "items": [],
        })
        for year, value in a.items():
            cat["amounts"][year] += value
        detail = row.get("E", "").strip()
        cat["items"].append({
            "name": strip_code(row["D"]),
            "detail": "" if detail in ("", "(세부사업전체)") else detail,
            "account": strip_code(row["A"]),
            "amounts": a,
        })

    group_order = [shown for _, shown in GROUPS]
    ordered = sorted(categories.values(), key=lambda c: (group_order.index(c["group"]), -c["amounts"]["2027"]))
    for cat in ordered:
        cat["items"].sort(key=lambda i: -i["amounts"]["2027"])
        cat["description"] = descriptions["categories"][cat["id"]]

    data = {
        "id": "ai-2027",
        "title": "모두의 AI 예산",
        "unit": "백만원",
        "years": list(YEAR_COLUMNS.values()),
        "baseYear": "2027",
        "baseLabel": "2027년 정부안",
        "groups": [{"name": g, "description": descriptions["groups"].get(g, "")} for g in group_order],
        "source": descriptions["source"],
        "categories": ordered,
    }
    Path(dest).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(c["amounts"]["2027"] for c in ordered)
    print(f"{len(ordered)}개 중분류, {sum(len(c['items']) for c in ordered)}개 사업, 2027 합계 {total:,}백만원")


if __name__ == "__main__":
    main(*sys.argv[1:3])
