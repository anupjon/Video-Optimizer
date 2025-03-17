const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let currentFfmpegProcess = null; // Global variable to track the running FFmpeg process

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 400,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    resizable: false
  });
  // Remove default menus
  Menu.setApplicationMenu(null);
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handler to select a video file.
ipcMain.handle('select-video', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'mov', 'avi'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// IPC handler to select an output folder.
ipcMain.handle('select-output-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Helper: Get video duration in seconds using ffprobe.
function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ]);
    let data = '';
    ffprobe.stdout.on('data', (chunk) => { data += chunk; });
    ffprobe.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error('ffprobe error'));
      }
      resolve(parseFloat(data));
    });
  });
}

// Helper: Generate a timestamp string in format YYYYMMDD_HHmmss.
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

// IPC handler for video optimization.
ipcMain.handle('optimize-video', async (event, options) => {
  try {
    const { videoPath, crf, audioCodec, preset, scale, outputFolder, audioBitrate } = options;
    if (!videoPath?.trim()) {
      throw new Error('Invalid video path');
    }

    // Validate parameters
    if (!crf || crf < 0 || crf > 51) throw new Error('Invalid CRF value');
    if (!preset) throw new Error('Invalid preset');
    if (!audioBitrate || audioBitrate < 32 || audioBitrate > 320) throw new Error('Invalid audio bitrate');

    // Determine output folder (if not provided, use input file folder).
    const folder = outputFolder && outputFolder.trim() !== '' 
      ? outputFolder 
      : path.dirname(videoPath);

    // Build output file name: [originalName]_[timestamp].[extension]
    const originalName = path.basename(videoPath, path.extname(videoPath));
    const ext = path.extname(videoPath);
    const timestamp = getTimestamp();
    const outputPath = path.join(folder, `${originalName}_${timestamp}${ext}`);

    // Get total duration via ffprobe.
    const totalDuration = await getVideoDuration(videoPath);

    // Build FFmpeg arguments (audio bitrate appended with "k").
    const ffmpegArgs = [
      "-i", videoPath,
      "-vf", scale,
      "-c:v", "libx264",
      "-crf", crf,
      "-preset", preset,
      "-c:a", audioCodec,
      "-b:a", audioBitrate + "k",
      outputPath,
      "-progress", "pipe:1",
      "-nostats"
    ];

    console.log('Executing:', "ffmpeg", ffmpegArgs.join(' '));

    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);
      currentFfmpegProcess = ffmpeg; // Store the process globally
      let progressData = '';
      ffmpeg.stdout.on('data', (data) => {
        progressData += data.toString();
        const lines = progressData.split('\n');
        progressData = lines.pop(); // retain incomplete line
        let progressObj = {};
        lines.forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) {
            progressObj[key.trim()] = value.trim();
          }
        });
        if (progressObj.out_time_ms) {
          const outTimeSec = parseInt(progressObj.out_time_ms) / 1000000;
          let percentage = Math.min((outTimeSec / totalDuration) * 100, 100);
          event.sender.send('optimization-progress', percentage.toFixed(2));
        }
      });

      ffmpeg.stderr.on('data', (data) => {
        console.error('FFmpeg stderr:', data.toString());
      });

      ffmpeg.on('close', (code) => {
        currentFfmpegProcess = null; // Reset process variable on completion
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}`));
        } else {
          resolve(outputPath);
        }
      });
    });
  } catch (error) {
    console.error('Optimization error:', error);
    throw new Error(`Optimization failed: ${error.message}`);
  }
});

// IPC handler to stop the optimization.
ipcMain.handle('stop-optimization', async () => {
  if (currentFfmpegProcess) {
    currentFfmpegProcess.kill('SIGTERM');
    currentFfmpegProcess = null;
    return true;
  }
  return false;
});

// Function to check if FFmpeg is installed
function checkFfmpegInstalled() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version']);
    
    ffmpeg.on('error', () => {
      resolve(false);
    });
    
    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

// Add an IPC handler for the FFmpeg check
ipcMain.handle('check-ffmpeg', async () => {
  const installed = await checkFfmpegInstalled();
  return { installed };
});
