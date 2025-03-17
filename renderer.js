document.addEventListener('DOMContentLoaded', () => {
  const selectVideoButton = document.getElementById('selectVideoButton');
  const selectedVideoPathSpan = document.getElementById('selectedVideoPath');
  const selectOutputFolderButton = document.getElementById('selectOutputFolderButton');
  const selectedOutputFolderSpan = document.getElementById('selectedOutputFolder');
  const optimizeButton = document.getElementById('optimizeButton');
  const stopButton = document.getElementById('stopButton');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  const toastClose = document.getElementById('toastClose');
  const ffmpegBanner = document.getElementById('ffmpegBanner');

  let videoPath = '';
  let outputFolder = '';

  // Check for FFmpeg on startup
  window.electronAPI.checkFfmpeg()
    .then(data => {
      if (!data.installed) {
        ffmpegBanner.classList.remove('hidden');
      }
    })
    .catch(error => {
      console.error('Error checking FFmpeg:', error);
      showToast('Error checking FFmpeg installation');
    });

  // Function to show toast
  function showToast(message, isError = false) {
    toast.classList.remove('bg-green-500', 'bg-red-500');
    toast.classList.add(isError ? 'bg-red-500' : 'bg-green-500');
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 5000);
  }

  // Function to validate form inputs
  function validateForm() {
    const crf = parseInt(document.getElementById('crf').value);
    const audioBitrate = parseInt(document.getElementById('audioBitrate').value);
    
    if (!videoPath) {
      showToast('Please select a video file first.', true);
      return false;
    }
    if (isNaN(crf) || crf < 0 || crf > 51) {
      showToast('CRF value must be between 0 and 51', true);
      return false;
    }
    if (isNaN(audioBitrate) || audioBitrate < 32 || audioBitrate > 320) {
      showToast('Audio bitrate must be between 32 and 320 kbps', true);
      return false;
    }
    return true;
  }

  // Close toast when the close button is clicked
  toastClose.addEventListener('click', () => {
    toast.classList.add('hidden');
  });

  selectVideoButton.addEventListener('click', async () => {
    const result = await window.electronAPI.selectVideo();
    if (result) {
      videoPath = result;
      selectedVideoPathSpan.textContent = videoPath;
    } else {
      videoPath = '';
      selectedVideoPathSpan.textContent = 'No file selected.';
    }
  });

  selectOutputFolderButton.addEventListener('click', async () => {
    const result = await window.electronAPI.selectOutputFolder();
    if (result) {
      outputFolder = result;
      selectedOutputFolderSpan.textContent = outputFolder;
    } else {
      outputFolder = '';
      selectedOutputFolderSpan.textContent = 'Default';
    }
  });

  // Progress update handler
  window.electronAPI.onProgress((progress) => {
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
  });

  optimizeButton.addEventListener('click', async () => {
    if (!validateForm()) return;

    const options = {
      videoPath,
      crf: document.getElementById('crf').value,
      audioCodec: document.getElementById('audioCodec').value,
      audioBitrate: document.getElementById('audioBitrate').value,
      preset: document.getElementById('preset').value,
      scale: `scale=${document.getElementById('scale').value}:-2`,
      outputFolder
    };

    progressBar.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    try {
      const outputPathResult = await window.electronAPI.optimizeVideo(options);
      showToast(`Optimization complete! File saved to: ${outputPathResult}`);
    } catch (error) {
      showToast(`Error: ${error.message}`, true);
    } finally {
      setTimeout(() => {
        progressBar.classList.add('hidden');
      }, 2000);
    }
  });

  stopButton.addEventListener('click', async () => {
    const stopped = await window.electronAPI.stopOptimization();
    if (stopped) {
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
      progressBar.classList.add('hidden');
      showToast('Optimization stopped.');
    }
  });
});
