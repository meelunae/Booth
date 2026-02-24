import { useState, useEffect } from 'react';
import HostScreen from './HostScreen';
import MobileScreen from './MobileScreen';
import { io } from 'socket.io-client';

const SOCKET_URL = `http://${window.location.hostname}:3001`;

// Utility to generate a random 4-char Room Code
const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

function App() {
  const [socket, setSocket] = useState(null);

  // Read initial parameters from URL
  const urlParams = new URLSearchParams(window.location.search);
  const initialRoom = urlParams.get('room');
  const initialHost = urlParams.get('host') === 'true';

  const [roomId, setRoomId] = useState(initialRoom || '');
  const [isHost, setIsHost] = useState(initialHost);

  // Landing page states
  const [selection, setSelection] = useState((initialRoom && !initialHost) ? 'join' : null);
  const [usernameInput, setUsernameInput] = useState('');
  const [roomInput, setRoomInput] = useState(initialRoom || '');
  const [isJoining, setIsJoining] = useState(false);
  const [user, setUser] = useState(null);
  const [hostName, setHostName] = useState('');

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);
    // Cleanup on unmount
    return () => newSocket.close();
  }, []);

  const handleStartHost = (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    const newRoomCode = generateRoomCode();
    setRoomId(newRoomCode);
    setHostName(usernameInput.trim());
    setIsHost(true);
    // Update URL without reloading
    window.history.pushState({}, '', `/?room=${newRoomCode}&host=true`);
  };

  const handleJoinSession = (e) => {
    e.preventDefault();
    if (!usernameInput.trim() || !roomInput.trim()) return;

    setIsJoining(true);
    socket.emit('join_session', { username: usernameInput.trim(), roomId: roomInput.trim().toUpperCase() }, (response) => {
      if (response.success) {
        setUser(response.user);
        setRoomId(response.user.roomId);
      }
      setIsJoining(false);
    });
  };

  let content;
  if (!socket) {
    content = <div className="flex items-center justify-center h-screen text-white"><p className="text-xl">Connecting to Booth server...</p></div>;
  } else if (isHost && roomId) {
    content = <HostScreen socket={socket} roomId={roomId} hostName={hostName} />;
  } else if (user) {
    content = <MobileScreen socket={socket} user={user} />;
  } else {
    content = (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative text-white">
        <div className="glass p-8 w-full max-w-sm rounded-3xl z-10 shadow-2xl relative">
          <h1 className="text-5xl font-extrabold text-center mb-2 bg-clip-text text-transparent bg-gradient-to-br from-neon-magenta to-white">
            Booth
          </h1>
          <p className="text-gray-400 text-center mb-10 font-medium">Sing together.</p>

          {!selection ? (
            <div className="flex flex-col gap-4">
              <button onClick={() => setSelection('host')} className="w-full bg-gradient-to-r from-neon-magenta to-neon-cyan text-white font-bold text-lg rounded-xl px-4 py-4 hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_0_20px_rgba(234,0,217,0.4)]">
                Host a Room
              </button>
              <button onClick={() => setSelection('join')} className="w-full bg-white/10 border border-white/20 text-white font-bold text-lg rounded-xl px-4 py-4 hover:bg-white/20 active:scale-[0.98] transition-all">
                Join a Room
              </button>
            </div>
          ) : selection === 'host' ? (
            <form onSubmit={handleStartHost} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button type="button" onClick={() => setSelection(null)} className="text-gray-400 text-sm mb-2 hover:text-white transition-colors text-left flex items-center gap-1 w-fit px-2 py-1 rounded-lg hover:bg-white/5">&larr; Back</button>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-neon-magenta uppercase tracking-widest pl-2">Host Nickname</label>
                <input
                  type="text"
                  placeholder="e.g. Meelunae"
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
                Create Room
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinSession} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <button type="button" onClick={() => setSelection(null)} className="text-gray-400 text-sm mb-2 hover:text-white transition-colors text-left flex items-center gap-1 w-fit px-2 py-1 rounded-lg hover:bg-white/5">&larr; Back</button>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest pl-2">Room Code</label>
                  <input
                    type="text"
                    placeholder="4-Letter Code"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                    className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent transition-all uppercase tracking-widest font-bold"
                    maxLength={6}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-neon-cyan uppercase tracking-widest pl-2">Nickname</label>
                  <input
                    type="text"
                    placeholder="Your name..."
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
                {isJoining ? 'Joining...' : 'Enter Room'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Global Glowing Neon Spotlights Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Top left Magenta spotlight */}
        <div className="absolute top-[-20%] left-[-10%] w-[40rem] h-[40rem] bg-neon-magenta/30 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '4s' }} />
        {/* Bottom right Cyan spotlight */}
        <div className="absolute bottom-[-20%] right-[-10%] w-[40rem] h-[40rem] bg-neon-cyan/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '5s' }} />
        {/* Center Purple subtle spotlight */}
        <div className="absolute top-[30%] left-[20%] w-[30rem] h-[30rem] bg-neon-purple/40 rounded-full blur-[100px] mix-blend-screen animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
      </div>

      {/* Main App Content - Ensure z-10 so things are clickable above the spotlights */}
      <div className="relative z-10 w-full min-h-screen flex flex-col">
        {content}
      </div>
    </>
  );
}

export default App;
