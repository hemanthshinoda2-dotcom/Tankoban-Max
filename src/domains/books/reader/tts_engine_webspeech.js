// Books reader TTS engine: Web Speech API adapter (WAVE4)
(function () {
  'use strict';

  window.booksTTSEngines = window.booksTTSEngines || {};

  function create() {
    const synth = window.speechSynthesis || null;
    const state = {
      utterance: null,
      rate: 1.0,
      pitch: 1.0,     // TTS-F05
      voice: null,
      onBoundary: null,
      onEnd: null,
      onError: null,
    };

    function getVoices() {
      if (!synth) return [];
      try { return synth.getVoices(); } catch { return []; }
    }

    function setRate(r) {
      state.rate = Math.max(0.5, Math.min(2.0, Number(r) || 1.0));
    }

    function setVoice(voiceURI) {
      const voices = getVoices();
      state.voice = voices.find(v => v.voiceURI === voiceURI) || null;
    }

    function speak(text) {
      cancel();
      if (!synth || !text) return;

      const utt = new SpeechSynthesisUtterance(String(text));
      utt.rate = state.rate;
      utt.pitch = state.pitch;  // TTS-F05
      if (state.voice) utt.voice = state.voice;

      utt.onboundary = (ev) => {
        if (typeof state.onBoundary === 'function') {
          state.onBoundary(ev.charIndex, ev.charLength || 0, ev.name);
        }
      };

      utt.onend = () => {
        state.utterance = null;
        if (typeof state.onEnd === 'function') state.onEnd();
      };

      utt.onerror = (ev) => {
        state.utterance = null;
        if (typeof state.onError === 'function') state.onError(ev);
      };

      state.utterance = utt;
      synth.speak(utt);
    }

    function pause() { if (synth) try { synth.pause(); } catch {} }
    function resume() { if (synth) try { synth.resume(); } catch {} }
    function cancel() {
      if (synth) try { synth.cancel(); } catch {}
      state.utterance = null;
    }

    function isSpeaking() { return !!(synth && synth.speaking); }
    function isPaused() { return !!(synth && synth.paused); }
    function isAvailable() { return !!synth; }

    function setPitch(p) {
      state.pitch = Math.max(0.5, Math.min(2.0, Number(p) || 1.0));
    }

    return {
      getVoices, setRate, setVoice, setPitch,
      speak, pause, resume, cancel,
      isSpeaking, isPaused, isAvailable,
      engineId: 'webspeech',
      set onBoundary(fn) { state.onBoundary = typeof fn === 'function' ? fn : null; },
      set onEnd(fn) { state.onEnd = typeof fn === 'function' ? fn : null; },
      set onError(fn) { state.onError = typeof fn === 'function' ? fn : null; },
    };
  }

  window.booksTTSEngines.webspeech = { create };
})();
