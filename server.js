const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// Serve downloaded files
app.use('/downloads', express.static(DOWNLOADS_DIR));

// Active downloads tracker
const activeDownloads = new Map();

// ============ HELPERS ============

const FFMPEG_PATH = fs.existsSync(path.join(__dirname, 'ffmpeg.exe')) ? path.join(__dirname, 'ffmpeg.exe') : null;

function getYtDlpPath() {
  const localExe = path.join(__dirname, 'yt-dlp.exe');
  if (fs.existsSync(localExe)) return localExe;

  try {
    execSync('yt-dlp --version', { stdio: 'pipe' });
    return 'yt-dlp';
  } catch {
    return 'yt-dlp';
  }
}

const YT_DLP = getYtDlpPath();

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

function parseProgress(line) {
  // [download]  45.2% of  125.30MiB at  2.50MiB/s ETA 00:35
  const percentMatch = line.match(/(\d+\.?\d*)%/);
  const sizeMatch = line.match(/of\s+(\S+)/);
  const speedMatch = line.match(/at\s+(\S+)/);
  const etaMatch = line.match(/ETA\s+(\S+)/);
  
  if (percentMatch) {
    return {
      percent: parseFloat(percentMatch[1]),
      size: sizeMatch ? sizeMatch[1] : null,
      speed: speedMatch ? speedMatch[1] : null,
      eta: etaMatch ? etaMatch[1] : null
    };
  }
  return null;
}

// ============ API ROUTES ============

// Get video/playlist info
app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL gerekli' });

    const args = [
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates'
    ];
    args.push('--js-runtimes', 'node');
    if (FFMPEG_PATH) args.push('--ffmpeg-location', FFMPEG_PATH);
    args.push(url);

    const output = await runYtDlp(args);
    const lines = output.trim().split('\n');
    const items = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    if (items.length === 0) {
      return res.status(400).json({ error: 'Video bilgisi alınamadı' });
    }

    // Single video
    if (items.length === 1 && !items[0].entries && items[0].formats) {
      const info = items[0];
      return res.json({
        type: 'video',
        data: {
          id: info.id,
          title: info.title || info.fulltitle,
          description: info.description,
          thumbnail: info.thumbnail,
          duration: info.duration,
          channel: info.channel || info.uploader,
          channelUrl: info.channel_url || info.uploader_url,
          viewCount: info.view_count,
          likeCount: info.like_count,
          uploadDate: info.upload_date,
          formats: (info.formats || []).filter(f => f.filesize || f.filesize_approx).map(f => ({
            formatId: f.format_id,
            ext: f.ext,
            resolution: f.resolution || `${f.width || '?'}x${f.height || '?'}`,
            width: f.width,
            height: f.height,
            fps: f.fps,
            filesize: f.filesize || f.filesize_approx,
            vcodec: f.vcodec,
            acodec: f.acodec,
            abr: f.abr,
            tbr: f.tbr,
            formatNote: f.format_note
          })),
          subtitles: Object.keys(info.subtitles || {}),
          automaticCaptions: Object.keys(info.automatic_captions || {}).slice(0, 30)
        }
      });
    }

    // Playlist
    if (items.length === 1 && items[0]._type === 'playlist') {
      const pl = items[0];
      return res.json({
        type: 'playlist',
        data: {
          id: pl.id,
          title: pl.title,
          channel: pl.channel || pl.uploader,
          thumbnail: pl.thumbnails?.[0]?.url,
          videoCount: pl.playlist_count || (pl.entries || []).length,
          videos: (pl.entries || []).map((e, i) => ({
            index: i + 1,
            id: e.id || e.url,
            title: e.title,
            duration: e.duration,
            thumbnail: e.thumbnails?.[0]?.url,
            url: e.url || `https://www.youtube.com/watch?v=${e.id}`
          }))
        }
      });
    }

    // Multiple items (flat playlist)
    return res.json({
      type: 'playlist',
      data: {
        id: 'playlist',
        title: items[0]?.playlist_title || 'Playlist',
        channel: items[0]?.playlist_uploader || items[0]?.channel || '',
        thumbnail: items[0]?.thumbnails?.[0]?.url,
        videoCount: items.length,
        videos: items.map((e, i) => ({
          index: i + 1,
          id: e.id || e.url,
          title: e.title,
          duration: e.duration,
          thumbnail: e.thumbnail || e.thumbnails?.[0]?.url,
          url: e.url || e.webpage_url || `https://www.youtube.com/watch?v=${e.id}`
        }))
      }
    });

  } catch (err) {
    console.error('Info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get detailed formats for a video
app.post('/api/formats', async (req, res) => {
  try {
    const { url } = req.body;
    const args = ['--dump-json', '--no-warnings', '--no-check-certificates'];
    args.push('--js-runtimes', 'node');
    if (FFMPEG_PATH) args.push('--ffmpeg-location', FFMPEG_PATH);
    args.push(url);
    const output = await runYtDlp(args);
    const info = JSON.parse(output.trim().split('\n')[0]);

    const formats = (info.formats || []).map(f => ({
      formatId: f.format_id,
      ext: f.ext,
      resolution: f.resolution || `${f.width || '?'}x${f.height || '?'}`,
      width: f.width,
      height: f.height,
      fps: f.fps,
      filesize: f.filesize || f.filesize_approx,
      vcodec: f.vcodec,
      acodec: f.acodec,
      abr: f.abr,
      tbr: f.tbr,
      formatNote: f.format_note
    }));

    res.json({ formats, subtitles: Object.keys(info.subtitles || {}), automaticCaptions: Object.keys(info.automatic_captions || {}).slice(0, 30) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start download
app.post('/api/download', (req, res) => {
  try {
    const { url, format, quality, audioOnly, includeAudio, subtitleLang, thumbnailOnly, startTime, endTime, customFilename } = req.body;
    const downloadId = uuidv4();

    let args = [
      '--no-warnings',
      '--no-check-certificates',
      '--newline',
      '-o', path.join(DOWNLOADS_DIR, customFilename ? `${downloadId}-${customFilename}` : `${downloadId}-%(title)s.%(ext)s`)
    ];
    args.push('--js-runtimes', 'node');
    if (FFMPEG_PATH) args.push('--ffmpeg-location', FFMPEG_PATH);

    // Thumbnail only
    if (thumbnailOnly) {
      args.push('--write-thumbnail', '--skip-download', '--convert-thumbnails', 'jpg');
      args.push('-o', path.join(DOWNLOADS_DIR, `${downloadId}-%(title)s-thumbnail.%(ext)s`));
    }
    // Audio only
    else if (audioOnly) {
      const audioFormat = format || 'mp3';
      args.push('-x', '--audio-format', audioFormat);
      if (quality) args.push('--audio-quality', quality);
    }
    // Video
    else {
      // Prioritize H.264 (avc) to avoid ffmpeg postprocessing errors with AV1/VP9 on some setups
      args.push('-S', 'vcodec:h264,res,acodec:m4a');

      if (includeAudio === false) {
        if (quality === 'best') {
          args.push('-f', 'bestvideo[ext=mp4]/bestvideo');
        } else if (quality) {
          args.push('-f', `bestvideo[ext=mp4][height<=${quality}]/bestvideo[height<=${quality}]`);
        } else if (format) {
          args.push('-f', format);
        } else {
          args.push('-f', 'bestvideo[ext=mp4]/bestvideo');
        }
      } else {
        if (quality === 'best') {
          args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
        } else if (quality) {
          args.push('-f', `bestvideo[ext=mp4][height<=${quality}]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best`);
        } else if (format) {
          args.push('-f', format);
        } else {
          args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
        }
      }
    }

    // Subtitles
    if (subtitleLang) {
      args.push('--write-sub', '--sub-lang', subtitleLang, '--sub-format', 'srt');
    }

    // Time range (postprocessor)
    if (startTime || endTime) {
      let ppArgs = '';
      if (startTime) ppArgs += `-ss ${startTime} `;
      if (endTime) ppArgs += `-to ${endTime} `;
      args.push('--postprocessor-args', `ffmpeg:${ppArgs.trim()}`);
    }

    args.push(url);

    const proc = spawn(YT_DLP, args, { windowsHide: true });
    
    const downloadInfo = {
      id: downloadId,
      url,
      status: 'downloading',
      progress: 0,
      speed: null,
      eta: null,
      size: null,
      filename: null,
      error: null,
      startTime: Date.now(),
      proc
    };

    activeDownloads.set(downloadId, downloadInfo);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const progress = parseProgress(line);
        if (progress) {
          downloadInfo.progress = progress.percent;
          downloadInfo.speed = progress.speed;
          downloadInfo.eta = progress.eta;
          downloadInfo.size = progress.size;
          io.emit('download-progress', {
            id: downloadId,
            ...progress,
            status: 'downloading'
          });
        }

        // Capture destination filename
        const destMatch = line.match(/\[download\] Destination:\s*(.+)/);
        if (destMatch) {
          downloadInfo.filename = path.basename(destMatch[1].trim());
        }
        const mergeMatch = line.match(/\[Merger\] Merging formats into "(.+)"/);
        if (mergeMatch) {
          downloadInfo.filename = path.basename(mergeMatch[1].trim());
        }

        // Already downloaded
        const alreadyMatch = line.match(/\[download\]\s*(.+)\s*has already been downloaded/);
        if (alreadyMatch) {
          downloadInfo.filename = path.basename(alreadyMatch[1].trim());
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const errText = data.toString();
      console.error('yt-dlp stderr:', errText);
    });

    proc.on('close', (code) => {
      if (downloadInfo.status === 'cancelled') {
        downloadInfo.proc = null;
        return;
      }
      if (code === 0) {
        downloadInfo.status = 'completed';
        downloadInfo.progress = 100;

        // Locate exact generated file by ID prefix
        try {
          const files = fs.readdirSync(DOWNLOADS_DIR);
          const actualFile = files.find(f => f.startsWith(`${downloadId}-`));
          if (actualFile) {
            downloadInfo.filename = actualFile;
          }
        } catch (e) { console.error('Error finding file:', e); }

        io.emit('download-progress', {
          id: downloadId,
          percent: 100,
          status: 'completed',
          filename: downloadInfo.filename
        });
      } else {
        downloadInfo.status = 'error';
        downloadInfo.error = 'İndirme başarısız oldu';
        io.emit('download-progress', {
          id: downloadId,
          status: 'error',
          error: downloadInfo.error
        });
      }
      // Remove proc reference to allow garbage collection
      downloadInfo.proc = null;
    });

    proc.on('error', (err) => {
      if (downloadInfo.status === 'cancelled') {
        downloadInfo.proc = null;
        return;
      }
      downloadInfo.status = 'error';
      downloadInfo.error = err.message;
      downloadInfo.proc = null;
      io.emit('download-progress', {
        id: downloadId,
        status: 'error',
        error: err.message
      });
    });

    res.json({ downloadId, status: 'started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel download
app.post('/api/cancel/:id', (req, res) => {
  const download = activeDownloads.get(req.params.id);
  if (!download) return res.status(404).json({ error: 'İndirme bulunamadı' });
  
  download.status = 'cancelled';
  if (download.proc) {
    if (process.platform === 'win32') {
      require('child_process').exec(`taskkill /pid ${download.proc.pid} /T /F`, () => {});
    } else {
      download.proc.kill('SIGKILL');
    }
  }
  io.emit('download-progress', { id: req.params.id, status: 'cancelled' });
  res.json({ status: 'cancelled' });
});

// List active downloads
app.get('/api/downloads', (req, res) => {
  const downloads = [];
  for (const [id, d] of activeDownloads) {
    downloads.push({
      id,
      url: d.url,
      status: d.status,
      progress: d.progress,
      speed: d.speed,
      eta: d.eta,
      size: d.size,
      filename: d.filename,
      error: d.error
    });
  }
  res.json(downloads);
});

// List downloaded files
app.get('/api/files', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR).map(f => {
      const stat = fs.statSync(path.join(DOWNLOADS_DIR, f));
      return {
        name: f,
        size: stat.size,
        date: stat.mtime,
        ext: path.extname(f).slice(1)
      };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(files);
  } catch {
    res.json([]);
  }
});

// Delete a downloaded file
app.delete('/api/files/:filename', (req, res) => {
  try {
    const filePath = path.join(DOWNLOADS_DIR, req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ status: 'deleted' });
    } else {
      res.status(404).json({ error: 'Dosya bulunamadı' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ SOCKET.IO ============

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🎬 YouTube Downloader Server`);
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  📁 Downloads: ${DOWNLOADS_DIR}\n`);
});
