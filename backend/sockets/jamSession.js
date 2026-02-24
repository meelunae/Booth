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

const jamSessionHandler = (io) => {
    // Store rooms: { [roomId]: { users: [], queue: [], currentSong: null } }
    const rooms = new Map();

    io.on('connection', (socket) => {
        console.log(`[Socket] User connected: ${socket.id}`);

        socket.on('join_host', ({ roomId }) => {
            console.log(`[Socket] Host ${socket.id} joining room ${roomId}`);
            if (!rooms.has(roomId)) {
                rooms.set(roomId, { users: [], queue: [], currentSong: null });
            }
            socket.join(roomId);

            const room = rooms.get(roomId);
            io.to(roomId).emit('session_state', room);
        });

        socket.on('join_session', ({ username, roomId }, callback) => {
            console.log(`[Socket] ${username} joining room ${roomId}`);

            // Initialize room if it doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, { users: [], queue: [], currentSong: null });
            }

            const room = rooms.get(roomId);
            const user = { id: socket.id, username, roomId };
            room.users.push(user);

            // Join the socket to the isolated room channel
            socket.join(roomId);

            // Broadcast state only to this room
            io.to(roomId).emit('session_state', room);

            if (callback) callback({ success: true, user });
        });

        socket.on('search_song', async ({ query }, callback) => {
            try {
                let searchQuery = query.trim();

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

            // Fetch the actual title from YouTube if not provided by search popover
            const title = preFetchedTitle || await getYouTubeTitle(url);

            const song = {
                id: Date.now().toString(),
                url,
                title,
                queuedBy: user.username
            };

            // If no song is playing, play immediately
            if (!room.currentSong) {
                room.currentSong = song;
            } else {
                room.queue.push(song);
            }

            io.to(user.roomId).emit('session_state', room);
        });

        socket.on('next_song', ({ roomId }) => {
            console.log(`[Socket] Playing next song in room ${roomId}`);
            const room = rooms.get(roomId);
            if (!room) return;

            if (room.queue.length > 0) {
                room.currentSong = room.queue.shift();
            } else {
                room.currentSong = null;
            }
            io.to(roomId).emit('session_state', room);
        });

        socket.on('remove_song', ({ user, songId }) => {
            console.log(`[Socket] ${user.username} removing song ${songId} in room ${user.roomId}`);
            const room = rooms.get(user.roomId);
            if (!room) return;

            // Find song to verify permissions
            const songIndex = room.queue.findIndex(s => s.id === songId);
            if (songIndex === -1) return;

            const song = room.queue[songIndex];
            // Allow if user is host OR if user is the one who queued it (MobileScreen doesn't provide host role distinct from user, but we'll allow hostName bypass later if needed)
            if (song.queuedBy === user.username || user.username === 'Host') { // basic check; front-end handles UI visibility
                room.queue.splice(songIndex, 1);
                io.to(user.roomId).emit('session_state', room);
            }
        });

        socket.on('reorder_queue', ({ roomId, oldIndex, newIndex }) => {
            console.log(`[Socket] Reordering queue in room ${roomId} from ${oldIndex} to ${newIndex}`);
            const room = rooms.get(roomId);
            if (!room) return;

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

                    // Optional: Cleanup empty rooms after a delay
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

module.exports = jamSessionHandler;
