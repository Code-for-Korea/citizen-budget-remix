// 시민 심의 게시판. 글은 세 종류다.
// - 질문(question): 금액 없이 예산안 전체, 대분류, 분야에 남기는 글
// - 제안(proposal): 대분류나 분야 하나를 얼마나 늘리거나 줄일지(다섯 단계)와 그 이유
// - 시민 예산안(budget): 홈에서 모든 분야를 골라 짠 예산 묶음
// Supabase의 REST API를 fetch로 직접 부른다. 읽기는 누구나 하고, 글을 처음 쓸 때 익명 세션을 만들어
// 이 브라우저에 보관한다. 같은 브라우저에서만 자기 글을 고치거나 지울 수 있다.
//
// 홈과 시민 예산안·심의 페이지가 함께 쓴다. 페이지에 있는 다음 표시를 찾아 채운다.
// - [data-board-list][data-kind="talk|budget"]: 글 목록. talk는 질문·제안이다. data-limit이 있으면 최근 글만 보여 준다.
//   안에 [data-filter](대상), [data-kind-filter](종류) 고르기 칸이 있으면 그것으로 거른다.
// - [data-talk="대상"]: 누르면 그 대상의 질문·제안 모달을 연다. 안의 .num에 글 수를 쓴다.
// - [data-write="question|proposal|budget|"][data-target]: 글쓰기 버튼. 빈 값이면 쓰는 사람이 종류를 고른다.
// - [data-count="talk|budget"]: 글 수.
// 대상은 posts.category_id에 담는다. 빈 값은 예산안 전체, 'group:이름'은 대분류, 그 밖은 분야 id다.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=202610240416';
import { el } from './dom.js?v=202610240416';
import {
  data, levels, levelOf, isAmount, base, won, signed, sum, budgetPairs, parseBudget, proposalText, summarize,
} from './budget.js?v=202610240416';

const SESSION_KEY = 'board-session';
const NAME_KEY = 'board-name';
// 목록은 작성자 id를 감춘 posts_public 뷰에서 읽고, 쓰기는 posts 표에 한다(supabase/migrations 참고).
const FIELDS = 'id,kind,title,body,author_name,category_id,budget,created_at,updated_at';

const KINDS = {
  question: {
    label: '질문',
    icon: '?',
    hint: '궁금한 점이나 따져 묻고 싶은 점을 적어 주세요.',
  },
  proposal: {
    label: '제안',
    icon: '±',
    hint: '대분류나 분야 하나를 얼마나 늘리거나 줄일지 고르고, 그 이유를 적어 주세요.',
  },
  budget: {
    label: '시민 예산안',
    icon: '⇄',
    hint: '지금 화면에서 짠 내 예산을 시민 예산안으로 냅니다.',
  },
};
const TALK = ['question', 'proposal'];
const EMPTY = {
  talk: '아직 남긴 질문·제안이 없습니다. 첫 글을 남겨 보세요.',
  budget: '아직 낸 시민 예산안이 없습니다. 내 예산을 짜서 첫 시민 예산안으로 내 보세요.',
};

// localStorage는 막혀 있을 수 있다. 그럴 때는 이 페이지를 연 동안만 기억한다.
function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장하지 못해도 화면은 동작한다.
  }
}

let session = JSON.parse(load(SESSION_KEY) || 'null');

class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(url, { method = 'GET', body, token, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  let response;
  try {
    response = await fetch(url, { method, headers, body: body && JSON.stringify(body) });
  } catch {
    throw new RequestError('게시판 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  const json = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new RequestError(json?.message || json?.msg || `요청이 실패했습니다(${response.status}).`, response.status);
  }
  return json;
}

async function auth(path, body) {
  const json = await call(`${SUPABASE_URL}/auth/v1/${path}`, { method: 'POST', body });
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at ?? Math.floor(Date.now() / 1000) + json.expires_in,
  };
}

// 세션이 있으면 만료 전에 갱신해 토큰을 돌려준다. create가 참이면 세션이 없을 때 익명 세션을 새로 만든다.
// 갱신 토큰이 거절되면 세션을 버린다. 그러면 예전 글은 더는 고칠 수 없다.
async function token({ create = false } = {}) {
  if (session && session.expires_at - 60 < Date.now() / 1000) {
    try {
      session = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    } catch (error) {
      if (!error.status || error.status >= 500) throw error;
      session = null;
    }
    store(SESSION_KEY, JSON.stringify(session));
  }
  if (!session && create) {
    session = await auth('signup', {});
    store(SESSION_KEY, JSON.stringify(session));
  }
  return session?.access_token;
}

function rest(path, options = {}) {
  return call(`${SUPABASE_URL}/rest/v1/${path}`, options);
}

const relative = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

function ago(iso) {
  const seconds = (new Date(iso) - Date.now()) / 1000;
  if (-seconds >= 7 * 86400) return new Date(iso).toLocaleDateString('ko-KR');
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (-seconds >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return '방금';
}


const GROUP = 'group:';

function category(id) {
  return data.categories.find((c) => c.id === id);
}

// 정부안에 없는 칸만 있는 대분류는 그 칸 하나로 충분해서 대분류 대상에서 뺀다.
function targetGroups() {
  return data.groups.filter((g) => data.categories.some((c) => c.group === g.name && !isAmount(c)));
}

function targetName(target) {
  if (!target) return '예산안 전체';
  if (target.startsWith(GROUP)) return target.slice(GROUP.length);
  return category(target)?.name || target;
}

// 제안이 조절하는 분야: 분야 하나, 또는 대분류 아래 정부 분류 칸 모두.
function targetCategories(target) {
  if (!target) return [];
  if (!target.startsWith(GROUP)) return [category(target)].filter(Boolean);
  return data.categories.filter((c) => `${GROUP}${c.group}` === target && !isAmount(c));
}

// 대분류를 고르면 그 아래 분야의 글도 함께 보여 준다. 'all'은 모든 글이다.
function matches(post, target) {
  if (!TALK.includes(post.kind)) return false;
  if (target === 'all') return true;
  const own = post.category_id || '';
  if (own === target) return true;
  if (!target.startsWith(GROUP)) return false;
  return data.categories.some((c) => c.id === own && `${GROUP}${c.group}` === target);
}

// 제안 한 줄 요약: "증액(+20%) · +1,032억"
function proposalSummary(post) {
  const pairs = budgetPairs(post.budget);
  const covered = [...pairs.keys()].map(category);
  if (!covered.length) return '';
  const first = covered[0];
  const value = pairs.get(first.id);
  const level = levelOf(first, value);
  const diff = sum(covered, (c) => (isAmount(c) ? pairs.get(c.id) : Math.round((base(c) * pairs.get(c.id)) / 100)) - base(c));
  if (isAmount(first)) return `${won(value)}으로 정하자`;
  const name = level ? `${level.label}${level.value === 100 ? '' : `(${level.note})`}` : `${value}%`;
  return Math.round(diff / 100) ? `${name} · ${signed(diff)}` : `${name} · 정부안 그대로`;
}

// 모달 우상단의 닫기 버튼.
function closeButton(dialog) {
  const button = el('button', { type: 'button', className: 'dialog-close', textContent: '×', onclick: () => dialog.close() });
  button.setAttribute('aria-label', '닫기');
  return button;
}

// 글쓰기 창. 페이지마다 같은 모양이라 HTML에 두지 않고 여기서 만든다.
function formDialog() {
  const field = (label, control, className = '') => el('label', { className }, label, ' ', control);
  const kindRadio = (kind) => el('label', { className: 'kind-choice' },
    el('input', { type: 'radio', name: 'kind', value: kind }), `${KINDS[kind].icon} ${KINDS[kind].label}`);
  const dialog = el('dialog', { id: 'post-dialog' },
    el('form', { id: 'post-form', noValidate: true },
      el('h2', { id: 'post-dialog-title' }),
      el('fieldset', { className: 'kind-field' },
        el('legend', { textContent: '무엇을 남길까요' }),
        ...TALK.map(kindRadio)),
      el('p', { className: 'hint', id: 'post-hint' }),
      field('대상', el('select', { name: 'category_id' }), 'category-field'),
      el('fieldset', { className: 'level-field' }, el('legend', { textContent: '얼마나 바꿀까요' }), el('div', { className: 'levels' })),
      field('제목', el('input', { name: 'title', maxLength: 100, required: true })),
      field('내용', el('textarea', { name: 'body', rows: 6, maxLength: 4000 })),
      field('이름(별명)', el('input', { name: 'author_name', maxLength: 30, autocomplete: 'nickname', required: true })),
      el('p', { className: 'note', textContent: '로그인 없이 씁니다. 내 글은 이 브라우저에서만 고치거나 지울 수 있습니다. 연락처 같은 개인정보는 적지 마세요.' }),
      el('p', { className: 'status', id: 'post-status', role: 'status' }),
      el('div', { className: 'actions' },
        el('button', { type: 'submit', textContent: '올리기' }),
        el('button', { type: 'button', className: 'secondary', id: 'post-cancel', textContent: '취소' }),
      ),
    ),
  );
  dialog.prepend(closeButton(dialog));
  dialog.setAttribute('aria-labelledby', 'post-dialog-title');
  return dialog;
}

function targetOptions() {
  const option = (value, text) => el('option', { value, textContent: text });
  const groups = targetGroups();
  return [
    option('', '예산안 전체'),
    ...groups.map((group) => el('optgroup', { label: group.name },
      option(`${GROUP}${group.name}`, `${group.name} 전체`),
      ...data.categories.filter((c) => c.group === group.name).map((c) => option(c.id, c.name)))),
    ...data.groups.filter((g) => !groups.includes(g)).flatMap((group) =>
      data.categories.filter((c) => c.group === group.name).map((c) => option(c.id, c.name))),
  ];
}

// currentBudget: 홈에서 지금 짠 예산(c=...). 다른 페이지에서는 빈 문자열이다.
// loadBudget: 시민 예산안을 통째로 불러온다. applyBudget: 제안의 값을 지금 예산에 덮어쓴다.
// onPosts: 글 목록이 바뀔 때마다 모든 글을 넘겨받는다(홈의 시민 선택 집계).
export function setupBoard({ currentBudget = () => '', loadBudget, applyBudget, onPosts }) {
  const ready = Boolean(SUPABASE_URL && SUPABASE_KEY);
  const campaign = data.id;
  const lists = [...document.querySelectorAll('[data-board-list]')].map((node) => ({
    node,
    kind: node.dataset.kind,
    limit: Number(node.dataset.limit) || Infinity,
    list: node.querySelector('.posts'),
    status: node.querySelector('.board-status'),
    filter: node.querySelector('[data-filter]'),
    kindFilter: node.querySelector('[data-kind-filter]'),
  }));
  const dialog = formDialog();
  const viewer = el('dialog', { className: 'talk-dialog' });
  viewer.setAttribute('aria-label', '질문·제안');
  document.body.append(dialog, viewer);
  const form = dialog.querySelector('form');
  const formStatus = dialog.querySelector('#post-status');
  const targetSelect = form.elements.category_id;
  const levelBox = form.querySelector('.level-field .levels');

  let posts = [];
  let loading = ready;
  let error = '';
  let editing = null;
  let draftBudget = '';
  let viewing = null; // 모달이 보여 주는 것: { target, kind, post? }

  targetSelect.append(...targetOptions());
  for (const { filter } of lists) filter?.append(...targetOptions());

  function talkFor(target, kind = 'all') {
    return posts.filter((p) => matches(p, target) && (kind === 'all' || p.kind === kind));
  }

  function meta(post) {
    const parts = [`#${post.id}`];
    if (TALK.includes(post.kind)) parts.push(KINDS[post.kind].label);
    parts.push(post.author_name, ago(post.created_at));
    if (post.updated_at && new Date(post.updated_at) - new Date(post.created_at) > 60000) parts.push('고침');
    if (TALK.includes(post.kind)) parts.push(targetName(post.category_id));
    return parts.join(' · ');
  }

  function ownActions(post) {
    if (!post.mine) return [];
    return [
      el('button', { type: 'button', className: 'secondary', textContent: '고치기', onclick: () => openForm(post.kind, { post }) }),
      el('button', { type: 'button', className: 'secondary', textContent: '지우기', onclick: () => remove(post) }),
    ];
  }

  function body(post) {
    return post.body
      ? el('p', { className: 'post-body', textContent: post.body })
      : el('p', { className: 'post-body muted', textContent: '본문 없이 제목만 남긴 글입니다.' });
  }

  function icon(post) {
    return el('span', { className: `post-icon ${post.kind}`, textContent: KINDS[post.kind].icon, ariaHidden: 'true' });
  }

  // 질문·제안 한 줄. 누르면 모달에서 자세히 본다.
  function talkRow(post, onclick) {
    return el('li', { className: `post ${post.kind}`, id: `post-${post.id}` }, icon(post),
      el('button', { type: 'button', className: 'post-open', onclick },
        el('strong', { className: 'post-title', textContent: post.title }),
        el('span', { className: 'post-meta', textContent: meta(post) }),
        post.kind === 'proposal' ? el('span', { className: 'post-budget', textContent: proposalSummary(post) }) : null,
      ));
  }

  // 시민 예산안은 그 자리에서 펼친다.
  function budgetRow(post) {
    return el('li', { className: 'post budget', id: `post-${post.id}` }, icon(post),
      el('details', {},
        el('summary', {},
          el('strong', { className: 'post-title', textContent: post.title }),
          el('span', { className: 'post-meta', textContent: meta(post) }),
          el('span', { className: 'post-budget', textContent: summarize(post.budget) }),
        ),
        body(post),
        el('div', { className: 'actions' },
          el('button', { type: 'button', textContent: '이 시민 예산안 불러오기', onclick: () => openBudget(post) }),
          ...ownActions(post)),
      ));
  }

  function renderViewer() {
    const { target, kind, post } = viewing;
    const close = closeButton(viewer);
    const where = target === 'all' ? '모든' : `「${targetName(target)}」`;
    if (post) {
      viewer.replaceChildren(...[
        close,
        el('div', { className: 'viewer-bar' },
          el('button', { type: 'button', className: 'secondary', textContent: '← 목록', onclick: () => openViewer({ target, kind }) })),
        el('p', { className: `kind-badge ${post.kind}`, textContent: `${KINDS[post.kind].icon} ${KINDS[post.kind].label}` }),
        el('h2', { className: 'post-title', textContent: post.title }),
        el('p', { className: 'post-meta', textContent: meta(post) }),
        post.kind === 'proposal' ? el('p', { className: 'proposal-line' },
          el('strong', { textContent: proposalSummary(post) }), ' ',
          applyBudget ? el('button', {
            type: 'button',
            textContent: '내 예산안에 반영',
            onclick: () => { viewer.close(); applyBudget(post.budget); },
          }) : null) : null,
        body(post),
        el('div', { className: 'actions' }, ...ownActions(post)),
      ].filter(Boolean));
      return;
    }
    const shown = talkFor(target, kind);
    const tab = (value, label) => {
      const button = el('button', {
        type: 'button',
        className: 'tab',
        onclick: () => openViewer({ target, kind: value }),
      }, `${label} `, el('span', { className: 'num', textContent: talkFor(target, value).length }));
      button.setAttribute('aria-pressed', value === kind);
      return button;
    };
    viewer.replaceChildren(...[
      close,
      el('div', { className: 'viewer-bar' },
        el('h2', { textContent: `${where} 질문·제안` })),
      el('div', { className: 'tabs' }, tab('all', '전체'), ...TALK.map((k) => tab(k, KINDS[k].label))),
      el('div', { className: 'actions' },
        el('button', {
          type: 'button',
          textContent: kind === 'all' ? '남기기' : `${KINDS[kind].label} 남기기`,
          onclick: () => openForm(kind === 'all' ? '' : kind, { target: target === 'all' ? '' : target }),
        })),
      error ? el('p', { className: 'status', textContent: error }) : null,
      !error && !shown.length ? el('p', { className: 'status', textContent: '아직 남긴 글이 없습니다. 첫 글을 남겨 보세요.' }) : null,
      el('ol', { className: 'posts' }, ...shown.map((p) => talkRow(p, () => openViewer({ target, kind, post: p })))),
    ].filter(Boolean));
  }

  // 모달 내용을 통째로 바꾸면 누른 버튼이 사라져 키보드 초점이 페이지로 빠진다. 바뀐 화면의 제목으로 초점을 옮긴다.
  function focusViewer() {
    const heading = viewer.querySelector('h2');
    heading.tabIndex = -1;
    heading.focus();
  }

  function openViewer(next) {
    viewing = next;
    renderViewer();
    if (!viewer.open) viewer.showModal();
    viewer.scrollTop = 0;
    focusViewer();
  }

  function render() {
    for (const { kind, limit, list, status, filter, kindFilter } of lists) {
      const target = filter?.value ?? 'all';
      const only = kindFilter?.value ?? 'all';
      const shown = (kind === 'talk' ? talkFor(target, only) : posts.filter((p) => p.kind === kind)).slice(0, limit);
      list.replaceChildren(...shown.map((post) => (kind === 'talk'
        ? talkRow(post, () => openViewer({ target: post.category_id || '', kind: 'all', post }))
        : budgetRow(post))));
      status.textContent = error
        || (!ready && '게시판을 준비하고 있습니다. 곧 글을 남길 수 있습니다.')
        || (loading && '글을 불러오고 있습니다.')
        || (shown.length ? '' : EMPTY[kind]);
    }
    for (const node of document.querySelectorAll('[data-count]')) {
      const kind = node.dataset.count;
      node.textContent = kind === 'talk' ? talkFor('all').length : posts.filter((p) => p.kind === kind).length;
    }
    for (const button of document.querySelectorAll('[data-talk]')) {
      button.querySelector('.num').textContent = talkFor(button.dataset.talk).length;
    }
    if (viewer.open) {
      if (viewing.post) viewing.post = posts.find((p) => p.id === viewing.post.id);
      renderViewer();
    }
    onPosts?.(posts);
  }

  async function refresh() {
    try {
      posts = await rest(`posts_public?select=${FIELDS},mine&campaign=eq.${encodeURIComponent(campaign)}&order=created_at.desc&limit=500`,
        { token: await token() });
      error = '';
    } catch (failure) {
      error = `글 목록을 불러오지 못했습니다. ${failure.message}`;
    }
    loading = false;
    render();
  }

  function notice(kind, text) {
    const list = lists.find((l) => l.kind === kind);
    if (!list) return;
    list.status.textContent = text;
    list.node.scrollIntoView();
  }

  // 제안의 단계 고르기. 대상의 첫 분야를 기준으로 단계를 보여 준다(대분류는 늘 퍼센트 단계다).
  function renderLevels(checked) {
    const covered = targetCategories(targetSelect.value);
    if (!covered.length) {
      levelBox.replaceChildren(el('p', { className: 'hint', textContent: '먼저 제안할 대분류나 분야를 고르세요.' }));
      return;
    }
    const current = parseBudget(currentBudget());
    const value = checked ?? (covered.every((c) => current.get(c.id) === current.get(covered[0].id)) ? current.get(covered[0].id) : 100);
    levelBox.replaceChildren(...levels(covered[0]).map((level) => el('label', { className: `level ${level.tone}` },
      el('input', { type: 'radio', name: 'level', value: level.value, checked: level.value === value }),
      el('span', { className: 'level-label', textContent: level.label }),
      level.note ? el('span', { className: 'level-note', textContent: [level.arrow, level.note].filter(Boolean).join(' ') }) : null)));
  }

  // 종류에 맞게 창을 바꾼다. 제안은 예산안 전체를 대상으로 할 수 없다.
  function applyKind(kind, checked) {
    form.dataset.kind = kind;
    document.getElementById('post-hint').textContent = kind === 'budget'
      ? `${editing ? '이 시민 예산안은' : KINDS.budget.hint} ${summarize(draftBudget)}`
      : KINDS[kind].hint;
    const whole = targetSelect.querySelector('option[value=""]');
    whole.disabled = kind === 'proposal';
    if (kind === 'proposal' && !targetSelect.value) targetSelect.value = targetSelect.querySelector('option:not([disabled])').value;
    if (kind === 'proposal') renderLevels(checked);
  }

  function openForm(kind, { post = null, target = '' } = {}) {
    if (!ready) return;
    editing = post;
    const nextKind = kind || 'question';
    draftBudget = post ? post.budget : nextKind === 'budget' ? currentBudget() : '';
    if (nextKind === 'budget' && !draftBudget) {
      notice('budget', '먼저 홈에서 분야마다 증액·감액을 골라 내 예산을 짠 다음 시민 예산안으로 내 주세요.');
      return;
    }
    form.reset();
    form.dataset.fixed = post || nextKind === 'budget' ? 'true' : '';
    for (const radio of form.elements.kind) radio.checked = radio.value === nextKind;
    form.elements.title.value = post?.title ?? '';
    form.elements.body.value = post?.body ?? '';
    targetSelect.value = post ? post.category_id || '' : target;
    form.elements.author_name.value = post?.author_name ?? load(NAME_KEY) ?? '';
    const pairs = post?.kind === 'proposal' ? budgetPairs(post.budget) : null;
    applyKind(nextKind, pairs ? [...pairs.values()][0] : undefined);
    document.getElementById('post-dialog-title').textContent = post
      ? `${KINDS[nextKind].label} 고치기`
      : nextKind === 'budget' ? '시민 예산안 내기' : '질문·제안 남기기';
    formStatus.textContent = '';
    dialog.showModal();
  }

  async function submit(event) {
    event.preventDefault();
    const kind = form.dataset.kind;
    const talk = TALK.includes(kind);
    const fields = {
      title: form.elements.title.value.trim(),
      body: form.elements.body.value.trim(),
      author_name: form.elements.author_name.value.trim(),
      category_id: talk ? targetSelect.value || null : null,
    };
    if (kind === 'proposal') {
      const level = form.querySelector('input[name="level"]:checked');
      const covered = targetCategories(targetSelect.value);
      if (!covered.length || !level) {
        formStatus.textContent = '제안할 대상과 단계를 골라 주세요.';
        return;
      }
      fields.budget = proposalText(covered, Number(level.value));
    }
    if (!fields.title || !fields.author_name) {
      formStatus.textContent = '제목과 이름(별명)을 적어 주세요.';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    formStatus.textContent = '올리는 중입니다.';
    try {
      const auth = await token({ create: true });
      const [saved] = editing
        ? await rest(`posts?id=eq.${editing.id}&select=${FIELDS}`,
          { method: 'PATCH', body: fields, token: auth, prefer: 'return=representation' })
        : await rest(`posts?select=${FIELDS}`, {
          method: 'POST',
          body: { budget: kind === 'budget' ? draftBudget : null, ...fields, campaign, kind },
          token: auth,
          prefer: 'return=representation',
        });
      if (!saved) throw new Error('이 브라우저에서 쓴 글이 아니라서 고칠 수 없습니다.');
      saved.mine = true;
      store(NAME_KEY, fields.author_name);
      posts = [saved, ...posts.filter((p) => p.id !== saved.id)]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      dialog.close();
      render();
      show(saved);
    } catch (failure) {
      formStatus.textContent = `올리지 못했습니다. ${failure.message}`;
    } finally {
      button.disabled = false;
    }
  }

  // 올린 글을 보여 준다. 질문·제안은 모달에서, 시민 예산안은 목록에서 펼친다.
  function show(post) {
    if (TALK.includes(post.kind)) {
      const keep = viewing && viewer.open;
      openViewer({ target: keep ? viewing.target : post.category_id || '', kind: keep ? viewing.kind : 'all', post });
      return;
    }
    const node = document.getElementById(`post-${post.id}`);
    if (!node) return;
    node.querySelector('details').open = true;
    node.scrollIntoView();
  }

  async function remove(post) {
    if (!confirm(`「${post.title}」을(를) 지울까요? 지운 글은 되살릴 수 없습니다.`)) return;
    try {
      // 권한이 없으면 PostgREST는 지운 것 없이 204를 돌려준다. 지운 행을 돌려받아 정말 지웠는지 확인한다.
      const deleted = await rest(`posts?id=eq.${post.id}&select=id`, { method: 'DELETE', token: await token(), prefer: 'return=representation' });
      if (!deleted?.length) throw new Error('이 브라우저에서 쓴 글이 아니라서 지울 수 없습니다.');
      posts = posts.filter((p) => p.id !== post.id);
      if (viewing?.post?.id === post.id) viewing = { target: viewing.target, kind: viewing.kind };
      render();
      if (viewer.open) focusViewer();
    } catch (failure) {
      alert(`지우지 못했습니다. ${failure.message}`);
    }
  }

  function openBudget(post) {
    const current = currentBudget();
    if (current && current !== post.budget
      && !confirm('지금 조절한 내 예산 대신 이 시민 예산안을 불러올까요? 지금 값은 이 시민 예산안으로 바뀝니다.')) return;
    loadBudget(post.budget);
  }

  document.addEventListener('click', (event) => {
    const talk = event.target.closest('[data-talk]');
    if (talk) {
      openViewer({ target: talk.dataset.talk, kind: 'all' });
      return;
    }
    const write = event.target.closest('[data-write]');
    if (write) openForm(write.dataset.write, { target: write.dataset.target || '' });
  });
  for (const radio of form.elements.kind) radio.addEventListener('change', () => applyKind(radio.value));
  targetSelect.addEventListener('change', () => { if (form.dataset.kind === 'proposal') renderLevels(); });
  for (const { filter, kindFilter } of lists) {
    filter?.addEventListener('change', render);
    kindFilter?.addEventListener('change', render);
  }
  form.addEventListener('submit', submit);
  dialog.querySelector('#post-cancel').addEventListener('click', () => dialog.close());

  render();
  if (ready) refresh();
  else for (const button of document.querySelectorAll('[data-write]')) button.disabled = true;
}
