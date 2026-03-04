"use client";

import { useCallback, useRef, useState } from "react";

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  play: (audioBlob: Blob) => Promise<void>;
  stop: () => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const play = useCallback(
    async (audioBlob: Blob) => {
      cleanup();

      const url = URL.createObjectURL(audioBlob);
      urlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      return new Promise<void>((resolve) => {
        audio.onended = () => {
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          resolve();
        };
        setIsPlaying(true);
        audio.play().catch(() => {
          cleanup();
          resolve();
        });
      });
    },
    [cleanup]
  );

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return { isPlaying, play, stop };
}
