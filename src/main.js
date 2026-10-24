// 홈 화면: 캠페인 데이터를 불러와 분야(중분류)마다 증액·감액을 고르는 화면을 그린다.
// 고른 값은 주소의 해시(#c=id:값,...)에 담아 공유한다. 값을 읽고 쓰는 규칙은 budget.js에 있다.

import { el } from './dom.js';
import { setupBoard } from './board.js';
import {
  data, loadCampaign, won, signed, growth, isAmount, levels, initial, base, prevYear, prev, sum,
  parseBudget, summarize, mine as budgetMine, budgetText as budgetString, highlights as budgetHighlights,
} from './budget.js';

const CELL = 10000; // 칸 그림의 한 칸: 100억 원(백만원 단위)

const values = new Map();

// 지금 화면에서 고른 값(values)으로 계산한다.
function mine(category) {
  return budgetMine(category, values);
}

function budgetText() {
  return budgetString(values);
}

function highlights() {
  return budgetHighlights(values);
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

function readHash() {
  for (const [id, value] of parseBudget(location.hash)) values.set(id, value);
}

function writeHash() {
  const text = budgetText();
  history.replaceState(null, '', location.pathname + location.search + (text ? `#${text}` : ''));
}

// 증감을 색과 함께 쓴다. 정부안에서 바꾸지 않았으면(diff가 0) 아무것도 쓰지 않는다.
function setChange(node, diff, text = signed(diff)) {
  const zero = Math.round(diff / 100) === 0;
  node.textContent = zero && text === signed(diff) ? '' : text;
  node.classList.toggle('up', !zero && diff > 0);
  node.classList.toggle('down', !zero && diff < 0);
}

function percentOf(part, whole) {
  return whole ? ((part / whole) * 100).toFixed(1) : '0.0';
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
  document.getElementById('total-mine').textContent = won(total);
  setChange(document.getElementById('total-diff'), total - gov);
  document.getElementById('highlights').textContent =
    highlights().join(' · ') || '아직 바꾼 분야가 없습니다. 아래에서 분야마다 증액·감액을 골라 보세요.';
  updateBars(gov, total);

  for (const category of data.categories) {
    const card = document.getElementById(`cat-${category.id}`);
    card.querySelector(`input[value="${values.get(category.id)}"]`).checked = true;
    card.querySelector('.mine').textContent = won(mine(category));
    card.querySelector('.share').textContent =
      `전체 중 비중 ${percentOf(base(category), gov)}% → ${percentOf(mine(category), total)}%`;
    setChange(card.querySelector('.mine-diff'), mine(category) - base(category));
  }

  data.groups.forEach((group, index) => {
    const [before, after, my] = [prev, base, mine].map((amount) => sum(members(group), amount));
    document.getElementById(`group-total-${index}`).textContent = isAbsentGroup(group)
      ? `내 예산 ${won(my)}`
      : `${prevYear()}년 ${won(before)} → ${data.baseLabel} ${won(after)} · ${growth(before, after)}`
        + (my === after ? '' : ` · 내 예산 ${won(my)}`);
  });
}

function itemTable(category) {
  const rows = category.items.map((item) =>
    el('tr', {},
      el('td', {},
        item.name,
        item.detail ? el('span', { className: 'detail', textContent: item.detail }) : null,
        item.category ? el('span', { className: 'detail', textContent: `정부 분류: ${item.category}` }) : null,
      ),
      el('td', { className: 'num', textContent: won(item.amounts[prevYear()]) }),
      el('td', { className: 'num', textContent: won(item.amounts[data.baseYear]) }),
    ));
  return el('div', { className: 'table-wrap' },
    el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { textContent: '사업' }),
        el('th', { className: 'num', textContent: `${prevYear()}년 예산` }),
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

// 전년 예산 → 정부안과 그 증감. 정부안에 없는 칸은 두 해 모두 0원이라 쓰지 않는다.
function yearOverYear(category) {
  const change = el('span', { className: 'change' });
  setChange(change, base(category) - prev(category), growth(prev(category), base(category)));
  return el('p', { className: 'yoy' },
    `${prevYear()}년 ${won(prev(category))} → ${data.baseLabel} ${won(base(category))} `, change);
}

// 분야마다 다섯 단계 가운데 하나를 고른다. 라디오 버튼이라 키보드 화살표로도 고를 수 있다.
function levelPicker(category) {
  const name = `level-${category.id}`;
  return el('fieldset', { className: 'levels' },
    el('legend', { className: 'visually-hidden', textContent: `${category.name} 예산` }),
    ...levels(category).map((level) => {
      const input = el('input', { type: 'radio', name, value: level.value });
      input.addEventListener('change', () => {
        values.set(category.id, level.value);
        update();
        writeHash();
      });
      return el('label', { className: `level ${level.tone}` },
        input,
        el('span', { className: 'level-label', textContent: level.label }),
        level.note ? el('span', { className: 'level-note', textContent: level.note }) : null,
      );
    }),
  );
}

// 줄 그림 아이콘. currentColor를 써서 버튼 글자색을 따른다.
const ICONS = {
  write: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  view: '<path d="M4 5h16v11H9l-5 4z"/>',
};

function icon(name) {
  const span = el('span', { className: 'icon', ariaHidden: 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

// 대상마다 '의견 남기기'와 '의견 보기 N'. 동작과 개수는 board.js가 맡는다.
function opinionButtons(target) {
  const write = el('button', { type: 'button', className: 'chip' }, icon('write'), '의견 남기기');
  write.dataset.write = 'question';
  write.dataset.target = target;
  const view = el('button', { type: 'button', className: 'chip' },
    icon('view'), '의견 보기 ', el('span', { className: 'num', textContent: '0' }));
  view.dataset.opinions = target;
  return el('span', { className: 'opinion-actions' }, write, view);
}

function categoryCard(category) {
  const amount = isAmount(category);
  return el('article', { className: `category${amount ? ' absent' : ''}`, id: `cat-${category.id}` },
    el('div', { className: 'category-head' },
      el('h3', { textContent: category.name }),
      el('span', { className: 'amounts' },
        '내 예산 ',
        el('strong', { className: 'mine' }),
        ' ',
        el('span', { className: 'change mine-diff' }),
      ),
    ),
    amount ? null : yearOverYear(category),
    levelPicker(category),
    el('div', { className: 'scale' },
      el('span', { className: 'share' }),
      opinionButtons(category.id),
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

// 분야별 칸 수. 칸 수 합계가 정부안 합계의 칸 수와 맞도록 나머지가 큰 분야부터 한 칸씩 더 준다.
let cellCounts;
function cells(group) {
  if (!cellCounts) {
    const exact = data.groups.map((g) => sum(members(g), base) / CELL);
    const counts = exact.map(Math.floor);
    const left = Math.round(sum(data.categories, base) / CELL) - counts.reduce((s, n) => s + n, 0);
    exact.map((x, i) => i).sort((i, j) => (exact[j] % 1) - (exact[i] % 1))
      .slice(0, left).forEach((i) => { counts[i] += 1; });
    cellCounts = new Map(data.groups.map((g, i) => [g, counts[i]]));
  }
  return cellCounts.get(group);
}

// 정부안에 없는 칸은 대분류 이름 대신 그 칸의 이름을 보여 준다.
function groupLabel(group) {
  return isAbsentGroup(group) ? members(group).map((c) => c.name).join(', ') : group.name;
}

// 정부안 전체를 100억 원짜리 칸으로 쪼개 분야 색으로 칠한다. 정부안에 없는 칸은 점선 빈칸 하나로 남긴다.
function renderWaffle() {
  const gov = sum(data.categories, base);
  const total = sum(data.groups, cells);
  let index = 0;
  const nodes = data.groups.flatMap((group) => {
    const absent = isAbsentGroup(group);
    const tip = `${groupLabel(group)} ${won(sum(members(group), base))} · ${cells(group)}칸`;
    return Array.from({ length: absent ? 1 : cells(group) }, () => {
      const cell = el('span', { className: `cell${absent ? ' absent' : ''}` });
      cell.dataset.tip = tip;
      cell.style.setProperty('--group-color', groupColor(group));
      cell.style.setProperty('--i', index++);
      return cell;
    });
  });
  const waffle = document.getElementById('waffle');
  waffle.replaceChildren(...nodes);
  waffle.setAttribute('aria-label', data.groups
    .map((group) => `${groupLabel(group)} ${cells(group)}칸`).join(', '));

  const absent = data.categories.find(isAmount);
  document.getElementById('waffle-caption').replaceChildren(
    el('strong', { textContent: `정부안 ${won(gov)} 원을 100억 원짜리 칸 ${total.toLocaleString('ko-KR')}개로 나눠 보면` }),
    absent ? el('span', { textContent: `맨 끝 점선 칸이 정부안에 없는 '${absent.name}'입니다. 칸에 손가락이나 마우스를 올려 보세요.` }) : null,
  );
}

function renderLegend() {
  document.getElementById('legend').replaceChildren(...data.groups.map((group) => {
    const item = el('li', { className: isAbsentGroup(group) ? 'absent' : '' },
      groupLabel(group), ' ', el('span', { className: 'count', textContent: `${cells(group)}칸` }));
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

// 막대 조각이나 칸에 마우스를 올리거나 누르면 금액을 보여 준다.
function setupTooltip() {
  const tip = document.getElementById('tip');
  const show = (event) => {
    const mark = event.target.closest('[data-tip]');
    if (!mark) {
      tip.hidden = true;
      return;
    }
    tip.textContent = mark.dataset.tip;
    tip.hidden = false;
    const x = Math.min(event.clientX + 12, innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${event.clientY + 16}px`;
  };
  for (const area of document.querySelectorAll('.bars, .waffle')) {
    area.addEventListener('pointermove', show);
    area.addEventListener('pointerdown', show);
    area.addEventListener('pointerleave', () => { tip.hidden = true; });
  }
}

function renderTotals() {
  const before = sum(data.categories, prev);
  const gov = sum(data.categories, base);
  document.getElementById('total-prev-label').textContent = `${prevYear()}년 예산`;
  document.getElementById('total-prev').textContent = won(before);
  document.getElementById('total-gov-label').textContent = data.baseLabel;
  document.getElementById('total-gov').textContent = won(gov);
  setChange(document.getElementById('total-growth'), gov - before, growth(before, gov));
}

function render() {
  renderTotals();
  renderWaffle();
  renderFacts();
  renderLegend();
  renderBars();

  const main = document.getElementById('groups');
  main.replaceChildren(...data.groups.map((group, index) => {
    const section = el('section', { className: `group${isAbsentGroup(group) ? ' absent' : ''}` },
      el('div', { className: 'group-head' },
        el('h2', { textContent: group.name }),
        isAbsentGroup(group) ? null : opinionButtons(`group:${group.name}`),
      ),
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
    await loadCampaign();
  } catch {
    document.querySelector('#groups .status').textContent = '예산 자료를 불러오지 못했습니다.';
    return;
  }
  readHash();
  render();
  update();
  setupTooltip();
  const summary = document.getElementById('summary');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--summary-height', `${summary.offsetHeight}px`);
  }).observe(summary);
  setupBoard({
    campaign: data.id,
    groups: data.groups,
    categories: data.categories,
    currentBudget: () => budgetText(),
    summarize,
    loadBudget: (text) => {
      location.hash = text;
      document.getElementById('summary').scrollIntoView();
    },
  });

  document.getElementById('share').addEventListener('click', share);
  // 주소의 해시에 조절 값이 담기므로, 앵커 이동 대신 스크롤만 한다.
  for (const link of document.querySelectorAll('.start')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      document.querySelector(link.getAttribute('href')).scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
  }
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
