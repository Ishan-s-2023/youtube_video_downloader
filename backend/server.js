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

// Throttled SSE Status Broadcast — prevents hundreds of writes/sec from saturating the event stream
const broadcastTimers = new Map();
function broadcastStatus(sessionId, statusData) {
  sessions.set(sessionId, { ...sessions.get(sessionId), ...statusData });
  
  // Always broadcast terminal states immediately
  const status = statusData.status;
  if (status === 'completed' || status === 'failed' || status === 'zipping') {
    broadcastTimers.delete(sessionId);
    flushBroadcast(sessionId);
    return;
  }

  // Throttle progress updates to every 250ms
  if (!broadcastTimers.has(sessionId)) {
    broadcastTimers.set(sessionId, setTimeout(() => {
      broadcastTimers.delete(sessionId);
      flushBroadcast(sessionId);
    }, 250));
  }
}

function flushBroadcast(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const clientList = clients.get(sessionId) || [];
  const payload = `data: ${JSON.stringify(session)}\n\n`;
  clientList.forEach((res) => res.write(payload));
}

// Fetch Video/Playlist Metadata for single URL helper
function fetchSingleUrlInfo(url) {
  return new Promise((resolve, reject) => {
    const args = ['--dump-single-json', '--flat-playlist', url];
    execFile(ytdlpPath, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching info for ${url}: ${stderr || error.message}`);
        return reject(new Error(`Failed to retrieve info for: ${url}`));
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
        resolve({ title, entries, isPlaylist });
      } catch (parseErr) {
        reject(parseErr);
      }
    });
  });
}

// Fetch Video/Playlist Metadata
app.post('/api/info', async (req, res) => {
  const { urls, url } = req.body;
  const urlList = urls && Array.isArray(urls) ? urls : (url ? [url] : []);
  
  if (urlList.length === 0) {
    return res.status(400).json({ error: 'At least one URL is required.' });
  }

  console.log(`Fetching info for URLs: ${urlList.join(', ')}`);
  
  try {
    const results = await Promise.all(urlList.map(async (targetUrl) => {
      try {
        return await fetchSingleUrlInfo(targetUrl);
      } catch (err) {
        console.warn(`Failed to fetch metadata for ${targetUrl}:`, err.message);
        return null;
      }
    }));

    const combinedEntries = [];
    const sourceTitles = [];
    let hasPlaylist = false;

    for (const result of results) {
      if (result) {
        combinedEntries.push(...result.entries);
        sourceTitles.push(result.title);
        if (result.isPlaylist) hasPlaylist = true;
      }
    }

    if (combinedEntries.length === 0) {
      return res.status(500).json({ error: 'Failed to retrieve metadata from all provided links.' });
    }

    // Deduplicate entries by video ID
    const seenIds = new Set();
    const uniqueEntries = [];
    for (const entry of combinedEntries) {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        uniqueEntries.push(entry);
      }
    }

    res.json({
      title: sourceTitles.length > 2 
        ? `${sourceTitles.slice(0, 2).join(', ')} and ${sourceTitles.length - 2} more`
        : sourceTitles.join(', '),
      isPlaylist: hasPlaylist || uniqueEntries.length > 1,
      entries: uniqueEntries
    });

  } catch (err) {
    console.error('Error combining metadata:', err);
    res.status(500).json({ error: 'Failed to parse YouTube metadata.' });
  }
});

// Trigger Download
app.post('/api/download', async (req, res) => {
  const { urls, format, resolution, audioQuality, tracks, embedMetadata, downloadSubtitles, embedSubtitles } = req.body;
  
  let tracksToDownload = [];
  if (tracks && Array.isArray(tracks) && tracks.length > 0) {
    tracksToDownload = tracks;
  } else if (urls && Array.isArray(urls)) {
    tracksToDownload = urls.map(url => ({
      url,
      format,
      resolution,
      audioQuality
    }));
  }

  if (tracksToDownload.length === 0) {
    return res.status(400).json({ error: 'No video URLs or tracks provided.' });
  }

  const sessionId = uuidv4();
  const sessionDir = path.join(downloadsDir, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const initialStatus = {
    status: 'starting',
    progress: 0,
    currentVideoIndex: 0,
    totalVideos: tracksToDownload.length,
    currentTitle: '',
    speed: '',
    eta: '',
    details: 'Initializing downloads...'
  };
  
  sessions.set(sessionId, initialStatus);
  res.json({ sessionId });

  runDownloadQueue(sessionId, sessionDir, tracksToDownload, format, resolution, audioQuality, embedMetadata, downloadSubtitles, embedSubtitles);
});

// Concurrency Pool Helper
async function runWithLimit(concurrency, items, fn) {
  const results = [];
  const executing = new Set();
  for (let i = 0; i < items.length; i++) {
    const p = fn(items[i], i).then(res => {
      executing.delete(p);
      return res;
    });
    results.push(p);
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// Download Queue Runner
async function runDownloadQueue(sessionId, sessionDir, tracks, globalFormat, globalResolution, globalAudioQuality, embedMetadata, downloadSubtitles, embedSubtitles) {
  try {
    const total = tracks.length;
    const failedVideos = [];
    let successfulCount = 0;
    
    // Track individual progress of each track
    const trackProgresses = new Array(total).fill(0);
    const activeTitles = new Set();
    let overallSpeed = '';
    let overallEta = '';

    const CONCURRENCY = Math.min(8, total);

    const downloadTrack = async (track, index) => {
      const url = track.url;
      const format = track.format || globalFormat || 'mp3';
      const resolution = track.resolution || globalResolution || 'best';
      const audioQuality = track.audioQuality || globalAudioQuality || 'best';
      const trimStart = track.trimStart;
      const trimEnd = track.trimEnd;
      const videoIndex = index + 1;

      // Use title from track metadata (already fetched during /api/info) — avoids extra yt-dlp call
      const displayTitle = track.title || `Track ${videoIndex}`;
      activeTitles.add(displayTitle);

      broadcastStatus(sessionId, {
        status: 'downloading',
        details: `Downloading ${activeTitles.size} active tracks concurrently...`,
        currentTitle: Array.from(activeTitles).slice(0, 2).join(', ') + (activeTitles.size > 2 ? ` (+${activeTitles.size - 2} more)` : '')
      });

      const args = [
        '--concurrent-fragments', '32',
        '--no-playlist',
        '--no-mtime',
        '--no-warnings',
        '--no-check-certificates',
        '--extractor-args', 'youtube:skip=hls,dash',
        '--http-chunk-size', '10M',
        '--buffer-size', '64K'
      ];
      const audioFormats = ['mp3', 'm4a', 'wav', 'flac', 'opus'];
      const isAudioOnly = audioFormats.includes(format);

      if (isAudioOnly) {
        args.push('--extract-audio');
        args.push('--audio-format', format);
        if (audioQuality && audioQuality !== 'best') {
          args.push('--audio-quality', `${audioQuality}k`);
        } else {
          args.push('--audio-quality', '0');
        }
      } else {
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

      // Metadata & Album Art embedding
      if (embedMetadata) {
        args.push('--embed-metadata');
        args.push('--embed-thumbnail');
      }

      // Subtitles downloading / embedding
      if (downloadSubtitles) {
        args.push('--write-subs');
        args.push('--write-auto-subs');
        args.push('--sub-langs', 'en');
        if (embedSubtitles && !isAudioOnly) {
          args.push('--embed-subs');
        }
      }

      // Section trimming/clipping
      if (trimStart || trimEnd) {
        const start = trimStart ? trimStart.trim() : '0';
        const end = trimEnd ? trimEnd.trim() : 'inf';
        args.push('--download-sections', `*${start}-${end}`);
        args.push('--force-keyframes-at-cuts');
      }

      args.push('-o', path.join(sessionDir, '%(title)s.%(ext)s'));
      args.push(url);

      const success = await new Promise((resolve) => {
        console.log(`Spawning yt-dlp: ${args.join(' ')}`);
        const child = spawn(ytdlpPath, args);
        
        let buffer = '';
        child.stdout.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop();
          
          for (const line of lines) {
            const percentMatch = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
            if (percentMatch) {
              const percent = parseFloat(percentMatch[1]);
              const speedMatch = line.match(/at\s+(\S+\/s)/) || line.match(/at\s+(\S+)/);
              const etaMatch = line.match(/ETA\s+(\S+)/);
              
              if (speedMatch) overallSpeed = speedMatch[1];
              if (etaMatch) overallEta = etaMatch[1];
              
              trackProgresses[index] = percent;
              const overallProgress = Math.round(trackProgresses.reduce((a, b) => a + b, 0) / total);
              
              broadcastStatus(sessionId, {
                progress: Math.min(overallProgress, 94),
                speed: overallSpeed,
                eta: overallEta,
                details: `Downloading... Avg: ${overallProgress}%`
              });
            }
          }
        });

        child.stderr.on('data', (data) => {
          console.error(`yt-dlp stderr: ${data.toString()}`);
        });

        child.on('close', (code) => {
          resolve(code === 0);
        });
      });

      activeTitles.delete(displayTitle);
      if (success) {
        successfulCount++;
        trackProgresses[index] = 100;
      } else {
        console.warn(`Track fail: ${displayTitle}`);
        failedVideos.push(displayTitle);
        trackProgresses[index] = 0;
      }
      
      const overallProgress = Math.round(trackProgresses.reduce((a, b) => a + b, 0) / total);
      broadcastStatus(sessionId, {
        progress: Math.min(overallProgress, 94)
      });
    };

    await runWithLimit(CONCURRENCY, tracks, downloadTrack);

    if (successfulCount === 0) {
      throw new Error('All selected tracks failed to download.');
    }

    // Check how many files were actually downloaded
    const downloadedFiles = fs.readdirSync(sessionDir);

    if (downloadedFiles.length === 1) {
      // Single file — skip ZIP entirely, just move the file out
      const srcFile = path.join(sessionDir, downloadedFiles[0]);
      const destFile = path.join(downloadsDir, `${sessionId}_${downloadedFiles[0]}`);
      fs.renameSync(srcFile, destFile);
      fs.rm(sessionDir, { recursive: true, force: true }, () => {});

      broadcastStatus(sessionId, {
        status: 'completed',
        progress: 100,
        singleFile: downloadedFiles[0],
        details: failedVideos.length > 0
          ? `Finished. Skipped ${failedVideos.length} failed tracks: ${failedVideos.join(', ')}`
          : 'Download complete!'
      });
    } else {
      broadcastStatus(sessionId, {
        status: 'zipping',
        progress: 95,
        details: 'Packaging files...'
      });

      const zipPath = `${sessionDir}.zip`;
      await zipDirectory(sessionDir, zipPath);

      fs.rm(sessionDir, { recursive: true, force: true }, (err) => {
        if (err) console.error('Error cleaning up temp directory:', err);
      });

      broadcastStatus(sessionId, {
        status: 'completed',
        progress: 100,
        details: failedVideos.length > 0
          ? `Finished. Successfully packaged ${successfulCount} tracks. Skipped ${failedVideos.length} failed tracks: ${failedVideos.join(', ')}`
          : 'ZIP archive created successfully!'
      });
    }

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

function zipDirectory(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    // level 0 = store mode — no compression CPU cost (media files are already compressed)
    const archive = archiver('zip', { store: true });

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

  // Check for single file first (no ZIP was created)
  const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith(`${sessionId}_`));
  if (files.length === 1) {
    const singleFilePath = path.join(downloadsDir, files[0]);
    const originalName = files[0].substring(sessionId.length + 1); // strip sessionId_ prefix
    return res.download(singleFilePath, originalName, (err) => {
      if (err) {
        console.error('Error serving file:', err);
      }
    });
  }

  // Fall back to ZIP
  const zipPath = path.join(downloadsDir, `${sessionId}.zip`);
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  res.download(zipPath, 'youtube_downloads.zip', (err) => {
    if (err) {
      console.error('Error serving ZIP file:', err);
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
