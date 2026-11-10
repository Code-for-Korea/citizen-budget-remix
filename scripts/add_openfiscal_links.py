"""캠페인 budget.json의 세부사업에 열린재정 사업설명자료 링크(url)와 사업 ID(id)를 단다.

사업 이름으로 열린재정 세부사업 목록(selectSactvSearchList.do 응답 JSON)과 맞춘다. 띄어쓰기·가운뎃점·마침표,
'(舊…)' 같은 옛 이름 표기, 미래대응기금으로 옮겨 편성하며 붙인 '(과기정통부)' 같은 부처 표기는 무시한다.
같은 이름이 둘 이상이면 회계가 같은 것을 고르고, 그래도 하나로 정해지지 않으면 링크를 달지 않는다.
잘못 이어진 링크는 시민을 엉뚱한 사업으로 보내므로, 확실히 맞는 것만 단다.

xlsx_to_json.py로 budget.json을 다시 만들면 링크가 사라지므로 그 뒤에 이 스크립트를 다시 돌린다.

    python3 scripts/add_openfiscal_links.py <목록.json> campaigns/ai-2027/budget.json 과학기술정보통신부 과기정통부,과기부
"""

import json
import re
import sys
from pathlib import Path

from openfiscal_to_json import business_id, download_url


def norm(name, marks):
    name = re.sub(r"\((舊|구)[^)]*\)", "", name)
    for mark in marks:
        name = name.replace(f"({mark})", "")
    return re.sub(r"[\s·ㆍ・.\-_]", "", name)


def main(list_path, budget_path, office, marks):
    marks = [m for m in marks.split(",") if m]
    rows = json.loads(Path(list_path).read_text(encoding="utf-8"))["opKoBsClsSerDVOList"]
    # 그 부처 소관 사업과, 미래대응기금에 그 부처 표기를 붙여 편성한 사업.
    candidates = [r for r in rows if r["offcNm"] == office
                  or (r["acntNm"] == "미래대응기금" and any(f"({m})" in r["sayNm"] for m in marks))]
    by_name = {}
    for r in candidates:
        by_name.setdefault(norm(r["sayNm"], marks), []).append(r)

    path = Path(budget_path)
    text = path.read_text(encoding="utf-8")
    budget = json.loads(text)
    linked, unmatched, ambiguous = 0, [], []
    for category in budget["categories"]:
        for item in category["items"]:
            found = by_name.get(norm(item["name"], marks), [])
            if len(found) > 1:
                found = [r for r in found if r["acntNm"] == item.get("account")] or found
            if len(found) == 1 and download_url(found[0]):
                item["id"] = business_id(found[0])
                item["url"] = download_url(found[0])
                linked += 1
            else:
                item.pop("url", None)
                (ambiguous if found else unmatched).append(item["name"])
    # 원래 파일의 들여쓰기(xlsx_to_json.py는 1칸, openfiscal_to_json.py는 2칸)를 그대로 지킨다.
    indent = len(re.match(r"\{\n( *)", text).group(1)) or 1
    path.write_text(json.dumps(budget, ensure_ascii=False, indent=indent) + "\n", encoding="utf-8")

    total = sum(len(c["items"]) for c in budget["categories"])
    print(f"링크 {linked}/{total}개. 못 찾음 {len(unmatched)}개, 여럿이라 고르지 못함 {len(ambiguous)}개")
    for title, names in (("못 찾음", unmatched), ("여럿", ambiguous)):
        for name in sorted(set(names)):
            print(f"  {title}: {name}")


if __name__ == "__main__":
    main(*sys.argv[1:5])
