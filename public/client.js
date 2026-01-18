const socket = io();
let myId = "";
let myNickname = "";
let currentRoom = "";
let isHost = false;
let lastMentionTime = 0;

// --- 1. 昼夜背景の自動切り替え (JST) ---
function updateBackground() {
    const hour = new Date().getHours();
    const body = document.body;
    // 5時〜17時は昼、それ以外は夜
    if (hour >= 5 && hour < 17) {
        body.classList.add('day-bg');
        body.classList.remove('night-bg');
    } else {
        body.classList.add('night-bg');
        body.classList.remove('day-bg');
    }
}
setInterval(updateBackground, 60000);
updateBackground();

// --- 2. 音楽プレイヤーの準備 ---
const audioKetsui = new Audio('/sounds/ketsui.mp3'); // 主催者用
const audioBattle = new Audio('/sounds/battle.mp3'); // 参加者待機用
audioBattle.loop = true;

// --- 3. 九九認証ロジック ---
let captchaAns = 0;
function startKuku() {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    captchaAns = a * b;
    document.getElementById('kuku-question').innerText = `${a} × ${b} = ?`;
    showScreen('screen-captcha');
}

function checkKuku() {
    const ans = parseInt(document.getElementById('kuku-answer').value);
    if (ans === captchaAns) {
        showScreen('screen-login');
    } else {
        alert("正解ではありません。もう一度！");
        startKuku();
    }
}

// --- 4. 認証・アカウント機能 ---
function doLogin() {
    const id = document.getElementById('login-id').value;
    const pw = document.getElementById('login-pw').value;
    socket.emit('login', { id, pw });
}

socket.on('login-success', (data) => {
    myNickname = data.nickname;
    myId = data.id;
    showScreen('screen-menu');
});

function checkReg1() {
    const id = document.getElementById('reg-id').value;
    const pw = document.getElementById('reg-pw').value;
    if (!/^[a-zA-Z0-9.-]+$/.test(id)) return alert("IDに使用できない文字が含まれています");
    if (pw.length < 6 || !/^[a-zA-Z0-9]+$/.test(pw)) return alert("パスワードは英数6文字以上で入力してください");
    
    socket.emit('check-id', id);
}

socket.on('check-id-result', (exists) => {
    if (exists) alert("このIDは既に存在します");
    else showScreen('screen-reg-2');
});

function finishRegister() {
    const id = document.getElementById('reg-id').value;
    const pw = document.getElementById('reg-pw').value;
    const nickname = document.getElementById('reg-nick').value;
    socket.emit('register', { id, pw, nickname });
}

socket.on('register-success', () => {
    alert("BlueChatアカウントを作成しました！ログインしてください。");
    showScreen('screen-login');
});

// --- 5. 通話・音楽演出ロジック ---
function showCallMenu() {
    const roomId = prompt("通話IDを入力（参加）または空欄で新規作成");
    if (!roomId) {
        // 新規作成
        const newId = Math.random().toString(36).substring(2, 8);
        socket.emit('create-room', newId);
    } else {
        // 参加リクエスト & 待機BGM開始
        currentRoom = roomId;
        audioBattle.play(); // 参加側で曲を流す
        socket.emit('request-join', { roomId, nickname: myNickname });
        alert("主催者の承認を待っています...");
    }
}

socket.on('admin-approval-request', (data) => {
    audioKetsui.play(); // 主催者側で通知曲を流す
    if (confirm(`${data.nickname}さんから参加リクエストです。承認しますか？`)) {
        socket.emit('approve-user', data.senderId);
    }
});

socket.on('join-approved', () => {
    audioBattle.pause(); // 承認されたら待機曲を止める
    audioBattle.currentTime = 0;
    startVideo();
});

async function startVideo() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('main-stream').srcObject = stream;
    showScreen('screen-call');
    updateClock();
}

function updateClock() {
    const now = new Date();
    document.getElementById('call-clock').innerText = now.toLocaleTimeString('ja-JP');
    setTimeout(updateClock, 1000);
}

// --- 6. メンション・チャット制限 ---
function sendMsg() {
    const msg = document.getElementById('chat-input').value;
    const now = Date.now();
    
    if (msg.includes('@') && !isHost) {
        if (now - lastMentionTime < 60000) {
            alert("メンションは1分間に1回までです。");
            return;
        }
        lastMentionTime = now;
    }
    socket.emit('send-chat', { roomId: currentRoom, sender: myNickname, text: msg });
    document.getElementById('chat-input').value = "";
}

// 画面切り替えユーティリティ
function showScreen(id) {
    document.querySelectorAll('.full-screen, #screen-call').forEach(s => s.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}
