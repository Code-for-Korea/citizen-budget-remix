"""열린재정 「재정사업별 상세설명자료」로 캠페인 데이터(budget.json, descriptions.json, excluded.json)를 만든다.

원자료 두 가지를 쓴다. 둘 다 저장소에 넣지 않는다.
- 목록: 열린재정 세부사업 목록 API(selectSactvSearchList.do) 응답 JSON. 공식 분류(분야·부문·프로그램·
  단위사업·세부사업)와 2027년 정부안 금액(백만원)이 있다. 여러 쪽이면 opKoBsClsSerDVOList를 합쳐서 준다.
- 연도별 금액: 사업별 설명자료(hwpx)의 예산 총괄표에서 뽑은 탭 구분 텍스트.
  열: 사업ID, 2025결산, 2026본예산, 2026추경, 2027요구, 2027정부안, 메타상태(기금은 본예산 자리에 당초계획액).

분야(중분류)는 프로그램이고 id는 'p' + 프로그램 코드다. 공유 링크와 게시판 글에 남으므로 바꾸지 않는다.
프로그램 8000·9000번대(회계·기금 간 전출, 여유자금 예치 같은 내부거래·보전지출)는 사업이 아니라 빼고
excluded.json에 남긴다. 미래대응기금(기획예산처 소관)에 「(문체부)」를 붙여 편성한 사업은 'future-fund' 분야로 넣는다.
사람이 쓰는 설명(대분류 설명, crosscheck)은 기존 descriptions.json에서 읽어 그대로 쓴다.

    python3 scripts/openfiscal_to_json.py <목록.json> <연도별금액.tsv> campaigns/mcst-2027
"""

import json
import sys
from pathlib import Path
from urllib.parse import quote

OFFICE = "문화체육관광부"
FUTURE_FUND = "미래대응기금"
FUTURE_FUND_ID = "future-fund"
FUTURE_FUND_GROUP = "미래대응기금 편성"
YEARS = ["2025", "2026", "2027"]

# 프로그램 코드 범위로 캠페인이 묶은 대분류(정부 공식 분류가 아님).
GROUPS = [
    ("문화예술", 1100, 3999),
    ("관광", 4100, 4699),
    ("체육", 5100, 5599),
    ("문화·관광 일반", 7100, 7299),
]


def group_of(program):
    code = int(program)
    for name, low, high in GROUPS:
        if low <= code <= high:
            return name
    raise ValueError(f"대분류를 정할 수 없는 프로그램: {program}")


def business_id(row):
    """열린재정의 사업 고유 ID(22자리). 설명자료 파일 키(sayBrkdFileNm)와 같다."""
    return "".join(row[k] for k in ("acntYr", "offcCd", "acntCd", "acctCd", "sectCd", "actvCd", "sayCd"))


def download_url(row):
    """그 사업의 열린재정 사업설명자료(hwpx) 내려받기 주소. 설명자료가 없으면 None.
    열린재정 「재정사업별 상세설명자료」 상세 화면의 '다운로드' 버튼이 부르는 주소와 같다(2027년 정부안: 2027_1)."""
    if not row.get("sayBrkdFileNm"):
        return None
    name = quote(f"{row['offcNm']}_{row['sayNm']}", safe="")
    return (f"https://www.openfiscaldata.go.kr/op/ko/cm/downloadFileSayBrkdBdgCfmtnDiv.do/"
            f"{row['acntYr']}_{row['bdgCfmtnDivCd']}/{name}/{row['sayBrkdFileNm']}/{row['bdgCfmtnDivCd']}")


def won(million):
    """백만원을 '9조 6,345억'처럼 쓴다(src/budget.js의 won과 같은 규칙)."""
    eok = round(million / 100)
    jo, rest = divmod(eok, 10000)
    parts = ([f"{jo:,}조"] if jo else []) + ([f"{rest:,}억"] if rest else [])
    return " ".join(parts) or "0원"


def read_amounts(path):
    """사업ID → {'2025': 결산, '2026': 본예산(기금은 당초계획), 상태}. 값이 없으면 None."""
    lines = [line for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
    header = lines[0].split("\t")
    table = {}
    for line in lines[1:]:
        if line.startswith("끝"):
            continue
        cells = dict(zip(header, line.split("\t")))
        # 원문 값 몇 개는 소수점이 있다(예: 3,582.1). 화면 단위(억)에 영향이 없도록 백만원 정수로 반올림한다.
        number = lambda key: round(float(cells[key].replace(",", ""))) if cells.get(key, "").strip() else None
        table[cells["사업ID"].strip()] = {
            "2025": number("2025결산"),
            "2026": number("2026본예산"),
            "2027": number("2027정부안"),
            "status": cells.get("메타상태", "").strip(),
        }
    return table


def item_of(row, amounts, missing):
    sid = business_id(row)
    found = amounts.get(sid)
    if found is None:
        missing.append(f"{sid} {row['sayNm']}")
        found = {}
    # 2027년은 목록 금액(정부안)을 쓴다. 설명자료 총괄표와 다른 사업은 따로 알린다.
    return {
        "id": sid,
        "name": row["sayNm"],
        "account": row["acntNm"],
        "code": f"{row['actvCd']}-{row['sayCd']}",
        "amounts": {
            "2025": found.get("2025") or 0,
            "2026": found.get("2026") or 0,
            "2027": row["thyCfmtnMediAmt"] or 0,
        },
        "detail": "",
        "unit": row["actvNm"],
        "url": download_url(row),
    }


def describe(items):
    top = sorted(items, key=lambda i: -i["amounts"]["2027"])[:3]
    names = "·".join(f"「{i['name']}」" for i in top)
    return f"세부사업 {len(items)}개가 들어 있습니다. 정부안이 큰 사업은 {names}입니다."


def main(list_path, amounts_path, out_dir):
    out = Path(out_dir)
    rows = json.loads(Path(list_path).read_text(encoding="utf-8"))["opKoBsClsSerDVOList"]
    amounts = read_amounts(amounts_path)
    descriptions = json.loads((out / "descriptions.json").read_text(encoding="utf-8"))

    office = [r for r in rows if r["offcNm"] == OFFICE]
    spend = [r for r in office if r["pgmCd"][0] not in "89"]
    internal = [r for r in office if r["pgmCd"][0] in "89"]
    fund = [r for r in rows if r["acntNm"] == FUTURE_FUND and "(문체부)" in r["sayNm"]]

    missing, mismatched = [], []
    for r in spend + fund:
        found = amounts.get(business_id(r))
        if found and found.get("2027") is not None and found["2027"] != r["thyCfmtnMediAmt"]:
            mismatched.append(f"{business_id(r)} {r['sayNm']}: 목록 {r['thyCfmtnMediAmt']}, 설명자료 {found['2027']}")

    programs = {}
    for r in spend:
        programs.setdefault(r["pgmCd"], {"name": r["pgmNm"], "rows": []})["rows"].append(r)

    categories = []
    for code in sorted(programs):
        items = sorted((item_of(r, amounts, missing) for r in programs[code]["rows"]),
                       key=lambda i: -i["amounts"]["2027"])
        categories.append({
            "id": f"p{code}",
            "group": group_of(code),
            "name": programs[code]["name"],
            "amounts": {y: sum(i["amounts"][y] for i in items) for y in YEARS},
            "items": items,
            "description": describe(items),
        })
    fund_items = sorted((item_of(r, amounts, missing) for r in fund), key=lambda i: -i["amounts"]["2027"])
    categories.append({
        "id": FUTURE_FUND_ID,
        "group": FUTURE_FUND_GROUP,
        "name": f"미래대응기금으로 편성된 {OFFICE} 사업",
        "amounts": {y: sum(i["amounts"][y] for i in fund_items) for y in YEARS},
        "items": fund_items,
        "description": descriptions["categories"].get(FUTURE_FUND_ID) or describe(fund_items),
    })

    spend_total = sum(r["thyCfmtnMediAmt"] for r in spend)
    fund_total = sum(r["thyCfmtnMediAmt"] for r in fund)
    internal_total = sum(r["thyCfmtnMediAmt"] for r in internal)
    source = {
        "title": f"{OFFICE} 2027년도 예산안 세부사업(열린재정 「재정사업별 상세설명자료」)",
        "provider": "기획예산처 열린재정 재정정보공개시스템 「재정사업별 상세설명자료」(2027년 정부안)",
        "unit": "백만원",
        "notes": [
            "2025년은 결산, 2026년은 본예산(기금은 당초 계획), 2027년은 정부안입니다. "
            "분류와 2027년 금액은 열린재정 세부사업 목록에서, 2025·2026년 금액은 사업별 설명자료의 예산 총괄표에서 옮겼습니다.",
            "분야(중분류)는 문화체육관광부 예산의 프로그램(예: 콘텐츠산업 육성, 생활체육육성)입니다. "
            "대분류는 캠페인이 프로그램 코드 범위로 묶은 것이며 정부 공식 분류가 아닙니다.",
            "분야 설명은 세부사업 이름으로 자동으로 만든 초안이며, 정부 공식 설명이 아닙니다.",
            f"회계·기금 사이 전출금과 여유자금 예치 같은 내부거래·보전지출 {len(internal)}건"
            f"(2027년 정부안 {won(internal_total)} 원)은 사업이 아니라 돈이 오가는 장부라 뺐습니다.",
            "2026년 금액은 열린재정 설명자료에 적힌 그대로입니다. 일부 기금 사업(예: 관광산업 융자지원)은 "
            "국회에 제출된 다른 자료와 2026년 금액이 달라 확인하고 있습니다.",
            "세부사업 표의 「열린재정 사업설명자료」 링크는 그 사업의 설명자료 파일(hwpx)을 열린재정에서 바로 내려받습니다.",
            f"합계 {won(spend_total + fund_total)} 원은 {OFFICE} 총지출 {won(spend_total)} 원에 "
            f"기획예산처 소관 미래대응기금으로 편성된 {OFFICE} 사업 {won(fund_total)} 원을 더한 값입니다.",
        ],
    }
    crosscheck = descriptions.get("crosscheck", {})
    crosscheck["futureFund"] = {**crosscheck.get("futureFund", {}), "amount": fund_total}

    by_id = {c["id"]: c for c in categories}
    budget = {
        "id": "mcst-2027",
        "title": f"{OFFICE} 2027 예산 심의",
        "unit": "백만원",
        "years": YEARS,
        "baseYear": "2027",
        "baseLabel": "2027년 정부안",
        "groups": [{"name": name, "description": descriptions["groups"][name]}
                   for name in [g[0] for g in GROUPS] + [FUTURE_FUND_GROUP]],
        "source": source,
        "crosscheck": crosscheck,
        "categories": categories,
    }
    descriptions["source"] = source
    descriptions["crosscheck"] = crosscheck
    descriptions["categories"] = {c["id"]: by_id[c["id"]]["description"] for c in categories}
    excluded = {
        "note": "회계·기금 간 거래와 여유자금 운용(프로그램 8000~9700). 총지출에 들지 않아 캠페인에서 뺐습니다.",
        "items": [{"id": business_id(r), "name": r["sayNm"], "program": r["pgmCd"], "account": r["acntNm"],
                   "code": f"{r['actvCd']}-{r['sayCd']}", "amounts": {"2027": r["thyCfmtnMediAmt"]}} for r in internal],
    }

    dump = lambda name, data: (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    dump("budget.json", budget)
    dump("descriptions.json", descriptions)
    dump("excluded.json", excluded)

    print(f"분야 {len(categories)}개, 세부사업 {sum(len(c['items']) for c in categories)}개, "
          f"합계 {won(spend_total + fund_total)} (총지출 {won(spend_total)} + 미래대응기금 {won(fund_total)}), "
          f"뺀 내부거래 {len(internal)}건 {won(internal_total)}")
    for title, values in (("연도별 금액을 찾지 못한 사업", missing), ("2027년 금액이 목록과 설명자료에서 다른 사업", mismatched)):
        print(f"{title}: {len(values)}건")
        for value in values:
            print("  ", value)


if __name__ == "__main__":
    main(*sys.argv[1:4])
