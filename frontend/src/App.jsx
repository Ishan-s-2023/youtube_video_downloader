import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Youtube, 
  Check, 
  AlertCircle, 
  Music, 
  Video, 
  RefreshCw, 
  ArrowLeft,
  Settings,
  Film,
  Sun,
  Moon
} from 'lucide-react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

export default function App() {
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Metadata & selection
  const [playlistData, setPlaylistData] = useState(null);
  const [selectedTracks, setSelectedTracks] = useState(new Set());
  
  // Advanced Settings
  const [category, setCategory] = useState('audio'); // 'audio', 'video-audio', 'video-only'
  const [format, setFormat] = useState('mp3'); // 'mp3', 'm4a', 'wav', 'flac', 'opus', 'mp4', 'webm'
  const [resolution, setResolution] = useState('best'); // 'best', '1080', '720', '480', '360'
  const [audioQuality, setAudioQuality] = useState('best'); // 'best', '320', '256', '192', '128'
  
  // Download execution state
  const [sessionId, setSessionId] = useState(null);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const eventSourceRef = useRef(null);

  // Set default format based on category
  useEffect(() => {
    if (isLightTheme) {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [isLightTheme]);

  // Set default format based on category
  useEffect(() => {
    if (category === 'audio') {
      setFormat('mp3');
    } else if (category === 'video-audio') {
      setFormat('mp4');
    } else if (category === 'video-only') {
      setFormat('mp4-noaudio');
    }
  }, [category]);

  const formatDuration = (sec) => {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleFetchInfo = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setPlaylistData(null);
    setSelectedTracks(new Set());

    try {
      const response = await fetch(`${API_BASE}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve link information.');
      }

      setPlaylistData(data);
      setSelectedTracks(new Set(data.entries.map(e => e.id)));
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTrack = (id) => {
    const next = new Set(selectedTracks);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTracks(next);
  };

  const handleSelectAll = () => {
    if (!playlistData) return;
    setSelectedTracks(new Set(playlistData.entries.map(e => e.id)));
  };

  const handleSelectNone = () => {
    setSelectedTracks(new Set());
  };

  const handleStartDownload = async () => {
    if (selectedTracks.size === 0) {
      setError('Please select at least one track to download.');
      return;
    }

    setError(null);
    setLoading(true);

    const selectedUrls = playlistData.entries
      .filter(e => selectedTracks.has(e.id))
      .map(e => e.url);

    try {
      const response = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: selectedUrls,
          format: format,
          resolution,
          audioQuality
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start download.');
      }

      setSessionId(data.sessionId);
      startProgressSSE(data.sessionId);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setLoading(false);
    }
  };

  const startProgressSSE = (sessId) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`${API_BASE}/api/status/${sessId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setDownloadStatus(data);
        setLoading(false);

        if (data.status === 'completed') {
          es.close();
          window.location.href = `${API_BASE}/api/retrieve/${sessId}`;
        } else if (data.status === 'failed') {
          es.close();
          setError(data.details || 'Download session failed.');
        }
      } catch (parseErr) {
        console.error('SSE error:', parseErr);
      }
    };

    es.onerror = (err) => {
      console.error('SSE Connection error:', err);
      es.close();
      setError('Connection to download progress was lost.');
    };
  };

  const handleReset = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setSessionId(null);
    setDownloadStatus(null);
    setPlaylistData(null);
    setSelectedTracks(new Set());
    setUrl('');
    setError(null);
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      const isDownloading = sessionId && downloadStatus && 
                            downloadStatus.status !== 'completed' && 
                            downloadStatus.status !== 'failed';
      if (isDownloading) {
        e.preventDefault();
        e.returnValue = 'A download is in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [sessionId, downloadStatus]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="app-container">
      <header style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
        <button 
          onClick={() => setIsLightTheme(!isLightTheme)} 
          className="btn-secondary" 
          style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px' }}
          title={isLightTheme ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
          {isLightTheme ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <Youtube size={42} className="text-gradient" style={{ filter: 'drop-shadow(0 0 12px rgba(99,102,241,0.5))' }} />
          <h1>Loader</h1>
        </div>
        <p className="subtitle">Premium YouTube Video & Playlist Downloader</p>
      </header>

      <main className="glass-panel">
        
        {error && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {/* Phase 1: Search */}
        {!playlistData && !sessionId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', fontSize: '1.05rem', lineHeight: '1.6' }}>
              Paste any YouTube video or playlist URL below to customize your formats, resolutions, and download them packaged as a ZIP.
            </p>
            <form onSubmit={handleFetchInfo} className="search-wrapper">
              <input
                type="url"
                className="search-input"
                placeholder="https://www.youtube.com/watch?v=... or https://www.youtube.com/playlist?list=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={loading}
              />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" size={18} />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Extract
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Phase 2: Configuration & Track Selector */}
        {playlistData && !sessionId && (
          <div>
            <div className="playlist-header">
              <div className="playlist-title-info">
                <span className="playlist-badge">{playlistData.isPlaylist ? 'Playlist' : 'Single Video'}</span>
                <span className="playlist-title" title={playlistData.title}>{playlistData.title}</span>
              </div>
              <div className="playlist-actions">
                <button className="btn-secondary" onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ArrowLeft size={14} /> Back
                </button>
              </div>
            </div>

            <div className="config-grid">
              
              {/* Left Column: Settings Revamp */}
              <div>
                <h3 className="config-section-title">Download Category</h3>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <button 
                    className={`btn-secondary ${category === 'audio' ? 'active' : ''}`}
                    onClick={() => setCategory('audio')}
                    style={{ flex: 1, padding: '0.75rem', borderColor: category === 'audio' ? 'var(--primary)' : '' }}
                  >
                    Audio Only
                  </button>
                  <button 
                    className={`btn-secondary ${category === 'video-audio' ? 'active' : ''}`}
                    onClick={() => setCategory('video-audio')}
                    style={{ flex: 1, padding: '0.75rem', borderColor: category === 'video-audio' ? 'var(--primary)' : '' }}
                  >
                    Video + Audio
                  </button>
                  <button 
                    className={`btn-secondary ${category === 'video-only' ? 'active' : ''}`}
                    onClick={() => setCategory('video-only')}
                    style={{ flex: 1, padding: '0.75rem', borderColor: category === 'video-only' ? 'var(--primary)' : '' }}
                  >
                    Video Only
                  </button>
                </div>

                <h3 className="config-section-title">Format</h3>
                <div className="option-group" style={{ marginBottom: '1.5rem' }}>
                  {category === 'audio' && (
                    <>
                      {['mp3', 'm4a', 'wav', 'flac', 'opus'].map((fmt) => (
                        <div key={fmt} className={`radio-card ${format === fmt ? 'active' : ''}`} onClick={() => setFormat(fmt)}>
                          <span className="radio-title" style={{ textTransform: 'uppercase' }}>{fmt} Audio</span>
                          <div className="radio-circle"></div>
                        </div>
                      ))}
                    </>
                  )}

                  {category === 'video-audio' && (
                    <>
                      {['mp4', 'webm'].map((fmt) => (
                        <div key={fmt} className={`radio-card ${format === fmt ? 'active' : ''}`} onClick={() => setFormat(fmt)}>
                          <span className="radio-title" style={{ textTransform: 'uppercase' }}>{fmt} Video</span>
                          <div className="radio-circle"></div>
                        </div>
                      ))}
                    </>
                  )}

                  {category === 'video-only' && (
                    <>
                      {['mp4-noaudio', 'webm-noaudio'].map((fmt) => (
                        <div key={fmt} className={`radio-card ${format === fmt ? 'active' : ''}`} onClick={() => setFormat(fmt)}>
                          <span className="radio-title" style={{ textTransform: 'uppercase' }}>{fmt.replace('-noaudio', '')} Video Only</span>
                          <div className="radio-circle"></div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Video Resolution Options */}
                {category !== 'audio' && (
                  <div>
                    <h3 className="config-section-title">Resolution Limit</h3>
                    <div className="option-group">
                      {['best', '1080', '720', '480', '360'].map((res) => (
                        <div key={res} className={`radio-card ${resolution === res ? 'active' : ''}`} onClick={() => setResolution(res)}>
                          <span className="radio-title">{res === 'best' ? 'Best Available' : `${res}p`}</span>
                          <div className="radio-circle"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Audio Quality Bitrates */}
                {category === 'audio' && ['mp3', 'm4a', 'opus'].includes(format) && (
                  <div>
                    <h3 className="config-section-title">Audio Quality (Bitrate)</h3>
                    <div className="option-group">
                      {['best', '320', '256', '192', '128'].map((q) => (
                        <div key={q} className={`radio-card ${audioQuality === q ? 'active' : ''}`} onClick={() => setAudioQuality(q)}>
                          <span className="radio-title">{q === 'best' ? 'Best Available' : `${q} kbps`}</span>
                          <div className="radio-circle"></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Track Selector */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 className="config-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Select Videos ({selectedTracks.size} selected)</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={handleSelectAll}>Select All</button>
                    <button className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={handleSelectNone}>Clear</button>
                  </div>
                </h3>

                <div className="playlist-list">
                  {playlistData.entries.map((entry) => {
                    const isSelected = selectedTracks.has(entry.id);
                    return (
                      <div 
                        key={entry.id} 
                        className={`track-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleToggleTrack(entry.id)}
                      >
                        <div className="track-checkbox"></div>
                        {entry.thumbnail && (
                          <img src={entry.thumbnail} alt="" className="track-thumb" />
                        )}
                        <div className="track-details">
                          <div className="track-title" title={entry.title}>{entry.title}</div>
                          <div className="track-meta">{formatDuration(entry.duration)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
                  <button 
                    className="btn-primary" 
                    onClick={handleStartDownload} 
                    style={{ width: '100%', justifyContent: 'center', height: '54px' }}
                    disabled={selectedTracks.size === 0 || loading}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="animate-spin" size={20} />
                        Starting Download...
                      </>
                    ) : (
                      <>
                        <Download size={20} />
                        Download Selected to ZIP
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Phase 3: Active Download */}
        {sessionId && downloadStatus && (
          <div className="progress-container">
            {downloadStatus.status === 'completed' ? (
              <div className="success-card">
                <div className="success-icon-wrapper">
                  <Check size={40} />
                </div>
                <h2 className="progress-header-text">ZIP File Ready!</h2>
                <p className="progress-subtext">
                  Your ZIP file has been created. The download should start automatically.
                </p>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <a href={`${API_BASE}/api/retrieve/${sessionId}`} className="btn-primary" style={{ textDecoration: 'none' }}>
                    <Download size={18} /> Download Now
                  </a>
                  <button className="btn-secondary" onClick={handleReset}>
                    Start New
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="progress-header-text">
                  {downloadStatus.status === 'zipping' ? 'Zipping Files...' : 'Downloading Archive'}
                </h2>
                
                <div 
                  className="loader-ring" 
                  style={{ '--progress-val': downloadStatus.progress || 0 }}
                >
                  <div className="loader-percentage">
                    {downloadStatus.progress || 0}%
                  </div>
                </div>

                <div style={{ width: '100%', maxWidth: '500px', marginTop: '-0.5rem' }}>
                  <p className="progress-subtext" style={{ fontWeight: '600', fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    {downloadStatus.currentTitle || 'Preparing items...'}
                  </p>
                  <p className="progress-subtext" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {downloadStatus.details}
                  </p>
                  
                  <div className="linear-progress-track">
                    <div className="linear-progress-bar" style={{ width: `${downloadStatus.progress || 0}%` }}></div>
                  </div>
                </div>

                {downloadStatus.status === 'downloading' && (
                  <div className="progress-stats-box">
                    <div className="stat-item">
                      <span className="stat-label">File</span>
                      <span className="stat-value">{downloadStatus.currentVideoIndex} / {downloadStatus.totalVideos}</span>
                    </div>
                    <div className="stat-item" style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '2rem' }}>
                      <span className="stat-label">Speed</span>
                      <span className="stat-value">{downloadStatus.speed || '--'}</span>
                    </div>
                    <div className="stat-item" style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '2rem' }}>
                      <span className="stat-label">ETA</span>
                      <span className="stat-value">{downloadStatus.eta || '--'}</span>
                    </div>
                  </div>
                )}
                
                <div style={{ marginTop: '1rem' }}>
                  <button className="btn-secondary" onClick={handleReset}>
                    Cancel Download
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </main>

      <footer style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <p>100% Free • Open Source • High Quality Formats</p>
      </footer>
    </div>
  );
}
