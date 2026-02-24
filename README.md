# Booth 🎤

Booth is a synchronized, multiplayer karaoke (KTV) web application built for your home theater or private parties. It provides a "Chinese KTV-like" experience where a **Host** runs the main screen (a TV or monitor), and friends (**Acts**) join via their smartphones using a QR code to search for songs, queue them up, and manage the playlist in real-time.

---

## ✨ Features

- **Real-time Synchronization:** Built on Socket.IO for blazingly fast queue updates.
- **Dynamic Search:** Directly search YouTube from your phone for lyrics/karaoke videos.
- **Queue Management:** 
  - Host can skip songs, reorder the queue (drag-and-drop), and remove any song.
  - Guests can delete the specific songs they queued.
- **Zero Friction Onboarding:** Scan the QR code, type a nickname, and you're immediately in the room. No accounts or logins required. Zero data collected.
- **Cyberpunk Neon Aesthetics:** A stunning React frontend utilizing Tailwind CSS v4, featuring a dynamic spotlight background and glassmorphism UI.

---

## 🛠 Tech Stack & Dependencies

### Frontend (`/frontend`)
- **Framework:** React 19 + Vite
- **Styling:** Tailwind CSS V4
- **Real-time Client:** `socket.io-client`
- **Video Player:** `react-youtube`
- **UI Interactions:** `@dnd-kit` (drag and drop sorting), `react-qr-code`

### Backend (`/backend`)
- **Server:** Node.js + Fastify
- **Real-time Server:** `socket.io`
- **Search Provider:** `yt-search` (YouTube data scraping) & `node-fetch`

---

## 🚀 Installation & Local Development

To run Booth locally, you'll need Node.js installed on your machine. The project runs as two separate servers: the Fastify WebSocket backend and the Vite frontend.

### 1. Start the Backend
```bash
cd backend
npm install
npm run dev
```
> The backend runs by default on port `3001`.

### 2. Start the Frontend
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
> The frontend runs by default on port `5173`. You can access it in your browser at `http://localhost:5173`.

---

## ⚙️ Configuration

### Custom QR Code Domain (Optional)
By default, the Host screen generates a QR code that points to the local IP of the machine running the frontend (e.g., `http://192.168.1.x:5173`). 

If you are tunneling your frontend (e.g., via Ngrok or Cloudflare Tunnels) so friends can join from outside your WiFi network, you should specify the public domain.

1. Create a `.env` file in the `/frontend` directory.
2. Add your external URL:
   ```env
   VITE_QR_DOMAIN=https://your-custom-tunnel.trycloudflare.com
   ```
3. Restart your Vite dev server. The QR code on the Host screen will now route scanners to that public URL.

---

## 🎮 How to Play
1. The **Host** opens the React app in a web browser on a smart TV, laptop, or projector.
2. Click **Host a Room** and enter a Host Nickname.
3. The screen will transition to the Booth Session queue and display a large QR Code.
4. **Friends** scan the QR code with their phones, type their nickname, and search for a song.
5. Watch the queue update instantly on the big screen!

---

*Sing together, make memories, have fun.*
