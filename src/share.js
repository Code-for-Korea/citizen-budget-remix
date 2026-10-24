// GNB의 '공유' 버튼: 사이트 주소를 나눈다. 휴대폰에서는 운영체제 공유 시트를 열고,
// 공유 시트가 없으면 링크를 복사한 뒤 잠깐 알림을 띄운다. 모든 페이지(main.js, posts.js)가 부른다.

import { el } from './dom.js?v=202610240331';

const SITE = new URL('../', import.meta.url).href;
const TITLE = '모두의 AI 예산 심의';
const TEXT = '국회가 심사하는 AI 예산, 시민도 직접 나눠 보고 따져 봅니다.';

function toast(message) {
  const node = el('div', { className: 'toast', role: 'status', textContent: message });
  document.body.append(node);
  setTimeout(() => node.remove(), 2500);
}

// 카카오톡·메시지 같은 앱은 공유 시트의 title을 버리고 text와 url만 쓰는 경우가 많아서, 본문 맨 앞에도 이름을 쓴다.
// 링크 미리보기 카드의 이름은 각 페이지의 Open Graph 태그(og:title, og:site_name)가 정한다.
async function share() {
  if (navigator.share) {
    try {
      await navigator.share({ title: TITLE, text: `${TITLE}: ${TEXT}`, url: SITE });
    } catch {
      // 공유 시트를 닫은 것도 여기로 온다. 따로 알릴 것이 없다.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${TITLE}\n${SITE}`);
    toast('사이트 이름과 링크를 복사했습니다.');
  } catch {
    toast(SITE);
  }
}

export function setupShare() {
  for (const button of document.querySelectorAll('[data-share-site]')) button.addEventListener('click', share);
}
