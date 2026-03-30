use axum::{
    routing::get,
    Router,
};
use regex::Regex;
use serde::{Deserialize, Serialize};
use socketioxide::{
    extract::{Data, SocketRef},
    SocketIo,
};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub username: String,
    #[serde(rename = "roomId")]
    pub room_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub url: String,
    pub title: String,
    #[serde(rename = "queuedBy")]
    pub queued_by: String,
    #[serde(rename = "queuedBySessionId")]
    pub queued_by_session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub users: Vec<User>,
    pub queue: Vec<Song>,
    #[serde(rename = "currentSong")]
    pub current_song: Option<Song>,
    #[serde(rename = "hostSessionId")]
    pub host_session_id: String,
    #[serde(skip)]
    pub host_socket_id: Option<String>,
}

pub type RoomStore = Arc<Mutex<HashMap<String, Room>>>;

fn generate_room_code() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let chars = b"ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
    let mut code = String::new();
    let mut num = now;
    for _ in 0..4 {
        code.push(chars[(num % chars.len() as u128) as usize] as char);
        num /= chars.len() as u128;
    }
    code
}

async fn get_youtube_title(url: &str) -> String {
    let api = format!("https://www.youtube.com/oembed?url={}&format=json", url);
    if let Ok(resp) = reqwest::get(&api).await {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(title) = json.get("title").and_then(|t| t.as_str()) {
                return title.to_string();
            }
        }
    }
    "YouTube Video".to_string()
}

fn extract_bvid(url: &str) -> Option<String> {
    let re = Regex::new(r"bilibili\.com/video/(BV[^/?#]+)").unwrap();
    re.captures(url).map(|caps| caps[1].to_string())
}

async fn get_bilibili_title(url: &str) -> String {
    if let Some(bvid) = extract_bvid(url) {
        let api = format!("https://api.bilibili.com/x/web-interface/view?bvid={}", bvid);
        let client = reqwest::Client::new();
        if let Ok(resp) = client.get(&api)
            .header("User-Agent", "Mozilla/5.0")
            .header("Referer", "https://www.bilibili.com")
            .send().await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(title) = json.pointer("/data/title").and_then(|t| t.as_str()) {
                    return title.to_string();
                }
            }
        }
    }
    "Bilibili Video".to_string()
}

async fn fetch_thumbnail_as_data_uri(client: &reqwest::Client, url: &str) -> String {
    if let Ok(resp) = client.get(url)
        .header("Referer", "https://www.bilibili.com")
        .header("User-Agent", "Mozilla/5.0")
        .send().await
    {
        let content_type = resp.headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();
        if let Ok(bytes) = resp.bytes().await {
            use base64::Engine;
            let encoded = base64::prelude::BASE64_STANDARD.encode(&bytes);
            return format!("data:{};base64,{}", content_type, encoded);
        }
    }
    url.to_string()
}

async fn search_bilibili(query: &str) -> Vec<serde_json::Value> {
    let url = format!(
        "https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword={}&page=1",
        urlencoding::encode(query)
    );
    let client = reqwest::Client::new();
    match client.get(&url)
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .header("Referer", "https://www.bilibili.com")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send().await
    {
        Ok(resp) => {
            match resp.text().await {
                Ok(text) => {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                        if json.get("code").and_then(|c| c.as_i64()) == Some(0) {
                            if let Some(results) = json.pointer("/data/result").and_then(|r| r.as_array()) {
                                let em_re = Regex::new(r"<[^>]+>").unwrap();

                                // Collect video metadata first
                                let videos: Vec<(String, String, String, String)> = results.iter()
                                    .filter(|v| v.get("bvid").and_then(|b| b.as_str()).map(|s| !s.is_empty()).unwrap_or(false))
                                    .take(5)
                                    .map(|v| {
                                        let bvid = v.get("bvid").and_then(|b| b.as_str()).unwrap_or("").to_string();
                                        let raw_title = v.get("title").and_then(|t| t.as_str()).unwrap_or("");
                                        let title = em_re.replace_all(raw_title, "").to_string();
                                        let pic = v.get("pic").and_then(|p| p.as_str()).unwrap_or("");
                                        let thumbnail_url = if pic.starts_with("//") {
                                            format!("https:{}", pic)
                                        } else {
                                            pic.to_string()
                                        };
                                        let duration = v.get("duration").and_then(|d| d.as_str()).unwrap_or("0:00").to_string();
                                        (bvid, title, thumbnail_url, duration)
                                    })
                                    .collect();

                                // Concurrently fetch all thumbnails as base64 data URIs
                                let mut handles = Vec::new();
                                for (_, _, thumbnail_url, _) in &videos {
                                    let c = client.clone();
                                    let u = thumbnail_url.clone();
                                    handles.push(tokio::spawn(async move {
                                        fetch_thumbnail_as_data_uri(&c, &u).await
                                    }));
                                }
                                let mut thumbnails = Vec::new();
                                for handle in handles {
                                    thumbnails.push(handle.await.unwrap_or_default());
                                }

                                let mapped: Vec<serde_json::Value> = videos.into_iter().zip(thumbnails)
                                    .map(|((bvid, title, _, duration), thumbnail)| {
                                        serde_json::json!({
                                            "id": bvid,
                                            "title": title,
                                            "thumbnail": thumbnail,
                                            "url": format!("https://www.bilibili.com/video/{}", bvid),
                                            "duration": duration,
                                            "platform": "bilibili"
                                        })
                                    })
                                    .collect();

                                println!("[Bilibili Search] Returning {} results", mapped.len());
                                return mapped;
                            }
                        }
                    }
                }
                Err(e) => println!("[Bilibili Search] Failed to read body: {}", e),
            }
        }
        Err(e) => println!("[Bilibili Search] Request failed: {}", e),
    }
    println!("[Bilibili Search] No results for query: {}", query);
    vec![]
}

async fn search_youtube(query: &str) -> Vec<serde_json::Value> {
    let url = format!("https://www.youtube.com/results?search_query={}", urlencoding::encode(query));
    let mut results = Vec::new();

    if let Ok(resp) = reqwest::get(&url).await {
        if let Ok(html) = resp.text().await {
            let re = Regex::new(r#"ytInitialData = (\{.*?\});</script>"#).unwrap();
            if let Some(caps) = re.captures(&html) {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(&caps[1]) {
                    if let Some(contents) = data.pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents/0/itemSectionRenderer/contents") {
                        if let Some(items) = contents.as_array() {
                            for item in items {
                                if let Some(video) = item.get("videoRenderer") {
                                    let id = video.get("videoId").and_then(|v| v.as_str()).unwrap_or("");
                                    let title = video.pointer("/title/runs/0/text").and_then(|t| t.as_str()).unwrap_or("");
                                    let thumb = video.pointer("/thumbnail/thumbnails/0/url").and_then(|t| t.as_str()).unwrap_or("");
                                    let duration = video.pointer("/lengthText/simpleText").and_then(|t| t.as_str()).unwrap_or("00:00");
                                    
                                    if !id.is_empty() && results.len() < 5 {
                                        results.push(serde_json::json!({
                                            "id": id,
                                            "title": title,
                                            "thumbnail": thumb,
                                            "url": format!("https://youtube.com/watch?v={}", id),
                                            "duration": duration
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    println!("[YouTube Search] Returning {} results for query: {}", results.len(), query);
    results
}

pub async fn start_server() {
    let (layer, io) = SocketIo::new_layer();
    let store: RoomStore = Arc::new(Mutex::new(HashMap::new()));
    
    io.clone().ns("/", move |socket: SocketRef| {
        let store_clone = store.clone();
        let io_clone = io.clone();
        on_connect(socket, store_clone, io_clone);
    });

    let app = Router::new()
        .fallback_service(ServeDir::new("../dist"))
        .route("/health", get(|| async { "OpenKTV Backend OK" }))
        .layer(layer)
        .layer(CorsLayer::permissive());

    println!("Socket.IO Server listening on port 3001");
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3001").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn on_connect(socket: SocketRef, store: RoomStore, io: SocketIo) {
    println!("[Socket] User connected: {}", socket.id);
    
    let store_c = store.clone();
    socket.on("create_room", move |socket: SocketRef, Data::<serde_json::Value>(data), ack: socketioxide::extract::AckSender| {
        println!("[Socket] Received 'create_room' with data: {:?}", data);
        let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let room_id = generate_room_code();
        
        {
            let mut rooms = store_c.lock().unwrap();
            rooms.insert(room_id.clone(), Room {
                users: vec![],
                queue: vec![],
                current_song: None,
                host_session_id: session_id,
                host_socket_id: None,
            });
        }
        
        let _ = socket.join(room_id.clone());
        let _ = ack.send(&serde_json::json!({
            "success": true,
            "roomId": room_id
        }));
    });

    let store_c = store.clone();
    socket.on("join_host", move |socket: SocketRef, Data::<serde_json::Value>(data), ack: socketioxide::extract::AckSender| {
        let room_id = data.get("roomId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let mut rooms = store_c.lock().unwrap();
        if let Some(room) = rooms.get_mut(&room_id) {
            if room.host_session_id == session_id {
                room.host_socket_id = Some(socket.id.to_string());
                let _ = socket.join(room_id.clone());
                println!("[join_host] Host socket {} joined rooms: {:?}", socket.id, socket.rooms());
                let _ = socket.to(room_id.clone()).emit("session_state", &room);
                let _ = ack.send(&serde_json::json!({ "success": true, "room": room }));
            } else {
                let _ = ack.send(&serde_json::json!({ "success": false }));
            }
        } else {
            let _ = ack.send(&serde_json::json!({ "success": false }));
        }
    });

    let store_c = store.clone();
    socket.on("join_session", move |socket: SocketRef, Data::<serde_json::Value>(data), ack: socketioxide::extract::AckSender| {
        let room_id = data.get("roomId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let username = data.get("username").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let mut rooms = store_c.lock().unwrap();
        if let Some(room) = rooms.get_mut(&room_id) {
            room.users.retain(|u| u.session_id != session_id);
            let user = User {
                id: socket.id.to_string(),
                session_id,
                username,
                room_id: room_id.clone(),
            };
            room.users.push(user.clone());
            
            let room_clone = room.clone();
            drop(rooms);
            
            let _ = socket.join(room_id.clone());
            println!("[join_session] Broadcasting session_state to room: {}", room_id);
            let s_clone = socket.clone();
            let r_id = room_id.clone();
            tokio::spawn(async move {
                if let Err(e) = s_clone.within(r_id).emit("session_state", &room_clone).await {
                    println!("!! Emit Error join_session: {:?}", e);
                }
            });
            let _ = ack.send(&serde_json::json!({
                "success": true,
                "user": user
            }));
        } else {
            let _ = ack.send(&serde_json::json!({ "success": false }));
        }
    });

    socket.on("search_song", |_socket: SocketRef, Data::<serde_json::Value>(data), ack: socketioxide::extract::AckSender| async move {
        let query = data.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let platform = data.get("platform").and_then(|v| v.as_str()).unwrap_or("youtube").to_string();
        let mut search_query = query.clone();

        let results = if platform == "bilibili" {
            if !search_query.contains("KTV") && !search_query.contains("卡拉OK") && !search_query.to_lowercase().contains("karaoke") {
                search_query = format!("{} KTV", search_query);
            }
            search_bilibili(&search_query).await
        } else {
            if !search_query.to_lowercase().contains("karaoke") {
                search_query = format!("{} lyrics karaoke", search_query);
            }
            search_youtube(&search_query).await
        };

        let _ = ack.send(&serde_json::json!({
            "success": true,
            "results": results
        }));
    });

    let store_c = store.clone();
    socket.on("queue_song", move |socket: SocketRef, Data::<serde_json::Value>(data)| {
        let store_c = store_c.clone();
        tokio::spawn(async move {
            if let Some(user_data) = data.get("user") {
                let room_id = user_data.get("roomId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let username = user_data.get("username").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let session_id = user_data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();
                
                let url = data.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let pre_fetched_title = data.get("title").and_then(|v| v.as_str());
                
                let title = if let Some(t) = pre_fetched_title {
                    t.to_string()
                } else if url.contains("bilibili.com") {
                    get_bilibili_title(&url).await
                } else {
                    get_youtube_title(&url).await
                };

                let song = Song {
                    id: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis().to_string(),
                    url,
                    title,
                    queued_by: username,
                    queued_by_session_id: session_id,
                };

                let mut room_state_to_emit = None;
                {
                    let mut rooms = store_c.lock().unwrap();
                    if let Some(room) = rooms.get_mut(&room_id) {
                        room.queue.push(song);
                        room_state_to_emit = Some(room.clone());
                    }
                }
                
                if let Some(room_clone) = room_state_to_emit {
                    println!("[queue_song] Broadcasting session_state to room: {}", room_id);
                    if let Err(e) = socket.within(room_id.clone()).emit("session_state", &room_clone).await {
                        println!("!! Emit Error queue_song: {:?}", e);
                    }
                }
            }
        });
    });

    let store_c = store.clone();
    socket.on("next_song", move |socket: SocketRef, Data::<serde_json::Value>(data)| {
        let room_id = data.get("roomId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let mut rooms = store_c.lock().unwrap();
        if let Some(room) = rooms.get_mut(&room_id) {
            if room.host_session_id == session_id {
                if !room.queue.is_empty() {
                    room.current_song = Some(room.queue.remove(0));
                } else {
                    room.current_song = None;
                }
                let room_clone = room.clone();
                drop(rooms);
                println!("[next_song] Broadcasting session_state to room: {}", room_id);
                let s_clone = socket.clone();
                let r_id = room_id.clone();
                tokio::spawn(async move {
                    if let Err(e) = s_clone.within(r_id).emit("session_state", &room_clone).await {
                        println!("!! Emit Error next_song: {:?}", e);
                    }
                });
            }
        }
    });

    let store_c = store.clone();
    socket.on("remove_song", move |socket: SocketRef, Data::<serde_json::Value>(data)| {
        let room_id = data.get("roomId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let song_id = data.get("songId").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let mut rooms = store_c.lock().unwrap();
        if let Some(room) = rooms.get_mut(&room_id) {
            if let Some(idx) = room.queue.iter().position(|s| s.id == song_id) {
                if room.queue[idx].queued_by_session_id == session_id || room.host_session_id == session_id {
                    room.queue.remove(idx);
                    let room_clone = room.clone();
                    drop(rooms);
                    let s_clone = socket.clone();
                    let r_id = room_id.clone();
                    tokio::spawn(async move {
                        let _ = s_clone.within(r_id).emit("session_state", &room_clone).await;
                    });
                }
            }
        }
    });

    let store_c = store.clone();
    let io_c = io.clone();
    socket.on_disconnect(move |socket: SocketRef, _reason: socketioxide::socket::DisconnectReason| {
        println!("[Socket] User disconnected: {}", socket.id);
        
        let mut rooms = store_c.lock().unwrap();
        let mut room_to_close = None;
        
        for (room_id, room) in rooms.iter() {
            if room.host_socket_id.as_ref() == Some(&socket.id.to_string()) {
                room_to_close = Some(room_id.clone());
                break;
            }
        }
        
        if let Some(r_id) = room_to_close {
            println!("[Socket] Host disconnected, closing room: {}", r_id);
            rooms.remove(&r_id);
            drop(rooms);
            
            let io_clone = io_c.clone();
            tokio::spawn(async move {
                let _ = io_clone.to(r_id).emit("session_ended", &serde_json::json!({})).await;
            });
        }
    });
}
