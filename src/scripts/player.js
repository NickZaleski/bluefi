/**
 * Custom audio player wiring.
 *
 * Drives a hidden <audio> element from custom controls: play/pause, seek,
 * volume, and m:ss time display. Keyboard accessible. No external deps.
 */

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function initPlayer(root) {
  const audio = root.querySelector('[data-audio]');
  const playBtn = root.querySelector('[data-play]');
  const seek = root.querySelector('[data-seek]');
  const volume = root.querySelector('[data-volume]');
  const curEl = root.querySelector('[data-current]');
  const durEl = root.querySelector('[data-duration]');

  if (!audio || !playBtn || !seek || !volume || !curEl || !durEl) return;

  let seeking = false;

  // --- helpers ---------------------------------------------------------------
  function setProgressFill(input) {
    // Paint the "filled" portion of a range input via a CSS custom prop.
    // The thumb center travels within [r, width - r] (r = thumb radius), so a
    // naive 0..100% track fill drifts away from the thumb. We express fill as a
    // calc() that keeps the color stop exactly under the thumb center.
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const val = Number(input.value);
    const pct = max > min ? Math.min(1, Math.max(0, (val - min) / (max - min))) : 0;
    input.style.setProperty(
      '--fill',
      `calc(${pct} * (100% - var(--thumb, 15px)) + (var(--thumb, 15px) / 2))`
    );
  }

  function syncDuration() {
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) {
      seek.max = String(d);
      durEl.textContent = formatTime(d);
      setProgressFill(seek);
    }
  }

  function reflectPlayState() {
    const playing = !audio.paused && !audio.ended;
    root.classList.toggle('is-playing', playing);
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function togglePlay() {
    if (audio.paused) {
      audio.play().catch((err) => console.warn('Playback blocked:', err));
    } else {
      audio.pause();
    }
  }

  // --- audio events ----------------------------------------------------------
  // MP3s without an accurate header (e.g. CBR ADTS streams) can report an
  // estimated duration at loadedmetadata and correct it later, so re-sync on
  // durationchange too. Guards against Infinity/NaN estimates.
  audio.addEventListener('loadedmetadata', syncDuration);
  audio.addEventListener('durationchange', syncDuration);

  audio.addEventListener('timeupdate', () => {
    if (!seeking) {
      seek.value = String(audio.currentTime);
      setProgressFill(seek);
    }
    curEl.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener('play', reflectPlayState);
  audio.addEventListener('pause', reflectPlayState);
  audio.addEventListener('ended', reflectPlayState);

  // --- control events --------------------------------------------------------
  playBtn.addEventListener('click', togglePlay);

  seek.addEventListener('input', () => {
    seeking = true;
    curEl.textContent = formatTime(Number(seek.value));
    setProgressFill(seek);
  });
  seek.addEventListener('change', () => {
    audio.currentTime = Number(seek.value);
    seeking = false;
  });

  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value);
    setProgressFill(volume);
  });

  // Initialize volume from the control's default value.
  audio.volume = Number(volume.value);
  setProgressFill(volume);
  setProgressFill(seek);
  reflectPlayState();

  // Metadata may already be available by the time this script runs (the
  // loadedmetadata/durationchange events would have fired before we attached
  // listeners), so sync the duration now if we can.
  if (audio.readyState >= 1) syncDuration();

  // --- keyboard --------------------------------------------------------------
  // Space toggles play/pause when focus isn't on a control that uses space.
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const onControl = tag === 'INPUT' || tag === 'BUTTON' || tag === 'A';
    if (e.code === 'Space' && !onControl) {
      e.preventDefault();
      togglePlay();
    }
  });
}
