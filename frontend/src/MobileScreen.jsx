import { useState, useEffect } from 'react';

export default function MobileScreen({ socket, user }) {
    const [searchInput, setSearchInput] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [session, setSession] = useState({ queue: [], currentSong: null, users: [] });

    useEffect(() => {
        socket.on('session_state', (state) => {
            setSession(state);
        });
        return () => socket.off('session_state');
    }, [socket]);

    const handleSearch = (e) => {
        e.preventDefault();
        const query = searchInput.trim();
        if (!query || !user) return;

        // Fast-track: if it's already a direct YouTube URL, just queue it
        if (query.match(/youtube\.com\/watch|youtu\.be/)) {
            socket.emit('queue_song', {
                user,
                url: query
            });
            setSearchInput('');
            return;
        }

        setIsSearching(true);
        socket.emit('search_song', { query }, (response) => {
            if (response && response.success) {
                setSearchResults(response.results);
            }
            setIsSearching(false);
        });
    };

    const handleQueueResult = (video) => {
        socket.emit('queue_song', {
            user,
            url: video.url,
            title: video.title
        });
        setSearchResults([]);
        setSearchInput('');
    };

    return (
        <div className="flex flex-col min-h-screen pb-safe">
            {/* Header */}
            <div className="glass p-4 sticky top-0 z-50 flex justify-between items-center border-b border-white/10 rounded-none shadow-md">
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-neon-magenta to-neon-cyan flex items-center gap-2">
                    Booth <span className="text-xs text-white bg-white/20 px-2 py-0.5 rounded-full">{user.roomId}</span>
                </h1>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                    <span className="text-sm font-medium text-gray-300">{user.username}</span>
                </div>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-6">
                {/* Now Playing */}
                <div className="glass p-5 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 bg-neon-magenta h-full" />
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-2 font-semibold flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" /> Live Now
                    </h2>
                    {session.currentSong ? (
                        <div>
                            <p className="font-bold text-lg text-white leading-tight mb-1">{session.currentSong.title}</p>
                            <p className="text-sm text-neon-cyan">by {session.currentSong.queuedBy}</p>
                        </div>
                    ) : (
                        <p className="text-gray-500 italic">Nothing is playing right now.</p>
                    )}
                </div>

                {/* Search / Add Song Form */}
                <form onSubmit={handleSearch} className="flex gap-2 relative">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="Search song or paste a Spotify or YouTube link"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan transition-all placeholder-gray-500"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!searchInput.trim() || isSearching}
                        className="bg-neon-cyan text-black px-6 py-4 rounded-xl font-bold disabled:opacity-50 hover:bg-white transition-colors flex items-center justify-center shrink-0 active:scale-95 shadow-[0_4px_14px_rgba(10,189,198,0.4)]"
                    >
                        {isSearching ? <span className="animate-spin text-xl">↻</span> : 'Search'}
                    </button>
                </form>

                {/* Search Results Popover/List */}
                {searchResults.length > 0 && (
                    <div className="glass p-2 rounded-2xl max-h-[50vh] overflow-y-auto custom-scrollbar border border-neon-cyan/50 shadow-[0_0_30px_rgba(10,189,198,0.2)]">
                        <div className="sticky top-0 bg-black/60 backdrop-blur-md flex justify-between items-center p-3 mb-2 border-b border-white/10 z-10 rounded-t-xl">
                            <span className="text-sm font-bold text-gray-300">Youtube Search Results</span>
                            <button onClick={() => setSearchResults([])} className="text-gray-400 hover:text-white text-sm px-2 py-1 bg-white/5 hover:bg-white/20 rounded-lg transition-colors">Cancel</button>
                        </div>
                        <div className="flex flex-col gap-2">
                            {searchResults.map((video) => (
                                <div
                                    key={video.id}
                                    onClick={() => handleQueueResult(video)}
                                    className="flex items-center gap-3 p-2 hover:bg-white/10 rounded-xl cursor-pointer transition-colors active:scale-[0.98] group"
                                >
                                    <img src={video.thumbnail} alt={video.title} className="w-24 h-16 object-cover rounded-md border border-white/10" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-white line-clamp-2 leading-tight group-hover:text-neon-cyan transition-colors">{video.title}</p>
                                        <p className="text-xs text-gray-400 mt-1 font-mono">{video.duration}</p>
                                    </div>
                                    <button className="bg-white/5 text-white rounded-full p-2 group-hover:bg-neon-magenta group-hover:text-white transition-colors shrink-0">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Queue List */}
                <div>
                    <h3 className="text-sm font-bold text-gray-400 mb-4 px-2 tracking-wide uppercase">Up Next ({session.queue.length})</h3>
                    <div className="flex flex-col gap-3">
                        {session.queue.map((song, idx) => (
                            <div key={song.id} className="glass p-4 rounded-xl flex items-center gap-3 border border-white/5 bg-black/20 group">
                                <span className="text-neon-magenta text-sm font-bold opacity-80 min-w-[20px]">{idx + 1}.</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-medium truncate">{song.title}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">from {song.queuedBy}</p>
                                </div>

                                {/* Current user can remove their own songs */}
                                {song.queuedBy === user.username && (
                                    <button
                                        onClick={() => socket.emit('remove_song', { user, songId: song.id })}
                                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-white/10 rounded-lg active:scale-90 transition-all opacity-80 flex-shrink-0"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))}
                        {session.queue.length === 0 && (
                            <div className="glass p-8 rounded-xl text-center border border-dashed border-white/10 bg-transparent flex flex-col items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                    <span className="text-xl opacity-50">🎵</span>
                                </div>
                                <p className="text-sm text-gray-400">Queue is empty</p>
                                <p className="text-xs text-gray-500 mt-1">Be the first to add a song!</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
