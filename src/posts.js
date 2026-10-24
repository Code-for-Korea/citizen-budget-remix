// 시민 예산안·심의 페이지: 캠페인 자료를 불러온 뒤 게시판 목록을 채운다.
// 예산을 짜는 화면은 홈에 있으므로, 불러오기와 반영은 홈으로 옮겨 가서 한다.

import { setupBoard } from './board.js?v=202610240130';
import { loadCampaign, mergeBudget } from './budget.js?v=202610240130';

// 홈이 기억해 둔 마지막 예산(main.js의 SAVED_KEY).
function saved() {
  try {
    return localStorage.getItem('my-budget') || '';
  } catch {
    return '';
  }
}

async function start() {
  try {
    await loadCampaign();
  } catch {
    document.querySelector('.board-status').textContent = '예산 자료를 불러오지 못했습니다.';
    return;
  }
  setupBoard({
    loadBudget: (text) => { location.href = `../#${text}`; },
    applyBudget: (text) => { location.href = `../#${mergeBudget(saved(), text)}`; },
  });
}

start();
