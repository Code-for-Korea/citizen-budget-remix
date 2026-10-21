// 캠페인 데이터를 불러와 중분류별 조절 화면을 그린다.
// 정부 분류의 칸은 정부안 대비 퍼센트로, 정부안에 없는 칸(input: 'amount')은 금액으로 조절한다.
// 조절 값은 주소의 해시(#c=id:값,...)에 담아 공유한다. 값은 퍼센트, 금액 칸은 억 원 단위다.

const CAMPAIGN = 'campaigns/ai-2027/budget.json';
const MAX_PERCENT = 500;
const STEP = 5;

const values = new Map();
let data;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

// 백만원 단위 금액을 "6조 1,490억"처럼 읽기 쉽게 바꾼다.
function won(million) {
  const eok = Math.round(million / 100);
  if (eok === 0) return million > 0 ? '1억 미만' : '0원';
  const jo = Math.floor(eok / 10000);
  const rest = eok % 10000;
  const parts = [];
  if (jo) parts.push(`${jo.toLocaleString('ko-KR')}조`);
  if (rest) parts.push(`${rest.toLocaleString('ko-KR')}억`);
  return parts.join(' ');
}

function signed(million) {
  if (Math.round(million / 100) === 0) return '변화 없음';
  return `${million > 0 ? '+' : '−'}${won(Math.abs(million))}`;
}

function isAmount(category) {
  return category.input === 'amount';
}

function initial(category) {
  return isAmount(category) ? 0 : 100;
}

function base(category) {
  return category.amounts[data.baseYear];
}

function mine(category) {
  const value = values.get(category.id);
  return isAmount(category) ? value : Math.round((base(category) * value) / 100);
}

function sum(categories, amount) {
  return categories.reduce((s, c) => s + amount(c), 0);
}

function members(group) {
  return data.categories.filter((c) => c.group === group.name);
}

// 대분류 순서대로 고정된 색을 쓴다(style.css의 --series-N).
function groupColor(group) {
  return `var(--series-${data.groups.indexOf(group) + 1})`;
}

function isAbsentGroup(group) {
  return members(group).every(isAmount);
}

function clamp(category, raw) {
  const [max, step] = isAmount(category) ? [category.max, category.step] : [MAX_PERCENT, STEP];
  return Math.min(max, Math.max(0, Math.round(raw / step) * step));
}

function readHash() {
  for (const category of data.categories) values.set(category.id, initial(category));
  const match = location.hash.match(/c=([^&]*)/);
  if (!match) return;
  for (const pair of decodeURIComponent(match[1]).split(',')) {
    const [id, value] = pair.split(':');
    const category = data.categories.find((c) => c.id === id);
    const number = Number(value);
    if (category && Number.isFinite(number)) {
      values.set(id, clamp(category, isAmount(category) ? number * 100 : number));
    }
  }
}

function writeHash() {
  const changed = data.categories
    .filter((c) => values.get(c.id) !== initial(c))
    .map((c) => `${c.id}:${isAmount(c) ? values.get(c.id) / 100 : values.get(c.id)}`);
  const hash = changed.length ? `#c=${changed.join(',')}` : '';
  history.replaceState(null, '', location.pathname + location.search + hash);
}

function setChange(node, diff) {
  node.textContent = signed(diff);
  node.className = `change ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`;
}

function percentOf(part, whole) {
  return whole ? ((part / whole) * 100).toFixed(1) : '0.0';
}

// 가장 많이 늘리고 줄인 분야를 한 줄로 알려 준다.
function highlights() {
  const diffs = data.categories.map((c) => ({ c, diff: mine(c) - base(c) }));
  const up = diffs.reduce((a, b) => (b.diff > a.diff ? b : a), { diff: 0 });
  const down = diffs.reduce((a, b) => (b.diff < a.diff ? b : a), { diff: 0 });
  const parts = [];
  if (Math.round(up.diff / 100)) parts.push(`가장 늘린 분야: ${up.c.name} ${signed(up.diff)}`);
  if (Math.round(down.diff / 100)) parts.push(`가장 줄인 분야: ${down.c.name} ${signed(down.diff)}`);
  return parts.length ? parts.join(' · ') : '아직 바꾼 분야가 없습니다. 아래 슬라이더를 움직여 보세요.';
}

function updateBars(gov, total) {
  const scale = Math.max(gov, total);
  for (const [id, amount, whole] of [['bar-gov', base, gov], ['bar-mine', mine, total]]) {
    const fill = document.getElementById(id);
    fill.style.width = `${scale ? (whole / scale) * 100 : 0}%`;
    data.groups.forEach((group, index) => {
      const value = sum(members(group), amount);
      const seg = fill.children[index];
      seg.style.flexGrow = value;
      seg.hidden = value === 0;
      seg.dataset.tip = `${seg.dataset.label} · ${group.name} ${won(value)} (${percentOf(value, whole)}%)`;
    });
  }
}

function update() {
  const gov = sum(data.categories, base);
  const total = sum(data.categories, mine);
  document.getElementById('total-gov').textContent = won(gov);
  document.getElementById('total-mine').textContent = won(total);
  setChange(document.getElementById('total-diff'), total - gov);
  document.getElementById('highlights').textContent = highlights();
  updateBars(gov, total);

  for (const category of data.categories) {
    const card = document.getElementById(`cat-${category.id}`);
    card.querySelector('input').value = values.get(category.id);
    card.querySelector('.mine').textContent = isAmount(category)
      ? won(mine(category))
      : `${won(mine(category))} (${values.get(category.id)}%)`;
    card.querySelector('.share').textContent =
      `전체 중 비중 ${percentOf(base(category), gov)}% → ${percentOf(mine(category), total)}%`;
    setChange(card.querySelector('.change'), mine(category) - base(category));
  }

  data.groups.forEach((group, index) => {
    document.getElementById(`group-total-${index}`).textContent =
      `정부안 ${won(sum(members(group), base))} → 내 예산 ${won(sum(members(group), mine))}`;
  });
}

function itemTable(category) {
  const [prevYear] = data.years.slice(-2);
  const rows = category.items.map((item) =>
    el('tr', {},
      el('td', {},
        item.name,
        item.detail ? el('span', { className: 'detail', textContent: item.detail }) : null,
        item.category ? el('span', { className: 'detail', textContent: `정부 분류: ${item.category}` }) : null,
      ),
      el('td', { className: 'num', textContent: won(item.amounts[prevYear]) }),
      el('td', { className: 'num', textContent: won(item.amounts[data.baseYear]) }),
    ));
  return el('div', { className: 'table-wrap' },
    el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { textContent: '사업' }),
        el('th', { className: 'num', textContent: `${prevYear}년 예산` }),
        el('th', { className: 'num', textContent: data.baseLabel }),
      )),
      el('tbody', {}, ...rows),
    ));
}

// 정부안에 없는 칸은 관련 사업이 다른 분야에 흩어져 있다는 점과 그 합계를 따로 밝힌다.
function relatedNote(category) {
  if (!isAmount(category)) return null;
  const related = category.items.reduce((s, i) => s + i.amounts[data.baseYear], 0);
  const gov = sum(data.categories, base);
  return el('p', {},
    el('strong', { textContent: `관련 사업 ${category.items.length}개를 모두 더해도 ${won(related)}, ${data.baseLabel} 전체의 ${percentOf(related, gov)}%입니다.` }));
}

function categoryCard(category) {
  const amount = isAmount(category);
  const slider = el('input', {
    type: 'range',
    min: 0,
    max: amount ? category.max : MAX_PERCENT,
    step: amount ? category.step : STEP,
    value: initial(category),
  });
  slider.setAttribute('aria-label', amount
    ? `${category.name} 예산 (금액)`
    : `${category.name} 예산 (정부안 대비 퍼센트)`);
  slider.addEventListener('input', () => {
    values.set(category.id, Number(slider.value));
    update();
    writeHash();
  });

  const mark = amount ? null : el('span', { className: 'gov-mark', textContent: '정부안' });
  mark?.style.setProperty('--at', 100 / MAX_PERCENT);

  return el('article', { className: `category${amount ? ' absent' : ''}`, id: `cat-${category.id}` },
    el('div', { className: 'category-head' },
      el('h3', { textContent: category.name }),
      el('span', { className: 'amounts' },
        `정부안 ${won(base(category))} → `,
        el('strong', { className: 'mine' }),
        ' ',
        el('span', { className: 'change' }),
      ),
    ),
    el('div', { className: 'slider' }, mark, slider),
    el('div', { className: 'scale' },
      el('span', { textContent: amount ? '0원' : '0%' }),
      el('span', { className: 'share' }),
      el('span', { textContent: amount ? won(category.max) : `${MAX_PERCENT}%` }),
    ),
    el('details', {},
      el('summary', { textContent: `설명과 ${amount ? '관련 사업' : '세부사업'} ${category.items.length}개` }),
      el('p', { textContent: category.description }),
      relatedNote(category),
      itemTable(category),
    ),
  );
}

// 맨 위 핵심 숫자: 가장 큰 사업 하나의 비중, 안전·신뢰 비중, 정부안에 없는 칸.
function renderFacts() {
  const gov = sum(data.categories, base);
  const items = data.categories.filter((c) => !isAmount(c)).flatMap((c) => c.items);
  const top = items.reduce((a, b) => (b.amounts[data.baseYear] > a.amounts[data.baseYear] ? b : a));
  const safety = data.groups.find((g) => g.name === '안전·신뢰');
  const absent = data.categories.find(isAmount);

  const facts = [
    [`${Math.round((top.amounts[data.baseYear] / gov) * 100)}%`,
      `「${top.detail || top.name}」 사업 하나가 ${data.baseLabel} 전체에서 차지하는 비중`,
      data.groups.find((g) => g.name === data.categories.find((c) => c.items.includes(top)).group)],
    safety && [`${percentOf(sum(members(safety), base), gov)}%`,
      `안전·신뢰 분야 전체(${won(sum(members(safety), base))})의 비중`, safety],
    absent && ['0원', `정부 분류에 '${absent.name}' 칸이 없습니다`,
      data.groups.find((g) => g.name === absent.group)],
  ].filter(Boolean);

  document.getElementById('facts').replaceChildren(...facts.map(([value, label, group]) => {
    const card = el('div', { className: 'fact' }, el('strong', { textContent: value }), el('span', { textContent: label }));
    card.style.setProperty('--fact-color', groupColor(group));
    return card;
  }));
}

function renderLegend() {
  document.getElementById('legend').replaceChildren(...data.groups.map((group) => {
    const item = el('li', { className: isAbsentGroup(group) ? 'absent' : '', textContent: group.name });
    item.style.setProperty('--group-color', groupColor(group));
    return item;
  }));
}

function renderBars() {
  for (const [id, label] of [['bar-gov', '정부안'], ['bar-mine', '내 예산']]) {
    document.getElementById(id).replaceChildren(...data.groups.map((group) => {
      const seg = el('div', { className: `seg${isAbsentGroup(group) ? ' absent' : ''}` });
      seg.dataset.label = label;
      seg.style.setProperty('--group-color', groupColor(group));
      return seg;
    }));
  }
}

// 막대 조각에 마우스를 올리거나 누르면 금액을 보여 준다.
function setupTooltip() {
  const tip = document.getElementById('tip');
  const show = (event) => {
    const seg = event.target.closest('.seg');
    if (!seg) {
      tip.hidden = true;
      return;
    }
    tip.textContent = seg.dataset.tip;
    tip.hidden = false;
    const x = Math.min(event.clientX + 12, innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${event.clientY + 16}px`;
  };
  document.querySelector('.bars').addEventListener('pointermove', show);
  document.querySelector('.bars').addEventListener('pointerdown', show);
  document.querySelector('.bars').addEventListener('pointerleave', () => { tip.hidden = true; });
}

function render() {
  renderFacts();
  renderLegend();
  renderBars();

  const main = document.getElementById('groups');
  main.replaceChildren(...data.groups.map((group, index) => {
    const section = el('section', { className: `group${isAbsentGroup(group) ? ' absent' : ''}` },
      el('h2', { textContent: group.name }),
      el('p', {},
        group.description,
        el('br'),
        el('span', { className: 'group-total', id: `group-total-${index}` }),
      ),
      ...members(group).map(categoryCard),
    );
    section.style.setProperty('--group-color', groupColor(group));
    return section;
  }));

  const { source } = data;
  document.getElementById('source').replaceChildren(
    el('p', {}, `출처: ${source.provider}. 단위는 원자료 기준 ${source.unit}이며 화면에는 억 원 단위로 반올림해 보여 줍니다.`),
    el('ul', {}, ...source.notes.map((note) => el('li', { textContent: note }))),
  );
}

async function share() {
  const status = document.getElementById('share-status');
  try {
    await navigator.clipboard.writeText(location.href);
    status.textContent = '링크를 복사했습니다. 이 링크를 열면 내가 짠 예산이 그대로 보입니다.';
  } catch {
    const field = el('input', { value: location.href, readOnly: true });
    field.setAttribute('aria-label', '공유 링크');
    status.replaceChildren(field);
    field.select();
  }
}

async function start() {
  try {
    data = await (await fetch(CAMPAIGN)).json();
  } catch {
    document.querySelector('#groups .status').textContent = '예산 자료를 불러오지 못했습니다.';
    return;
  }
  readHash();
  render();
  update();
  setupTooltip();

  document.getElementById('share').addEventListener('click', share);
  document.getElementById('reset').addEventListener('click', () => {
    for (const category of data.categories) values.set(category.id, initial(category));
    update();
    writeHash();
    document.getElementById('share-status').textContent = '';
  });
  window.addEventListener('hashchange', () => {
    readHash();
    update();
  });
}

start();
