# Loader — Premium YouTube Video & Playlist Downloader

Loader is a sleek, minimalist web application that allows users to download YouTube videos and playlists, customize outputs, and package everything into a single ZIP file.

---

## 🚀 Local Setup & Execution

Follow these simple steps to run Loader on your local machine:

### 1. Prerequisites
Ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v24 or later)
*   **FFmpeg** (Required to merge high-resolution video streams with audio streams)

### 2. Installation
Open your terminal in the project root directory and install all dependencies:
```bash
npm run install:all
```
This automatically installs the backend, frontend, and monorepo dependencies.

### 3. Run the App
Start the development server for both frontend and backend concurrently:
```bash
npm run dev
```

Once running, open your browser and navigate to:
👉 **[http://localhost:5173/](http://localhost:5173/)**

---

## 🛠️ Setting up FFmpeg (Required)

If FFmpeg is not installed on your system, follow the guide for your OS:

### **macOS**
Install using [Homebrew](https://brew.sh/):
```bash
brew install ffmpeg
```

### **Windows**
1. Download the latest build from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/).
2. Extract the ZIP folder to `C:\ffmpeg`.
3. Add `C:\ffmpeg\bin` to your System Environment variables (PATH).
4. Restart your terminal and verify by running: `ffmpeg -version`

### **Linux (Ubuntu/Debian)**
Install via APT:
```bash
sudo apt update && sudo apt install ffmpeg -y
```

---

## ⚡ Deployment to Vercel

Loader is fully optimized for Vercel, dynamically writing temporary downloads to Vercel's writable `/tmp/` directory.

### Deploy via Vercel CLI
1. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. Run the deployment command from the project root:
   ```bash
   vercel
   ```
3. Follow the CLI prompts to link and deploy your project.

### Deploy via GitHub (Continuous Integration)
1. Push this repository to your GitHub account.
2. Go to the [Vercel Dashboard](https://vercel.com/) and click **Add New** > **Project**.
3. Import your GitHub repository.
4. Keep the default settings and click **Deploy**. Vercel will build and serve your app automatically using the root `vercel.json` configuration.

---

## 🎨 Tech Stack

*   **Frontend**: React, Vite, Vanilla CSS, Lucide Icons
*   **Backend**: Express.js, Server-Sent Events (SSE), Archiver, `yt-dlp` Wrapper

