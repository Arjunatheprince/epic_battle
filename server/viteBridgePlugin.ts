import { mergeVisualBatches } from '../src/engine/MirrorEffects';
import type { Plugin } from 'vite';
import os from 'os';
import QRCode from 'qrcode';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import type { Faction } from '../src/types/game';
import { resolveGiftConfig } from '../src/config/gifts';

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

interface ViewerSession {
  username: string;
  team?: Faction;
  lastEventTime: number;
  totalCoins: number;
  likes: number;
}

export function createLiveBridgePlugin(): Plugin {
  return {
    name: 'epic-war-live-bridge',
    configureServer(server) {
      if (!server.httpServer) return;

      const viewerMap = new Map<string, ViewerSession>();
      const processedEventIds = new Set<string>();
      const pendingGiftQueue = new Map<string, Array<{ giftId: string; repeatCount: number }>>();
      const streakTracker = new Map<string, number>();

      let activeTikTokRoom = 'velofit.id';
      let tiktokConn: TikTokLiveConnection | null = null;
      let detectedRoomId: string | null = null;
      let isConnectingRoom = false;
      let standbyRetryTimer: NodeJS.Timeout | null = null;
      let lastHostCamera: any = null;
      let lastHostState: any = null;
      let activeMasterTabId: string | null = null;
      let activeMasterInteractTime = 0;
      let activeMasterLastPostAt = 0;
      const sseClients = new Set<import('http').ServerResponse>();
      let hasLoggedMaster = false;
      let hasLoggedMirror = false;

      function broadcastSse(eventType: string, payload: any): void {
        const msg = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const client of sseClients) {
          try {
            client.write(msg);
          } catch {
            sseClients.delete(client);
          }
        }
      }

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

        if (team) session.team = team;
        broadcastSse('tiktok:comment_team', { eventId, username, team: session.team, comment });

        if (team) {
          const queued = pendingGiftQueue.get(username);
          if (queued && queued.length > 0) {
            for (const item of queued) {
              const giftEv = {
                username,
                team,
                giftId: item.giftId,
                repeatCount: item.repeatCount,
              };
              broadcastSse('tiktok:gift', giftEv);
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
        const likeEv = {
          eventId,
          username,
          likeCount: addedLikes,
          totalLikes: session.likes,
          team: session.team,
        };
        broadcastSse('tiktok:like', likeEv);
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
          if (repeatEnd) streakTracker.delete(key);
          else streakTracker.set(key, Number(repeatCount) || 1);
          if (deltaRepeat === 0) return;
        }

        if (!session.team) {
          const list = pendingGiftQueue.get(username) || [];
          list.push({ giftId: canonicalGiftId, repeatCount: deltaRepeat });
          pendingGiftQueue.set(username, list);
          broadcastSse('tiktok:gift_queued', { username, giftId: canonicalGiftId, repeatCount: deltaRepeat });
          return;
        }

        if (resolved) session.totalCoins += resolved.coins * deltaRepeat;
        const giftEv = {
          eventId,
          username,
          team: session.team,
          giftId: canonicalGiftId,
          diamondCount,
          repeatCount: deltaRepeat,
        };
        broadcastSse('tiktok:gift', giftEv);
      }

      async function connectToTikTokLiveRoom(rawUniqueId: string, isAutoRetry = false): Promise<void> {
        const cleanId = rawUniqueId.trim().replace(/^@/, '');
        if (!cleanId) return;

        if ((tiktokConn?.isConnected || detectedRoomId) && activeTikTokRoom === cleanId && !isAutoRetry) {
          const statusMsg = {
            state: 'CONNECTED',
            uniqueId: cleanId,
            roomId: tiktokConn?.roomId || detectedRoomId,
            message: `TERHUBUNG ke LIVE @${cleanId} (Room #${tiktokConn?.roomId || detectedRoomId})!`,
          };
          broadcastSse('tiktok:room_status', statusMsg);
          return;
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
            // ignore
          }
          tiktokConn = null;
        }

        activeTikTokRoom = cleanId;

        try {
          const conn = new TikTokLiveConnection(cleanId, {
            processInitialData: false,
            fetchRoomInfoOnConnect: false,
            enableExtendedGiftInfo: false,
            signApiKey: process.env.SIGN_API_KEY || undefined,
          });
          tiktokConn = conn;

          const resolvedRoomId = await conn.fetchRoomId(cleanId);
          if (resolvedRoomId) {
            detectedRoomId = String(resolvedRoomId);
            console.log(`[TikTok LIVE] Room Active for @${cleanId} (Room ID: ${detectedRoomId})`);
            broadcastSse('tiktok:room_status', {
              state: 'CONNECTED',
              uniqueId: cleanId,
              roomId: detectedRoomId,
              message: `TERHUBUNG ke LIVE @${cleanId} (Room #${detectedRoomId})!`,
            });
          }

          conn.on(ControlEvent.CONNECTED, (state) => {
            detectedRoomId = String(state.roomId || detectedRoomId || '');
            broadcastSse('tiktok:room_status', {
              state: 'CONNECTED',
              uniqueId: cleanId,
              roomId: detectedRoomId,
              message: `TERHUBUNG ke LIVE @${cleanId} (Room #${detectedRoomId})!`,
            });
          });

          conn.on(WebcastEvent.CHAT, (data: any) => {
            const sender = data?.user?.nickname || data?.user?.uniqueId || 'Penonton';
            const comment = data?.comment || '';
            const msgId = data?.common?.msgId ? String(data.common.msgId) : undefined;
            handleIncomingComment(sender, comment, msgId);
          });

          conn.on(WebcastEvent.GIFT, (data: any) => {
            const sender = data?.user?.nickname || data?.user?.uniqueId || 'Sultan_TikTok';
            const giftId = data?.giftId ?? data?.gift?.id ?? 'rose';
            const giftName = data?.giftDetails?.giftName || data?.extendedGiftInfo?.name || data?.giftName;
            const diamondCount = data?.giftDetails?.diamondCount ?? data?.diamondCount ?? 1;
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
            const sender = data?.user?.nickname || data?.user?.uniqueId || 'Penonton';
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
          if (detectedRoomId) {
            broadcastSse('tiktok:room_status', {
              state: 'CONNECTED',
              uniqueId: cleanId,
              roomId: detectedRoomId,
              message: `TERHUBUNG ke LIVE @${cleanId} (Room #${detectedRoomId})!`,
            });
          }
          standbyRetryTimer = setTimeout(() => {
            if (activeTikTokRoom === cleanId) {
              connectToTikTokLiveRoom(cleanId, true);
            }
          }, isRateLimit ? 60000 : 25000);
        }
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const parsed = new URL(req.url, 'http://localhost:5173');

        if (parsed.pathname === '/api/stream') {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.flushHeaders?.();

          sseClients.add(res);
          if (!hasLoggedMirror) {
            hasLoggedMirror = true;
            console.log(`[Bridge 5173] SSE Stream Client connected (${sseClients.size} active)`);
          }

          const activeRoomId = tiktokConn?.roomId || detectedRoomId;
          if ((tiktokConn?.isConnected || activeRoomId) && activeTikTokRoom) {
            res.write(
              `event: tiktok:room_status\ndata: ${JSON.stringify({
                state: 'CONNECTED',
                uniqueId: activeTikTokRoom,
                roomId: activeRoomId,
                message: `TERHUBUNG ke LIVE @${activeTikTokRoom} (Room #${activeRoomId})!`,
              })}\n\n`
            );
          }
          if (lastHostCamera) {
            res.write(`event: sync:camera\ndata: ${JSON.stringify(lastHostCamera)}\n\n`);
          }
          if (lastHostState) {
            res.write(`event: sync:state\ndata: ${JSON.stringify(lastHostState)}\n\n`);
          }

          req.on('close', () => {
            sseClients.delete(res);
          });
          return;
        }

        if (parsed.pathname === '/api/sync') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
              try {
                const payload = JSON.parse(body || '{}');
                const now = Date.now();
                const tabId = payload.tabId || 'default';
                const interactTime = Number(payload.lastInteractTime) || 0;

                if (
                  !activeMasterTabId ||
                  activeMasterTabId === tabId ||
                  interactTime > activeMasterInteractTime ||
                  now - activeMasterLastPostAt > 2500
                ) {
                  activeMasterTabId = tabId;
                  if (interactTime > activeMasterInteractTime) {
                    activeMasterInteractTime = interactTime;
                  }
                  activeMasterLastPostAt = now;

                  if (payload.cam) {
                    if (!hasLoggedMaster) {
                      hasLoggedMaster = true;
                      console.log(`[Bridge 5173] Master Host Laptop syncing page: ${payload.cam.page} (tab: ${tabId})`);
                    }
                    lastHostCamera = payload.cam;
                    broadcastSse('sync:camera', payload.cam);
                  }
                  if (payload.state) {
                    lastHostState = { ...payload.state, fx: payload.state.fx
                      ? mergeVisualBatches(lastHostState?.fx, payload.state.fx) : undefined };
                    broadcastSse('sync:state', payload.state);
                  }
                  if (payload.action) {
                    broadcastSse('sync:action', payload.action);
                  }
                }
                res.setHeader('Content-Type', 'application/json');
                res.end('{"ok":1}');
              } catch {
                res.statusCode = 400;
                res.end('{"ok":0}');
              }
            });
            return;
          } else {
            if (!hasLoggedMirror) {
              hasLoggedMirror = true;
              console.log(`[Bridge 5173] HP Mirror polling /api/sync active!`);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                cam: lastHostCamera,
                state: lastHostState?.fx && parsed.searchParams.get('fxStream') === lastHostState.fx.stream
                  ? { ...lastHostState, fx: { ...lastHostState.fx,
                    events: lastHostState.fx.events.filter((event: { id: number }) => event.id > Number(parsed.searchParams.get('fxAfter') || 0)) } }
                  : lastHostState,
              })
            );
            return;
          }
        }

        if (parsed.pathname === '/api/network-info') {
          const lanIp = getLocalLanIp();
          const room = activeTikTokRoom || 'velofit.id';
          const activeRoomId = tiktokConn?.roomId || detectedRoomId || null;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              lanIp,
              activeTikTokRoom: room,
              isLiveConnected: Boolean(tiktokConn?.isConnected || activeRoomId),
              roomId: activeRoomId,
              remoteUrl: `http://${lanIp}:5173/remote?username=${encodeURIComponent(room)}`,
              gameUrl: `http://${lanIp}:5173/?tiktok=${encodeURIComponent(room)}`,
              obsMobileUrl: `http://${lanIp}:5173/?obs=true&slave=1&tiktok=${encodeURIComponent(room)}`,
              tiktokLiveUrl: `https://www.tiktok.com/@${encodeURIComponent(room)}/live`,
            })
          );
          return;
        }

        if (parsed.pathname === '/api/qr') {
          const text =
            parsed.searchParams.get('text') ||
            `http://${getLocalLanIp()}:5173/?obs=true&slave=1&tiktok=${activeTikTokRoom || 'velofit.id'}`;
          const svg = await QRCode.toString(text, {
            type: 'svg',
            margin: 2,
            width: 280,
            color: { dark: '#110d1a', light: '#ffffff' },
          });
          res.setHeader('Content-Type', 'image/svg+xml');
          res.end(svg);
          return;
        }

        if (parsed.pathname === '/api/tiktok/connect') {
          const username = (parsed.searchParams.get('username') || activeTikTokRoom || 'velofit.id')
            .trim()
            .replace(/^@/, '');
          connectToTikTokLiveRoom(username, false);
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              status: 'ok',
              activeTikTokRoom: username,
              isLiveConnected: Boolean(tiktokConn?.isConnected || detectedRoomId),
              roomId: tiktokConn?.roomId || detectedRoomId || null,
            })
          );
          return;
        }

        if (parsed.pathname === '/api/tiktok/event' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              if (data.type === 'comment') handleIncomingComment(data.username, data.comment, data.eventId);
              else if (data.type === 'like') handleIncomingLike(data.username, Number(data.likeCount) || 15, data.eventId);
              else if (data.type === 'gift') handleIncomingGift(data);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'ok' }));
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        next();
      });

      connectToTikTokLiveRoom(activeTikTokRoom, false);
    },
  };
}
