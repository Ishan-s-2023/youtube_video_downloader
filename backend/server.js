import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { spawn, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import archiver from 'archiver';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Paths
const binDir = process.env.VERCEL ? '/tmp/bin' : path.join(process.cwd(), 'bin');
const downloadsDir = process.env.VERCEL ? '/tmp/downloads' : path.join(process.cwd(), 'downloads');

// Ensure directories exist
if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });

// Determine yt-dlp binary based on platform
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const ytdlpFilename = isWindows ? 'yt-dlp.exe' : (isMac ? 'yt-dlp_macos' : 'yt-dlp');
const ytdlpPath = path.join(binDir, ytdlpFilename);
const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytdlpFilename}`;

// Session Progress Map
const sessions = new Map();

// SSE Clients Map
const clients = new Map();

// Download yt-dlp helper
function downloadYtDlp() {
  return new Promise((resolve, reject) => {
    console.log(`Downloading yt-dlp from ${downloadUrl}...`);
    const file = fs.createWriteStream(ytdlpPath);
    
    const request = (url) => {
      https.get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          request(response.headers.location);
        } else if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            if (!isWindows) {
              fs.chmodSync(ytdlpPath, 0o755);
            }
            console.log('yt-dlp downloaded successfully.');
            resolve();
          });
        } else {
          file.close();
          fs.unlink(ytdlpPath, () => {});
          reject(new Error(`Failed to download yt-dlp: ${response.statusCode} ${response.statusMessage}`));
        }
      }).on('error', (err) => {
        file.close();
        fs.unlink(ytdlpPath, () => {});
        reject(err);
      });
    };
    request(downloadUrl);
  });
}

// Clean up old downloads (older than 1 hour)
function cleanUpDownloads() {
  fs.readdir(downloadsDir, (err, files) => {
    if (err) return;
    const now = Date.now();
    const expiry = 60 * 60 * 1000; // 1 hour
    
    files.forEach((file) => {
      const filePath = path.join(downloadsDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > expiry) {
          fs.rm(filePath, { recursive: true, force: true }, () => {
            console.log(`Cleaned up expired file: ${file}`);
          });
        }
      });
    });
  });
}
setInterval(cleanUpDownloads, 15 * 60 * 1000); // run every 15 mins

// SSE Status Broadcast
function broadcastStatus(sessionId, statusData) {
  sessions.set(sessionId, { ...sessions.get(sessionId), ...statusData });
  const clientList = clients.get(sessionId) || [];
  clientList.forEach((res) => {
    res.write(`data: ${JSON.stringify(sessions.get(sessionId))}\n\n`);
  });
}

// Fetch Video/Playlist Metadata
app.post('/api/info', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  console.log(`Fetching info for URL: ${url}`);
  const args = ['--dump-single-json', '--flat-playlist', url];
  
  execFile(ytdlpPath, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error fetching info: ${stderr || error.message}`);
      return res.status(500).json({ error: 'Failed to retrieve YouTube info. Verify the link.' });
    }

    try {
      const data = JSON.parse(stdout);
      const isPlaylist = data._type === 'playlist';
      const title = data.title || 'Unknown Title';
      
      let entries = [];
      if (isPlaylist) {
        entries = (data.entries || []).map((entry) => ({
          id: entry.id,
          title: entry.title || 'Untitled Video',
          duration: entry.duration || 0,
          thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
          url: entry.url || `https://www.youtube.com/watch?v=${entry.id}`
        }));
      } else {
        entries = [{
          id: data.id,
          title: data.title || 'Untitled Video',
          duration: data.duration || 0,
          thumbnail: data.thumbnails?.[0]?.url || data.thumbnail || null,
          url: data.webpage_url || `https://www.youtube.com/watch?v=${data.id}`
        }];
      }

      res.json({
        title,
        isPlaylist,
        entries
      });
    } catch (parseErr) {
      console.error('Error parsing JSON:', parseErr);
      res.status(500).json({ error: 'Failed to parse YouTube metadata.' });
    }
  });
});

// Trigger Download
app.post('/api/download', async (req, res) => {
  const { urls, format, resolution, audioQuality } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'No video URLs provided.' });
  }

  const sessionId = uuidv4();
  const sessionDir = path.join(downloadsDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const initialStatus = {
    status: 'starting',
    progress: 0,
    currentVideoIndex: 0,
    totalVideos: urls.length,
    currentTitle: '',
    speed: '',
    eta: '',
    details: 'Initializing downloads...'
  };
  
  sessions.set(sessionId, initialStatus);
  res.json({ sessionId });

  runDownloadQueue(sessionId, sessionDir, urls, format, resolution, audioQuality);
});

// Download Queue Runner
async function runDownloadQueue(sessionId, sessionDir, urls, format, resolution, audioQuality) {
  try {
    const total = urls.length;
    
    for (let i = 0; i < total; i++) {
      const url = urls[i];
      const videoIndex = i + 1;
      
      broadcastStatus(sessionId, {
        status: 'downloading',
        currentVideoIndex: videoIndex,
        details: `Fetching metadata for video ${videoIndex} of ${total}...`
      });

      const title = await getVideoTitle(url);
      broadcastStatus(sessionId, { currentTitle: title || 'Downloading...' });

      const args = [];
      const audioFormats = ['mp3', 'm4a', 'wav', 'flac', 'opus'];
      const isAudioOnly = audioFormats.includes(format);

      if (isAudioOnly) {
        args.push('--extract-audio');
        args.push('--audio-format', format);
        
        // Handle audio bitrate (quality) mapping
        // yt-dlp quality: 0-9 (0 is best), or a specific bitrate in kbps like 320k, 256k
        if (audioQuality && audioQuality !== 'best') {
          args.push('--audio-quality', `${audioQuality}k`);
        } else {
          args.push('--audio-quality', '0'); // best
        }
      } else {
        // Video options
        const isVideoOnly = format.endsWith('-noaudio');
        const container = format.startsWith('webm') ? 'webm' : 'mp4';
        
        if (isVideoOnly) {
          args.push('--merge-output-format', container);
          let formatFilter = `bv*[ext=${container}]/bv*`;
          if (resolution && resolution !== 'best') {
            const height = parseInt(resolution);
            formatFilter = `bv*[height<=${height}][ext=${container}]/bv*[height<=${height}]`;
          }
          args.push('-f', formatFilter);
        } else {
          // Both Audio & Video
          args.push('--merge-output-format', container);
          let formatFilter = `bv*[ext=${container}]+ba[ext=m4a]/b[ext=${container}]`;
          if (container === 'webm') {
            formatFilter = 'bv*[ext=webm]+ba[ext=webm]/b[ext=webm]';
          }
          
          if (resolution && resolution !== 'best') {
            const height = parseInt(resolution);
            if (container === 'webm') {
              formatFilter = `bv*[height<=${height}][ext=webm]+ba[ext=webm]/b[height<=${height}][ext=webm]/bv*[height<=${height}]+ba/b[height<=${height}]`;
            } else {
              formatFilter = `bv*[height<=${height}][ext=mp4]+ba[ext=m4a]/b[height<=${height}][ext=mp4]/bv*[height<=${height}]+ba/b[height<=${height}]`;
            }
          }
          args.push('-f', formatFilter);
        }
      }

      args.push('-o', path.join(sessionDir, '%(title)s.%(ext)s'));
      args.push(url);

      await new Promise((resolve, reject) => {
        console.log(`Spawning yt-dlp: ${args.join(' ')}`);
        const child = spawn(ytdlpPath, args);
        
        child.stdout.on('data', (data) => {
          const output = data.toString();
          const percentMatch = output.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
          
          if (percentMatch) {
            const percent = parseFloat(percentMatch[1]);
            
            // Capture speed and ETA individually to support varying size/spacing formats
            const speedMatch = output.match(/at\s+(\S+\/s)/) || output.match(/at\s+(\S+)/);
            const etaMatch = output.match(/ETA\s+(\S+)/);
            
            const speed = speedMatch ? speedMatch[1] : '';
            const eta = etaMatch ? etaMatch[1] : '';
            
            const baseProgress = ((videoIndex - 1) / total) * 100;
            const itemContribution = (percent / total);
            const overallProgress = Math.round(baseProgress + itemContribution);
            
            broadcastStatus(sessionId, {
              progress: overallProgress,
              speed,
              eta,
              details: `Downloading video ${videoIndex} of ${total} (${percent}%)`
            });
          }
        });

        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`yt-dlp exited with code ${code}`));
        });
      });
    }

    broadcastStatus(sessionId, {
      status: 'zipping',
      progress: 95,
      details: 'Packaging files into a ZIP archive...'
    });

    const zipPath = `${sessionDir}.zip`;
    await zipDirectory(sessionDir, zipPath);

    fs.rm(sessionDir, { recursive: true, force: true }, (err) => {
      if (err) console.error('Error cleaning up temp directory:', err);
    });

    broadcastStatus(sessionId, {
      status: 'completed',
      progress: 100,
      details: 'ZIP archive created successfully!'
    });

  } catch (error) {
    console.error('Download queue error:', error);
    broadcastStatus(sessionId, {
      status: 'failed',
      details: `Error: ${error.message || 'An error occurred during download.'}`
    });
    if (fs.existsSync(sessionDir)) {
      fs.rm(sessionDir, { recursive: true, force: true }, () => {});
    }
  }
}

function getVideoTitle(url) {
  return new Promise((resolve) => {
    execFile(ytdlpPath, ['--get-title', url], (error, stdout) => {
      if (error) resolve(null);
      else resolve(stdout.trim());
    });
  });
}

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

app.get('/api/status-json/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (session) {
    res.json(session);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

app.get('/api/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const session = sessions.get(sessionId);
  if (session) {
    res.write(`data: ${JSON.stringify(session)}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ status: 'not_found' })}\n\n`);
  }

  if (!clients.has(sessionId)) {
    clients.set(sessionId, []);
  }
  clients.get(sessionId).push(res);

  req.on('close', () => {
    const list = clients.get(sessionId) || [];
    const index = list.indexOf(res);
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) clients.delete(sessionId);
  });
});

app.get('/api/retrieve/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const zipPath = path.join(downloadsDir, `${sessionId}.zip`);

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'ZIP file not found.' });
  }

  res.download(zipPath, 'youtube_downloads.zip', (err) => {
    if (err) {
      console.error('Error serving ZIP file:', err);
    } else {
      fs.unlink(zipPath, (unlinkErr) => {
        if (unlinkErr) console.error('Error deleting ZIP:', unlinkErr);
      });
      sessions.delete(sessionId);
    }
  });
});

const startServer = async () => {
  if (!fs.existsSync(ytdlpPath)) {
    try {
      await downloadYtDlp();
    } catch (err) {
      console.error('Failed to download yt-dlp.', err);
      if (!process.env.VERCEL) process.exit(1);
    }
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
};

startServer();

export default app;
