import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

function LanguageToggle() {
    const { i18n } = useTranslation();
    const isChinese = i18n.resolvedLanguage === 'zh';
    return (
        <button
            onClick={() => i18n.changeLanguage(isChinese ? 'en' : 'zh')}
            className="text-xs font-bold text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/10"
        >
            {isChinese ? 'EN' : '中文'}
        </button>
    );
}

export default function MobileScreen({ socket, user, sessionId, onLeaveRoom }) {
    const { t } = useTranslation();
    const [searchInput, setSearchInput] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [session, setSession] = useState({ queue: [], currentSong: null, users: [] });
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [platform, setPlatform] = useState('youtube'); // 'youtube' | 'bilibili'

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

        // Fast-track direct YouTube URLs
        if (query.match(/youtube\.com\/watch|youtu\.be/)) {
            socket.emit('queue_song', { user, url: query });
            setSearchInput('');
            return;
        }

        // Fast-track direct Bilibili URLs
        if (query.match(/bilibili\.com\/video\//)) {
            socket.emit('queue_song', { user, url: query });
            setSearchInput('');
            return;
        }

        setIsSearching(true);
        socket.emit('search_song', { query, platform }, (response) => {
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
                <div className="flex items-center gap-3">
                    <LanguageToggle />
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
                        <span className="text-sm font-medium text-gray-300">{user.username}</span>
                    </div>
                    <button
                        onClick={() => setShowLeaveModal(true)} className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Leave Room"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-6">
                {/* Now Playing */}
                <div className="glass p-5 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 bg-neon-magenta h-full" />
                    <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-2 font-semibold flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" /> {t('live_now')}
                    </h2>
                    {session.currentSong ? (
                        <div>
                            <p className="font-bold text-lg text-white leading-tight mb-1">{session.currentSong.title}</p>
                            <p className="text-sm text-neon-cyan">by {session.currentSong.queuedBy}</p>
                        </div>
                    ) : (
                        <p className="text-gray-500 italic">{t('nothing_playing')}</p>
                    )}
                </div>

                {/* Platform Toggle */}
                <div className="flex gap-2 p-1 bg-black/40 rounded-xl border border-white/10">
                    <button
                        onClick={() => { setPlatform('youtube'); setSearchResults([]); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${platform === 'youtube' ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.5)]' : 'text-gray-400 hover:text-white'}`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        YouTube
                    </button>
                    <button
                        onClick={() => { setPlatform('bilibili'); setSearchResults([]); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${platform === 'bilibili' ? 'bg-[#00a1d6] text-white shadow-[0_0_12px_rgba(0,161,214,0.5)]' : 'text-gray-400 hover:text-white'}`}
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96v-1.173c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96v-1.173c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/>
                        </svg>
                        哔哩哔哩
                    </button>
                </div>

                {/* Search / Add Song Form */}
                <form onSubmit={handleSearch} className="flex gap-2 relative">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder={platform === 'bilibili' ? t('search_placeholder_bilibili') : t('search_placeholder_youtube')}
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
                        {isSearching ? <span className="animate-spin text-xl">↻</span> : t('search_btn')}
                    </button>
                </form>

                {/* Search Results */}
                {searchResults.length > 0 && (
                    <div className="glass p-2 rounded-2xl max-h-[50vh] overflow-y-auto custom-scrollbar border border-neon-cyan/50 shadow-[0_0_30px_rgba(10,189,198,0.2)]">
                        <div className="sticky top-0 bg-black/60 backdrop-blur-md flex justify-between items-center p-3 mb-2 border-b border-white/10 z-10 rounded-t-xl">
                            <span className="text-sm font-bold text-gray-300">
                                {platform === 'bilibili' ? t('search_results_bilibili') : t('search_results_youtube')}
                            </span>
                            <button onClick={() => setSearchResults([])} className="text-gray-400 hover:text-white text-sm px-2 py-1 bg-white/5 hover:bg-white/20 rounded-lg transition-colors">{t('cancel')}</button>
                        </div>
                        <div className="flex flex-col gap-2">
                            {searchResults.map((video) => (
                                <div
                                    key={video.id}
                                    onClick={() => handleQueueResult(video)}
                                    className="flex items-center gap-3 p-2 hover:bg-white/10 rounded-xl cursor-pointer transition-colors active:scale-[0.98] group"
                                >
                                    <img
                                        src={video.thumbnail}
                                        alt={video.title}
                                        className="w-24 h-16 object-cover rounded-md border border-white/10"
                                    />
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
                    <h3 className="text-sm font-bold text-gray-400 mb-4 px-2 tracking-wide uppercase">{t('up_next_count', { count: session.queue.length })}</h3>
                    <div className="flex flex-col gap-3">
                        {session.queue.map((song, idx) => (
                            <div key={song.id} className="glass p-4 rounded-xl flex items-center gap-3 border border-white/5 bg-black/20 group">
                                <span className="text-neon-magenta text-sm font-bold opacity-80 min-w-[20px]">{idx + 1}.</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-medium truncate">{song.title}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{t('queued_from')} {song.queuedBy}</p>
                                </div>

                                {song.queuedBy === user.username && (
                                    <button
                                        onClick={() => socket.emit('remove_song', { roomId: user.roomId, sessionId, songId: song.id })}
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
                                <p className="text-sm text-gray-400">{t('queue_empty')}</p>
                                <p className="text-xs text-gray-500 mt-1">{t('queue_empty_desc')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Leave Room Modal */}
            {showLeaveModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="glass p-6 max-w-sm w-full mx-6 rounded-3xl border border-red-500/30 shadow-[0_0_50px_rgba(255,0,0,0.2)] text-center animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 text-red-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">{t('leave_session_title')}</h2>
                        <p className="text-sm text-gray-400 mb-6">{t('leave_session_desc')}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLeaveModal(false)}
                                className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={() => onLeaveRoom()}
                                className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-[0_0_15px_rgba(255,0,0,0.4)] transition-all"
                            >
                                {t('leave')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
