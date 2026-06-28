# Loader — Premium YouTube Video & Playlist Downloader

Loader is a sleek, minimalist web application that allows users to download YouTube videos and playlists, customize outputs, and package everything into a single ZIP file.

---

## ✨ Features & Functionality

This application supports the following key features and backend functions:

### 📹 Video & Audio Downloading
*   **Format Selection**:
    *   **Audio & Video**: MP4 (using standard H.264 video codec) and WebM (VP9 codec).
    *   **Video Only**: Extract pure video without audio tracks (MP4 or WebM).
    *   **Audio Only**: Convert and extract pure audio in high fidelity formats like MP3, M4A, WAV, FLAC, and OPUS.
*   **Granular Quality Selection**:
    *   Configure video resolution dynamically (360p, 480p, 720p, 1080p).
    *   Configure audio bitrate controls for custom compressed outputs (128kbps, 192kbps, 256kbps, 320kbps).

### 🎶 Playlist & ZIP Packaging Functions
*   **Flat Playlist Fetching**: Fast metadata parsing from playlist links to select specific songs or videos.
*   **Custom Bulk Downloading**: Pick and choose specific tracks from a list via checkboxes or select all.
*   **Automatic ZIP Archiving**: Downloads are packaged neatly on the backend and sent to the client as a single `.zip` file.

### ⚡ Real-Time Progress Tracking
*   Uses **Server-Sent Events (SSE)** to stream progress updates directly from the Express backend command process to the React interface, displaying real-time speed, percentages, and status logs.

---

## 📁 Project Structure

The project is structured as a monorepo containing:
*   **Root Folder**: `youtube_video_downloader` (Contains root configuration files like `package.json` and `vercel.json`).
*   **Frontend**: Located in the `frontend` folder (The web UI built with React + Vite).
*   **Backend**: Located in the `backend` folder (The Express.js server that runs downloads using `yt-dlp`).

---

## 🚀 Step-by-Step Installation & Local Run Guide

Here is exactly how to download, install dependencies, configure environment paths, and run the project from scratch.

### 📥 Step 1: Download the Project Repository
Get the project code on your local system:
*   **Option A (Using Git)**:
    Open your terminal/command prompt and clone the repository:
    ```bash
    git clone https://github.com/Ishan-s-2023/youtube_video_downloader.git
    ```
*   **Option B (Downloading ZIP)**:
    1. Go to the [GitHub Repository page](https://github.com/Ishan-s-2023/youtube_video_downloader).
    2. Click the green **Code** button and select **Download ZIP**.
    3. Find the downloaded `youtube_video_downloader-main.zip` in your `Downloads` folder.
    4. Right-click the file, select **Extract All...**, and extract it (for example, to `C:\youtube_video_downloader`).

---

### 📦 Step 2: Install Node.js
Node.js runs the local server and builds the interface.
1. Download the **Node.js LTS (Recommended)** installer from [nodejs.org](https://nodejs.org/).
2. Run the downloaded `.msi` or `.pkg` installer.
3. Click **Next** through the setup wizard (leave default settings checked) and finish.
4. Verify installation by opening a new command terminal and running:
   ```bash
   node -v
   npm -v
   ```

---

### 🎥 Step 3: Download, Unzip, and Set Up FFmpeg (Crucial for Video/Audio merging)
FFmpeg is required to merge high-definition video with audio stream tracks.

#### **For Windows (Simplified Setup)**
1. **Download**: Click to download [ffmpeg-release-essentials.zip](https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip).
2. **Extract**: 
   * Go to your `Downloads` folder, right-click the zip, and select **Extract All...**
   * Extract it directly to your `C:\` drive.
   * Rename the extracted folder (e.g. `ffmpeg-7.0.1-essentials_build`) to `ffmpeg` so the path is exactly `C:\ffmpeg`.
3. **Set Environment Path**:
   * Search for **env** in the Windows search bar and choose **Edit the system environment variables**.
   * Click **Environment Variables...** at the bottom.
   * Double-click **Path** under *User variables*.
   * Click **New** and type: `C:\ffmpeg\bin`
   * Click **OK** on all windows to save.
4. **Verify**: Open a new Command Prompt and run: `ffmpeg -version`

#### **For macOS**
Install via Homebrew:
```bash
brew install ffmpeg
```

#### **For Linux (Ubuntu/Debian)**
Install via APT:
```bash
sudo apt update && sudo apt install ffmpeg -y
```

---

### 💻 Step 4: Run the Application Locally
1. **Open Terminal / Command Prompt**.
2. **Navigate into the Project Folder**:
   Go to the directory where you cloned or unzipped the project folder:
   ```bash
   cd C:\youtube_video_downloader
   # Or if it is in your Downloads folder:
   cd C:\Users\YourUsername\Downloads\youtube_video_downloader
   ```
3. **Install Dependencies**:
   ```bash
   npm run install:all
   ```
4. **Start the App**:
   ```bash
   npm run dev
   ```
5. **Open in Browser**:
   Open your browser and navigate to:
   👉 **[http://localhost:5173/](http://localhost:5173/)**

---

## ⚡ Deployment & Hosting Recommendations

Loader contains a configured `vercel.json` file. However, please be aware of the following serverless limitations before deploying:

> [!WARNING]
> **Serverless Execution Limits (Vercel)**
> Due to Vercel's serverless function timeout limits (10 seconds for Hobby plans) and ephemeral disk space, running the backend on Vercel is **not recommended** for downloading long videos or large playlists. Long-running processes will fail or timeout.

### 🌐 Recommended Production Architecture
For a stable production setup:
1. **Frontend**: Deploy the static frontend to **Vercel**, **GitHub Pages**, or **Netlify**.
2. **Backend**: Host the backend Express server separately on a dedicated/containerized hosting service with no timeout limits:
   * **Cloud Run** (Recommended, configured as a container service)
   * **Compute Engine** (or any VM instance)
   * **Render** (Web Services)
   * **AWS ECS** / **EC2**
   * **DigitalOcean Droplet** / **VPS**

---


## 🎨 Tech Stack

*   **Frontend**: React, Vite, Vanilla CSS, Lucide Icons
*   **Backend**: Express.js, Server-Sent Events (SSE), Archiver, `yt-dlp` Wrapper


