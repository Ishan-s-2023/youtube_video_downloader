# Loader — Premium YouTube Video & Playlist Downloader

Loader is a sleek, minimalist web application that allows users to download YouTube videos and playlists, customize outputs, and package everything into a single ZIP file.

---

## 📁 Project Structure

The project is structured as a monorepo containing:
*   **Root Folder**: `youtube_video_downloader` (Contains root configuration files like `package.json` and `vercel.json`).
*   **Frontend**: Located in the `frontend` folder (The web UI built with React + Vite).
*   **Backend**: Located in the `backend` folder (The Express.js server that runs downloads using `yt-dlp`).

---

## 🚀 Step-by-Step Installation & Local Run Guide

Here is exactly how to download, install dependencies, configure environment paths, and run the project from scratch.

### 📦 Step 1: Install Node.js
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

### 🎥 Step 2: Download, Unzip, and Set Up FFmpeg (Crucial for Video/Audio merging)
FFmpeg is required to merge high-definition video with audio stream tracks.

#### **For Windows (Manual Download & Unzip)**
1. **Download**: Go to [gyan.dev FFmpeg Builds](https://www.gyan.dev/ffmpeg/builds/) and download the zip file under the **release builds** section named:
   * `ffmpeg-release-essentials.zip` (Direct Link: [ffmpeg-release-essentials.zip](https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip))
2. **Unzip/Extract**:
   * Locate the downloaded `.zip` file in your **Downloads** folder.
   * Right-click the file and click **Extract All...**
   * Change the destination path to `C:\` and click **Extract**.
   * Go to `C:\` in your File Explorer. Rename the extracted folder (e.g., `ffmpeg-7.0.1-essentials_build`) to simply `ffmpeg`.
   * Ensure that the folder path `C:\ffmpeg\bin` exists and contains `ffmpeg.exe`.
3. **Set Path Environment Variable**:
   * Press the **Windows Key**, type `env`, and press Enter (selects **Edit the system environment variables**).
   * In the window that appears, click the **Environment Variables...** button at the bottom.
   * Under the **User variables** section, find the variable named `Path` (or `PATH`), select it, and click **Edit...**.
   * Click **New** on the right side and type: `C:\ffmpeg\bin`
   * Click **OK** on all open windows to save the changes.
4. **Verify**: Open a new Command Prompt or PowerShell window and run:
   ```cmd
   ffmpeg -version
   ```

#### **For macOS**
Install via terminal using Homebrew:
```bash
brew install ffmpeg
```

#### **For Linux (Ubuntu/Debian)**
Install via terminal:
```bash
sudo apt update && sudo apt install ffmpeg -y
```

---

### 💻 Step 3: Run the Application Locally
1. **Open your Terminal / Command Prompt**.
2. **Navigate into the Project Folder**:
   Change directory to where you cloned/extracted the project folder (for example, if it's on your Documents folder):
   ```bash
   cd C:\Users\Ishan\Documents\antigravity\eager-hypatia
   ```
3. **Install Project Dependencies**:
   Run the monorepo installation script to install dependencies for root, frontend, and backend packages:
   ```bash
   npm run install:all
   ```
4. **Start the Servers**:
   Launch both the frontend and backend servers concurrently:
   ```bash
   npm run dev
   ```
5. **Open in Browser**:
   Open your browser and navigate to:
   👉 **[http://localhost:5173/](http://localhost:5173/)**

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


