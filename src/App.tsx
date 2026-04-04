import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Track = {
  id: string;
  title: string;
  artist: string;
  src: string;
  cover: string;
  accent: string;
  isLocal?: boolean;
};

const demoTracks: Track[] = [
  {
    id: 'midnight-drive',
    title: 'Midnight Drive',
    artist: 'SoundHelix',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    cover: 'linear-gradient(135deg, #ff9a62 0%, #ffd36f 100%)',
    accent: '#ffb56b',
  },
  {
    id: 'city-lights',
    title: 'City Lights',
    artist: 'SoundHelix',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    cover: 'linear-gradient(135deg, #5888ff 0%, #73d7ff 100%)',
    accent: '#7fc8ff',
  },
  {
    id: 'after-hours',
    title: 'After Hours',
    artist: 'SoundHelix',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    cover: 'linear-gradient(135deg, #db6fff 0%, #7b68ff 100%)',
    accent: '#c78eff',
  },
];

const formatTime = (value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');

  return `${minutes}:${seconds}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const goToNextTrackRef = useRef<() => void>(() => {});
  const restartTrackRef = useRef<(autoplay: boolean) => Promise<void>>(async () => {});

  const [tracks, setTracks] = useState<Track[]>(demoTracks);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [isMuted, setIsMuted] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('all');
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: 32 }, (_, index) => 18 + (index % 5) * 10));

  const currentTrack = tracks[currentIndex];

  const totalTracksLabel = useMemo(() => `${tracks.length.toString().padStart(2, '0')} faixas`, [tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      if (repeatMode === 'one') {
        void restartTrackRef.current(true);
        return;
      }

      goToNextTrackRef.current();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [repeatMode]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    audio.src = currentTrack.src;
    audio.load();
    setCurrentTime(0);
    setDuration(0);

    if (isPlaying) {
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const localSources = tracks.filter((track) => track.isLocal).map((track) => track.src);

    return () => {
      localSources.forEach((src) => URL.revokeObjectURL(src));
    };
  }, [tracks]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      setBars((previous) => previous.map((_, index) => 20 + (index % 6) * 7));
      return;
    }

    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      const nextBars = Array.from({ length: 32 }, (_, index) => {
        const start = Math.floor((index / 32) * dataArray.length);
        const end = Math.max(start + 1, Math.floor(((index + 1) / 32) * dataArray.length));
        let total = 0;

        for (let pointer = start; pointer < end; pointer += 1) {
          total += dataArray[pointer];
        }

        const average = total / (end - start);
        return clamp(average / 2.8, 8, 100);
      });

      setBars(nextBars);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  const ensureAudioGraph = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!audioContextRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);

      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    await ensureAudioGraph();
    await audio.play();
    setIsPlaying(true);
  };

  const restartTrack = async (autoplay: boolean) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    setCurrentTime(0);

    if (autoplay) {
      await ensureAudioGraph();
      await audio.play();
      setIsPlaying(true);
    }
  };

  const goToTrack = (index: number) => {
    setCurrentIndex(index);
  };

  const goToNextTrack = () => {
    if (tracks.length === 0) {
      return;
    }

    if (isShuffleOn && tracks.length > 1) {
      let nextIndex = currentIndex;

      while (nextIndex === currentIndex) {
        nextIndex = Math.floor(Math.random() * tracks.length);
      }

      setCurrentIndex(nextIndex);
      return;
    }

    if (currentIndex === tracks.length - 1) {
      if (repeatMode === 'all') {
        setCurrentIndex(0);
      } else {
        setIsPlaying(false);
      }

      return;
    }

    setCurrentIndex((previous) => previous + 1);
  };

  const goToPreviousTrack = () => {
    if (currentTime > 3) {
      void restartTrack(isPlaying);
      return;
    }

    if (currentIndex === 0) {
      setCurrentIndex(tracks.length - 1);
      return;
    }

    setCurrentIndex((previous) => previous - 1);
  };

  useLayoutEffect(() => {
    goToNextTrackRef.current = goToNextTrack;
    restartTrackRef.current = restartTrack;
  });

  const handleSeek = (event: ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const nextTime = Number(event.target.value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    setIsMuted(nextVolume === 0);
  };

  const handleMute = () => {
    setIsMuted((previous) => !previous);
  };

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      return;
    }

    const nextTracks = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      title: file.name.replace(/\.[^.]+$/, ''),
      artist: 'Biblioteca local',
      src: URL.createObjectURL(file),
      cover: 'linear-gradient(135deg, #75f0b8 0%, #3ec7ff 100%)',
      accent: '#83e6c2',
      isLocal: true,
    } satisfies Track));

    setTracks((previous) => [...nextTracks, ...previous]);
    setCurrentIndex(0);
    setIsPlaying(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cycleRepeatMode = () => {
    setRepeatMode((previous) => {
      if (previous === 'off') {
        return 'all';
      }

      if (previous === 'all') {
        return 'one';
      }

      return 'off';
    });
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <main className="relative overflow-hidden px-5 py-8 text-stone-100 md:px-8 lg:min-h-screen lg:px-10 lg:py-10">
      <audio ref={audioRef} preload="metadata" />

      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/6 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(255,181,107,0.18),transparent_28%)]" />

          <div className="relative flex flex-col gap-8">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <p className="text-xs uppercase tracking-[0.45em] text-stone-300/70">GL Audio Player</p>
                <h1 className="mt-3 max-w-xl text-5xl leading-none text-stone-50 md:text-7xl" style={{ fontFamily: '"Instrument Serif", serif' }}>
                  Desktop mood, dentro do navegador.
                </h1>
              </div>

              <div className="flex items-center gap-3 rounded-full border border-white/12 bg-black/15 px-4 py-2 text-sm text-stone-200/80">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_20px_rgba(74,222,128,0.75)]" />
                {totalTracksLabel}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <div className="flex flex-col gap-5">
                <div className="relative aspect-square overflow-hidden rounded-[28px] border border-white/10 p-5">
                  <div className="absolute inset-0" style={{ background: currentTrack.cover }} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_30%),linear-gradient(180deg,transparent_0%,rgba(15,16,20,0.54)_100%)]" />
                  <div className="relative flex h-full flex-col justify-between">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.35em] text-black/55">
                      <span>Now Playing</span>
                      <span>{String(currentIndex + 1).padStart(2, '0')}</span>
                    </div>

                    <div>
                      <div className="flex h-40 items-end gap-2">
                        {bars.map((bar, index) => (
                          <span
                            key={`${currentTrack.id}-${index}`}
                            className="w-full rounded-full bg-black/70 transition-[height] duration-150 ease-out"
                            style={{ height: `${bar}%` }}
                          />
                        ))}
                      </div>

                      <div className="mt-6 text-black/80">
                        <p className="text-sm uppercase tracking-[0.35em]">{currentTrack.artist}</p>
                        <h2 className="mt-2 text-3xl font-bold">{currentTrack.title}</h2>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl border border-white/12 bg-white/8 px-4 py-4 text-left transition hover:border-white/25 hover:bg-white/12"
                  >
                    <span className="block text-xs uppercase tracking-[0.3em] text-stone-300/65">Importar</span>
                    <span className="mt-1 block text-lg font-medium">Adicionar MP3 local</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => goToTrack(0)}
                    className="rounded-2xl border border-white/12 bg-black/18 px-4 py-4 text-left transition hover:border-white/25 hover:bg-black/28"
                  >
                    <span className="block text-xs uppercase tracking-[0.3em] text-stone-300/65">Biblioteca</span>
                    <span className="mt-1 block text-lg font-medium">Voltar à seleção inicial</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-6">
                <div className="rounded-[28px] border border-white/10 bg-black/18 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-stone-300/60">Timeline</p>
                      <p className="mt-2 text-sm text-stone-300/72">Troque de faixa, ajuste o volume e navegue pela reprodução em tempo real.</p>
                    </div>

                    <div className="text-right">
                      <p className="text-3xl font-bold tabular-nums">{Math.round(progress)}%</p>
                      <p className="text-xs uppercase tracking-[0.3em] text-stone-300/50">progresso</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <input
                      type="range"
                      min="0"
                      max={duration || 0}
                      step="0.1"
                      value={Math.min(currentTime, duration || 0)}
                      onChange={handleSeek}
                      className="w-full"
                    />

                    <div className="mt-2 flex items-center justify-between text-sm text-stone-300/65">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsShuffleOn((previous) => !previous)}
                      className={`rounded-full px-4 py-2 text-sm transition ${isShuffleOn ? 'bg-amber-300 text-stone-950' : 'bg-white/8 text-stone-100 hover:bg-white/12'}`}
                    >
                      Shuffle {isShuffleOn ? 'on' : 'off'}
                    </button>

                    <button
                      type="button"
                      onClick={cycleRepeatMode}
                      className={`rounded-full px-4 py-2 text-sm transition ${repeatMode !== 'off' ? 'bg-sky-300 text-slate-950' : 'bg-white/8 text-stone-100 hover:bg-white/12'}`}
                    >
                      Repeat {repeatMode}
                    </button>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/6 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={goToPreviousTrack}
                      className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-medium transition hover:border-white/25 hover:bg-white/14"
                    >
                      Prev
                    </button>

                    <button
                      type="button"
                      onClick={() => void togglePlayback()}
                      className="rounded-full px-6 py-3 text-base font-semibold text-stone-950 transition hover:scale-[1.02]"
                      style={{ backgroundColor: currentTrack.accent }}
                    >
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>

                    <button
                      type="button"
                      onClick={goToNextTrack}
                      className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-medium transition hover:border-white/25 hover:bg-white/14"
                    >
                      Next
                    </button>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <button
                      type="button"
                      onClick={handleMute}
                      className="rounded-full border border-white/12 bg-black/20 px-4 py-2 text-sm text-stone-100 transition hover:border-white/25"
                    >
                      {isMuted ? 'Unmute' : 'Mute'}
                    </button>

                    <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolume} className="w-full" />

                    <span className="text-sm text-stone-300/65">{Math.round(volume * 100)}%</span>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-black/18 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-stone-300/60">Queue</p>
                      <h3 className="mt-2 text-2xl font-bold">Selecione a próxima faixa</h3>
                    </div>

                    <p className="text-sm text-stone-300/60">Site pronto para desktop e responsivo.</p>
                  </div>

                  <div className="mt-5 space-y-3">
                    {tracks.map((track, index) => {
                      const isActive = index === currentIndex;

                      return (
                        <button
                          key={track.id}
                          type="button"
                          onClick={() => goToTrack(index)}
                          className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition ${isActive ? 'border-white/24 bg-white/14' : 'border-white/8 bg-white/[0.03] hover:border-white/16 hover:bg-white/[0.06]'}`}
                        >
                          <div className="h-12 w-12 rounded-2xl" style={{ background: track.cover }} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-base font-medium text-stone-100">{track.title}</p>
                            <p className="truncate text-sm text-stone-300/62">{track.artist}</p>
                          </div>
                          <span className="rounded-full bg-black/25 px-3 py-1 text-xs uppercase tracking-[0.25em] text-stone-200/65">
                            {isActive ? 'Live' : String(index + 1).padStart(2, '0')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-white/10 bg-black/24 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur-xl md:p-7">
          <div className="flex h-full flex-col gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-stone-300/58">Session</p>
              <h2 className="mt-3 text-4xl leading-none" style={{ fontFamily: '"Instrument Serif", serif' }}>Um player para ouvir no browser sem cara de demo genérica.</h2>
            </div>

            <div className="grid gap-4">
              <article className="rounded-[24px] border border-white/10 bg-white/6 p-5">
                <p className="text-xs uppercase tracking-[0.35em] text-stone-300/58">Features</p>
                <ul className="mt-4 space-y-3 text-sm text-stone-200/80">
                  <li>Playlist inicial com faixas demonstrativas.</li>
                  <li>Upload local de arquivos MP3 direto do computador.</li>
                  <li>Play, pause, anterior, próxima, shuffle e repeat.</li>
                  <li>Waveform simplificado com Web Audio API.</li>
                </ul>
              </article>

              <article className="rounded-[24px] border border-white/10 bg-white/6 p-5">
                <p className="text-xs uppercase tracking-[0.35em] text-stone-300/58">Current Track</p>
                <div className="mt-4 flex items-start gap-4">
                  <div className="h-16 w-16 rounded-[20px] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]" style={{ background: currentTrack.cover }} />
                  <div>
                    <p className="text-lg font-semibold text-stone-100">{currentTrack.title}</p>
                    <p className="text-sm text-stone-300/68">{currentTrack.artist}</p>
                    <p className="mt-3 text-xs uppercase tracking-[0.35em] text-stone-300/48">
                      {isPlaying ? 'Reproduzindo agora' : 'Em espera'}
                    </p>
                  </div>
                </div>
              </article>

              <article className="rounded-[24px] border border-dashed border-white/14 bg-black/18 p-5 text-sm text-stone-300/72">
                <p className="font-medium text-stone-100">Como usar</p>
                <p className="mt-3">Clique em Play para iniciar as faixas demo ou importe seus próprios arquivos pela ação Adicionar MP3 local.</p>
              </article>
            </div>
          </div>
        </section>
      </div>

      <input ref={fileInputRef} type="file" accept="audio/mpeg,audio/mp3" multiple className="hidden" onChange={handleUpload} />
    </main>
  );
}

export default App;