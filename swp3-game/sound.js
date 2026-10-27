/* SWP3 Designer - WebAudio-synthesized sound (no files). Nothing plays until the first user gesture unlocks audio (iOS). */
(function (root) {
  'use strict';
  var KEY = 'swp3-game-muted', ctx = null, master = null, rainSrc = null, rainGain = null, noiseBuf = null, unlocked = false;
  var muted = false; try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
  var VOL = 0.35, vol = 0.6;
  function init() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : VOL * vol / 0.6; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() {
    if (unlocked) return; if (!init()) return;
    var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(master); s.start(0); // iOS unlock
    if (ctx.resume) ctx.resume(); unlocked = true;
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { root.addEventListener && root.addEventListener(ev, unlock, { capture: true, passive: true }); });
  function env(g, t0, a, peak, dec) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec); }
  function tone(type, f0, f1, dur, peak, delay) {
    var t0 = ctx.currentTime + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur); env(g, t0, 0.005, peak, dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, peak, ftype, freq, q, delay, attack) {
    var t0 = ctx.currentTime + (delay || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = ftype; f.frequency.value = freq; f.Q.value = q || 0.7; env(g, t0, attack || 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + attack + 0.1);
  }
  var SFX = {
    click: function () { tone('square', 1400, 900, 0.03, 0.08); },
    thunk: function () { tone('sine', 180, 55, 0.18, 0.6); noise(0.06, 0.25, 'lowpass', 900); },
    hammer: function () { tone('square', 820, 600, 0.03, 0.06); noise(0.03, 0.12, 'bandpass', 2500, 4); },
    thunder: function () { noise(2.6, 0.9, 'lowpass', 140, 0.8, 0, 0.05); noise(0.5, 0.5, 'lowpass', 600, 0.7, 0.02, 0.01); tone('sine', 60, 35, 1.6, 0.3); },
    jingle: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone('square', f, 0, 0.16, 0.12, i * 0.11); tone('triangle', f / 2, 0, 0.18, 0.12, i * 0.11); }); },
    dirt: function () { noise(0.22, 0.5, 'lowpass', 400, 0.8, 0, 0.01); tone('sine', 110, 50, 0.2, 0.4); },
    unroll: function () { noise(0.45, 0.22, 'bandpass', 1800, 0.6, 0, 0.12); },
    clank: function () { tone('triangle', 520, 470, 0.25, 0.25); tone('triangle', 1310, 1200, 0.18, 0.12); noise(0.05, 0.2, 'highpass', 3000); },
    rocks: function () { for (var i = 0; i < 5; i++) noise(0.04, 0.3, 'bandpass', 900 + i * 300, 2, i * 0.05); },
    splash: function () { noise(0.5, 0.45, 'bandpass', 700, 0.8, 0, 0.01); noise(0.25, 0.2, 'highpass', 2500, 0.7, 0.05); tone('sine', 320, 120, 0.2, 0.12); },
    anchor: function () { tone('sine', 90, 40, 0.4, 0.5); noise(0.3, 0.25, 'lowpass', 300, 0.8, 0.02); for (var i = 0; i < 4; i++) tone('square', 1800 - i * 150, 0, 0.02, 0.05, 0.1 + i * 0.06); },
    buzz: function () { tone('sawtooth', 140, 110, 0.35, 0.18); tone('sawtooth', 147, 112, 0.35, 0.12); }
  };
  function play(name) { if (!unlocked || muted || !ctx || !SFX[name]) return; try { SFX[name](); } catch (e) { /* ignore */ } }
  // Rain loop: filtered noise; level 0..~2 follows storm intensity.
  function rain(level) {
    if (!unlocked || !ctx) return;
    if (!rainSrc && level > 0) {
      rainSrc = ctx.createBufferSource(); rainSrc.buffer = noiseBuf; rainSrc.loop = true;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
      rainGain = ctx.createGain(); rainGain.gain.value = 0.0001; rainSrc.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(master); rainSrc.start();
    }
    if (!rainGain) return;
    var t = ctx.currentTime; rainGain.gain.cancelScheduledValues(t); rainGain.gain.setTargetAtTime(Math.max(0.0001, Math.min(0.5, level * 0.22)), t, 0.6);
    if (level <= 0) { var s = rainSrc; rainSrc = null; var g = rainGain; rainGain = null; setTimeout(function () { try { s.stop(); g.disconnect(); } catch (e) { /* ignore */ } }, 2500); }
  }
  function setMuted(m) { muted = !!m; try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ } if (master) master.gain.setTargetAtTime(muted ? 0 : VOL * vol / 0.6, ctx.currentTime, 0.05); }
  function setVolume(v) { vol = Math.max(0, Math.min(1, +v || 0)); if (master) master.gain.setTargetAtTime(muted ? 0 : VOL * vol / 0.6, ctx.currentTime, 0.05); }
  root.SWP3Sound = { setVolume: setVolume, play: play, rain: rain, setMuted: setMuted, isMuted: function () { return muted; }, isUnlocked: function () { return unlocked; }, state: function () { return ctx ? ctx.state : 'none'; } };
})(this);
