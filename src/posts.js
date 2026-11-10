// 시민 예산안·심의 페이지: 캠페인 자료를 불러온 뒤 게시판 목록을 채운다.
// 예산을 짜는 화면은 홈에 있으므로, 불러오기와 반영은 홈으로 옮겨 가서 한다.

import { setupBoard } from './board.js?v=202611100208';
import { loadCampaign, mergeBudget, SAVED_KEY } from './budget.js?v=202611100208';
import { setupShare } from './share.js?v=202611100208';
import { setupSwitch } from './switch.js?v=202611100208';

// 홈이 기억해 둔 마지막 예산(budget.js의 SAVED_KEY).
function saved() {
  try {
    return localStorage.getItem(SAVED_KEY) || '';
  } catch {
    return '';
  }
}

async function start() {
  setupShare();
  setupSwitch();
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
