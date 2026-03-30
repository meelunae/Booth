import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import HostScreen from './HostScreen';
import MobileScreen from './MobileScreen';
import { io } from 'socket.io-client';
import { invoke } from '@tauri-apps/api/core';

const getSessionId = () => {
  let id = localStorage.getItem('booth_sessionId');
  if (!id) {
    id = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('booth_sessionId', id);
  }
  return id;
};

function LanguageToggle() {
  const { i18n } = useTranslation();
  const isChinese = i18n.resolvedLanguage === 'zh';
  return (
    <button
      onClick={() => i18n.changeLanguage(isChinese ? 'en' : 'zh')}
      className="text-xs font-bold text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/10 tracking-wider"
    >
      {isChinese ? 'EN' : '中文'}
    </button>
  );
}

function App() {
  const { t } = useTranslation();
  const [socket, setSocket] = useState(null);
  const [hostIp, setHostIp] = useState('');
  const [sessionId] = useState(() => getSessionId());

  const urlParams = new URLSearchParams(window.location.search);
  const initialRoom = urlParams.get('room');

  const [roomId, setRoomId] = useState(initialRoom || '');
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    const initializeSocket = async () => {
      let ip = window.location.hostname;
      console.log("Initializing Socket. Default IP is:", ip);
      try {
        console.log("Invoking get_local_ip IPC command...");
        const rustIp = await invoke('get_local_ip');
        console.log("Rust returned IP:", rustIp);
        if (rustIp && typeof rustIp === 'string') {
          ip = rustIp;
        }
      } catch (err) {
        console.warn("Could not get local IP via Tauri, falling back to localhost", err);
      }
      console.log("Final IP assigned to Host and Socket:", ip);
      setHostIp(ip);
      setSocket(io(`http://${ip}:3001`));
    };

    if (!socket) {
      initializeSocket();
    }
  }, [socket]);

  const [selection, setSelection] = useState(initialRoom ? 'join' : null);
  const [usernameInput, setUsernameInput] = useState('');
  const [roomInput, setRoomInput] = useState(initialRoom || '');
  const [isJoining, setIsJoining] = useState(false);
  const [user, setUser] = useState(null);
  const [hostName, setHostName] = useState('');

  useEffect(() => {
    if (!socket) return;

    const handleReconnect = () => {
      const savedRoomId = localStorage.getItem('booth_roomId');
      const savedIsHost = localStorage.getItem('booth_isHost');
      const savedName = localStorage.getItem('booth_name');

      if (savedRoomId && savedIsHost && savedName) {
        if (initialRoom && initialRoom !== savedRoomId) {
          localStorage.removeItem('booth_roomId');
          localStorage.removeItem('booth_isHost');
          localStorage.removeItem('booth_name');
          return;
        }

        if (savedIsHost === 'true') {
          socket.emit('join_host', { roomId: savedRoomId, sessionId }, (response) => {
            if (response && response.success) {
              setRoomId(savedRoomId);
              setHostName(savedName);
              setIsHost(true);
              window.history.pushState({}, '', `/?room=${savedRoomId}`);
            } else {
              localStorage.removeItem('booth_roomId');
            }
          });
        } else {
          socket.emit('join_session', { username: savedName, roomId: savedRoomId, sessionId }, (response) => {
            if (response && response.success) {
              setUser(response.user);
              setRoomId(savedRoomId);
              window.history.pushState({}, '', `/?room=${savedRoomId}`);
            } else {
              localStorage.removeItem('booth_roomId');
            }
          });
        }
      }
    };

    if (socket.connected) {
      handleReconnect();
    }
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('connect', handleReconnect);
    };
  }, [socket, sessionId, initialRoom]);

  const handleStartHost = (e) => {
    e.preventDefault();
    if (!usernameInput.trim() || !socket) return;

    socket.emit('create_room', { sessionId }, (response) => {
      if (response && response.success) {
        setRoomId(response.roomId);
        setHostName(usernameInput.trim());
        setIsHost(true);

        localStorage.setItem('booth_roomId', response.roomId);
        localStorage.setItem('booth_isHost', 'true');
        localStorage.setItem('booth_name', usernameInput.trim());

        window.history.pushState({}, '', `/?room=${response.roomId}`);
      }
    });
  };

  const handleJoinSession = (e) => {
    e.preventDefault();
    if (!usernameInput.trim() || !roomInput.trim()) return;

    setIsJoining(true);
    socket.emit('join_session', { username: usernameInput.trim(), roomId: roomInput.trim().toUpperCase(), sessionId }, (response) => {
      if (response.success) {
        setUser(response.user);
        setRoomId(response.user.roomId);

        localStorage.setItem('booth_roomId', response.user.roomId);
        localStorage.setItem('booth_isHost', 'false');
        localStorage.setItem('booth_name', usernameInput.trim());

        window.history.pushState({}, '', `/?room=${response.user.roomId}`);
      }
      setIsJoining(false);
    });
  };

  const handleLeaveRoom = () => {
    localStorage.removeItem('booth_roomId');
    localStorage.removeItem('booth_isHost');
    localStorage.removeItem('booth_name');
    setRoomId('');
    setIsHost(false);
    setUser(null);
    setSelection(null);
    window.history.pushState({}, '', '/');
  };

  useEffect(() => {
    if (!socket) return;
    socket.on('session_ended', handleLeaveRoom);
    return () => socket.off('session_ended', handleLeaveRoom);
  }, [socket]);

  let content;
  if (!socket) {
    content = <div className="flex items-center justify-center h-screen text-white"><p className="text-xl">{t('connecting')}</p></div>;
  } else if (isHost && roomId) {
    content = <HostScreen socket={socket} roomId={roomId} hostName={hostName} sessionId={sessionId} hostIp={hostIp} onLeaveRoom={handleLeaveRoom} />;
  } else if (user) {
    content = <MobileScreen socket={socket} user={user} sessionId={sessionId} onLeaveRoom={handleLeaveRoom} />;
  } else {
    content = (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative text-white">
        <div className="glass p-8 w-full max-w-sm rounded-3xl z-10 shadow-2xl relative">
          <div className="flex justify-end mb-2">
            <LanguageToggle />
          </div>
          <h1 className="text-5xl font-extrabold text-center mb-2 bg-clip-text text-transparent bg-gradient-to-br from-neon-magenta to-white">
            {t('app_title')}
          </h1>
          <p className="text-gray-400 text-center mb-10 font-medium">{t('app_tagline')}</p>

          {!selection ? (
            <div className="flex flex-col gap-4">
              <button onClick={() => setSelection('host')} className="w-full bg-gradient-to-r from-neon-magenta to-neon-cyan text-white font-bold text-lg rounded-xl px-4 py-4 hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(234,0,217,0.4)]">
                {t('host_a_room')}
              </button>
              <button onClick={() => setSelection('join')} className="w-full bg-white/10 border border-white/20 text-white font-bold text-lg rounded-xl px-4 py-4 hover:bg-white/20 active:scale-[0.98] transition-all">
                {t('join_a_room')}
              </button>
            </div>
          ) : selection === 'host' ? (
            <form onSubmit={handleStartHost} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button type="button" onClick={() => setSelection(null)} className="text-gray-400 text-sm mb-2 hover:text-white transition-colors text-left flex items-center gap-1 w-fit px-2 py-1 rounded-lg hover:bg-white/5">{t('back')}</button>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-neon-magenta uppercase tracking-widest pl-2">{t('host_nickname_label')}</label>
                <input
                  type="text"
                  placeholder={t('host_nickname_placeholder')}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-magenta focus:border-transparent transition-all"
                  autoFocus
                  required
                />
              </div>
              <button
                type="submit"
                disabled={!usernameInput.trim()}
                className="w-full bg-gradient-to-r from-neon-magenta to-neon-cyan text-white font-bold rounded-xl px-4 py-4 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 shadow-[0_0_20px_rgba(234,0,217,0.4)] mt-2"
              >
                {t('create_room')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinSession} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button type="button" onClick={() => setSelection(null)} className="text-gray-400 text-sm mb-2 hover:text-white transition-colors text-left flex items-center gap-1 w-fit px-2 py-1 rounded-lg hover:bg-white/5">{t('back')}</button>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest pl-2">{t('room_code_label')}</label>
                  <input
                    type="text"
                    placeholder={t('room_code_placeholder')}
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                    className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent transition-all uppercase tracking-widest font-bold"
                    maxLength={6}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest pl-2">{t('nickname_label')}</label>
                  <input
                    type="text"
                    placeholder={t('nickname_placeholder')}
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent transition-all"
                    autoFocus={!initialRoom}
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isJoining || !usernameInput.trim() || !roomInput.trim()}
                className="w-full bg-gradient-to-r from-neon-magenta to-neon-cyan text-white font-bold rounded-xl px-4 py-4 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 shadow-[0_0_20px_rgba(234,0,217,0.4)] mt-2"
              >
                {isJoining ? t('joining') : t('enter_room')}
              </button>
            </form>
          )}
        </div>
        <p className="absolute bottom-6 text-xs text-white/30 font-medium tracking-widest z-10">
          Made with ❤️ by Meelunae
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[40rem] h-[40rem] bg-neon-magenta/30 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[40rem] h-[40rem] bg-neon-cyan/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute top-[30%] left-[20%] w-[30rem] h-[30rem] bg-neon-purple/40 rounded-full blur-[100px] mix-blend-screen animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 w-full min-h-screen flex flex-col">
        {content}
      </div>
    </>
  );
}

export default App;
