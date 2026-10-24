"""HTML과 JS가 부르는 사이트 파일(.css, .js, .json) 주소의 버전 번호(?v=...)를 한꺼번에 바꾼다.

GitHub Pages는 파일을 브라우저에 10분 동안 캐시하게 해서, 배포 직후에는 새 HTML과 예전 CSS·JS가
섞일 수 있다. 주소에 버전 번호를 붙이면 HTML이 가리키는 파일 묶음이 늘 한 벌로 맞는다.
같은 모듈을 서로 다른 번호로 부르면 브라우저가 두 번 읽어 따로 동작하므로, 번호는 손으로 고치지 말고
이 스크립트로 모두 같은 값으로 바꾼다.

    python3 scripts/bump_version.py          # 지금 시각으로 번호를 바꾼다
    python3 scripts/bump_version.py --check  # 모든 주소가 같은 번호인지 확인만 한다
"""

import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [ROOT / "index.html", *ROOT.glob("*/index.html"), *(ROOT / "src").glob("*.js")]
# 따옴표 안의 상대 주소 가운데 .css, .js, .json으로 끝나는 것. 주석 속 파일 이름은 따옴표가 없어서 건드리지 않는다.
REFERENCE = re.compile(r"""(["'])((?:\.{1,2}/|src/)[^"'?:]*\.(?:css|js|json))(?:\?v=([\w-]*))?\1""")


def references():
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        for match in REFERENCE.finditer(text):
            yield path, match


def check():
    found = {}
    for path, match in references():
        found.setdefault(match.group(3), []).append(f"{path.relative_to(ROOT)}: {match.group(2)}")
    if len(found) == 1 and None not in found:
        print(f"버전 {next(iter(found))}: 주소 {sum(len(v) for v in found.values())}개가 모두 같습니다.")
        return 0
    for version, places in found.items():
        print(f"버전 {version or '(없음)'}:")
        for place in places:
            print(f"  {place}")
    return 1


def bump():
    version = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    for path in FILES:
        text = path.read_text(encoding="utf-8")
        new = REFERENCE.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(1)}", text)
        if new != text:
            path.write_text(new, encoding="utf-8")
    print(f"버전을 {version}(으)로 바꿨습니다.")
    return check()


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv[1:] else bump())
