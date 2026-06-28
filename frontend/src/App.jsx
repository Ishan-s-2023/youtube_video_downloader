import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
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
  const [isLightTheme, setIsLightTheme] = useState(true);
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

  // Global features state
  const [embedMetadata, setEmbedMetadata] = useState(true);
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);
  const [embedSubtitles, setEmbedSubtitles] = useState(false);

  // Per-track settings override state (trackId -> override object)
  const [trackOverrides, setTrackOverrides] = useState({});
  // Expanded tracks set (trackId)
  const [expandedTracks, setExpandedTracks] = useState(new Set());
  
  // Download execution state
  const [sessionId, setSessionId] = useState(null);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const eventSourceRef = useRef(null);

  const toggleTrackSettings = (trackId) => {
    const next = new Set(expandedTracks);
    if (next.has(trackId)) {
      next.delete(trackId);
    } else {
      next.add(trackId);
    }
    setExpandedTracks(next);
  };

  const updateTrackOverride = (trackId, key, value) => {
    setTrackOverrides(prev => {
      const currentTrack = prev[trackId] || {
        useCustom: false,
        category: 'audio',
        format: 'mp3',
        resolution: 'best',
        audioQuality: 'best',
        trimStart: '',
        trimEnd: ''
      };
      const updatedTrack = { ...currentTrack, [key]: value };
      
      // Auto-set default format if category changes
      if (key === 'category') {
        if (value === 'audio') updatedTrack.format = 'mp3';
        else if (value === 'video-audio') updatedTrack.format = 'mp4';
        else if (value === 'video-only') updatedTrack.format = 'mp4-noaudio';
      }

      return {
        ...prev,
        [trackId]: updatedTrack
      };
    });
  };

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

  const handlePaste = (e) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && pastedText.trim()) {
      e.preventDefault();
      const textarea = e.target;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = textarea.value;
      
      const textToInsert = pastedText.endsWith('\n') ? pastedText : pastedText + '\n';
      const newValue = currentValue.substring(0, start) + textToInsert + currentValue.substring(end);
      
      setUrl(newValue);
      
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
      }, 0);
    }
  };

  const handleFetchInfo = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    // Split input into lines, trim, and filter valid URLs
    const urls = url.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && (line.startsWith('http://') || line.startsWith('https://')));

    if (urls.length === 0) {
      setError('Please enter at least one valid YouTube URL.');
      return;
    }

    setLoading(true);
    setError(null);
    setPlaylistData(null);
    setSelectedTracks(new Set());

    try {
      const response = await fetch(`${API_BASE}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
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

    const tracksPayload = playlistData.entries
      .filter(e => selectedTracks.has(e.id))
      .map(e => {
        const override = trackOverrides[e.id];
        if (override && override.useCustom) {
          return {
            url: e.url,
            title: e.title,
            format: override.format,
            resolution: override.resolution,
            audioQuality: override.audioQuality,
            trimStart: override.trimStart || undefined,
            trimEnd: override.trimEnd || undefined
          };
        }
        return {
          url: e.url,
          title: e.title,
          format: format,
          resolution: resolution,
          audioQuality: audioQuality
        };
      });

    try {
      const response = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: tracksPayload,
          format: format,
          resolution,
          audioQuality,
          embedMetadata,
          downloadSubtitles,
          embedSubtitles
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

  const triggerDownload = async (sessId) => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/api/retrieve/${sessId}`);
      if (!response.ok) {
        throw new Error('Failed to retrieve download file.');
      }
      
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'youtube_downloads.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to trigger automatic download. Please try clicking "Download again".');
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
          triggerDownload(sessId);
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
          <svg width="42" height="42" viewBox="0 0 32 32" fill="none" style={{ filter: 'drop-shadow(0 0 12px rgba(6,182,212,0.5))' }}>
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f5d4" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <path d="M6 18v6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-6" stroke="url(#logo-grad)" strokeWidth="3" strokeLinecap="round" />
            <path d="M16 6v12M11 13l5 5 5-5" stroke="url(#logo-grad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
            <form onSubmit={handleFetchInfo} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
              <textarea
                className="search-input"
                style={{ resize: 'vertical', minHeight: '120px', lineHeight: '1.5', padding: '1rem 1.25rem' }}
                placeholder="Paste YouTube video or playlist links here (one per line)...&#10;https://www.youtube.com/watch?v=123&#10;https://www.youtube.com/playlist?list=abc"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={handlePaste}
                required
                disabled={loading}
              />
              <button type="submit" className="btn-primary" style={{ height: '54px', width: '100%', justifyContent: 'center' }} disabled={loading}>
                {loading ? (
                  <>
                    <RefreshCw className="animate-spin" size={18} />
                    Extracting Tracks...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Extract All Links
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

                {/* Advanced Enrichment Options */}
                <div style={{ marginTop: '1.5rem' }}>
                  <h3 className="config-section-title">Options</h3>
                  <div 
                    className={`switch-card ${embedMetadata ? 'active' : ''}`}
                    onClick={() => setEmbedMetadata(!embedMetadata)}
                  >
                    <div className="switch-label-container">
                      <span className="switch-title">Embed Metadata & Art</span>
                      <span className="switch-desc">Tag files & embed cover artwork</span>
                    </div>
                    <div className="switch-toggle-btn">
                      <div className="switch-circle"></div>
                    </div>
                  </div>

                  <div 
                    className={`switch-card ${downloadSubtitles ? 'active' : ''}`}
                    onClick={() => setDownloadSubtitles(!downloadSubtitles)}
                  >
                    <div className="switch-label-container">
                      <span className="switch-title">Download Subtitles</span>
                      <span className="switch-desc">Extract English CC/subtitles</span>
                    </div>
                    <div className="switch-toggle-btn">
                      <div className="switch-circle"></div>
                    </div>
                  </div>

                  {downloadSubtitles && category !== 'audio' && (
                    <div 
                      className={`switch-card ${embedSubtitles ? 'active' : ''}`}
                      onClick={() => setEmbedSubtitles(!embedSubtitles)}
                      style={{ marginLeft: '1.25rem', borderLeft: '2px solid var(--primary)', borderRadius: '0 12px 12px 0' }}
                    >
                      <div className="switch-label-container">
                        <span className="switch-title">Embed Subtitles in Video</span>
                        <span className="switch-desc">Merge subtitles directly into video</span>
                      </div>
                      <div className="switch-toggle-btn">
                        <div className="switch-circle"></div>
                      </div>
                    </div>
                  )}
                </div>
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
                    const isExpanded = expandedTracks.has(entry.id);
                    const override = trackOverrides[entry.id] || {
                      useCustom: false,
                      category: 'audio',
                      format: 'mp3',
                      resolution: 'best',
                      audioQuality: 'best',
                      trimStart: '',
                      trimEnd: ''
                    };

                    return (
                      <div key={entry.id} className={`track-item-wrapper ${isSelected ? 'selected' : ''}`}>
                        <div 
                          className="track-item"
                          onClick={() => handleToggleTrack(entry.id)}
                        >
                          <div className="track-checkbox"></div>
                          {entry.thumbnail && (
                            <img src={entry.thumbnail} alt="" className="track-thumb" />
                          )}
                          <div className="track-details">
                            <div className="track-title" title={entry.title}>{entry.title}</div>
                            <div className="track-meta">
                              {formatDuration(entry.duration)}
                              {override.useCustom && (
                                <span style={{ marginLeft: '0.5rem', color: 'var(--primary)', fontWeight: '600', fontSize: '0.75rem' }}>
                                  (Custom Overrides)
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <button 
                            type="button"
                            className={`track-settings-toggle ${isExpanded ? 'active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTrackSettings(entry.id);
                            }}
                            title="Customize track settings"
                          >
                            <Settings size={16} />
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="track-settings-panel">
                            <div className="track-setting-row" style={{ alignItems: 'center' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }}>
                                <input 
                                  type="checkbox" 
                                  checked={override.useCustom} 
                                  onChange={(e) => updateTrackOverride(entry.id, 'useCustom', e.target.checked)}
                                  style={{ accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                                />
                                Override global settings
                              </label>
                            </div>

                            {override.useCustom && (
                              <>
                                <div className="track-setting-row">
                                  <div className="track-setting-col">
                                    <span className="track-setting-label">Category</span>
                                    <select 
                                      className="track-select"
                                      value={override.category}
                                      onChange={(e) => updateTrackOverride(entry.id, 'category', e.target.value)}
                                    >
                                      <option value="audio">Audio Only</option>
                                      <option value="video-audio">Video + Audio</option>
                                      <option value="video-only">Video Only</option>
                                    </select>
                                  </div>

                                  <div className="track-setting-col">
                                    <span className="track-setting-label">Format</span>
                                    <select 
                                      className="track-select"
                                      value={override.format}
                                      onChange={(e) => updateTrackOverride(entry.id, 'format', e.target.value)}
                                    >
                                      {override.category === 'audio' && (
                                        <>
                                          <option value="mp3">MP3</option>
                                          <option value="m4a">M4A</option>
                                          <option value="wav">WAV</option>
                                          <option value="flac">FLAC</option>
                                          <option value="opus">OPUS</option>
                                        </>
                                      )}
                                      {override.category === 'video-audio' && (
                                        <>
                                          <option value="mp4">MP4</option>
                                          <option value="webm">WEBM</option>
                                        </>
                                      )}
                                      {override.category === 'video-only' && (
                                        <>
                                          <option value="mp4-noaudio">MP4 Only</option>
                                          <option value="webm-noaudio">WEBM Only</option>
                                        </>
                                      )}
                                    </select>
                                  </div>
                                </div>

                                <div className="track-setting-row">
                                  {override.category !== 'audio' && (
                                    <div className="track-setting-col">
                                      <span className="track-setting-label">Resolution</span>
                                      <select 
                                        className="track-select"
                                        value={override.resolution}
                                        onChange={(e) => updateTrackOverride(entry.id, 'resolution', e.target.value)}
                                      >
                                        <option value="best">Best Available</option>
                                        <option value="1080">1080p</option>
                                        <option value="720">720p</option>
                                        <option value="480">480p</option>
                                        <option value="360">360p</option>
                                      </select>
                                    </div>
                                  )}

                                  {override.category === 'audio' && ['mp3', 'm4a', 'opus'].includes(override.format) && (
                                    <div className="track-setting-col">
                                      <span className="track-setting-label">Audio Bitrate</span>
                                      <select 
                                        className="track-select"
                                        value={override.audioQuality}
                                        onChange={(e) => updateTrackOverride(entry.id, 'audioQuality', e.target.value)}
                                      >
                                        <option value="best">Best Available</option>
                                        <option value="320">320 kbps</option>
                                        <option value="256">256 kbps</option>
                                        <option value="192">192 kbps</option>
                                        <option value="128">128 kbps</option>
                                      </select>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}

                            <div className="track-setting-row">
                              <div className="track-setting-col">
                                <span className="track-setting-label">Clip/Trim Range (Optional)</span>
                                <div className="track-trim-grid">
                                  <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Start (e.g. 0:30)</span>
                                    <input 
                                      type="text" 
                                      className="track-input"
                                      placeholder="0:00"
                                      value={override.trimStart || ''}
                                      onChange={(e) => updateTrackOverride(entry.id, 'trimStart', e.target.value)}
                                    />
                                  </div>
                                  <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>End (e.g. 1:45)</span>
                                    <input 
                                      type="text" 
                                      className="track-input"
                                      placeholder="End"
                                      value={override.trimEnd || ''}
                                      onChange={(e) => updateTrackOverride(entry.id, 'trimEnd', e.target.value)}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
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
                  <button onClick={() => triggerDownload(sessionId)} className="btn-primary">
                    <Download size={18} /> Download again
                  </button>
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

                <div style={{ width: '100%', maxWidth: '500px', marginTop: '-0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.25rem' }}>
                  <p className="progress-subtext" style={{ fontWeight: '600', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                    {downloadStatus.currentTitle || 'Preparing items...'}
                  </p>
                  
                  {/* Song and loading part, with file index grouped exactly below the circle */}
                  <p style={{ fontSize: '0.95rem', fontWeight: '500', color: 'var(--primary)', margin: '0.125rem 0' }}>
                    File {downloadStatus.currentVideoIndex} out of {downloadStatus.totalVideos}
                  </p>

                  <p className="progress-subtext" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {downloadStatus.details}
                  </p>
                  
                  <div className="linear-progress-track" style={{ marginTop: '0.5rem' }}>
                    <div className="linear-progress-bar" style={{ width: `${downloadStatus.progress || 0}%` }}></div>
                  </div>
                </div>

                {downloadStatus.status === 'downloading' && (
                  <div className="progress-stats-box">
                    <div className="stat-item">
                      <span className="stat-label">Speed</span>
                      <span className="stat-value">{downloadStatus.speed || '--'}</span>
                    </div>
                    <div className="stat-item" style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '3rem' }}>
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
