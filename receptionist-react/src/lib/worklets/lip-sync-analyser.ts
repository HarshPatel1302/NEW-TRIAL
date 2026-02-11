/**
 * Lip Sync Analyser AudioWorklet
 * 
 * Runs in the audio thread. Extracts frequency band energy from PCM audio
 * to drive avatar morph targets (visemes) in real time.
 * 
 * Posts messages ~60fps with:
 *   volume  — RMS amplitude (0–1)
 *   lowBand — energy 0–300Hz   (jaw open, vowels)
 *   midBand — energy 300–2kHz  (tongue/lip shapes)
 *   highBand— energy 2kHz+     (sibilants: s, t, f)
 * 
 * NOTE: This string is passed to createWorketFromSrc() which wraps it in
 * registerProcessor("lip-sync-analyser", <this class>). So do NOT include
 * registerProcessor here — just export the class body.
 */

const LipSyncAnalyserWorklet = `
  class LipSyncAnalyser extends AudioWorkletProcessor {

    constructor() {
      super();
      this._frameSize = 400;
      this._buffer = new Float32Array(this._frameSize);
      this._writeIndex = 0;
    }

    process(inputs) {
      var input = inputs[0];
      if (!input || input.length === 0) return true;

      var samples = input[0];
      for (var i = 0; i < samples.length; i++) {
        this._buffer[this._writeIndex++] = samples[i];

        if (this._writeIndex >= this._frameSize) {
          this._analyze();
          this._writeIndex = 0;
        }
      }

      return true;
    }

    _analyze() {
      var N = this._buffer.length;

      // --- RMS volume ---
      var sumSq = 0;
      for (var i = 0; i < N; i++) {
        sumSq += this._buffer[i] * this._buffer[i];
      }
      var volume = Math.sqrt(sumSq / N);

      // --- Goertzel algorithm for targeted frequency bins ---
      // Band 0 (low):  ~150Hz  -> jaw open
      // Band 1 (mid):  ~800Hz  -> vowel formant F1
      // Band 2 (high): ~3000Hz -> sibilants

      var sr = sampleRate || 24000;
      var lowEnergy  = this._goertzelMag(150, sr, N);
      var midEnergy  = this._goertzelMag(800, sr, N);
      var highEnergy = this._goertzelMag(3000, sr, N);

      // Normalize energies relative to max to get 0-1 range
      var maxE = Math.max(lowEnergy, midEnergy, highEnergy, 0.001);
      var scaledVol = Math.min(1, volume * 8);
      var lowBand  = Math.min(1, (lowEnergy / maxE) * scaledVol);
      var midBand  = Math.min(1, (midEnergy / maxE) * scaledVol);
      var highBand = Math.min(1, (highEnergy / maxE) * scaledVol);

      this.port.postMessage({
        volume:   Math.min(1, volume * 5),
        lowBand:  lowBand,
        midBand:  midBand,
        highBand: highBand
      });
    }

    _goertzelMag(targetFreq, sr, N) {
      var k = Math.round(targetFreq * N / sr);
      var w = 2 * Math.PI * k / N;
      var coeff = 2 * Math.cos(w);

      var s0 = 0, s1 = 0, s2 = 0;
      for (var i = 0; i < N; i++) {
        s0 = this._buffer[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }

      return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / N;
    }
  }`;

export default LipSyncAnalyserWorklet;
