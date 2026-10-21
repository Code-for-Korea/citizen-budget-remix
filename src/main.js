// 캠페인 데이터를 불러와 중분류별 조절 화면을 그린다.
// 조절 값은 정부안 대비 퍼센트로 주소의 해시(#c=id:퍼센트,...)에 담아 공유한다.

const CAMPAIGN = 'campaigns/ai-2027/budget.json';
const MAX_PERCENT = 500;
const STEP = 5;

const percents = new Map();
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

function base(category) {
  return category.amounts[data.baseYear];
}

function mine(category) {
  return Math.round((base(category) * percents.get(category.id)) / 100);
}

function readHash() {
  for (const id of percents.keys()) percents.set(id, 100);
  const match = location.hash.match(/c=([^&]*)/);
  if (!match) return;
  for (const pair of decodeURIComponent(match[1]).split(',')) {
    const [id, value] = pair.split(':');
    const percent = Number(value);
    if (percents.has(id) && Number.isFinite(percent)) {
      percents.set(id, Math.min(MAX_PERCENT, Math.max(0, Math.round(percent / STEP) * STEP)));
    }
  }
}

function writeHash() {
  const changed = [...percents].filter(([, p]) => p !== 100).map(([id, p]) => `${id}:${p}`);
  const hash = changed.length ? `#c=${changed.join(',')}` : '';
  history.replaceState(null, '', location.pathname + location.search + hash);
}

function setChange(node, diff) {
  node.textContent = signed(diff);
  node.className = `change ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}`;
}

function update() {
  const gov = data.categories.reduce((sum, c) => sum + base(c), 0);
  const total = data.categories.reduce((sum, c) => sum + mine(c), 0);
  document.getElementById('total-gov').textContent = won(gov);
  document.getElementById('total-mine').textContent = won(total);
  setChange(document.getElementById('total-diff'), total - gov);

  for (const category of data.categories) {
    const percent = percents.get(category.id);
    const card = document.getElementById(`cat-${category.id}`);
    card.querySelector('input').value = percent;
    card.querySelector('.mine').textContent = `${won(mine(category))} (${percent}%)`;
    card.querySelector('.share').textContent =
      `전체 중 비중 ${((base(category) / gov) * 100).toFixed(1)}% → ${total ? ((mine(category) / total) * 100).toFixed(1) : '0.0'}%`;
    setChange(card.querySelector('.change'), mine(category) - base(category));
  }

  for (const group of data.groups) {
    const members = data.categories.filter((c) => c.group === group.name);
    const node = document.getElementById(`group-total-${data.groups.indexOf(group)}`);
    node.textContent = `정부안 ${won(members.reduce((s, c) => s + base(c), 0))} → 내 예산 ${won(members.reduce((s, c) => s + mine(c), 0))}`;
  }
}

function itemTable(category) {
  const [prevYear] = data.years.slice(-2);
  const rows = category.items.map((item) =>
    el('tr', {},
      el('td', {}, item.name, item.detail ? el('span', { className: 'detail', textContent: item.detail }) : null),
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

function categoryCard(category) {
  const slider = el('input', {
    type: 'range',
    min: 0,
    max: MAX_PERCENT,
    step: STEP,
    value: 100,
  });
  slider.setAttribute('aria-label', `${category.name} 예산 (정부안 대비 퍼센트)`);
  slider.addEventListener('input', () => {
    percents.set(category.id, Number(slider.value));
    update();
    writeHash();
  });

  return el('article', { className: 'category', id: `cat-${category.id}` },
    el('div', { className: 'category-head' },
      el('h3', { textContent: category.name }),
      el('span', { className: 'amounts' },
        `정부안 ${won(base(category))} → `,
        el('strong', { className: 'mine' }),
        ' ',
        el('span', { className: 'change' }),
      ),
    ),
    slider,
    el('div', { className: 'scale' },
      el('span', { textContent: '0%' }),
      el('span', { className: 'share' }),
      el('span', { textContent: `${MAX_PERCENT}%` }),
    ),
    el('details', {},
      el('summary', { textContent: `설명과 세부사업 ${category.items.length}개` }),
      el('p', { textContent: category.description }),
      itemTable(category),
    ),
  );
}

function render() {
  const main = document.getElementById('groups');
  main.replaceChildren(...data.groups.map((group, index) =>
    el('section', { className: 'group' },
      el('h2', { textContent: group.name }),
      el('p', {},
        group.description,
        el('br'),
        el('span', { className: 'group-total', id: `group-total-${index}` }),
      ),
      ...data.categories.filter((c) => c.group === group.name).map(categoryCard),
    )));

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
  for (const category of data.categories) percents.set(category.id, 100);
  readHash();
  render();
  update();

  document.getElementById('share').addEventListener('click', share);
  document.getElementById('reset').addEventListener('click', () => {
    for (const id of percents.keys()) percents.set(id, 100);
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
