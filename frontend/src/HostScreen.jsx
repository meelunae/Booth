import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import YouTube from 'react-youtube';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sub-component for individual draggable song rows
function SortableSongItem({ song, idx, onRemove }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`glass p-3 rounded-xl flex items-center gap-4 group border bg-black/40 relative overflow-hidden transition-all ${isDragging ? 'shadow-[0_0_20px_rgba(234,0,217,0.4)] scale-105 border-neon-magenta/50 z-50' : 'border-white/5 hover:border-white/20 hover:bg-black/60 z-10'}`}
        >
            {/* Animated left border on hover/drag */}
            <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-neon-magenta to-neon-cyan transition-transform duration-300 ${isDragging ? 'translate-x-0' : '-translate-x-full group-hover:translate-x-0'}`} />

            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2 -ml-2 text-gray-500 hover:text-neon-cyan transition-colors z-10 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
            </div>

            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs select-none transition-colors z-10 shrink-0 ${isDragging ? 'bg-neon-magenta text-white' : 'bg-white/10 text-gray-300 group-hover:bg-white/20 group-hover:text-white'}`}>
                {idx + 1}
            </div>

            <div className="flex-1 min-w-0 z-10">
                <p className="font-bold text-white truncate text-sm tracking-wide">{song.title}</p>
                <div className="flex items-center gap-1.5 mt-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan"></span>
                    <p className="text-xs text-gray-400 truncate">Queued by <span className="text-neon-cyan font-semibold">{song.queuedBy}</span></p>
                </div>
            </div>

            {/* Delete/Trash Button */}
            <button
                onClick={() => onRemove(song.id)}
                className="p-2.5 z-10 text-gray-500 hover:text-white hover:bg-red-500/80 hover:shadow-[0_0_15px_rgba(255,0,0,0.5)] rounded-lg opacity-0 group-hover:opacity-100 transition-all shrink-0"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </div>
    );
}

export default function HostScreen({ socket, roomId, hostName, sessionId, hostIp, onLeaveRoom }) {
    const [session, setSession] = useState({ queue: [], currentSong: null, users: [] });
    const [playerError, setPlayerError] = useState(null);
    const [showEndModal, setShowEndModal] = useState(false);

    // Setup drag sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Generate the correct join URL using the local network IP rather than localhost
    // Mobile phones must be on the same WiFi network to connect to this IP
    const joinUrl = `http://${hostIp}:3001/?room=${roomId}`;

    const activeUsers = hostName
        ? [{ id: 'host-system', username: hostName, isHost: true }, ...session.users]
        : session.users;

    useEffect(() => {
        socket.emit('join_host', { roomId, sessionId }, () => { });

        socket.on('session_state', (state) => {
            setSession(state);
            setPlayerError(null);
        });
        return () => {
            socket.off('session_state');
        };
    }, [socket, roomId, sessionId]);

    const handleVideoEnded = () => {
        socket.emit('next_song', { roomId, sessionId });
    };

    const handleSkipCurrent = () => {
        socket.emit('next_song', { roomId, sessionId });
    };

    const handleRemoveSong = (songId) => {
        // We simulate the Host user object since Host Screen doesn't formally 'join_session' as a jammer
        socket.emit('remove_song', { roomId, sessionId, songId });
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = session.queue.findIndex((s) => s.id === active.id);
        const newIndex = session.queue.findIndex((s) => s.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            setSession(prev => ({
                ...prev,
                queue: arrayMove(prev.queue, oldIndex, newIndex)
            }));
            socket.emit('reorder_queue', { roomId, sessionId, oldIndex, newIndex });
        }
    };

    const extractVideoId = (url) => {
        try {
            return new URL(url).searchParams.get('v');
        } catch {
            return null;
        }
    };

    return (
        <div className="flex h-screen w-full overflow-hidden bg-black text-white font-sans">
            {/* Main Video Area */}
            <div className="flex-1 flex flex-col relative">
                {playerError && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600/90 text-white px-6 py-3 rounded-xl shadow-2xl backdrop-blur-md border border-red-400/50 flex items-center gap-4">
                        <span className="font-bold">Playback Error:</span>
                        <span className="text-sm">{playerError}</span>
                        <button onClick={handleSkipCurrent} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm ml-2">Skip Song</button>
                    </div>
                )}

                {session.currentSong ? (
                    <div className="w-full h-full relative group bg-black flex items-center justify-center">
                        <YouTube
                            key={session.currentSong.id}
                            videoId={extractVideoId(session.currentSong.url)}
                            opts={{
                                width: '100%',
                                height: '100%',
                                playerVars: {
                                    autoplay: 1,
                                    controls: 1,
                                    playsinline: 1,
                                    modestbranding: 1
                                }
                            }}
                            onEnd={handleVideoEnded}
                            onError={(e) => {
                                console.error("YouTube Error:", e.data);
                                // e.data contains the error code (2, 5, 100, 101, 150)
                                let errorMsg = "Unknown player error";
                                if (e.data === 2) errorMsg = "Invalid video parameter";
                                else if (e.data === 5) errorMsg = "HTML5 player error";
                                else if (e.data === 100) errorMsg = "Video not found or removed";
                                else if (e.data === 101 || e.data === 150) errorMsg = "Uploader blocked embedding";
                                setPlayerError(errorMsg);
                            }}
                            className="w-full h-full"
                            iframeClassName="w-full h-full"
                        />
                        {/* Minimal overlay for the current song info */}
                        <div className="absolute top-0 left-0 w-full p-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neon-magenta to-neon-cyan drop-shadow-md">
                                {session.currentSong.title}
                            </h1>
                            <p className="text-gray-300 text-lg drop-shadow-md">Queued by: {session.currentSong.queuedBy}</p>
                        </div>
                    </div>
                ) : session.queue.length > 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-neon-dark-blue to-neon-purple opacity-80 z-0" />
                        <div className="z-10 text-center glass p-12 rounded-3xl shadow-[0_0_50px_rgba(10,189,198,0.3)] border border-neon-cyan/30 animate-in zoom-in duration-500">
                            <h2 className="text-2xl text-neon-cyan mb-2 font-bold uppercase tracking-widest flex items-center justify-center gap-3">
                                Up Next <span className="w-2 h-2 rounded-full bg-neon-cyan animate-ping"></span>
                            </h2>
                            <h1 className="text-5xl font-extrabold mb-8 text-white drop-shadow-lg leading-tight text-balance max-w-3xl">
                                {session.queue[0].title}
                            </h1>
                            <p className="text-xl text-gray-300 mb-12">Queued by <span className="text-neon-cyan font-bold">{session.queue[0].queuedBy}</span></p>
                            <button
                                onClick={handleSkipCurrent}
                                className="bg-gradient-to-r from-neon-magenta to-neon-cyan text-white text-xl font-bold px-10 py-5 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(234,0,217,0.5)] flex items-center gap-3 mx-auto"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Start Performance
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-neon-dark-blue to-neon-purple opacity-80 z-0" />
                        <div className="z-10 text-center glass p-12 rounded-3xl animate-pulse shadow-[0_0_50px_rgba(234,0,217,0.3)] border border-neon-magenta/20">
                            <h1 className="text-6xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-neon-magenta to-neon-cyan drop-shadow-lg">
                                {hostName ? `${hostName}'s Room` : 'Booth Session'}
                            </h1>
                            <p className="text-2xl text-gray-200">Scan QR to get the party started!</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Sidebar for Queue and QR */}
            <div className="w-96 glass border-l border-white/10 flex flex-col shrink-0">
                <div className="p-6 border-b border-white/10 flex flex-col items-center justify-center bg-black/40">
                    <p className="text-sm text-gray-400 mb-1 uppercase tracking-wider font-semibold">Join Room</p>
                    <p className="text-4xl font-extrabold text-white mb-4 tracking-widest">{roomId}</p>
                    <div className="bg-white p-3 rounded-xl shadow-[0_0_20px_rgba(10,189,198,0.4)]">
                        <QRCode value={joinUrl} size={150} level="M" />
                    </div>
                    <p className="mt-4 mb-4 text-xs text-center text-gray-500 max-w-[200px]">
                        Scan code or use link to add songs to the queue
                    </p>
                    <button
                        onClick={() => setShowEndModal(true)}
                        className="w-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/30 uppercase tracking-widest font-bold text-xs py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(255,0,0,0.15)] hover:shadow-[0_0_20px_rgba(255,0,0,0.4)]"
                    >
                        End Session
                    </button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            Up Next
                            <span className="text-xs font-normal bg-white/10 px-2 py-0.5 rounded-full text-neon-cyan">
                                {session.queue.length}
                            </span>
                        </h2>
                        {session.currentSong && (
                            <button
                                onClick={handleSkipCurrent}
                                className="text-xs font-bold text-black bg-neon-cyan px-3 py-1.5 rounded-lg hover:bg-white hover:scale-105 active:scale-95 transition-all shadow-[0_0_10px_rgba(10,189,198,0.3)]"
                            >
                                Skip Current
                            </button>
                        )}
                    </div>

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <div className="flex flex-col gap-2 relative">
                            <SortableContext items={session.queue.map(s => s.id)} strategy={verticalListSortingStrategy}>
                                {session.queue.map((song, idx) => (
                                    <SortableSongItem
                                        key={song.id}
                                        song={song}
                                        idx={idx}
                                        onRemove={handleRemoveSong}
                                    />
                                ))}
                            </SortableContext>

                            {session.queue.length === 0 && (
                                <div className="text-center py-12 px-4 border border-dashed border-white/10 rounded-xl bg-black/40 flex flex-col items-center justify-center gap-3 animate-in fade-in duration-500">
                                    <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-neon-magenta/60 shadow-[0_0_15px_rgba(234,0,217,0.15)]">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                                        </svg>
                                    </div>
                                    <p className="text-gray-300 font-semibold text-sm">The queue is empty.</p>
                                    <p className="text-gray-500 text-xs text-balance">Scan the QR code to search and add some tracks!</p>
                                </div>
                            )}
                        </div>
                    </DndContext>
                </div>

                {/* Live Acts VIP List */}
                <div className="p-5 bg-black/60 border-t border-neon-cyan/30 flex flex-col gap-3 shrink-0">
                    <h3 className="text-xs uppercase tracking-widest text-neon-cyan font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-neon-magenta animate-pulse" /> Live Acts
                    </h3>
                    <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 items-center">
                        {activeUsers.map(u => (
                            <div key={u.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${u.isHost ? 'bg-neon-magenta/20 border-neon-magenta text-white shadow-[0_0_10px_rgba(234,0,217,0.3)]' : 'bg-white/5 border-white/10 text-gray-200'} shrink-0`}>
                                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${u.isHost ? 'bg-neon-magenta text-white' : 'bg-white/20 text-white'}`}>
                                    {u.username.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs font-bold whitespace-nowrap">{u.isHost ? `${u.username} (Host)` : u.username}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* End Session Modal */}
            {showEndModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="glass p-8 max-w-md w-full mx-4 rounded-3xl border border-red-500/30 shadow-[0_0_50px_rgba(255,0,0,0.2)] text-center animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 text-red-500 shadow-[0_0_15px_rgba(255,0,0,0.2)]">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">End Session?</h2>
                        <p className="text-gray-400 mb-8">This will immediately disconnect all Acts and destroy the room. This action cannot be undone.</p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowEndModal(false)}
                                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    socket.emit('end_session', { roomId, sessionId });
                                    onLeaveRoom();
                                }}
                                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-[0_0_15px_rgba(255,0,0,0.4)] transition-all"
                            >
                                End Session
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
