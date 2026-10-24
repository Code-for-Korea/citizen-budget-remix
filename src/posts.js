// 의견·시민 예산안 페이지: 캠페인 자료를 불러온 뒤 게시판 목록 하나를 채운다.

import { setupBoard } from './board.js';
import { data, loadCampaign, summarize } from './budget.js';

async function start() {
  try {
    await loadCampaign();
  } catch {
    document.querySelector('.board-status').textContent = '예산 자료를 불러오지 못했습니다.';
    return;
  }
  setupBoard({
    campaign: data.id,
    groups: data.groups,
    categories: data.categories,
    summarize,
    // 시민 예산안은 홈의 조절 화면에서 연다.
    loadBudget: (text) => { location.href = `../#${text}`; },
  });
}

start();
