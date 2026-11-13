const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const wins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

app.use(express.static(path.join(__dirname, 'public')));

function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  io.to(code).emit('state', {
    code, board: room.board, turn: room.turn, winner: room.winner,
    winningLine: room.winningLine, players: Object.keys(room.players),
    rematch: [...room.rematch]
  });
}

function leave(socket) {
  const code = socket.data.room;
  const room = rooms.get(code);
  if (!room) return;
  delete room.players[socket.data.mark];
  socket.leave(code);
  socket.data.room = null;
  socket.data.mark = null;
  if (Object.keys(room.players).length === 0) {
    rooms.delete(code);
  } else {
    // A new player starts a fresh game with the remaining player.
    room.board = Array(9).fill(null);
    room.turn = 'X';
    room.winner = null;
    room.winningLine = [];
    room.rematch.clear();
    broadcast(code);
  }
}

io.on('connection', (socket) => {
  socket.on('create', (reply) => {
    if (typeof reply !== 'function') return;
    leave(socket);
    let code;
    do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
    rooms.set(code, { players: { X: socket.id }, board: Array(9).fill(null), turn: 'X', winner: null, winningLine: [], rematch: new Set() });
    socket.data.room = code;
    socket.data.mark = 'X';
    socket.join(code);
    reply({ code, mark: 'X' });
    broadcast(code);
  });

  socket.on('join', (input, reply) => {
    if (typeof reply !== 'function') return;
    const code = typeof input === 'string' ? input.trim().toUpperCase() : '';
    const room = rooms.get(code);
    if (!room) return reply({ error: '找不到这个房间，请检查房间号。' });
    if (socket.data.room === code) return reply({ code, mark: socket.data.mark });
    const mark = !room.players.X ? 'X' : !room.players.O ? 'O' : null;
    if (!mark) return reply({ error: '房间已经满了，请让朋友创建新房间。' });
    leave(socket);
    room.players[mark] = socket.id;
    socket.data.room = code;
    socket.data.mark = mark;
    socket.join(code);
    reply({ code, mark });
    broadcast(code);
  });

  socket.on('move', (index) => {
    const room = rooms.get(socket.data.room);
    const mark = socket.data.mark;
    if (!room || Object.keys(room.players).length !== 2 || room.winner || room.turn !== mark || !Number.isInteger(index) || index < 0 || index > 8 || room.board[index]) return;
    room.board[index] = mark;
    const line = wins.find((cells) => cells.every((cell) => room.board[cell] === mark));
    if (line) {
      room.winner = mark;
      room.winningLine = line;
    } else if (room.board.every(Boolean)) {
      room.winner = 'draw';
    } else {
      room.turn = mark === 'X' ? 'O' : 'X';
    }
    broadcast(socket.data.room);
  });

  socket.on('rematch', () => {
    const room = rooms.get(socket.data.room);
    if (!room || !room.winner || Object.keys(room.players).length !== 2) return;
    room.rematch.add(socket.data.mark);
    if (room.rematch.size === 2) {
      room.board = Array(9).fill(null);
      room.turn = 'X';
      room.winner = null;
      room.winningLine = [];
      room.rematch.clear();
    }
    broadcast(socket.data.room);
  });

  socket.on('leave', () => leave(socket));
  socket.on('disconnect', () => leave(socket));
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`游戏已启动：http://localhost:${port}`));
