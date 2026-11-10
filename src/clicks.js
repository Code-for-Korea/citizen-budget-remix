// 세부사업 표의 「열린재정 사업설명자료」 링크를 시민이 열어 본 횟수(Supabase source_clicks 표, count_source_click 함수).
// 링크 옆에 「N번 열어 봄」을 쓰고, 누르면 1을 올린다. 한 브라우저에서 같은 사업은 하루 한 번만 센다.
// 누가 눌렀는지는 보내지 않는다. 로그인 없이 세므로 관심의 대략적인 크기로만 읽는다(찬성이나 중요도가 아니다).
// 세는 단위는 열린재정 사업 ID(세부사업)라서, 같은 세부사업을 가리키는 링크는 같은 횟수를 보여 준다.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=202611100208';

const HEADERS = { apikey: SUPABASE_KEY };
let campaign = '';

function seenKey(id) {
  return `source-click:${campaign}:${id}:${new Date().toISOString().slice(0, 10)}`;
}

// localStorage가 막혀 있으면 이 페이지를 연 동안만 기억한다.
const seenHere = new Set();
function seen(id) {
  try {
    return seenHere.has(id) || localStorage.getItem(seenKey(id)) === '1';
  } catch {
    return seenHere.has(id);
  }
}

function markSeen(id) {
  seenHere.add(id);
  try {
    localStorage.setItem(seenKey(id), '1');
  } catch {
    // 기억하지 못해도 이 페이지 안에서는 seenHere가 막는다.
  }
}

function show(id, count) {
  for (const node of document.querySelectorAll(`a.source-link[data-item-id="${id}"] .click-count`)) {
    node.textContent = count ? `${Number(count).toLocaleString('ko-KR')}번 열어 봄` : '';
  }
}

async function count(id) {
  if (seen(id)) return;
  markSeen(id);
  try {
    // 링크는 새 탭으로 열리지만, 페이지를 떠나도 요청이 끝나도록 keepalive를 쓴다.
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/count_source_click`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_campaign: campaign, p_item_id: id }),
      keepalive: true,
    });
    if (response.ok) show(id, await response.json());
  } catch {
    // 세지 못해도 링크는 그대로 열린다.
  }
}

export async function setupClicks(campaignId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !document.querySelector('a.source-link[data-item-id]')) return;
  campaign = campaignId;
  // 왼쪽 클릭과 가운데 클릭(새 탭)을 모두 센다.
  for (const type of ['click', 'auxclick']) {
    document.addEventListener(type, (event) => {
      const link = event.target.closest?.('a.source-link[data-item-id]');
      if (link && (type === 'click' || event.button === 1)) count(link.dataset.itemId);
    });
  }
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/source_clicks?campaign=eq.${encodeURIComponent(campaign)}&select=item_id,clicks`,
      { headers: HEADERS });
    if (!response.ok) return;
    for (const row of await response.json()) show(row.item_id, row.clicks);
  } catch {
    // 횟수를 읽지 못하면 링크만 보인다.
  }
}
