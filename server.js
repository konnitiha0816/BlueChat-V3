const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// データベースの代わり（メモリ保持）
const users = new Map(); // { id: {pw, nickname} }
const rooms = new Map(); // { roomId: {hostId, locked: false, members: []} }

io.on('connection', (socket) => {
    // --- ID重複・アカウント管理 ---
    socket.on('check-id', (id) => {
        socket.emit('check-id-result', users.has(id));
    });

    socket.on('register', (data) => {
        users.set(data.id, { pw: data.pw, nickname: data.nickname });
        socket.emit('register-success');
    });

    socket.on('login', (data) => {
        const user = users.get(data.id);
        if (user && user.pw === data.pw) {
            socket.emit('login-success', { nickname: user.nickname, id: data.id });
        } else {
            socket.emit('login-error', 'IDまたはパスワードが違います');
        }
    });

    // --- 通話ルーム管理 ---
    socket.on('create-room', (roomId) => {
        if (rooms.has(roomId)) {
            socket.emit('room-error', 'この通話IDは使えません');
        } else {
            rooms.set(roomId, { hostId: socket.id, locked: false, members: [socket.id] });
            socket.join(roomId);
            socket.emit('room-created', roomId);
        }
    });

    socket.on('request-join', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) return socket.emit('join-error', '通話が見つかりません');
        if (room.locked) return socket.emit('join-error', '通話がロックされています');
        
        // 主催者に承認リクエスト（音楽トリガー）
        io.to(room.hostId).emit('admin-approval-request', {
            senderId: socket.id,
            nickname: data.nickname
        });
    });

    socket.on('approve-user', (targetId) => {
        io.to(targetId).emit('join-approved');
    });

    // --- 通話中アクション ---
    socket.on('send-chat', (data) => {
        io.to(data.roomId).emit('receive-chat', data);
    });

    socket.on('admin-action', (data) => {
        const room = rooms.get(data.roomId);
        if (room && room.hostId === socket.id) {
            if (data.type === 'lock') room.locked = !room.locked;
            if (data.type === 'kick-all') io.to(data.roomId).emit('force-exit');
            io.to(data.roomId).emit('room-update', { locked: room.locked });
        }
    });

    socket.on('disconnect', () => {
        for (let [id, room] of rooms) {
            if (room.hostId === socket.id) rooms.delete(id);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('BlueChat V3 Server Running'));
