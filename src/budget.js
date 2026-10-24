// 캠페인 예산 자료와 조절 값을 다루는 함수. 예산 화면(main.js)과 게시판 페이지(posts.js)가 함께 쓴다.
// 정부 분류의 칸은 정부안 대비 다섯 단계 중 하나를, 정부안에 없는 칸(input: 'amount')은 금액 다섯 단계 중 하나를 고른다.
// 조절 값은 "c=id:값,..." 문자열로 주소의 해시와 시민 예산안에 담는다. 값은 퍼센트, 금액 칸은 억 원 단위다.

const CAMPAIGN = new URL('../campaigns/ai-2027/budget.json?v=202610240140', import.meta.url);

// 국회 심사처럼 늘릴지 줄일지와 그 폭만 고른다. tone은 화면의 색(style.css의 .level.up/.down)이다.
const PERCENT_LEVELS = [
  { value: 50, label: '크게 감액', note: '−50%', tone: 'down' },
  { value: 80, label: '감액', note: '−20%', tone: 'down' },
  { value: 100, label: '유지', note: '정부안', tone: '' },
  { value: 120, label: '증액', note: '+20%', tone: 'up' },
  { value: 150, label: '크게 증액', note: '+50%', tone: 'up' },
];

// 정부안에 없는 칸의 금액 단계: 최대 금액(category.max)에 곱하는 비율.
const AMOUNT_SHARES = [0, 0.1, 0.25, 0.5, 1];

export let data;

export async function loadCampaign() {
  data = await (await fetch(CAMPAIGN)).json();
  return data;
}

// 백만원 단위 금액을 "6조 1,490억"처럼 읽기 쉽게 바꾼다.
export function won(million) {
  const eok = Math.round(million / 100);
  if (eok === 0) return million > 0 ? '1억 미만' : '0원';
  const jo = Math.floor(eok / 10000);
  const rest = eok % 10000;
  const parts = [];
  if (jo) parts.push(`${jo.toLocaleString('ko-KR')}조`);
  if (rest) parts.push(`${rest.toLocaleString('ko-KR')}억`);
  return parts.join(' ');
}

export function signed(million) {
  if (Math.round(million / 100) === 0) return '변화 없음';
  return `${million > 0 ? '+' : '−'}${won(Math.abs(million))}`;
}

// 전년 대비 증감: "+2조 8,506억 (+129%)". 전년이 0원이면 퍼센트 대신 '새로 생김'이라고 쓴다.
export function growth(before, after) {
  const diff = after - before;
  if (Math.round(diff / 100) === 0) return '전년과 같음';
  const rate = before ? `${diff > 0 ? '+' : '−'}${Math.round((Math.abs(diff) / before) * 100)}%` : '새로 생김';
  return `${signed(diff)} (${rate})`;
}

export function isAmount(category) {
  return category.input === 'amount';
}

export function levels(category) {
  if (!isAmount(category)) return PERCENT_LEVELS;
  return AMOUNT_SHARES.map((share) => {
    const value = Math.round((category.max * share) / category.step) * category.step;
    return { value, label: won(value), note: share ? '' : '정부안', tone: share ? 'up' : '' };
  });
}

export function initial(category) {
  return isAmount(category) ? 0 : 100;
}

export function base(category) {
  return category.amounts[data.baseYear];
}

// 정부안 바로 앞 해(2026년)의 예산. 정부안과 나란히 놓고 전년 대비 증감을 보여 준다.
export function prevYear() {
  return data.years[data.years.indexOf(data.baseYear) - 1];
}

export function prev(category) {
  return category.amounts[prevYear()];
}

export function mine(category, budget) {
  const value = budget.get(category.id);
  return isAmount(category) ? value : Math.round((base(category) * value) / 100);
}

export function sum(categories, amount) {
  return categories.reduce((s, c) => s + amount(c), 0);
}

// 다섯 단계 가운데 가장 가까운 값으로 맞춘다. 예전 슬라이더로 만든 링크의 값도 이렇게 읽는다.
function snap(category, raw) {
  return levels(category).reduce((a, b) => (Math.abs(b.value - raw) < Math.abs(a.value - raw) ? b : a)).value;
}

// "c=id:값,..." 문자열에 적힌 분야만 읽는다. 제안처럼 일부 분야만 담은 문자열에 쓴다.
export function budgetPairs(text) {
  const pairs = new Map();
  const match = (text || '').match(/c=([^&]*)/);
  if (!match) return pairs;
  for (const pair of decodeURIComponent(match[1]).split(',')) {
    const [id, value] = pair.split(':');
    const category = data.categories.find((c) => c.id === id);
    const number = Number(value);
    if (category && Number.isFinite(number)) {
      pairs.set(id, snap(category, isAmount(category) ? number * 100 : number));
    }
  }
  return pairs;
}

// "c=id:값,..." 문자열(주소의 해시나 시민 예산안)을 모든 분야의 조절 값으로 읽는다. 적히지 않은 분야는 정부안 그대로다.
export function parseBudget(text) {
  const budget = new Map(data.categories.map((c) => [c.id, initial(c)]));
  for (const [id, value] of budgetPairs(text)) budget.set(id, value);
  return budget;
}

function encode(categories, budget) {
  return `c=${categories.map((c) => `${c.id}:${isAmount(c) ? budget.get(c.id) / 100 : budget.get(c.id)}`).join(',')}`;
}

// 정부안에서 바꾼 분야만 담는다. 바꾼 게 없으면 빈 문자열이다.
export function budgetText(budget) {
  const changed = data.categories.filter((c) => budget.get(c.id) !== initial(c));
  return changed.length ? encode(changed, budget) : '';
}

// 제안의 조절 값: 대상 분야(대분류면 그 아래 정부 분류 칸 모두)에 같은 단계를 적는다. '유지'도 적는다.
export function proposalText(categories, value) {
  return encode(categories, new Map(categories.map((c) => [c.id, value])));
}

// 지금 예산(text)에 제안(patch)의 값을 덮어쓴다.
export function mergeBudget(text, patch) {
  const budget = parseBudget(text);
  for (const [id, value] of budgetPairs(patch)) budget.set(id, value);
  return budgetText(budget);
}

export function levelOf(category, value) {
  return levels(category).find((level) => level.value === value);
}

// 가장 많이 늘리고 줄인 분야를 알려 준다. 바꾼 분야가 없으면 빈 배열이다.
export function highlights(budget) {
  const diffs = data.categories.map((c) => ({ c, diff: mine(c, budget) - base(c) }));
  const up = diffs.reduce((a, b) => (b.diff > a.diff ? b : a), { diff: 0 });
  const down = diffs.reduce((a, b) => (b.diff < a.diff ? b : a), { diff: 0 });
  const parts = [];
  if (Math.round(up.diff / 100)) parts.push(`가장 늘린 분야: ${up.c.name} ${signed(up.diff)}`);
  if (Math.round(down.diff / 100)) parts.push(`가장 줄인 분야: ${down.c.name} ${signed(down.diff)}`);
  return parts;
}

// 시민 예산안 한 줄 요약: 합계가 얼마나 달라졌고 어느 분야를 가장 바꿨는지.
export function summarize(text) {
  const budget = parseBudget(text);
  const diff = sum(data.categories, (c) => mine(c, budget)) - sum(data.categories, base);
  return [`합계 ${signed(diff)}`, ...highlights(budget)].join(' · ');
}
