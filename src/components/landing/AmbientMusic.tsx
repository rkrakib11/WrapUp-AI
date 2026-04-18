import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const AUDIO_SRC = "/relaxlanding.mp3";
const VOLUME = 0.5;

export default function AmbientMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userTouchedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [pulsing, setPulsing] = useState(true);

  useEffect(() => {
    const audio = new Audio(AUDIO_SRC);
    audio.loop = true;
    audio.volume = VOLUME;
    audio.muted = true;
    audio.preload = "auto";
    audioRef.current = audio;

    audio.play().catch(() => {});

    const activate = () => {
      if (userTouchedRef.current) return;
      audio.muted = false;
      if (audio.paused) audio.play().catch(() => {});
      setPulsing(false);
    };

    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) =>
      window.addEventListener(e, activate, { once: true, passive: true })
    );

    return () => {
      events.forEach((e) => window.removeEventListener(e, activate));
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    userTouchedRef.current = true;
    setPulsing(false);
    const next = !muted;
    setMuted(next);
    audio.muted = next;
    if (!next && audio.paused) audio.play().catch(() => {});
  };

  return (
    <div className="fixed bottom-5 left-5 z-50">
      {pulsing && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-teal-400/40 animate-ping" />
          <span
            className="pointer-events-none absolute inset-0 rounded-full bg-teal-300/30 animate-ping"
            style={{ animationDelay: "0.6s" }}
          />
        </>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggle}
        aria-label={muted ? "Unmute ambient music" : "Mute ambient music"}
        aria-pressed={!muted}
        className="relative w-11 h-11 rounded-full border border-teal-400/40 bg-teal-500/10 backdrop-blur-xl text-teal-200 flex items-center justify-center hover:border-teal-300/70 hover:bg-teal-400/20 hover:text-teal-100 transition-all duration-300 shadow-[0_0_20px_-4px_rgba(45,212,191,0.5)]"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
    </div>
  );
}
