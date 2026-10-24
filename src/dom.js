// 화면 요소를 만드는 작은 도우미. main.js와 board.js가 함께 쓴다.

// 모바일에서 화면을 확대·축소하지 않게 한다. iOS Safari는 viewport의 user-scalable=no를 무시하므로
// 두 손가락 확대는 여기서 막는다(두 번 탭 확대는 style.css의 touch-action이 막는다).
document.addEventListener('gesturestart', (event) => event.preventDefault());
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}
