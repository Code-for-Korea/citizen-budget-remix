// 홈 화면: 캠페인 데이터를 불러와 분야(중분류)마다 증액·감액을 고르는 화면을 그린다.
// 고른 값은 주소의 해시(#c=id:값,...)에 담아 공유한다. 값을 읽고 쓰는 규칙은 budget.js에 있다.

import { el } from './dom.js?v=202610240411';
import { setupBoard } from './board.js?v=202610240411';
import { setupShare } from './share.js?v=202610240411';
import {
  data, loadCampaign, won, signed, growth, isAmount, levels, initial, base, prevYear, prev, sum,
  parseBudget, budgetPairs, mine as budgetMine, budgetText as budgetString, highlights as budgetHighlights,
} from './budget.js?v=202610240411';

const CELL = 10000; // 칸 그림의 한 칸: 100억 원(백만원 단위)

// 다른 페이지에서 제안을 내 예산안에 반영할 때 이어 붙일 수 있도록 마지막 예산을 기억한다(posts.js).
const SAVED_KEY = 'my-budget';

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

// 대분류 순서(금액이 큰 것부터)대로 색을 쓴다(style.css의 --series-N). 팔레트는 이웃한 색끼리 구분되도록 이 순서로 검증했다.
function groupColor(group) {
  return `var(--series-${data.groups.indexOf(group) + 1})`;
}

function isAbsentGroup(group) {
  return members(group).every(isAmount);
}

function saveBudget(text) {
  try {
    localStorage.setItem(SAVED_KEY, text);
  } catch {
    // 기억하지 못해도 화면은 동작한다.
  }
}

function savedBudget() {
  try {
    return localStorage.getItem(SAVED_KEY) || '';
  } catch {
    return '';
  }
}

// 주소의 예산을 읽고 기억한다. 시민 예산안을 불러와 주소가 바뀐 때도 여기로 온다.
function readHash() {
  for (const [id, value] of parseBudget(location.hash)) values.set(id, value);
  saveBudget(budgetText());
}

function writeHash() {
  const text = budgetText();
  history.replaceState(null, '', location.pathname + location.search + (text ? `#${text}` : ''));
  saveBudget(text);
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
    setComparison(card.querySelector('.yoy'), mine(category), isAmount(category) ? category.max : 0);
    card.querySelector('.share').textContent =
      `전체 중 비중 ${percentOf(base(category), gov)}% → ${percentOf(mine(category), total)}%`;
  }

  data.groups.forEach((group, index) => {
    const floor = isAbsentGroup(group) ? sum(members(group), (c) => c.max) : 0;
    setComparison(document.getElementById(`group-yoy-${index}`), sum(members(group), mine), floor);
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
  return el('p', { className: 'related' },
    el('strong', { textContent: `관련 사업 ${category.items.length}개를 모두 더해도 ${won(related)}, ${data.baseLabel} 전체의 ${percentOf(related, gov)}%입니다.` }));
}

function yoyRow(label, className) {
  return el('div', { className: `yoy-row ${className}` },
    el('span', { className: 'yoy-label', textContent: label }),
    el('span', { className: 'yoy-bar' }, el('i')),
    el('span', { className: 'yoy-amount' }));
}

// 전년 예산·정부안·내 예산을 같은 축척의 막대로 견준다. 칩은 정부안의 전년 대비 증감, 맨 아래 줄은 내 예산의 정부안 대비 증감이다.
// 분야 카드와 대분류 머리가 함께 쓴다. 정부안에 없는 칸(withYear가 거짓)은 두 해 모두 0원이라 내 예산 줄만 둔다.
// 막대 길이와 내 예산은 고를 때마다 setComparison()이 다시 그린다.
function comparison(before, after, withYear = true) {
  const nodes = [];
  if (withYear) {
    const diff = after - before;
    const same = Math.round(diff / 100) === 0;
    const rate = before ? `${diff > 0 ? '+' : '−'}${Math.round((Math.abs(diff) / before) * 100)}%` : '새로 생김';
    const chip = el('span', { className: `yoy-chip${same ? '' : diff > 0 ? ' up' : ' down'}` },
      ...(same ? ['전년과 같음'] : [el('strong', { textContent: rate }), ` ${signed(diff)}`]));
    nodes.push(
      el('div', { className: 'yoy-head' }, el('span', { textContent: '전년 대비' }), chip),
      yoyRow(`${prevYear()}년`, 'before'),
      yoyRow(data.baseLabel, 'after'),
    );
  }
  nodes.push(yoyRow('내 예산', 'mine'), el('p', { className: 'yoy-diff change' }));
  const node = el('div', { className: 'yoy' }, ...nodes);
  node.dataset.before = before;
  node.dataset.after = after;
  return node;
}

// floor: 막대 축척의 최솟값. 정부안에 없는 칸은 고를 수 있는 최대 금액을 쓴다.
function setComparison(node, my, floor = 0) {
  const before = Number(node.dataset.before);
  const after = Number(node.dataset.after);
  const scale = Math.max(before, after, my, floor) || 1;
  for (const [className, amount] of [['before', before], ['after', after], ['mine', my]]) {
    const row = node.querySelector(`.yoy-row.${className}`);
    if (!row) continue;
    row.querySelector('i').style.width = `${(amount / scale) * 100}%`;
    row.querySelector('.yoy-amount').textContent = won(amount);
  }
  const diff = my - after;
  const rate = after ? ` (${diff > 0 ? '+' : '−'}${Math.round((Math.abs(diff) / after) * 100)}%)` : '';
  setChange(node.querySelector('.yoy-diff'), diff, Math.round(diff / 100) ? `정부안보다 ${signed(diff)}${rate}` : '');
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

// 대상마다 '질문·제안 남기기'와 그 바로 옆에 남긴 글 수. 글 수를 누르면 목록 모달이 열린다. 동작과 개수는 board.js가 맡는다.
function talkButtons(target) {
  const write = el('button', { type: 'button', className: 'chip' }, icon('write'), '질문·제안 남기기');
  write.dataset.write = '';
  write.dataset.target = target;
  const view = el('button', { type: 'button', className: 'chip count-chip' },
    icon('view'), el('span', {}, el('span', { className: 'num', textContent: '0' }), '개'));
  view.dataset.talk = target;
  view.setAttribute('aria-label', '남긴 질문·제안 보기');
  return el('div', { className: 'talk-actions' }, write, view);
}

// 시민 예산안들이 이 분야를 어떻게 골랐는지 센다. 고르지 않은 분야는 정부안 그대로(유지)로 친다.
function renderTallies(posts) {
  const budgets = posts.filter((p) => p.kind === 'budget').map((p) => parseBudget(p.budget));
  for (const category of data.categories) {
    const node = document.querySelector(`#cat-${category.id} .tally`);
    if (!budgets.length) {
      node.textContent = '';
      continue;
    }
    const counts = { up: 0, keep: 0, down: 0 };
    for (const budget of budgets) {
      const diff = budget.get(category.id) - initial(category);
      counts[diff > 0 ? 'up' : diff < 0 ? 'down' : 'keep'] += 1;
    }
    node.textContent = `시민 예산안 ${budgets.length}개: 증액 ${counts.up} · 유지 ${counts.keep}`
      + (isAmount(category) ? '' : ` · 감액 ${counts.down}`);
  }
}

// 제안의 값을 지금 예산에 덮어쓰고 그 분야를 보여 준다.
function applyBudget(text) {
  const pairs = budgetPairs(text);
  for (const [id, value] of pairs) values.set(id, value);
  update();
  writeHash();
  const [first] = pairs.keys();
  if (first) document.getElementById(`cat-${first}`).scrollIntoView();
}

function categoryCard(category) {
  const amount = isAmount(category);
  return el('article', { className: `category${amount ? ' absent' : ''}`, id: `cat-${category.id}` },
    el('div', { className: 'category-head' }, el('h3', { textContent: category.name })),
    comparison(prev(category), base(category), !amount),
    el('p', { className: 'category-description', textContent: category.description }),
    relatedNote(category),
    levelPicker(category),
    el('p', { className: 'tally' }),
    el('div', { className: 'scale' }, el('span', { className: 'share' })),
    talkButtons(category.id),
    el('details', {},
      el('summary', { textContent: `${amount ? '관련 사업' : '세부사업'} ${category.items.length}개` }),
      itemTable(category),
    ),
  );
}

// 맨 위 핵심 숫자: 대분류마다 정부안에서 차지하는 비중. 금액이 큰 대분류부터 놓는다.
function renderFacts() {
  const gov = sum(data.categories, base);
  const facts = data.groups.filter((g) => !isAbsentGroup(g)).map((group) => {
    const amount = sum(members(group), base);
    return [`${percentOf(amount, gov)}%`, `${group.name} · ${won(amount)}`, group];
  });

  document.getElementById('facts').replaceChildren(...facts.map(([value, label, group]) => {
    const card = el('div', { className: 'fact' }, el('strong', { textContent: value }), el('span', { textContent: label }));
    card.style.setProperty('--fact-color', groupColor(group));
    return card;
  }));
}

// 짚어 볼 점: 숫자 카드로는 드러나지 않는 쏠림과 빈칸을 한 문장씩 짚는다. 모든 숫자는 데이터에서 계산한다.
function renderPoints() {
  const gov = sum(data.categories, base);
  const before = sum(data.categories, prev);
  const items = data.categories.filter((c) => !isAmount(c)).flatMap((c) => c.items);
  const top = items.reduce((a, b) => (b.amounts[data.baseYear] > a.amounts[data.baseYear] ? b : a));
  const groupAmount = (name) => sum(data.categories.filter((c) => c.group === name), base);
  const biggest = data.groups.filter((g) => !isAbsentGroup(g)).reduce((a, b) => (groupAmount(b.name) > groupAmount(a.name) ? b : a));
  const safety = groupAmount('안전·신뢰');
  const shrunk = data.categories.filter((c) => !isAmount(c) && prev(c) > 0)
    .reduce((a, b) => (base(b) / prev(b) < base(a) / prev(a) ? b : a));
  const absent = data.categories.find(isAmount);
  const related = absent ? absent.items.reduce((s, i) => s + i.amounts[data.baseYear], 0) : 0;

  const points = [
    [`${Math.round((top.amounts[data.baseYear] / gov) * 100)}%`,
      `「${top.detail || top.name}」 사업 하나가 ${data.baseLabel} 전체(${won(gov)})의 ${Math.round((top.amounts[data.baseYear] / gov) * 100)}%, ${won(top.amounts[data.baseYear])}을 차지합니다.`],
    safety && [`1 : ${Math.round(groupAmount(biggest.name) / safety)}`,
      `안전·신뢰에 1원을 쓸 때 ${biggest.name}에는 약 ${Math.round(groupAmount(biggest.name) / safety)}원을 씁니다. 안전·신뢰는 ${won(safety)}, 전체의 ${percentOf(safety, gov)}%입니다.`],
    base(shrunk) < prev(shrunk) && [`${Math.round(((base(shrunk) - prev(shrunk)) / prev(shrunk)) * 100)}%`.replace('-', '−'),
      `전체 AI 예산이 ${prevYear()}년보다 ${Math.round(((gov - before) / before) * 100)}% 늘어나는 동안 「${shrunk.name}」 분야는 ${won(prev(shrunk))}에서 ${won(base(shrunk))}으로 가장 많이 줄었습니다.`],
    absent && ['0원',
      `정부 분류에는 「${absent.name}」처럼 민주주의와 공공재를 다루는 칸이 없습니다. 가까운 사업을 모두 더해도 ${won(related)}, 전체의 ${percentOf(related, gov)}%입니다.`],
  ].filter(Boolean);

  document.getElementById('points').replaceChildren(...points.map(([value, text]) =>
    el('li', { className: 'point' },
      el('strong', { className: 'point-value', textContent: value }),
      el('p', { textContent: text }))));
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

// 막대 조각이나 칸에 마우스를 올리거나 탭하면 금액을 보여 준다.
// 터치에서는 손가락을 대는 순간(pointerdown)이 아니라 탭(click)했을 때만 띄운다. 스크롤하려고 손가락을 댄 것은
// 탭이 아니어서 팝오버가 뜨지 않는다. 띄운 팝오버는 손가락을 움직이거나, 어디든 스크롤하거나, 다른 곳을 누르면 숨긴다.
function setupTooltip() {
  const tip = document.getElementById('tip');
  const hide = () => { tip.hidden = true; };
  const show = (event) => {
    const mark = event.target.closest('[data-tip]');
    if (!mark) {
      hide();
      return;
    }
    tip.textContent = mark.dataset.tip;
    tip.hidden = false;
    const x = Math.min(event.clientX + 12, innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${event.clientY + 16}px`;
  };
  for (const area of document.querySelectorAll('.bars, .waffle')) {
    area.addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch') show(event); });
    area.addEventListener('pointerleave', (event) => { if (event.pointerType !== 'touch') hide(); });
    area.addEventListener('click', show);
  }
  document.addEventListener('touchmove', hide, { passive: true });
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.bars, .waffle')) hide();
  });
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
  renderPoints();
  renderLegend();
  renderBars();

  const main = document.getElementById('groups');
  main.replaceChildren(...data.groups.map((group, index) => {
    const section = el('section', { className: `group${isAbsentGroup(group) ? ' absent' : ''}` },
      el('div', { className: 'group-head' },
        el('h2', { textContent: group.name }),
        isAbsentGroup(group) ? null : talkButtons(`group:${group.name}`),
      ),
      el('p', {}, group.description),
      Object.assign(comparison(sum(members(group), prev), sum(members(group), base), !isAbsentGroup(group)),
        { id: `group-yoy-${index}` }),
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

// '내 예산 공유': 지금 짠 예산이 담긴 주소를 나눈다. 휴대폰에서는 공유 시트를, 없으면 링크 복사를 쓴다.
// (GNB의 '공유'는 사이트 주소를 나눈다. share.js)
async function share() {
  const status = document.getElementById('share-status');
  const summary = highlights().join(' · ');
  if (navigator.share) {
    try {
      await navigator.share({
        title: '모두의 AI 예산 심의 · 내 예산안',
        text: `모두의 AI 예산 심의에서 내가 짠 AI 예산안${summary ? `: ${summary}` : ''}`,
        url: location.href,
      });
    } catch {
      // 공유 시트를 닫은 것도 여기로 온다.
    }
    return;
  }
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
  setupShare();
  try {
    await loadCampaign();
  } catch {
    document.querySelector('#groups .status').textContent = '예산 자료를 불러오지 못했습니다.';
    return;
  }
  // 탭 바로 홈에 돌아오면 주소에 예산이 없다. 그때는 이 브라우저가 기억한 예산을 이어서 보여 준다('처음으로'로 비운다).
  const saved = savedBudget();
  if (!location.hash.includes('c=') && saved) history.replaceState(null, '', `${location.pathname}${location.search}#${saved}`);
  readHash();
  render();
  update();
  setupTooltip();
  const summary = document.getElementById('summary');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--summary-height', `${summary.offsetHeight}px`);
  }).observe(summary);
  setupBoard({
    currentBudget: () => budgetText(),
    loadBudget: (text) => {
      location.hash = text;
      document.getElementById('summary').scrollIntoView();
    },
    applyBudget,
    onPosts: renderTallies,
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
