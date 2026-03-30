# Booth 🎤

Booth is a synchronized, multiplayer karaoke (KTV) desktop application built for your home theater or private parties. It provides a "Chinese KTV-like" experience where a **Host** runs the main screen (a TV or monitor), and friends (**Acts**) join via their smartphones using a QR code to search for songs, queue them up, and manage the playlist in real-time.

---

## ✨ Features

- **Real-time Synchronization:** Built on Socket.IO for blazingly fast queue updates.
- **YouTube & Bilibili Search:** Search for karaoke/lyrics videos on YouTube or Bilibili directly from your phone.
- **Queue Management:**
  - Host can skip songs, reorder the queue (drag-and-drop), and remove any song.
  - Guests can delete the specific songs they queued.
- **Chinese & English Localization:** Full i18n support with automatic browser language detection.
- **Zero Friction Onboarding:** Scan the QR code, type a nickname, and you're immediately in the room. No accounts or logins required.
- **Cyberpunk Neon Aesthetics:** A stunning React frontend utilizing Tailwind CSS v4, featuring a dynamic spotlight background and glassmorphism UI.

---

## 🛠 Tech Stack

### App (`/app`)
- **Desktop Shell:** Tauri 2.x (Rust)
- **Frontend:** React 19 + Vite + Tailwind CSS v4
- **Backend (bundled):** Axum + socketioxide (served on port 3001 inside the Tauri process)
- **Localization:** react-i18next with browser language auto-detection
- **Video Playback:** react-youtube (YouTube), Bilibili iframe player
- **UI Interactions:** `@dnd-kit` (drag and drop), `react-qr-code`

### Legacy Backend (`/backend`)
- Node.js + Socket.IO server (superseded by the bundled Rust backend in the Tauri app)

---

## 🚀 Installation & Local Development

You'll need [Node.js](https://nodejs.org/) and the [Rust toolchain](https://rustup.rs/) installed.

```bash
cd app
npm install
npx tauri dev
```

This starts the Vite dev server and the Tauri app simultaneously. The bundled Axum server listens on port 3001.

### Building a distributable

```bash
cd app
npm run build
npx tauri build
```

---

## 🎮 How to Play

1. The **Host** launches the Booth app on a TV, laptop, or projector.
2. Click **Host a Room** and enter a Host Nickname.
3. The screen transitions to the session view and displays a large QR Code.
4. **Friends** scan the QR code with their phones, type their nickname, and search for a song on YouTube or Bilibili.
5. Watch the queue update instantly on the big screen!

---

*Sing together, make memories, have fun.*
