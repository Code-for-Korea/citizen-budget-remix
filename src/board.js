// 시민 심의 게시판: 예산에 대한 의문(GitHub의 이슈처럼)과 예산 구성안(풀 리퀘스트처럼)을 남기고 목록으로 본다.
// Supabase의 REST API를 fetch로 직접 부른다. 읽기는 누구나 하고, 글을 처음 쓸 때 익명 세션을 만들어
// 이 브라우저에 보관한다. 같은 브라우저에서만 자기 글을 고치거나 지울 수 있다.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { el } from './dom.js';

const SESSION_KEY = 'board-session';
const NAME_KEY = 'board-name';
// 목록은 작성자 id를 감춘 posts_public 뷰에서 읽고, 쓰기는 posts 표에 한다(supabase/migrations 참고).
const FIELDS = 'id,kind,title,body,author_name,category_id,budget,created_at,updated_at';

const KINDS = {
  question: {
    label: '의문',
    icon: '?',
    write: '의문 남기기',
    empty: '아직 남긴 의문이 없습니다. 첫 의문을 남겨 보세요.',
    hint: '궁금한 점이나 따져 묻고 싶은 점을 적어 주세요. 분야를 고르면 그 분야에 대한 의문으로 남습니다.',
  },
  proposal: {
    label: '구성안',
    icon: '⇄',
    write: '구성안 내기',
    empty: '아직 낸 구성안이 없습니다. 내 예산을 첫 구성안으로 내 보세요.',
    hint: '지금 화면에서 짠 내 예산을 구성안으로 냅니다.',
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

export function setupBoard({ campaign, categories, currentBudget, summarize, loadBudget }) {
  const ready = Boolean(SUPABASE_URL && SUPABASE_KEY);
  const section = document.getElementById('board');
  const list = document.getElementById('posts');
  const status = document.getElementById('board-status');
  const write = document.getElementById('new-post');
  const tabs = [...section.querySelectorAll('[role="tab"]')];
  const dialog = document.getElementById('post-dialog');
  const form = document.getElementById('post-form');
  const formStatus = document.getElementById('post-status');
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  let posts = [];
  let kind = 'question';
  let editing = null;
  let draftBudget = '';

  form.elements.category_id.append(...categories.map((c) => el('option', { value: c.id, textContent: c.name })));

  function setStatus(text) {
    status.textContent = text;
  }

  function meta(post) {
    const parts = [`#${post.id}`, post.author_name, ago(post.created_at)];
    if (post.updated_at && new Date(post.updated_at) - new Date(post.created_at) > 60000) parts.push('고침');
    if (post.category_id) parts.push(categoryName.get(post.category_id) || post.category_id);
    return parts.join(' · ');
  }

  function item(post) {
    const actions = [];
    if (post.kind === 'proposal') {
      actions.push(el('button', { type: 'button', textContent: '이 구성안 불러오기', onclick: () => open(post) }));
    }
    if (post.mine) {
      actions.push(
        el('button', { type: 'button', className: 'secondary', textContent: '고치기', onclick: () => edit(post) }),
        el('button', { type: 'button', className: 'secondary', textContent: '지우기', onclick: () => remove(post) }),
      );
    }
    const details = el('details', {},
      el('summary', {},
        el('strong', { className: 'post-title', textContent: post.title }),
        el('span', { className: 'post-meta', textContent: meta(post) }),
        post.kind === 'proposal'
          ? el('span', { className: 'post-budget', textContent: summarize(post.budget) })
          : null,
      ),
      post.body
        ? el('p', { className: 'post-body', textContent: post.body })
        : el('p', { className: 'post-body muted', textContent: '본문 없이 제목만 남긴 글입니다.' }),
      actions.length ? el('div', { className: 'actions' }, ...actions) : null,
    );
    const node = el('li', { className: `post ${post.kind}`, id: `post-${post.id}` },
      el('span', { className: 'post-icon', textContent: KINDS[post.kind].icon, ariaHidden: 'true' }),
      details,
    );
    return node;
  }

  function render() {
    for (const tab of tabs) {
      const selected = tab.dataset.kind === kind;
      tab.setAttribute('aria-selected', selected);
      tab.querySelector('.count').textContent = posts.filter((p) => p.kind === tab.dataset.kind).length;
    }
    write.textContent = KINDS[kind].write;
    const shown = posts.filter((p) => p.kind === kind);
    list.replaceChildren(...shown.map(item));
    if (ready && !status.dataset.error) setStatus(shown.length ? '' : KINDS[kind].empty);
  }

  async function refresh() {
    try {
      posts = await rest(`posts_public?select=${FIELDS},mine&campaign=eq.${encodeURIComponent(campaign)}&order=created_at.desc&limit=200`,
        { token: await token() });
      delete status.dataset.error;
    } catch (error) {
      status.dataset.error = 'true';
      setStatus(`글 목록을 불러오지 못했습니다. ${error.message}`);
    }
    render();
  }

  function show(post) {
    kind = post.kind;
    render();
    const node = document.getElementById(`post-${post.id}`);
    node.querySelector('details').open = true;
    node.scrollIntoView();
  }

  function openForm(nextKind, { post = null, categoryId = '' } = {}) {
    if (!ready) {
      section.scrollIntoView();
      return;
    }
    editing = post;
    draftBudget = post ? post.budget : nextKind === 'proposal' ? currentBudget() : '';
    if (nextKind === 'proposal' && !draftBudget) {
      kind = 'proposal';
      render();
      section.scrollIntoView();
      setStatus('먼저 위에서 슬라이더를 움직여 내 예산을 짠 다음 구성안으로 내 주세요.');
      return;
    }
    form.reset();
    form.dataset.kind = nextKind;
    form.elements.title.value = post?.title ?? '';
    form.elements.body.value = post?.body ?? '';
    form.elements.category_id.value = post?.category_id ?? categoryId;
    form.elements.author_name.value = post?.author_name ?? load(NAME_KEY) ?? '';
    document.getElementById('post-dialog-title').textContent =
      `${KINDS[nextKind].label} ${post ? '고치기' : nextKind === 'proposal' ? '내기' : '남기기'}`;
    document.getElementById('post-hint').textContent = nextKind === 'proposal'
      ? `${post ? '이 구성안의 예산' : KINDS.proposal.hint} ${summarize(draftBudget)}`
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
      show(saved);
    } catch (error) {
      formStatus.textContent = `올리지 못했습니다. ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  function edit(post) {
    openForm(post.kind, { post });
  }

  async function remove(post) {
    if (!confirm(`「${post.title}」을(를) 지울까요? 지운 글은 되살릴 수 없습니다.`)) return;
    try {
      await rest(`posts?id=eq.${post.id}`, { method: 'DELETE', token: await token() });
      posts = posts.filter((p) => p.id !== post.id);
      render();
    } catch (error) {
      setStatus(`지우지 못했습니다. ${error.message}`);
    }
  }

  function open(post) {
    const current = currentBudget();
    if (current && current !== post.budget
      && !confirm('지금 조절한 내 예산 대신 이 구성안을 불러올까요? 지금 값은 이 구성안으로 바뀝니다.')) return;
    loadBudget(post.budget);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      kind = tab.dataset.kind;
      delete status.dataset.error;
      render();
    });
  }
  write.addEventListener('click', () => openForm(kind));
  form.addEventListener('submit', submit);
  document.getElementById('post-cancel').addEventListener('click', () => dialog.close());

  if (ready) {
    refresh();
  } else {
    write.disabled = true;
    setStatus('게시판을 준비하고 있습니다. 곧 의문과 구성안을 남길 수 있습니다.');
    render();
  }

  return {
    ask: (categoryId) => openForm('question', { categoryId }),
    propose: () => openForm('proposal'),
  };
}
