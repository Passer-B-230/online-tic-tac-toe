const socket = io();
const $ = (id) => document.getElementById(id);
let mark = null;
let current = null;
let pendingCode = new URLSearchParams(location.search).get('room');

function setError(message) { $('error').textContent = message || ''; }
function enter(result) {
  if (result.error) return setError(result.error);
  mark = result.mark;
  current = null;
  $('lobby').hidden = true;
  $('game').hidden = false;
  $('room-code').textContent = result.code;
  $('label-x').textContent = mark === 'X' ? '你' : '朋友';
  $('label-o').textContent = mark === 'O' ? '你' : '朋友';
  history.replaceState(null, '', `?room=${encodeURIComponent(result.code)}`);
  setError('');
}
function join(code) {
  if (!socket.connected) return setError('正在连接服务器，请稍后再试。');
  socket.emit('join', code, enter);
}
$('create').addEventListener('click', () => {
  if (!socket.connected) return setError('正在连接服务器，请稍后再试。');
  socket.emit('create', enter);
});
$('join-form').addEventListener('submit', (event) => { event.preventDefault(); join($('code').value); });
$('leave').addEventListener('click', () => {
  socket.emit('leave');
  mark = null;
  current = null;
  $('game').hidden = true;
  $('lobby').hidden = false;
  history.replaceState(null, '', location.pathname);
});
$('copy').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.search = `?room=${encodeURIComponent($('room-code').textContent)}`;
  try {
    await navigator.clipboard.writeText(url.toString());
    $('copy').textContent = '链接已复制 ✓';
    setTimeout(() => { $('copy').textContent = '复制邀请链接 ↗'; }, 2000);
  } catch {
    $('hint').textContent = `复制地址栏链接，或把房间号 ${$('room-code').textContent} 发给朋友。`;
  }
});
$('rematch').addEventListener('click', () => socket.emit('rematch'));
socket.on('connect', () => {
  if (pendingCode) {
    const code = pendingCode;
    pendingCode = null;
    $('code').value = code;
    join(code);
  } else if (!mark) setError('');
});
socket.on('disconnect', () => {
  if (mark) {
    mark = null;
    current = null;
    $('game').hidden = true;
    $('lobby').hidden = false;
    $('code').value = new URLSearchParams(location.search).get('room') || '';
    setError('连接已断开。重新连接后，请再次加入房间。');
  } else setError('连接已断开，正在尝试重新连接。');
});
socket.on('state', (state) => {
  if (!mark || state.code !== $('room-code').textContent) return;
  current = state;
  const ready = state.players.length === 2;
  let status = !ready ? '等待朋友加入房间…' : state.winner === 'draw' ? '平局！势均力敌 ✨' : state.winner ? (state.winner === mark ? '你赢了！漂亮的一局 ✨' : '朋友赢了！再来一局？') : state.turn === mark ? '轮到你了，落子吧' : '轮到朋友落子了…';
  $('status').textContent = status;
  $('player-x').classList.toggle('active', ready && !state.winner && state.turn === 'X');
  $('player-o').classList.toggle('active', ready && !state.winner && state.turn === 'O');
  $('board').replaceChildren(...state.board.map((value, index) => {
    const button = document.createElement('button');
    button.className = `cell ${value === 'X' ? 'x' : value === 'O' ? 'o' : ''} ${state.winningLine.includes(index) ? 'winning' : ''}`;
    button.textContent = value === 'X' ? '×' : value === 'O' ? '○' : '';
    button.setAttribute('aria-label', `第 ${Math.floor(index / 3) + 1} 行，第 ${index % 3 + 1} 列${value ? '，' + value : '，空'}`);
    button.disabled = !ready || !!state.winner || state.turn !== mark || !!value;
    button.addEventListener('click', () => socket.emit('move', index));
    return button;
  }));
  $('rematch').hidden = !state.winner || !ready;
  $('rematch').disabled = state.rematch.includes(mark);
  $('rematch').firstChild.textContent = state.rematch.includes(mark) ? '等待朋友确认 ' : '再来一局 ';
  $('hint').textContent = !ready ? '把邀请链接发给朋友，等 TA 加入就可以开始。' : state.winner && state.rematch.length && !state.rematch.includes(mark) ? '朋友想再来一局，点击按钮开始。' : '三个相同符号连成一线即可获胜。';
});
