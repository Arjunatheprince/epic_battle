import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X, Smartphone, Gamepad2, Radio, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { tikTokLiveClient } from '../services/TikTokLiveClient';

interface QrCodeModalProps {
  open: boolean;
  onClose: () => void;
}

type QrMode = 'REMOTE' | 'GAME_916' | 'TIKTOK_ROOM';

export const QrCodeModal: React.FC<QrCodeModalProps> = ({ open, onClose }) => {
  const { tiktokStatus, tiktokRoom } = useGameStore();
  const [qrMode, setQrMode] = useState<QrMode>('GAME_916');
  const [lanIp, setLanIp] = useState<string>('192.168.1.2');
  const [username, setUsername] = useState<string>(tiktokRoom || 'velofit.id');
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const fetchNetworkInfo = async () => {
    try {
      const res = await fetch('/api/network-info');
      if (!res.ok) return;
      const data = await res.json();
      if (data.lanIp) setLanIp(data.lanIp);
      if (data.activeTikTokRoom) setUsername(data.activeTikTokRoom);
      setIsLiveConnected(Boolean(data.isLiveConnected));
      setRoomId(data.roomId || null);
    } catch {
      // Fallback if offline
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchNetworkInfo();
    const timer = setInterval(fetchNetworkInfo, 4000);
    return () => clearInterval(timer);
  }, [open]);

  const cleanUser = username.trim().replace(/^@/, '') || 'velofit.id';
  const curPath = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';

  const targetUrl =
    qrMode === 'GAME_916'
      ? `http://${lanIp}:5173${curPath}?obs=true&slave=1&tiktok=${encodeURIComponent(cleanUser)}`
      : qrMode === 'REMOTE'
      ? `http://${lanIp}:5173/remote?username=${encodeURIComponent(cleanUser)}`
      : `https://www.tiktok.com/@${encodeURIComponent(cleanUser)}/live`;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(targetUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#110d1a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [open, targetUrl]);

  if (!open) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3">
      <div className="w-full max-w-md bg-[#151022] border-2 border-[#d9b25f] rounded-2xl shadow-[0_0_50px_rgba(217,178,95,0.35)] overflow-hidden text-xs text-[#f3ead8]">
        {/* HEADER */}
        <div className="px-4 py-3 bg-[#1f1733] border-b border-[#d9b25f55] flex items-center justify-between">
          <div className="flex items-center gap-2 font-cinzel font-bold text-sm text-[#f6d88c]">
            <QrCode className="w-5 h-5 text-[#d9b25f]" />
            <span>SCAN KODE QR DARI HP ANDA</span>
          </div>
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500/70 text-red-200 font-bold flex items-center gap-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
            Tutup
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* LIVE STATUS BAR */}
          <div className="p-2.5 rounded-xl bg-[#1c152e] border border-[#d9b25f44] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  isLiveConnected || tiktokStatus === 'CONNECTED'
                    ? 'bg-emerald-400 animate-ping'
                    : 'bg-amber-400'
                }`}
              />
              <div className="truncate">
                <div className="font-bold text-[#f6d88c] truncate flex items-center gap-1">
                  <span>TikTok LIVE: @{cleanUser}</span>
                  {(isLiveConnected || tiktokStatus === 'CONNECTED') && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                </div>
                <div className="text-[11px] text-[#b9ac96] truncate">
                  {isLiveConnected
                    ? `🟢 TERHUBUNG${roomId ? ` (Room ID: ${roomId})` : ''}`
                    : 'Siap dihubungkan dari HP / PC'}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                tikTokLiveClient.connectSocket(cleanUser);
                fetch(`http://${window.location.hostname || 'localhost'}:3001/api/tiktok/connect?username=${encodeURIComponent(cleanUser)}`).then(
                  () => fetchNetworkInfo()
                );
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#2a2042] hover:bg-[#382b57] border border-[#d9b25f66] text-[#f6d88c] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sinkronkan
            </button>
          </div>

          {/* QR MODE SELECTOR TABS */}
          <div className="grid grid-cols-3 gap-1.5 bg-[#0f0b18] p-1 rounded-xl border border-[#d9b25f33]">
            <button
              onClick={() => setQrMode('GAME_916')}
              className={`py-2 px-2 rounded-lg font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                qrMode === 'GAME_916'
                  ? 'bg-[#d9b25f] text-[#120d1d]'
                  : 'text-[#bfb29c] hover:text-white'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">1. Layar Siaran HP</span>
            </button>
            <button
              onClick={() => setQrMode('REMOTE')}
              className={`py-2 px-2 rounded-lg font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                qrMode === 'REMOTE'
                  ? 'bg-[#d9b25f] text-[#120d1d]'
                  : 'text-[#bfb29c] hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">2. Remote HP</span>
            </button>
            <button
              onClick={() => setQrMode('TIKTOK_ROOM')}
              className={`py-2 px-2 rounded-lg font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                qrMode === 'TIKTOK_ROOM'
                  ? 'bg-[#d9b25f] text-[#120d1d]'
                  : 'text-[#bfb29c] hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span className="text-[10px] leading-tight text-center">3. Room TikTok LIVE</span>
            </button>
          </div>

          {/* QR CODE DISPLAY */}
          <div className="flex flex-col items-center bg-white rounded-2xl p-4 shadow-inner border-4 border-[#d9b25f]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-60 h-60 sm:w-64 sm:h-64 object-contain"
              />
            ) : (
              <div className="w-60 h-60 flex items-center justify-center text-black font-bold">
                Membuat Kode QR...
              </div>
            )}
            <div className="mt-2 text-center text-[#151022] font-bold text-xs">
              {qrMode === 'GAME_916' && '📱 Scan untuk Jadikan HP Layar Siaran (Kamera & Game Diatur Langsung dari Laptop)'}
              {qrMode === 'REMOTE' && '🎛️ Scan untuk Buka Remote Kontrol di HP'}
              {qrMode === 'TIKTOK_ROOM' && `🔴 Scan untuk Buka LIVE TikTok @${cleanUser}`}
            </div>
          </div>

          {/* USERNAME & TARGET URL INFO */}
          <div className="space-y-1.5 bg-[#1b142b] p-2.5 rounded-xl border border-[#d9b25f33]">
            <div className="flex items-center gap-1.5">
              <span className="text-[#c7baa4] shrink-0">Username LIVE:</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1 px-2 py-1 rounded bg-[#0e0a18] border border-[#d9b25f55] text-[#f6d88c] font-bold text-xs"
              />
            </div>
            <div className="text-[10px] text-[#a89c87] break-all font-mono bg-[#0e0a18] p-1.5 rounded border border-white/5">
              URL: {targetUrl}
            </div>
            {qrMode !== 'TIKTOK_ROOM' && (
              <div className="text-[11px] text-amber-200/90 leading-snug">
                💡 Pastikan <strong>HP dan PC terhubung ke Wi-Fi yang sama</strong> (IP Lokal PC:{' '}
                <code className="text-[#f6d88c] font-bold">{lanIp}</code>). Jika ingin scan tanpa Wi-Fi yang sama, pilih tab <strong>3. Room TikTok LIVE</strong>.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
