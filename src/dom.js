// 화면 요소를 만드는 작은 도우미. main.js와 board.js가 함께 쓴다.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}
