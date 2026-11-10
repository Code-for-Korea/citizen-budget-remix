// 부처 바꾸기: 지금 보는 부처 이름을 누르면 아래에서 시트가 올라와 다른 부처 예산으로 옮겨 간다.
// 데스크톱은 GNB의 사이트 이름, 휴대폰은 합계 띠(홈)와 페이지 제목 위(시민 예산안·시민 심의)의 부처 이름이 버튼이 된다.
// <html data-campaign-switch>가 있는 페이지에서만 켠다(새 캠페인을 붙일 때 공개 전까지 끌 수 있게).

import { el, closeButton } from './dom.js?v=202611100133';
import { CAMPAIGNS, campaignId, data, won, sum } from './budget.js?v=202611100133';

// 캠페인마다 같은 이름으로 있는 페이지. 옮겨 갈 때 보던 페이지를 그대로 연다.
const PAGES = ['', 'budgets/', 'deliberation/'];

// 아래로 열린다는 표시(꺾쇠). 글꼴마다 ▾ 크기가 달라 그림으로 그린다.
function caret() {
  const span = el('span', { className: 'caret', ariaHidden: 'true' });
  span.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  return span;
}

function currentPage() {
  const home = CAMPAIGNS[campaignId].home.pathname;
  const rest = location.pathname.startsWith(home) ? location.pathname.slice(home.length).replace(/index\.html$/, '') : '';
  return PAGES.includes(rest) ? rest : '';
}

// 부처마다 정부안 합계. 시트를 처음 열 때 한 번만 읽는다.
let totals;
function loadTotals() {
  totals ??= Promise.all(Object.entries(CAMPAIGNS).map(async ([id, campaign]) => {
    const campaignData = id === campaignId && data ? data : await (await fetch(campaign.data)).json();
    return [id, `${campaignData.baseLabel} ${won(sum(campaignData.categories, (c) => c.amounts[campaignData.baseYear]))}`];
  })).then(Object.fromEntries).catch(() => ({}));
  return totals;
}

function sheet() {
  const dialog = el('dialog', { className: 'switch-dialog' });
  dialog.setAttribute('aria-labelledby', 'switch-title');
  const page = currentPage();
  const items = Object.entries(CAMPAIGNS).map(([id, campaign]) => {
    const here = id === campaignId;
    const link = el('a', { className: 'switch-item', href: new URL(page, campaign.home).href },
      el('strong', { textContent: campaign.name }),
      el('span', { className: 'switch-total' }),
      here ? el('span', { className: 'switch-here', textContent: '지금 보는 중' }) : null);
    link.dataset.campaign = id;
    if (here) {
      link.setAttribute('aria-current', 'page');
      link.addEventListener('click', (event) => {
        event.preventDefault();
        dialog.close();
      });
    }
    return el('li', {}, link);
  });
  dialog.append(
    closeButton(dialog),
    el('h2', { id: 'switch-title', textContent: '어느 부처 예산을 볼까요' }),
    el('p', { className: 'hint', textContent: '보던 페이지 그대로 옮겨 갑니다. 짜던 내 예산은 부처마다 따로 기억합니다.' }),
    el('ul', { className: 'switch-list' }, ...items),
  );
  // 시트 바깥(어두운 배경)을 눌러도 닫는다.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  loadTotals().then((byId) => {
    for (const link of dialog.querySelectorAll('[data-campaign]')) {
      link.querySelector('.switch-total').textContent = byId[link.dataset.campaign] || '';
    }
  });
  return dialog;
}

export function setupSwitch() {
  if (!('campaignSwitch' in document.documentElement.dataset)) return;
  let dialog;
  const open = () => {
    dialog ??= sheet();
    dialog.showModal();
  };
  const label = `지금 ${CAMPAIGNS[campaignId].name}. 다른 부처 예산 보기`;

  const brand = document.querySelector('.gnb-brand');
  if (brand) {
    const button = el('button', { type: 'button', className: 'gnb-brand gnb-switch' }, ...brand.childNodes, caret());
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', open);
    brand.replaceWith(button);
  }
  for (const node of document.querySelectorAll('[data-scope-switch]')) {
    const button = el('button', { type: 'button', className: 'scope-switch' }, CAMPAIGNS[campaignId].name, caret());
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', open);
    node.replaceChildren(button);
  }
}
