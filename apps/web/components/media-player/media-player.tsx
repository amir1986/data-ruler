'use client';

import React, { useRef, useState, useEffect } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2,
} from 'lucide-react';
import { useLanguageStore } from '@/stores/language-store';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface MediaPlayerProps {
  src: string;
  type: 'audio' | 'video';
  transcript?: TranscriptSegment[];
  title?: string;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MediaPlayer({ src, type, transcript, title }: MediaPlayerProps) {
  const { t } = useLanguageStore();
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [activeSegment, setActiveSegment] = useState(-1);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const onTime = () => {
      setCurrentTime(media.currentTime);
      if (transcript) {
        const idx = transcript.findIndex(
          (seg) => media.currentTime >= seg.start && media.currentTime < seg.end
        );
        setActiveSegment(idx);
      }
    };
    const onDuration = () => setDuration(media.duration);
    const onEnded = () => setPlaying(false);

    media.addEventListener('timeupdate', onTime);
    media.addEventListener('loadedmetadata', onDuration);
    media.addEventListener('ended', onEnded);

    return () => {
      media.removeEventListener('timeupdate', onTime);
      media.removeEventListener('loadedmetadata', onDuration);
      media.removeEventListener('ended', onEnded);
    };
  }, [transcript]);

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (playing) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play();
    }
    setPlaying(!playing);
  };

  const seek = (time: number) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const skip = (seconds: number) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
  };

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      {/* Media Element */}
      {type === 'video' ? (
        <video
          ref={mediaRef}
          src={src}
          className="w-full aspect-video bg-black"
          muted={muted}
        />
      ) : (
        <div className="h-24 flex items-center justify-center bg-zinc-800/50">
          <audio ref={mediaRef} src={src} muted={muted} />
          <div className="text-zinc-500 text-sm">{title || t.media.audioFile}</div>
        </div>
      )}

      {/* Controls */}
      <div className="px-4 py-3">
        {/* Progress Bar */}
        <div
          className="w-full h-1.5 bg-zinc-800 rounded-full cursor-pointer mb-3"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seek(pct * duration);
          }}
        >
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${(currentTime / duration) * 100 || 0}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => skip(-10)} className="p-1.5 text-zinc-400 hover:text-white transition">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={togglePlay} className="p-2 bg-blue-600 rounded-full text-white hover:bg-blue-500 transition">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={() => skip(10)} className="p-1.5 text-zinc-400 hover:text-white transition">
              <SkipForward className="w-4 h-4" />
            </button>
            <button onClick={() => setMuted(!muted)} className="p-1.5 text-zinc-400 hover:text-white transition">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          <span className="text-xs text-zinc-500 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Transcript */}
      {transcript && transcript.length > 0 && (
        <div className="border-t border-zinc-800 max-h-48 overflow-y-auto">
          <div className="px-4 py-2 text-xs text-zinc-500 font-medium border-b border-zinc-800/50">
            {t.media.transcript}
          </div>
          <div className="p-3 space-y-1">
            {transcript.map((seg, i) => (
              <button
                key={i}
                onClick={() => seek(seg.start)}
                className={`block w-full text-start px-2 py-1 rounded text-xs transition ${
                  i === activeSegment
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300'
                }`}
              >
                <span className="font-mono text-zinc-600 me-2">{formatTime(seg.start)}</span>
                {seg.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
