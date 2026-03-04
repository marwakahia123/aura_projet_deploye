"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PCMChunkCallback = (samples: Int16Array, sampleRate: number) => void;

interface UseAudioCaptureReturn {
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  sampleRate: number;
  volume: number;
  isActive: boolean;
  error: string | null;
  onPCMChunk: (callback: PCMChunkCallback) => void;
  requestMicAccess: () => Promise<{ stream: MediaStream; sampleRate: number }>;
  stopMic: () => void;
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [sampleRate, setSampleRate] = useState(48000);
  const [volume, setVolume] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcmCallbackRef = useRef<PCMChunkCallback | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const onPCMChunk = useCallback((callback: PCMChunkCallback) => {
    pcmCallbackRef.current = callback;
  }, []);

  const updateVolume = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const avg = sum / data.length;
    setVolume(Math.min(100, Math.round((avg / 255) * 100 * 1.5)));
    animFrameRef.current = requestAnimationFrame(updateVolume);
  }, []);

  const requestMicAccess = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(mediaStream);
      sourceRef.current = source;

      // Analyser for volume
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // AudioWorklet for PCM
      await ctx.audioWorklet.addModule("/pcmProcessor.worklet.js");
      const workletNode = new AudioWorkletNode(ctx, "pcm-processor");
      workletNode.port.onmessage = (event) => {
        if (event.data.type === "pcm" && pcmCallbackRef.current) {
          pcmCallbackRef.current(event.data.samples, event.data.sampleRate);
        }
      };
      source.connect(workletNode);
      workletNodeRef.current = workletNode;

      setStream(mediaStream);
      setAudioContext(ctx);
      setSampleRate(ctx.sampleRate);
      setIsActive(true);

      // Start volume updates
      animFrameRef.current = requestAnimationFrame(updateVolume);

      return { stream: mediaStream, sampleRate: ctx.sampleRate };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur d'accès au microphone"
      );
      throw err;
    }
  }, [updateVolume]);

  const stopMic = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    workletNodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    audioContext?.close();

    setStream(null);
    setAudioContext(null);
    setIsActive(false);
    setVolume(0);
  }, [stream, audioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return {
    stream,
    audioContext,
    sampleRate,
    volume,
    isActive,
    error,
    onPCMChunk,
    requestMicAccess,
    stopMic,
  };
}
