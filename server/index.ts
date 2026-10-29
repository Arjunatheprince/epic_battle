import express from 'express';
import { createServer } from 'http';
import os from 'os';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import type { Faction } from '../src/types/game';
import { resolveGiftConfig } from '../src/config/gifts';

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

function getLocalLanIp(): string {
  const nets = os.networkInterfaces();
  let fallbackIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (
          net.address.startsWith('192.168.') ||
          net.address.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)
        ) {
          return net.address;
        }
        if (!net.address.startsWith('169.254.')) {
          fallbackIp = net.address;
        }
      }
    }
  }
  return fallbackIp;
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

interface ViewerSession {
  username: string;
  team?: Faction;
  lastEventTime: number;
  totalCoins: number;
  likes: number;
}

interface RoundHistoryRecord {
  roundId: number;
  winner: Faction;
  kingdomHpRemaining: number;
  monsterHpRemaining: number;
  timestamp: number;
}

const viewerMap = new Map<string, ViewerSession>();
const processedEventIds = new Set<string>();
const pendingGiftQueue = new Map<string, Array<{ giftId: string; repeatCount: number }>>();
const streakTracker = new Map<string, number>();
const roundHistory: RoundHistoryRecord[] = [];

let activeTikTokRoom = 'velofit.id';
let tiktokConn: TikTokLiveConnection | null = null;
let detectedRoomId: string | null = null;
let isConnectingRoom = false;
let standbyRetryTimer: NodeJS.Timeout | null = null;

function isDuplicateEvent(eventId?: string): boolean {
  if (!eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  if (processedEventIds.size > 5000) {
    const first = processedEventIds.values().next().value;
    if (first) processedEventIds.delete(first);
  }
  return false;
}

function getOrCreateSession(username: string): ViewerSession {
  let session = viewerMap.get(username);
  if (!session) {
    session = { username, lastEventTime: 0, totalCoins: 0, likes: 0 };
    viewerMap.set(username, session);
  }
  return session;
}

function handleIncomingComment(username: string, comment: string, eventId?: string): Faction | undefined {
  if (!username || !comment) return undefined;
  if (isDuplicateEvent(eventId)) return undefined;

  const now = Date.now();
  const session = getOrCreateSession(username);
  if (now - session.lastEventTime < 350) return session.team;
  session.lastEventTime = now;

  const upper = comment.trim().toUpperCase();
  const team: Faction | undefined =
    upper.includes('KINGDOM') || upper === 'K' || upper.includes('BIRU') || upper === '1'
      ? 'K'
      : upper.includes('MONSTER') || upper === 'M' || upper.includes('MERAH') || upper === '2'
      ? 'M'
      : undefined;

  if (team) {
    session.team = team;
  }

  // Always emit comment event so Admin can see all real-time TikTok LIVE chats in the Event Log
  io.emit('tiktok:comment_team', { eventId, username, team: session.team, comment });

  if (team) {
    // Flush queued gifts for this user if any
    const queued = pendingGiftQueue.get(username);
    if (queued && queued.length > 0) {
      for (const item of queued) {
        io.emit('tiktok:gift', {
          username,
          team,
          giftId: item.giftId,
          repeatCount: item.repeatCount,
        });
      }
      pendingGiftQueue.delete(username);
    }
  }
  return session.team;
}

function handleIncomingLike(username: string, likeCount: number, eventId?: string): void {
  if (!username) return;
  if (isDuplicateEvent(eventId)) return;
  const session = getOrCreateSession(username);
  const addedLikes = Math.max(1, Math.min(200, Number(likeCount) || 15));
  session.likes += addedLikes;
  io.emit('tiktok:like', {
    eventId,
    username,
    likeCount: addedLikes,
    totalLikes: session.likes,
    team: session.team,
  });
}

function handleIncomingGift(params: {
  eventId?: string;
  username: string;
  giftId: string | number;
  giftName?: string;
  diamondCount?: number;
  repeatCount?: number;
  repeatEnd?: boolean;
  streakId?: string;
}): void {
  const { eventId, username, giftId, giftName, diamondCount, repeatCount = 1, repeatEnd = false, streakId } = params;
  if (!username || giftId === undefined) return;
  if (isDuplicateEvent(eventId)) return;

  const session = getOrCreateSession(username);
  const resolved =
    resolveGiftConfig(giftId, Number(diamondCount)) ||
    (giftName ? resolveGiftConfig(giftName, Number(diamondCount)) : undefined);
  const canonicalGiftId = resolved ? resolved.id : String(giftId);

  let deltaRepeat = Math.max(1, Number(repeatCount) || 1);
  if (streakId) {
    const key = `${username}:${canonicalGiftId}:${streakId}`;
    const prev = streakTracker.get(key) || 0;
    deltaRepeat = Math.max(0, deltaRepeat - prev);
    if (repeatEnd) {
      streakTracker.delete(key);
    } else {
      streakTracker.set(key, Number(repeatCount) || 1);
    }
    if (deltaRepeat === 0) return;
  }

  if (!session.team) {
    const list = pendingGiftQueue.get(username) || [];
    list.push({ giftId: canonicalGiftId, repeatCount: deltaRepeat });
    pendingGiftQueue.set(username, list);
    io.emit('tiktok:gift_queued', { username, giftId: canonicalGiftId, repeatCount: deltaRepeat });
    return;
  }

  if (resolved) {
    session.totalCoins += resolved.coins * deltaRepeat;
  }

  io.emit('tiktok:gift', {
    eventId,
    username,
    team: session.team,
    giftId: canonicalGiftId,
    diamondCount,
    repeatCount: deltaRepeat,
  });
}

async function connectToTikTokLiveRoom(rawUniqueId: string, isAutoRetry = false): Promise<void> {
  const cleanId = rawUniqueId.trim().replace(/^@/, '');
  if (!cleanId) return;

  // If already connected or detected live room for this exact user, broadcast current connected status
  if ((tiktokConn?.isConnected || detectedRoomId) && activeTikTokRoom === cleanId && !isAutoRetry) {
    io.emit('tiktok:room_status', {
      state: 'CONNECTED',
      uniqueId: cleanId,
      roomId: tiktokConn?.roomId || detectedRoomId,
      message: `TERHUBUNG ke LIVE @${cleanId} (Room #${tiktokConn?.roomId || detectedRoomId})!`,
    });
    if (tiktokConn?.isConnected) return;
  }

  if (isConnectingRoom && activeTikTokRoom === cleanId) return;
  isConnectingRoom = true;

  if (standbyRetryTimer) {
    clearTimeout(standbyRetryTimer);
    standbyRetryTimer = null;
  }

  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch {
      // ignore disconnect errors
    }
    tiktokConn = null;
  }

  activeTikTokRoom = cleanId;
  if (!isAutoRetry && !detectedRoomId) {
    io.emit('tiktok:room_status', {
      state: 'CONNECTING',
      uniqueId: cleanId,
      message: `Mengecek status LIVE @${cleanId}...`,
    });
  }

  try {
    const conn = new TikTokLiveConnection(cleanId, {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      enableExtendedGiftInfo: false,
      signApiKey: process.env.SIGN_API_KEY || undefined,
    });
    tiktokConn = conn;

    // Step 1: Resolve Room ID directly from TikTok HTML/API
    const resolvedRoomId = await conn.fetchRoomId(cleanId);
    if (resolvedRoomId) {
      detectedRoomId = String(resolvedRoomId);
      console.log(`[TikTok LIVE] Room Active for @${cleanId} (Room ID: ${detectedRoomId})`);
      io.emit('tiktok:room_status', {
        state: 'CONNECTED',
        uniqueId: cleanId,
        roomId: detectedRoomId,
        message: `TERHUBUNG ke LIVE @${cleanId} (Room #${detectedRoomId})!`,
      });
    }

    conn.on(ControlEvent.CONNECTED, (state) => {
      detectedRoomId = String(state.roomId || detectedRoomId || '');
      console.log(`[TikTok LIVE] WebSocket Connected to @${cleanId} (Room ID: ${detectedRoomId})`);
      io.emit('tiktok:room_status', {
        state: 'CONNECTED',
        uniqueId: cleanId,
        roomId: detectedRoomId,
        message: `TERHUBUNG ke LIVE @${cleanId} (Room #${detectedRoomId})!`,
      });
    });

    conn.on(ControlEvent.DISCONNECTED, () => {
      standbyRetryTimer = setTimeout(() => {
        connectToTikTokLiveRoom(cleanId, true);
      }, 30000);
    });

    conn.on(ControlEvent.ERROR, (err) => {
      console.warn(`[TikTok LIVE Error @${cleanId}]:`, err?.message || err);
    });

    conn.on(WebcastEvent.CHAT, (data: any) => {
      const sender =
        data?.user?.nickname || data?.user?.uniqueId || data?.nickname || data?.uniqueId || 'Penonton';
      const comment = data?.comment || '';
      const msgId = data?.common?.msgId ? String(data.common.msgId) : undefined;
      handleIncomingComment(sender, comment, msgId);
    });

    conn.on(WebcastEvent.GIFT, (data: any) => {
      const sender =
        data?.user?.nickname || data?.user?.uniqueId || data?.nickname || data?.uniqueId || 'Sultan_TikTok';
      const giftId = data?.giftId ?? data?.gift?.id ?? 'rose';
      const giftName =
        data?.giftDetails?.giftName || data?.extendedGiftInfo?.name || data?.giftName || undefined;
      const diamondCount =
        data?.giftDetails?.diamondCount ??
        data?.extendedGiftInfo?.diamond_count ??
        data?.diamondCount ??
        1;
      const repeatCount = Number(data?.repeatCount || 1);
      const repeatEnd = Boolean(data?.repeatEnd);
      const streakId = data?.groupId ? String(data.groupId) : `${giftId}`;

      handleIncomingGift({
        username: sender,
        giftId,
        giftName,
        diamondCount: Number(diamondCount) || 1,
        repeatCount,
        repeatEnd,
        streakId,
      });
    });

    conn.on(WebcastEvent.LIKE, (data: any) => {
      const sender =
        data?.user?.nickname || data?.user?.uniqueId || data?.nickname || data?.uniqueId || 'Penonton';
      const count = Number(data?.likeCount || 15);
      const msgId = data?.common?.msgId ? String(data.common.msgId) : undefined;
      handleIncomingLike(sender, count, msgId);
    });

    await conn.connect(resolvedRoomId);
    isConnectingRoom = false;
  } catch (err: any) {
    isConnectingRoom = false;
    const errMsg = err?.message || String(err);
    const isRateLimit = errMsg.toLowerCase().includes('rate limit');

    // If we already resolved the live Room ID from TikTok HTML, keep state as CONNECTED to the room
    if (detectedRoomId) {
      io.emit('tiktok:room_status', {
        state: 'CONNECTED',
        uniqueId: cleanId,
        roomId: detectedRoomId,
        message: `TERHUBUNG ke LIVE @${cleanId} (Room #${detectedRoomId})!`,
      });
      standbyRetryTimer = setTimeout(() => {
        if (activeTikTokRoom === cleanId) {
          connectToTikTokLiveRoom(cleanId, true);
        }
      }, isRateLimit ? 60000 : 25000);
      return;
    }

    const isOffline =
      errMsg.toLowerCase().includes('offline') ||
      errMsg.toLowerCase().includes("isn't online") ||
      errMsg.toLowerCase().includes('room id');

    if (!isAutoRetry) {
      console.log(`[TikTok LIVE Standby @${cleanId}]: Menunggu status LIVE...`);
      io.emit('tiktok:room_status', {
        state: 'STANDBY',
        uniqueId: cleanId,
        message: isOffline
          ? `Akun @${cleanId} belum mulai LIVE. Server STANDBY mengecek otomatis — silakan tekan "Mulai LIVE" di HP/TikTok Anda!`
          : `Menunggu @${cleanId} LIVE (${errMsg.slice(0, 60)})...`,
      });
    }

    standbyRetryTimer = setTimeout(() => {
      if (activeTikTokRoom === cleanId) {
        connectToTikTokLiveRoom(cleanId, true);
      }
    }, isRateLimit ? 60000 : 15000);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'EPIC WAR LIVE 3D TikTok Bridge & Round Authority',
    activeTikTokRoom: activeTikTokRoom || null,
    isLiveConnected: Boolean(tiktokConn?.isConnected || detectedRoomId),
    roomId: tiktokConn?.roomId || detectedRoomId || null,
    lanIp: getLocalLanIp(),
    connectedViewers: viewerMap.size,
    roundsCompleted: roundHistory.length,
  });
});

app.get('/api/network-info', (_req, res) => {
  const lanIp = getLocalLanIp();
  const room = activeTikTokRoom || 'velofit.id';
  res.json({
    lanIp,
    activeTikTokRoom: room,
    isLiveConnected: Boolean(tiktokConn?.isConnected || detectedRoomId),
    roomId: tiktokConn?.roomId || detectedRoomId || null,
    remoteUrl: `http://${lanIp}:3001/remote?username=${encodeURIComponent(room)}`,
    gameUrl: `http://${lanIp}:5173/?tiktok=${encodeURIComponent(room)}`,
    obsMobileUrl: `http://${lanIp}:5173/?obs=true&tiktok=${encodeURIComponent(room)}`,
    tiktokLiveUrl: `https://www.tiktok.com/@${encodeURIComponent(room)}/live`,
  });
});

app.get('/api/qr', async (req, res) => {
  try {
    const text = String(req.query.text || `http://${getLocalLanIp()}:3001/remote?username=${activeTikTokRoom || 'velofit.id'}`);
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 2,
      width: 280,
      color: {
        dark: '#110d1a',
        light: '#ffffff',
      },
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR error');
  }
});

app.get('/api/tiktok/connect', (req, res) => {
  const username = String(req.query.username || activeTikTokRoom || 'velofit.id').trim().replace(/^@/, '');
  connectToTikTokLiveRoom(username, false);
  res.json({
    status: 'ok',
    activeTikTokRoom: username,
    isLiveConnected: Boolean(tiktokConn?.isConnected || detectedRoomId),
    roomId: tiktokConn?.roomId || detectedRoomId || null,
  });
});

// Mobile QR Scanner Landing Page: Remote Controller + Pair HP + Launch 3D Game on HP
app.get('/remote', (req, res) => {
  const lanIp = getLocalLanIp();
  const reqUser = String(req.query.username || activeTikTokRoom || 'velofit.id').trim().replace(/^@/, '');
  if (reqUser) {
    connectToTikTokLiveRoom(reqUser, false);
  }
  const activeRoomId = tiktokConn?.roomId || detectedRoomId;
  io.emit('tiktok:room_status', {
    state: tiktokConn?.isConnected || detectedRoomId ? 'CONNECTED' : 'CONNECTING',
    uniqueId: reqUser,
    roomId: activeRoomId,
    message: `📱 HP berhasil scan QR Code! Terhubung ke LIVE @${reqUser}${activeRoomId ? ` (Room #${activeRoomId})` : ''}`,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>HP Controller — Epic War Live 3D</title>
<script src="/socket.io/socket.io.js"></script>
<style>
  :root{--bg:#0d0a16;--card:#181229;--gold:#d9b25f;--ink:#f5ebd6;--blue:#3b82f6;--red:#ef4444;--green:#10b981}
  *{box-sizing:border-box}
  body{margin:0;padding:14px;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,sans-serif}
  .card{background:var(--card);border:1px solid #d9b25f55;border-radius:12px;padding:14px;margin-bottom:12px;box-shadow:0 8px 24px #0008}
  h2{margin:0 0 6px;font-size:17px;color:var(--gold);display:flex;align-items:center;justify-content:space-between}
  .badge{font-size:11px;padding:4px 8px;border-radius:99px;font-weight:700}
  .badge.on{background:#064e3b;color:#6ee7b7;border:1px solid #10b981}
  .badge.wait{background:#78350f;color:#fcd34d;border:1px solid #f59e0b}
  .btn{display:block;width:100%;padding:12px;border-radius:8px;border:1px solid var(--gold);background:#281f3d;color:var(--ink);font-weight:700;font-size:13px;text-align:center;text-decoration:none;cursor:pointer;margin-top:8px}
  .btn.pri{background:linear-gradient(90deg,#b4862d,#e5c168);color:#120d1d;border:none;font-size:14px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
  input,select{width:100%;padding:10px;border-radius:8px;border:1px solid #d9b25f66;background:#0e0a18;color:var(--gold);font-weight:700;font-size:13px;margin-top:6px}
  #log{max-height:170px;overflow-y:auto;font-family:monospace;font-size:11px;background:#090610;padding:8px;border-radius:8px;border:1px solid #ffffff1a}
  #log div{padding:4px 0;border-bottom:1px solid #ffffff0f}
</style>
</head>
<body>
  <div class="card">
    <h2>
      <span>⚔️ EPIC WAR LIVE 3D</span>
      <span id="st" class="badge wait">MENGHUBUNGKAN...</span>
    </h2>
    <div id="rm" style="font-size:12px;color:#c4b79c;margin-bottom:8px">Menghubungkan ke TikTok LIVE <b>@${reqUser}</b>...</div>
    <div style="display:flex;gap:6px">
      <input id="u" value="${reqUser}" placeholder="@username TikTok..." style="margin:0;flex:1">
      <button onclick="joinRoom()" style="padding:0 14px;border-radius:8px;border:1px solid var(--gold);background:var(--gold);color:#111;font-weight:800">Hubungkan</button>
    </div>
    <a class="btn pri" href="http://${lanIp}:5173/?obs=true&tiktok=${encodeURIComponent(reqUser)}">
      📱 Buka Layar Game 3D Fullscreen (9:16) di HP Ini
    </a>
    <a class="btn" href="http://${lanIp}:5173/?tiktok=${encodeURIComponent(reqUser)}">
      🎛️ Buka Game 3D + Admin Panel di HP Ini
    </a>
  </div>

  <div class="card">
    <h2>🎁 Remote Kirim Pasukan / Gift dari HP</h2>
    <input id="gn" value="Sultan_${reqUser}" placeholder="Nama di atas kepala pasukan...">
    <select id="gt">
      <option value="K">🛡️ Bela KINGDOM (Biru)</option>
      <option value="M">💀 Bela MONSTERS (Merah)</option>
    </select>
    <div class="grid">
      <button class="btn" style="margin:0" onclick="sendGift('rose',1)">🌹 Rose (1c)</button>
      <button class="btn" style="margin:0" onclick="sendGift('finger_heart',5)">🫰 Finger Heart (5c)</button>
      <button class="btn" style="margin:0" onclick="sendGift('doughnut',30)">🍩 Doughnut (30c)</button>
      <button class="btn" style="margin:0" onclick="sendGift('confetti',100)">🎉 Confetti (100c)</button>
      <button class="btn" style="margin:0" onclick="sendGift('galaxy',1000)">🌌 Galaxy (1000c)</button>
      <button class="btn" style="margin:0" onclick="sendGift('lion',29999)">🦁 Lion Boss</button>
    </div>
    <button class="btn" onclick="sendLikes()">❤️ Tap +100 Likes Bantuan Pasukan</button>
  </div>

  <div class="card">
    <h2>📡 Log Event TikTok LIVE Real-Time</h2>
    <div id="log"><div>Menunggu aktivitas dari room LIVE @${reqUser}...</div></div>
  </div>

<script>
  const sock = io();
  const st = document.getElementById('st');
  const rm = document.getElementById('rm');
  const logEl = document.getElementById('log');
  function addLog(txt){
    const d = document.createElement('div');
    d.textContent = '[' + new Date().toLocaleTimeString('id-ID') + '] ' + txt;
    logEl.prepend(d);
  }
  sock.on('connect', () => {
    addLog('Terhubung ke Server PC (${lanIp}:3001)');
  });
  sock.on('tiktok:room_status', (p) => {
    if(p.state === 'CONNECTED'){
      st.className = 'badge on';
      st.textContent = '🟢 LIVE TERHUBUNG';
    } else {
      st.className = 'badge wait';
      st.textContent = p.state;
    }
    rm.innerHTML = p.message;
    addLog(p.message);
  });
  sock.on('tiktok:comment_team', (p) => addLog('💬 ' + p.username + ': ' + p.comment));
  sock.on('tiktok:gift', (p) => addLog('🎁 ' + p.username + ' kirim ' + p.giftId + ' x' + (p.repeatCount||1)));
  sock.on('tiktok:like', (p) => addLog('❤️ ' + p.username + ' +' + p.likeCount + ' Likes'));

  function joinRoom(){
    const u = document.getElementById('u').value.trim().replace(/^@/,'');
    if(!u) return;
    sock.emit('tiktok:join_room', { uniqueId: u });
    addLog('Menghubungkan ke @' + u + '...');
  }
  function sendGift(giftId, coins){
    const username = document.getElementById('gn').value.trim() || 'Sultan_HP';
    const team = document.getElementById('gt').value;
    fetch('/api/tiktok/event', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type:'comment', username, comment: team === 'K' ? 'KINGDOM' : 'MONSTER' })
    }).then(() => fetch('/api/tiktok/event', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type:'gift', username, giftId, diamondCount: coins, repeatCount: 1 })
    }));
    addLog('🚀 Spawn ' + giftId + ' (' + username + ') -> ' + (team==='K'?'Kingdom':'Monsters'));
  }
  function sendLikes(){
    const username = document.getElementById('gn').value.trim() || 'Sultan_HP';
    const team = document.getElementById('gt').value;
    fetch('/api/tiktok/event', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type:'comment', username, comment: team === 'K' ? 'KINGDOM' : 'MONSTER' })
    }).then(() => fetch('/api/tiktok/event', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ type:'like', username, likeCount: 100 })
    }));
    addLog('❤️ Kirim +100 Likes (' + username + ')');
  }
</script>
</body>
</html>`);
});

app.post('/api/round/report', (req, res) => {
  const { winner, kingdomHpRemaining, monsterHpRemaining } = req.body;
  if (winner !== 'K' && winner !== 'M') {
    res.status(400).json({ error: 'Invalid winner faction' });
    return;
  }
  const record: RoundHistoryRecord = {
    roundId: roundHistory.length + 1,
    winner,
    kingdomHpRemaining: Number(kingdomHpRemaining) || 0,
    monsterHpRemaining: Number(monsterHpRemaining) || 0,
    timestamp: Date.now(),
  };
  roundHistory.push(record);
  io.emit('round:verified', record);
  res.json({ status: 'ok', record });
});

// Webhook / Manual Connector endpoint for TikTok LIVE events
app.post('/api/tiktok/event', (req, res) => {
  const {
    eventId,
    type,
    username,
    comment,
    giftId,
    giftName,
    diamondCount,
    repeatCount = 1,
    repeatEnd = false,
    streakId,
    likeCount = 15,
  } = req.body;

  if (!username || !type) {
    res.status(400).json({ error: 'Invalid event payload' });
    return;
  }

  if (type === 'comment' && typeof comment === 'string') {
    const team = handleIncomingComment(username, comment, eventId);
    res.json({ status: 'ok', team });
    return;
  }

  if (type === 'like') {
    handleIncomingLike(username, Number(likeCount) || 15, eventId);
    res.json({ status: 'ok' });
    return;
  }

  if (type === 'gift' && (typeof giftId === 'string' || typeof giftId === 'number')) {
    handleIncomingGift({
      eventId,
      username,
      giftId,
      giftName,
      diamondCount: Number(diamondCount),
      repeatCount: Number(repeatCount) || 1,
      repeatEnd: Boolean(repeatEnd),
      streakId,
    });
    res.json({ status: 'ok' });
    return;
  }

  res.status(400).json({ error: 'Unsupported event type' });
});

let lastHostCamera: any = null;
let lastHostState: any = null;
const loggedSockets = new Set<string>();

io.on('connection', (socket) => {
  console.log(`[Socket.IO] Connected: ${socket.id} from ${socket.handshake.address} | UA: ${socket.handshake.headers['user-agent']?.slice(0, 50)}`);
  const activeRoomId = tiktokConn?.roomId || detectedRoomId;
  socket.emit('server:ready', {
    timestamp: Date.now(),
    activeTikTokRoom,
    isLiveConnected: Boolean(tiktokConn?.isConnected || activeRoomId),
  });

  if ((tiktokConn?.isConnected || activeRoomId) && activeTikTokRoom) {
    socket.emit('tiktok:room_status', {
      state: 'CONNECTED',
      uniqueId: activeTikTokRoom,
      roomId: activeRoomId,
      message: `TERHUBUNG ke LIVE @${activeTikTokRoom} (Room #${activeRoomId})!`,
    });
  }

  if (lastHostCamera) {
    socket.emit('sync:camera', lastHostCamera);
  }
  if (lastHostState) {
    socket.emit('sync:state', lastHostState);
  }

  socket.on('tiktok:join_room', (payload: { uniqueId?: string }) => {
    if (payload?.uniqueId) {
      connectToTikTokLiveRoom(payload.uniqueId, false);
    }
  });

  // Real-time Laptop (Host) -> HP (Live Broadcast Screen) Mirror Sync
  socket.on('sync:camera', (payload) => {
    if (!loggedSockets.has(socket.id)) {
      loggedSockets.add(socket.id);
      console.log(`[Socket.IO] Master Host active: ${socket.id} on page ${payload?.page}`);
    }
    lastHostCamera = payload;
    socket.broadcast.emit('sync:camera', payload);
  });

  socket.on('sync:action', (payload) => {
    socket.broadcast.emit('sync:action', payload);
  });

  socket.on('sync:state', (payload) => {
    lastHostState = payload;
    socket.broadcast.emit('sync:state', payload);
  });

  socket.on('sync:request_init', () => {
    if (lastHostCamera) socket.emit('sync:camera', lastHostCamera);
    if (lastHostState) socket.emit('sync:state', lastHostState);
    socket.broadcast.emit('sync:request_host_state');
  });
});

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLocalLanIp();
  console.log(
    `[EPIC WAR LIVE 3D Server] TikTok LIVE Bridge running on http://localhost:${PORT} (LAN: http://${lanIp}:${PORT})`
  );
  if (activeTikTokRoom) {
    connectToTikTokLiveRoom(activeTikTokRoom, false);
  }
});
