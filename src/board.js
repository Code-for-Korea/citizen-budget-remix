// 시민 심의 게시판: 예산안에 대한 의견(GitHub의 이슈처럼)과 시민 예산안(풀 리퀘스트처럼)을 남기고 목록으로 본다.
// Supabase의 REST API를 fetch로 직접 부른다. 읽기는 누구나 하고, 글을 처음 쓸 때 익명 세션을 만들어
// 이 브라우저에 보관한다. 같은 브라우저에서만 자기 글을 고치거나 지울 수 있다.
//
// 홈과 의견·시민 예산안 페이지가 함께 쓴다. 페이지에 있는 다음 표시를 찾아 채운다.
// - [data-board-list][data-kind]: 글 목록. data-limit이 있으면 최근 글만 그만큼 보여 준다.
// - [data-opinions="대상"]: 누르면 그 대상의 의견 목록 모달을 연다. 안의 .num에 의견 수를 쓴다.
// - [data-write="question|proposal"][data-target]: 글쓰기 버튼.
// 의견의 대상은 posts.category_id에 담는다. 빈 값은 예산안 전체, 'group:이름'은 대분류, 그 밖은 분야 id다.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { el } from './dom.js';

const SESSION_KEY = 'board-session';
const NAME_KEY = 'board-name';
// 목록은 작성자 id를 감춘 posts_public 뷰에서 읽고, 쓰기는 posts 표에 한다(supabase/migrations 참고).
const FIELDS = 'id,kind,title,body,author_name,category_id,budget,created_at,updated_at';

const KINDS = {
  question: {
    label: '의견',
    icon: '“',
    write: '의견 남기기',
    empty: '아직 남긴 의견이 없습니다. 첫 의견을 남겨 보세요.',
    hint: '예산안에 대한 의견을 적어 주세요. 궁금한 점이나 따져 묻고 싶은 점도 좋습니다. 분야를 고르면 그 분야에 대한 의견으로 남습니다.',
  },
  proposal: {
    label: '시민 예산안',
    icon: '⇄',
    write: '시민 예산안 내기',
    empty: '아직 낸 시민 예산안이 없습니다. 내 예산을 첫 시민 예산안으로 내 보세요.',
    hint: '지금 화면에서 짠 내 예산을 시민 예산안으로 냅니다.',
  },
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

// 글쓰기 창. 페이지마다 같은 모양이라 HTML에 두지 않고 여기서 만든다.
function formDialog() {
  const field = (label, control, className = '') => el('label', { className }, label, ' ', control);
  const dialog = el('dialog', { id: 'post-dialog' },
    el('form', { id: 'post-form', noValidate: true },
      el('h2', { id: 'post-dialog-title' }),
      el('p', { className: 'hint', id: 'post-hint' }),
      field('제목', el('input', { name: 'title', maxLength: 100, required: true })),
      field('무엇에 대한 의견인가요', el('select', { name: 'category_id' }), 'category-field'),
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
  dialog.setAttribute('aria-labelledby', 'post-dialog-title');
  return dialog;
}

export function setupBoard({ campaign, groups, categories, summarize, currentBudget = () => '', loadBudget }) {
  const ready = Boolean(SUPABASE_URL && SUPABASE_KEY);
  const lists = [...document.querySelectorAll('[data-board-list]')].map((node) => ({
    node,
    kind: node.dataset.kind,
    limit: Number(node.dataset.limit) || Infinity,
    list: node.querySelector('.posts'),
    status: node.querySelector('.board-status'),
    filter: node.querySelector('[data-filter]'),
  }));
  const dialog = formDialog();
  const viewer = el('dialog', { className: 'opinions-dialog' });
  viewer.setAttribute('aria-label', '의견');
  document.body.append(dialog, viewer);
  const form = dialog.querySelector('form');
  const formStatus = dialog.querySelector('#post-status');
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  // 정부안에 없는 칸만 있는 대분류는 그 칸 하나로 충분해서 대분류 대상에서 뺀다.
  const opinionGroups = groups.filter((g) => categories.some((c) => c.group === g.name && c.input !== 'amount'));

  let posts = [];
  let loading = ready;
  let error = '';
  let editing = null;
  let draftBudget = '';
  let viewing = null; // 의견 모달이 보여 주는 것: { target } 또는 { target, post }

  form.elements.category_id.append(
    el('option', { value: '', textContent: '예산안 전체' }),
    ...opinionGroups.map((group) => el('optgroup', { label: group.name },
      el('option', { value: `${GROUP}${group.name}`, textContent: `${group.name} 전체` }),
      ...categories.filter((c) => c.group === group.name).map((c) => el('option', { value: c.id, textContent: c.name })),
    )),
    ...groups.filter((g) => !opinionGroups.includes(g)).flatMap((group) =>
      categories.filter((c) => c.group === group.name).map((c) => el('option', { value: c.id, textContent: c.name }))),
  );

  function targetName(target) {
    if (!target) return '예산안 전체';
    if (target.startsWith(GROUP)) return target.slice(GROUP.length);
    return categoryName.get(target) || target;
  }

  // 대분류의 의견 목록에는 그 아래 분야의 의견도 함께 보여 준다. 'all'은 모든 의견이다.
  function matches(post, target) {
    if (post.kind !== 'question') return false;
    if (target === 'all') return true;
    const own = post.category_id || '';
    if (own === target) return true;
    if (!target.startsWith(GROUP)) return false;
    return categories.some((c) => c.id === own && `${GROUP}${c.group}` === target);
  }

  function opinionsFor(target) {
    return posts.filter((p) => matches(p, target));
  }

  function meta(post) {
    const parts = [`#${post.id}`, post.author_name, ago(post.created_at)];
    if (post.updated_at && new Date(post.updated_at) - new Date(post.created_at) > 60000) parts.push('고침');
    if (post.kind === 'question') parts.push(targetName(post.category_id));
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

  // 의견은 누르면 모달에서 자세히 보고, 시민 예산안은 그 자리에서 펼친다.
  function item(post) {
    const icon = el('span', { className: 'post-icon', textContent: KINDS[post.kind].icon, ariaHidden: 'true' });
    if (post.kind === 'question') {
      return el('li', { className: 'post question', id: `post-${post.id}` }, icon,
        el('button', { type: 'button', className: 'post-open', onclick: () => openViewer({ target: post.category_id || '', post }) },
          el('strong', { className: 'post-title', textContent: post.title }),
          el('span', { className: 'post-meta', textContent: meta(post) }),
        ));
    }
    const actions = [
      el('button', { type: 'button', textContent: '이 시민 예산안 불러오기', onclick: () => open(post) }),
      ...ownActions(post),
    ];
    return el('li', { className: 'post proposal', id: `post-${post.id}` }, icon,
      el('details', {},
        el('summary', {},
          el('strong', { className: 'post-title', textContent: post.title }),
          el('span', { className: 'post-meta', textContent: meta(post) }),
          el('span', { className: 'post-budget', textContent: summarize(post.budget) }),
        ),
        body(post),
        el('div', { className: 'actions' }, ...actions),
      ));
  }

  function renderViewer() {
    if (!viewing) return;
    const { target, post } = viewing;
    const close = el('button', { type: 'button', className: 'secondary close', textContent: '닫기', onclick: () => viewer.close() });
    if (post) {
      viewer.replaceChildren(
        el('div', { className: 'viewer-bar' },
          el('button', { type: 'button', className: 'secondary', textContent: `← ${target === 'all' ? '모든' : `「${targetName(target)}」`} 의견`, onclick: () => openViewer({ target }) }),
          close),
        el('h2', { className: 'post-title', textContent: post.title }),
        el('p', { className: 'post-meta', textContent: meta(post) }),
        body(post),
        el('div', { className: 'actions' }, ...ownActions(post)),
      );
      return;
    }
    const shown = opinionsFor(target);
    viewer.replaceChildren(...[
      el('div', { className: 'viewer-bar' },
        el('h2', { textContent: target === 'all' ? `모든 의견 ${shown.length}` : `「${targetName(target)}」에 대한 의견 ${shown.length}` }),
        close),
      el('div', { className: 'actions' },
        el('button', { type: 'button', textContent: '의견 남기기', onclick: () => openForm('question', { target: target === 'all' ? '' : target }) })),
      error ? el('p', { className: 'status', textContent: error }) : null,
      !error && !shown.length ? el('p', { className: 'status', textContent: '아직 남긴 의견이 없습니다. 첫 의견을 남겨 보세요.' }) : null,
      el('ol', { className: 'posts' }, ...shown.map((p) => el('li', { className: 'post question' },
        el('span', { className: 'post-icon', textContent: KINDS.question.icon, ariaHidden: 'true' }),
        el('button', { type: 'button', className: 'post-open', onclick: () => openViewer({ target, post: p }) },
          el('strong', { className: 'post-title', textContent: p.title }),
          el('span', { className: 'post-meta', textContent: meta(p) }),
        )))),
    ].filter(Boolean));
  }

  function openViewer(next) {
    viewing = next;
    renderViewer();
    if (!viewer.open) viewer.showModal();
    viewer.scrollTop = 0;
  }

  function render() {
    for (const { kind, limit, list, status, filter } of lists) {
      const target = filter?.value ?? 'all';
      const shown = posts.filter((p) => p.kind === kind && (kind !== 'question' || matches(p, target))).slice(0, limit);
      list.replaceChildren(...shown.map(item));
      status.textContent = error
        || (!ready && '게시판을 준비하고 있습니다. 곧 의견과 시민 예산안을 남길 수 있습니다.')
        || (loading && '글을 불러오고 있습니다.')
        || (shown.length ? '' : KINDS[kind].empty);
    }
    for (const node of document.querySelectorAll('[data-count]')) {
      node.textContent = posts.filter((p) => p.kind === node.dataset.count).length;
    }
    for (const button of document.querySelectorAll('[data-opinions]')) {
      button.querySelector('.num').textContent = opinionsFor(button.dataset.opinions).length;
    }
    if (viewer.open) {
      if (viewing.post) viewing.post = posts.find((p) => p.id === viewing.post.id);
      renderViewer();
    }
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
    const target = lists.find((l) => l.kind === kind);
    if (!target) return;
    target.status.textContent = text;
    target.node.scrollIntoView();
  }

  function openForm(nextKind, { post = null, target = '' } = {}) {
    if (!ready) return;
    editing = post;
    draftBudget = post ? post.budget : nextKind === 'proposal' ? currentBudget() : '';
    if (nextKind === 'proposal' && !draftBudget) {
      notice('proposal', '먼저 위에서 분야마다 증액·감액을 골라 내 예산을 짠 다음 시민 예산안으로 내 주세요.');
      return;
    }
    form.reset();
    form.dataset.kind = nextKind;
    form.elements.title.value = post?.title ?? '';
    form.elements.body.value = post?.body ?? '';
    form.elements.category_id.value = post ? post.category_id || '' : target;
    form.elements.author_name.value = post?.author_name ?? load(NAME_KEY) ?? '';
    document.getElementById('post-dialog-title').textContent =
      `${KINDS[nextKind].label} ${post ? '고치기' : nextKind === 'proposal' ? '내기' : '남기기'}`;
    document.getElementById('post-hint').textContent = nextKind === 'proposal'
      ? `${post ? '이 시민 예산안은' : KINDS.proposal.hint} ${summarize(draftBudget)}`
      : KINDS.question.hint;
    formStatus.textContent = '';
    dialog.showModal();
  }

  async function submit(event) {
    event.preventDefault();
    const nextKind = form.dataset.kind;
    const fields = {
      title: form.elements.title.value.trim(),
      body: form.elements.body.value.trim(),
      author_name: form.elements.author_name.value.trim(),
      category_id: nextKind === 'question' ? form.elements.category_id.value || null : null,
    };
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
          body: { ...fields, campaign, kind: nextKind, budget: nextKind === 'proposal' ? draftBudget : null },
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

  // 올린 글을 보여 준다. 의견은 모달에서, 시민 예산안은 목록에서 펼친다.
  function show(post) {
    if (post.kind === 'question') {
      openViewer({ target: viewing && viewer.open ? viewing.target : post.category_id || '', post });
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
      await rest(`posts?id=eq.${post.id}`, { method: 'DELETE', token: await token() });
      posts = posts.filter((p) => p.id !== post.id);
      if (viewing?.post?.id === post.id) viewing = { target: viewing.target };
      render();
    } catch (failure) {
      alert(`지우지 못했습니다. ${failure.message}`);
    }
  }

  function open(post) {
    const current = currentBudget();
    if (current && current !== post.budget
      && !confirm('지금 조절한 내 예산 대신 이 시민 예산안을 불러올까요? 지금 값은 이 시민 예산안으로 바뀝니다.')) return;
    loadBudget(post.budget);
  }

  document.addEventListener('click', (event) => {
    const opinions = event.target.closest('[data-opinions]');
    if (opinions) {
      openViewer({ target: opinions.dataset.opinions });
      return;
    }
    const write = event.target.closest('[data-write]');
    if (write) openForm(write.dataset.write, { target: write.dataset.target || '' });
  });
  for (const { filter } of lists) filter?.addEventListener('change', render);
  form.addEventListener('submit', submit);
  dialog.querySelector('#post-cancel').addEventListener('click', () => dialog.close());

  // 의견 페이지의 대상 고르기 칸은 글쓰기 창의 대상 목록을 그대로 쓴다('모든 의견'은 HTML에 있다).
  for (const { filter } of lists) {
    filter?.append(...[...form.elements.category_id.children].map((node) => node.cloneNode(true)));
  }
  render();
  if (ready) refresh();
  else for (const button of document.querySelectorAll('[data-write]')) button.disabled = true;
}
