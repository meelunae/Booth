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
        <div ref={setNodeRef} style={style} className="glass p-3 rounded-xl flex items-center gap-3 group border border-white/5 bg-black/20 relative">
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-2 -ml-2 text-gray-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
            </div>

            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 font-bold text-sm select-none">
                {idx + 1}
            </div>

            <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate text-sm">{song.title}</p>
                <p className="text-xs text-neon-cyan truncate mt-0.5">from {song.queuedBy}</p>
            </div>

            {/* Delete/Trash Button */}
            <button
                onClick={() => onRemove(song.id)}
                className="p-2 text-gray-500 hover:text-red-500 bg-white/5 hover:bg-white/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </div>
    );
}

export default function HostScreen({ socket, roomId, hostName }) {
    const [session, setSession] = useState({ queue: [], currentSong: null, users: [] });
    const [playerError, setPlayerError] = useState(null);

    // Setup drag sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Read custom domain from env if available (supports Vite or standard React patterns)
    const qrDomain = import.meta.env?.VITE_QR_DOMAIN;

    let joinUrl = `${window.location.protocol}//${window.location.host}/?room=${roomId}`;
    if (qrDomain) {
        if (qrDomain.startsWith('http://') || qrDomain.startsWith('https://')) {
            joinUrl = `${qrDomain}/?room=${roomId}`;
        } else {
            joinUrl = `${window.location.protocol}//${qrDomain}/?room=${roomId}`;
        }
    }

    useEffect(() => {
        // Explicitly join as host so the socket enters the correct broadcasting room
        socket.emit('join_host', { roomId });

        socket.on('session_state', (state) => {
            setSession(state);
            setPlayerError(null); // Reset error when new state arrives
        });
        return () => {
            socket.off('session_state');
        };
    }, [socket, roomId]);

    const handleVideoEnded = () => {
        socket.emit('next_song', { roomId });
    };

    const handleSkipCurrent = () => {
        socket.emit('next_song', { roomId });
    };

    const handleRemoveSong = (songId) => {
        // We simulate the Host user object since Host Screen doesn't formally 'join_session' as a jammer
        socket.emit('remove_song', { user: { username: 'Host', roomId }, songId });
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = session.queue.findIndex((s) => s.id === active.id);
        const newIndex = session.queue.findIndex((s) => s.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            // Optimistic UI update
            setSession(prev => ({
                ...prev,
                queue: arrayMove(prev.queue, oldIndex, newIndex)
            }));
            // Send to server
            socket.emit('reorder_queue', { roomId, oldIndex, newIndex });
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
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-neon-dark-blue to-neon-purple opacity-80 z-0" />
                        <div className="z-10 text-center glass p-12 rounded-3xl animate-pulse shadow-[0_0_50px_rgba(234,0,217,0.3)]">
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
                    <p className="mt-4 text-xs text-center text-gray-500 max-w-[200px]">
                        Scan code or use link to add songs to the queue
                    </p>
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
                                <div className="text-center py-10 text-gray-500 border border-dashed border-white/10 rounded-xl bg-black/20">
                                    The queue is empty.
                                </div>
                            )}
                        </div>
                    </DndContext>
                </div>

                {/* Active users footer */}
                <div className="p-4 bg-black/60 text-sm flex gap-2 overflow-x-auto no-scrollbar items-center border-t border-white/10">
                    <span className="text-gray-400 whitespace-nowrap">Acts:</span>
                    {session.users.map(u => (
                        <span key={u.id} className="bg-white/10 px-3 py-1 rounded-full text-white whitespace-nowrap text-xs border border-white/5">
                            {u.username}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
