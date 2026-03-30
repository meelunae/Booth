const fetch = require('node-fetch');
const yts = require('yt-search');

// Helper to fetch YouTube video title
async function getYouTubeTitle(url) {
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (!response.ok) return 'YouTube Video';
        const data = await response.json();
        return data.title || 'YouTube Video';
    } catch (error) {
        console.error('[YouTube API Error]', error);
        return 'YouTube Video';
    }
}

// Helper to extract BVID from a Bilibili URL
function extractBvid(url) {
    const match = url.match(/bilibili\.com\/video\/(BV[^/?#]+)/);
    return match ? match[1] : null;
}

// Helper to fetch Bilibili video title via public API
async function getBilibiliTitle(url) {
    try {
        const bvid = extractBvid(url);
        if (!bvid) return 'Bilibili Video';
        const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.bilibili.com' }
        });
        if (!response.ok) return 'Bilibili Video';
        const data = await response.json();
        return data?.data?.title || 'Bilibili Video';
    } catch (error) {
        console.error('[Bilibili Title Error]', error);
        return 'Bilibili Video';
    }
}

// Search Bilibili via public API
async function searchBilibili(query) {
    try {
        const params = new URLSearchParams({ search_type: 'video', keyword: query, page: '1' });
        const url = `https://api.bilibili.com/x/web-interface/search/type?${params}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.bilibili.com',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            }
        });
        if (!response.ok) return [];
        const data = await response.json();
        if (data.code !== 0 || !data?.data?.result) return [];
        return data.data.result.slice(0, 5).map(v => ({
            id: v.bvid,
            title: v.title.replace(/<[^>]+>/g, ''),
            thumbnail: v.pic.startsWith('//') ? `https:${v.pic}` : v.pic,
            url: `https://www.bilibili.com/video/${v.bvid}`,
            duration: v.duration,
            platform: 'bilibili'
        }));
    } catch (e) {
        console.error('[Bilibili Search Error]', e);
        return [];
    }
}

// Helper to extract Spotify Track and Artist from OpenGraph meta tags
async function getSpotifyTitle(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const match = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (match && match[1]) {
            return match[1].split('|')[0].replace('- song and lyrics by', '').trim();
        }
        return null;
    } catch (e) {
        console.error('[Spotify Fetch Error]', e);
        return null;
    }
}

// Utility to generate a random 4-char Room Code on the server
const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const boothSessionHandler = (io) => {
    // Store rooms: { [roomId]: { users: [], queue: [], currentSong: null } }
    const rooms = new Map();

    io.on('connection', (socket) => {
        console.log(`[Socket] User connected: ${socket.id}`);

        socket.on('create_room', ({ sessionId }, callback) => {
            const roomId = generateRoomCode();
            console.log(`[Socket] Host ${sessionId} creating room ${roomId}`);

            rooms.set(roomId, {
                users: [],
                queue: [],
                currentSong: null,
                hostSessionId: sessionId // Secure the room to this exact session ID
            });

            socket.join(roomId);
            if (callback) callback({ success: true, roomId });
        });

        socket.on('join_host', ({ roomId, sessionId }, callback) => {
            const room = rooms.get(roomId);
            if (!room) {
                if (callback) callback({ success: false });
                return;
            }

            // Only the original session that created the room can operate as host
            if (sessionId !== room.hostSessionId) {
                console.warn(`[Socket] Unauthorized host join attempt for room ${roomId} by ${sessionId}`);
                if (callback) callback({ success: false });
                return;
            }

            console.log(`[Socket] Host ${sessionId} verified and re-joining room ${roomId}`);
            socket.join(roomId);
            io.to(roomId).emit('session_state', room);
            if (callback) callback({ success: true });
        });

        socket.on('join_session', ({ username, roomId, sessionId }, callback) => {
            console.log(`[Socket] ${username} joining room ${roomId}`);

            const room = rooms.get(roomId);
            if (!room) {
                if (callback) callback({ success: false, error: 'Room not found' });
                return;
            }

            // Remove previous instances of this session if they refresh
            room.users = room.users.filter(u => u.sessionId !== sessionId);

            const user = { id: socket.id, sessionId, username, roomId };
            room.users.push(user);

            // Join the socket to the isolated room channel
            socket.join(roomId);

            // Broadcast state only to this room
            io.to(roomId).emit('session_state', room);

            if (callback) callback({ success: true, user });
        });

        socket.on('end_session', ({ roomId, sessionId }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            // Secure: Only the host session can end the room
            if (sessionId !== room.hostSessionId) return;

            console.log(`[Socket] Host ${sessionId} ended room ${roomId}`);

            // Tell everyone in the room to wipe their session memory
            io.to(roomId).emit('session_ended');

            // Destroy the room
            rooms.delete(roomId);
        });

        socket.on('search_song', async ({ query, platform }, callback) => {
            try {
                let searchQuery = query.trim();

                if (platform === 'bilibili') {
                    // Append KTV keyword for better Bilibili karaoke results
                    if (!searchQuery.includes('KTV') && !searchQuery.includes('卡拉OK') && !searchQuery.includes('karaoke')) {
                        searchQuery += ' KTV';
                    }
                    const results = await searchBilibili(searchQuery);
                    if (callback) callback({ success: true, results });
                    return;
                }

                // YouTube search (default)
                // If it's a spotify URL, extract the track/artist
                if (searchQuery.includes('spotify.com/track/')) {
                    const spTitle = await getSpotifyTitle(searchQuery);
                    if (spTitle) searchQuery = spTitle;
                }

                // Enforce "lyrics karaoke" for better KTV results if user didn't type it
                if (!searchQuery.toLowerCase().includes('karaoke')) {
                    searchQuery += ' lyrics karaoke';
                }

                const r = await yts(searchQuery);
                const videos = r.videos.slice(0, 5).map(v => ({
                    id: v.videoId,
                    title: v.title,
                    thumbnail: v.thumbnail,
                    url: v.url,
                    duration: v.timestamp
                }));

                if (callback) callback({ success: true, results: videos });
            } catch (error) {
                console.error('[Search Error]', error);
                if (callback) callback({ success: false, results: [] });
            }
        });

        socket.on('queue_song', async ({ user, url, title: preFetchedTitle }) => {
            console.log(`[Socket] ${user.username} queued ${url} in room ${user.roomId}`);
            const room = rooms.get(user.roomId);
            if (!room) return;

            // Fetch the actual title if not provided by search popover
            const title = preFetchedTitle || (url.includes('bilibili.com') ? await getBilibiliTitle(url) : await getYouTubeTitle(url));

            const song = {
                id: Date.now().toString(),
                url,
                title,
                queuedBy: user.username,
                queuedBySessionId: user.sessionId
            };

            // Push the song to the queue. The host must explicitly start it.
            room.queue.push(song);

            io.to(user.roomId).emit('session_state', room);
        });

        socket.on('next_song', ({ roomId, sessionId }) => {
            console.log(`[Socket] Playing next song in room ${roomId}`);
            const room = rooms.get(roomId);
            if (!room) return;

            if (sessionId !== room.hostSessionId) return;

            console.log(`[Socket] Host resolving next song in room ${roomId}`);

            if (room.queue.length > 0) {
                room.currentSong = room.queue.shift();
            } else {
                room.currentSong = null;
            }
            io.to(roomId).emit('session_state', room);
        });

        socket.on('remove_song', ({ roomId, sessionId, songId }) => {
            console.log(`[Socket] Removing song ${songId} from room ${roomId}`);
            const room = rooms.get(roomId);
            if (!room) return;

            // Find song to verify permissions
            const songIndex = room.queue.findIndex(s => s.id === songId);
            if (songIndex === -1) return;

            const song = room.queue[songIndex];
            // Allow if user is host OR if user is the one who queued it via matching session
            if (song.queuedBySessionId === sessionId || sessionId === room.hostSessionId) {
                room.queue.splice(songIndex, 1);
                io.to(roomId).emit('session_state', room);
            }
        });

        socket.on('reorder_queue', ({ roomId, oldIndex, newIndex }) => {
            const room = rooms.get(roomId);
            if (!room) return;

            // Secure: Only the host socket can reorder the queue
            if (socket.id !== room.hostSocketId) return;

            console.log(`[Socket] Host reordering queue in room ${roomId} from ${oldIndex} to ${newIndex}`);

            if (oldIndex < 0 || oldIndex >= room.queue.length || newIndex < 0 || newIndex >= room.queue.length) {
                return;
            }

            // Remove item from old position and insert at new position
            const [movedItem] = room.queue.splice(oldIndex, 1);
            room.queue.splice(newIndex, 0, movedItem);

            io.to(roomId).emit('session_state', room);
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] User disconnected: ${socket.id}`);

            // Find which room the user was in and remove them
            for (const [roomId, room] of rooms.entries()) {
                const userIndex = room.users.findIndex(u => u.id === socket.id);
                if (userIndex !== -1) {
                    room.users.splice(userIndex, 1);
                    io.to(roomId).emit('session_state', room);

                    if (room.users.length === 0) {
                        setTimeout(() => {
                            const currentRoom = rooms.get(roomId);
                            if (currentRoom && currentRoom.users.length === 0) {
                                rooms.delete(roomId);
                            }
                        }, 1000 * 60 * 5); // 5 minutes
                    }
                    break;
                }
            }
        });
    });
};

module.exports = boothSessionHandler;
