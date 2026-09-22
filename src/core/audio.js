// Synthesized audio. Nothing is loaded from disk: every sound is built from
// oscillators and noise buffers, so the game stays a single static bundle.
//
// Every entry point is failure-proof. A blocked or suspended AudioContext, or
// a browser with no WebAudio at all, degrades to silence rather than throwing.

// --- Tuning constants ---------------------------------------------------
const MASTER_GAIN = 0.5;
const NOISE_SECONDS = 0.4; // shared noise buffer length

// Ambience: a merengue-flavoured loop. Everything is scheduled on a 16th-note
// grid with a lookahead, which is the standard WebAudio way to keep a loop
// steady without running the game loop at audio rate.
const BPM = 138;
const STEP = 60 / BPM / 4;
const PATTERN = 16;
const LOOKAHEAD = 0.25; // seconds of notes queued in advance
const SCHEDULER_MS = 60;
const GUITAR_STEPS = [0, 3, 6, 8, 11, 14]; // tambora accents
const BASS_STEPS = [0, 6, 8, 14];
const ROOM_TONE_GAIN = 0.028;
// -------------------------------------------------------------------------

/**
 * Build the audio surface.
 * @returns {object} Audio exposing one-shot effects, `setVolume`, `enabled` and
 *   `unlock`.
 */
export function createAudio() {
  let ac = null;
  let master = null;
  let noise = null;
  let volume = MASTER_GAIN;
  let muted = false;

  let ambienceTimer = null;
  let ambienceGain = null;
  let roomSource = null;
  let nextStepTime = 0;
  let step = 0;
  let bar = 0; // bars since the ambience started; the phrase is four bars

  const ensure = () => {
    if (ac) return ac;
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ac = new Ctor();
    } catch {
      ac = null;
      return null;
    }
    master = ac.createGain();
    master.gain.value = volume;
    master.connect(ac.destination);

    const frames = Math.floor(ac.sampleRate * NOISE_SECONDS);
    noise = ac.createBuffer(1, frames, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    return ac;
  };

  const ready = () => {
    const context = ensure();
    if (!context || muted) return null;
    if (context.state === 'suspended') context.resume?.();
    return context;
  };

  // A short burst of filtered noise: the body of every tile sound.
  const burst = (freq, q, seconds, gain, type = 'bandpass') => {
    const context = ready();
    if (!context) return;
    const src = context.createBufferSource();
    src.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = context.createGain();
    const now = context.currentTime;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    src.connect(filter).connect(env).connect(master);
    src.start(now);
    src.stop(now + seconds + 0.02);
  };

  // A pitched blip, used for UI confirmation and turn cues.
  const tone = (freq, seconds, gain, type = 'triangle') => {
    const context = ready();
    if (!context) return;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const env = context.createGain();
    const now = context.currentTime;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(env).connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.02);
  };

  // --- Ambience voices, all scheduled at an absolute context time ---------

  /** Güira: the metal scraper that drives merengue. */
  const guira = (at, accent, scale = 1) => {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const env = ac.createGain();
    const peak = (accent ? 0.06 : 0.03) * scale;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
    src.connect(hp).connect(env).connect(ambienceGain);
    src.start(at);
    src.stop(at + 0.07);
  };

  /** Tambora: a drum with a fast pitch drop. */
  const tambora = (at, pitch, gain) => {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    // Humanize: a real player is never metronomic in pitch either.
    const p = pitch * (0.97 + Math.random() * 0.06);
    osc.frequency.setValueAtTime(p, at);
    osc.frequency.exponentialRampToValueAtTime(p * 0.55, at + 0.09);
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    osc.connect(env).connect(ambienceGain);
    osc.start(at);
    osc.stop(at + 0.17);
  };

  /** The two-note bass figure underneath. */
  const bass = (at, freq) => {
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    const env = ac.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.075, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.20);
    osc.connect(lp).connect(env).connect(ambienceGain);
    osc.start(at);
    osc.stop(at + 0.22);
  };

  /**
   * One 16th of the loop. The groove is fixed; the phrase around it is not:
   * ghost scrapes fall off-grid, the fourth bar of every phrase gets a tambora
   * fill and drops its offbeat bass for a breath before the pickup. Without
   * that the four bars wear thin over a long match.
   */
  const scheduleStep = (index, at) => {
    const lastBar = bar % 4 === 3;

    guira(at, index % 4 === 0);
    if (index % 2 === 1 && Math.random() < 0.16) guira(at + STEP * 0.5, false, 0.5);

    if (GUITAR_STEPS.includes(index)) {
      tambora(at, index === 0 || index === 8 ? 190 : 150, index === 0 || index === 8 ? 0.22 : 0.14);
    } else if (lastBar && index >= 12 && index % 2 === 0 && Math.random() < 0.75) {
      tambora(at, 168, 0.12); // end-of-phrase fill
    }

    if (BASS_STEPS.includes(index)) {
      if (lastBar && index === 14) return; // the breath before the pickup
      bass(at, index === 0 || index === 8 ? 87.3 : 116.5);
    } else if (lastBar && index === 15) {
      bass(at, 146.8); // pickup into the next phrase
    }
  };

  const scheduler = () => {
    if (!ac || !ambienceGain) return;
    while (nextStepTime < ac.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextStepTime);
      nextStepTime += STEP;
      step = (step + 1) % PATTERN;
      if (step === 0) bar += 1;
    }
  };

  return {
    get enabled() {
      return Boolean(ac) && !muted;
    },
    get ambienceOn() {
      return ambienceTimer !== null;
    },
    /** AudioContext state, for the debug overlay. */
    get state() {
      return ac ? ac.state : 'none';
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      muted = volume === 0;
      if (master) master.gain.value = volume;
    },
    /** Call from a real user gesture; browsers require one before playback. */
    unlock() {
      const context = ensure();
      if (context?.state === 'suspended') context.resume?.();
    },
    /** Bone on plastic: the signature sound of the game. */
    clack(strength = 1) {
      burst(2100, 1.1, 0.09, 0.5 * strength);
      burst(420, 2.0, 0.13, 0.3 * strength, 'lowpass');
    },
    /** Tiles rattling together in a hand or a shuffled pile. */
    shuffle(intensity = 1) {
      const context = ready();
      if (!context) return;
      const hits = 5 + Math.floor(intensity * 3);
      for (let i = 0; i < hits; i += 1) {
        const delay = context.currentTime + i * (0.028 + Math.random() * 0.03);
        const freq = 1800 + Math.random() * 1400;
        const gain = 0.14 * intensity;
        const src = context.createBufferSource();
        src.buffer = noise;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        const env = context.createGain();
        env.gain.setValueAtTime(0, delay);
        env.gain.linearRampToValueAtTime(gain, delay + 0.003);
        env.gain.exponentialRampToValueAtTime(0.0001, delay + 0.06);
        src.connect(filter).connect(env).connect(master);
        src.start(delay);
        src.stop(delay + 0.08);
      }
    },
    /** A tile set down flat on the table. */
    thud() {
      burst(180, 1.6, 0.14, 0.36, 'lowpass');
    },
    /** A knuckle on the table: passing, or a seña. */
    knock() {
      burst(320, 3.0, 0.06, 0.34, 'bandpass');
    },
    /** Your turn. */
    blip(freq = 660) {
      tone(freq, 0.09, 0.16);
    },
    /** A hand won. */
    knell() {
      tone(523.25, 0.5, 0.16);
      tone(784, 0.42, 0.1);
    },
    /** The shop: a merengue loop with room tone underneath. */
    startAmbience() {
      const context = ready();
      if (!context || ambienceTimer !== null) return false;

      ambienceGain = context.createGain();
      ambienceGain.gain.value = 0.9;
      ambienceGain.connect(master);

      // Room tone: a quiet, heavily filtered noise bed so silence between
      // notes is never actually silent.
      roomSource = context.createBufferSource();
      roomSource.buffer = noise;
      roomSource.loop = true;
      const lp = context.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const roomGain = context.createGain();
      roomGain.gain.value = ROOM_TONE_GAIN;
      roomSource.connect(lp).connect(roomGain).connect(master);
      roomSource.start();

      step = 0;
      bar = 0;
      nextStepTime = context.currentTime + 0.08;
      ambienceTimer = setInterval(scheduler, SCHEDULER_MS);
      return true;
    },
    stopAmbience() {
      if (ambienceTimer !== null) {
        clearInterval(ambienceTimer);
        ambienceTimer = null;
      }
      try {
        roomSource?.stop();
      } catch {
        // already stopped
      }
      roomSource = null;
      ambienceGain = null;
    },
    dispose() {
      this.stopAmbience();
      ac?.close?.();
      ac = null;
      master = null;
      noise = null;
    },
  };
}

