"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ConnectionStateToast,
  DisconnectButton,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartAudio,
  TrackToggle,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { useKrispNoiseFilter } from "@livekit/components-react/krisp";
import { Track } from "livekit-client";
import EntryGate from "@/components/EntryGate";
import Chat from "@/components/Chat";
import {
  avatarColor,
  getBroadcasterKey,
  getProfile,
  saveBroadcasterKey,
  type Profile,
} from "@/lib/identity";

const ROOM_NAME = "general";

// Pins capture to a consistent 1080p regardless of the source display's
// native resolution (matters most on Safari, where capture is otherwise
// uncapped and can come in oddly sized).
const SCREEN_SHARE_CAPTURE = {
  resolution: { width: 1920, height: 1080, frameRate: 30 },
};

// The built-in ScreenSharePresets.h1080fps30 caps at 5 Mbps, which visibly
// softens text-heavy screen share. This assumes bandwidth/CPU to spare
// (small, capped audience; broadcaster opted into 1080p already).
const SCREEN_SHARE_ENCODING = {
  maxBitrate: 8_000_000,
  maxFramerate: 30,
  priority: "high" as const,
};

function useVideoDimensions(containerRef: React.RefObject<HTMLElement | null>) {
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let video: HTMLVideoElement | null = null;

    const update = () => {
      if (video && video.videoWidth && video.videoHeight) {
        setDims({ width: video.videoWidth, height: video.videoHeight });
      }
    };

    const attach = () => {
      const el = container.querySelector("video");
      if (!el || el === video) return;
      video = el as HTMLVideoElement;
      video.addEventListener("resize", update);
      video.addEventListener("loadedmetadata", update);
      update();
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      video?.removeEventListener("resize", update);
      video?.removeEventListener("loadedmetadata", update);
    };
  }, [containerRef]);

  return dims;
}

function useOutputVolume(
  containerRef: React.RefObject<HTMLElement | null>,
  volume: number,
  muted: boolean,
  ready: boolean
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const apply = () => {
      container.querySelectorAll("audio, video").forEach((el) => {
        const media = el as HTMLMediaElement;
        media.volume = volume;
        media.muted = muted;
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
    // `ready` isn't read in the body, it just forces this to re-run once
    // LiveKitRoom actually mounts and containerRef.current stops being null
    // (a ref populating doesn't retrigger effects on its own).
  }, [containerRef, volume, muted, ready]);
}

function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}) {
  const silent = muted || volume === 0;

  return (
    <div className="flex shrink-0 items-center gap-2 pl-3">
      <button
        onClick={onToggleMute}
        className="flex h-8 w-8 items-center justify-center rounded-full text-discord-text-muted hover:bg-discord-bg-secondary hover:text-discord-text-bright"
        aria-label={silent ? "Unmute" : "Mute"}
      >
        {silent ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
          </svg>
        )}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={silent ? 0 : volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="h-1 w-20 cursor-pointer accent-discord-blurple"
        aria-label="Volume"
      />
    </div>
  );
}

function Stage() {
  const tracks = useTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const dims = useVideoDimensions(containerRef);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }

  if (tracks.length === 0) {
    return (
      <div className="flex min-h-0 flex-[3] items-center justify-center px-6 text-center text-sm text-discord-text-muted md:flex-1">
        Nobody is live yet.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative min-h-0 flex-[3] bg-black md:flex-1">
      <GridLayout tracks={tracks} className="h-full">
        <ParticipantTile />
      </GridLayout>
      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2">
        {dims && (
          <span className="rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
            {dims.width}×{dims.height}
          </span>
        )}
        <button
          onClick={toggleFullscreen}
          className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M9 3H5a2 2 0 0 0-2 2v4h2V5h4V3zm10 0h-4v2h4v4h2V5a2 2 0 0 0-2-2zM5 15H3v4a2 2 0 0 0 2 2h4v-2H5v-4zm14 4h-4v2h4a2 2 0 0 0 2-2v-4h-2v4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M3 3h6v2H5v4H3V3zm12 0h6v6h-2V5h-4V3zM3 15h2v4h4v2H3v-6zm16 4v-4h2v6h-6v-2h4z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function NoiseFilterToggle() {
  const { isNoiseFilterEnabled, isNoiseFilterPending, setNoiseFilterEnabled } =
    useKrispNoiseFilter();
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // Dynamically imported: this package references browser-only Worker
    // APIs at module scope, which breaks Next.js's server-side prerender
    // if imported statically at the top of the file.
    let cancelled = false;
    import("@livekit/krisp-noise-filter").then(({ isKrispNoiseFilterSupported }) => {
      if (!cancelled) setSupported(isKrispNoiseFilterSupported());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // On by default: this just sets intent. The hook only actually attaches
  // the processor once a local microphone track exists, so this is safe
  // to call before the mic is ever turned on.
  useEffect(() => {
    if (supported) setNoiseFilterEnabled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  if (!supported) return null;

  return (
    <button
      onClick={() => setNoiseFilterEnabled(!isNoiseFilterEnabled)}
      disabled={isNoiseFilterPending}
      aria-pressed={isNoiseFilterEnabled}
      title="Noise cancellation"
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${
        isNoiseFilterEnabled
          ? "bg-discord-blurple text-white hover:bg-discord-blurple-hover"
          : "bg-discord-input text-discord-text hover:bg-discord-bg-tertiary"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z" />
      </svg>
      <span className="hidden sm:inline">Noise cancellation</span>
    </button>
  );
}

function GoLiveButton() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();

  return (
    <button
      onClick={() =>
        localParticipant.setScreenShareEnabled(!isScreenShareEnabled, SCREEN_SHARE_CAPTURE)
      }
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
        isScreenShareEnabled
          ? "bg-discord-input text-discord-text-bright hover:bg-discord-bg-tertiary"
          : "bg-discord-blurple text-white hover:bg-discord-blurple-hover"
      }`}
    >
      {isScreenShareEnabled ? (
        <>
          <span className="h-2 w-2 rounded-full bg-discord-red" /> Stop sharing
        </>
      ) : (
        "Go live"
      )}
    </button>
  );
}

function LiveBadge() {
  const tracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  if (tracks.length === 0) return null;
  return (
    <span className="flex items-center gap-1 rounded-full bg-discord-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
    </span>
  );
}

// The broadcaster's only way out: stops sharing (if live) and disconnects
// in one action, rather than a separate "Leave" that's easy to hit by
// mistake while meaning to just pause the share.
function EndStreamButton() {
  const room = useRoomContext();
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();

  async function handleEndStream() {
    if (isScreenShareEnabled) {
      await localParticipant.setScreenShareEnabled(false);
    }
    room.disconnect();
  }

  return (
    <button
      onClick={handleEndStream}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-discord-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-discord-red-hover"
    >
      End stream
    </button>
  );
}

// Viewers only, shown briefly once the screen share track that was live
// disappears, since the passive "Nobody is live yet." placeholder alone
// is easy to miss if someone isn't looking at the stage.
function StreamEndedNotice({ isBroadcaster }: { isBroadcaster: boolean }) {
  const tracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const isLive = tracks.length > 0;
  const wasLive = useRef(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (wasLive.current && !isLive && !isBroadcaster) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
    wasLive.current = isLive;
  }, [isLive, isBroadcaster]);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
      <span className="rounded-full bg-discord-bg-floating px-4 py-2 text-sm font-medium text-discord-text-bright shadow-lg">
        The stream has ended
      </span>
    </div>
  );
}

function RoomHeader({
  role,
  profile,
  copied,
  onCopyLink,
  showLiveBadge,
}: {
  role: "viewer" | "broadcaster" | null;
  profile: Profile | null;
  copied: "invite" | "broadcaster" | null;
  onCopyLink: (kind: "invite" | "broadcaster") => void;
  showLiveBadge: boolean;
}) {
  return (
    <header className="flex items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-discord-border bg-discord-bg-secondary px-3 py-3 sm:gap-3 sm:px-4">
      {role !== "broadcaster" && (
        <Link
          href="/"
          className="shrink-0 text-sm text-discord-text-muted hover:text-discord-text-bright"
        >
          &larr; Leave
        </Link>
      )}
      <span className="shrink-0 text-sm font-semibold text-discord-text-bright"># general</span>
      {showLiveBadge && <LiveBadge />}
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => onCopyLink("invite")}
          className="shrink-0 rounded-full bg-discord-input px-3 py-1 text-xs font-medium text-discord-text hover:bg-discord-bg-tertiary"
        >
          {copied === "invite" ? (
            "Copied!"
          ) : (
            <>
              <span className="sm:hidden">Invite</span>
              <span className="hidden sm:inline">Copy invite link</span>
            </>
          )}
        </button>
        {role === "broadcaster" && (
          <button
            onClick={() => onCopyLink("broadcaster")}
            className="hidden rounded-full bg-discord-input px-3 py-1 text-xs font-medium text-discord-text hover:bg-discord-bg-tertiary sm:inline-block"
          >
            {copied === "broadcaster" ? "Copied!" : "Copy broadcaster link"}
          </button>
        )}
        {profile && (
          <span
            className={`hidden h-7 w-7 items-center justify-center rounded-full text-sm sm:flex ${avatarColor(profile.avatar)}`}
          >
            {profile.avatar}
          </span>
        )}
      </div>
    </header>
  );
}

export default function RoomPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [broadcasterKey, setBroadcasterKeyState] = useState<string | null>(null);
  const [role, setRole] = useState<"viewer" | "broadcaster" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"invite" | "broadcaster" | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const roomContainerRef = useRef<HTMLDivElement>(null);
  useOutputVolume(roomContainerRef, volume, muted, Boolean(token && serverUrl));

  useEffect(() => {
    // localStorage/URL parsing isn't available during SSR, so this runs client-side.
    const existingProfile = getProfile();
    const params = new URLSearchParams(window.location.search);
    const keyFromUrl = params.get("key");
    if (keyFromUrl) {
      saveBroadcasterKey(keyFromUrl);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const key = keyFromUrl ?? getBroadcasterKey();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfile(existingProfile);
    setProfileChecked(true);
    setBroadcasterKeyState(key);
  }, []);

  useEffect(() => {
    if (!profile) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    fetch("/api/livekit-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: ROOM_NAME,
        username: profile.username,
        broadcasterKey: broadcasterKey ?? undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to get a room token.");
        }
        return res.json();
      })
      .then((data: { token: string; url: string; role: "viewer" | "broadcaster" }) => {
        setToken(data.token);
        setServerUrl(data.url);
        setRole(data.role);
      })
      .catch((err: Error) => setError(err.message));
  }, [profile, broadcasterKey]);

  function copyLink(kind: "invite" | "broadcaster") {
    const url = new URL(`${window.location.origin}/room`);
    if (kind === "broadcaster" && broadcasterKey) {
      url.searchParams.set("key", broadcasterKey);
    }
    navigator.clipboard.writeText(url.toString());
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  if (profileChecked && !profile) {
    return <EntryGate onComplete={setProfile} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {(error || !token || !serverUrl) && (
        <RoomHeader
          role={role}
          profile={profile}
          copied={copied}
          onCopyLink={copyLink}
          showLiveBadge={false}
        />
      )}

      {error && (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-discord-red">
          {error}
        </div>
      )}

      {!error && (!token || !serverUrl) && (
        <div className="flex flex-1 items-center justify-center text-sm text-discord-text-muted">
          Connecting...
        </div>
      )}

      {!error && token && serverUrl && (
        <LiveKitRoom
          ref={roomContainerRef}
          token={token}
          serverUrl={serverUrl}
          connect
          audio={false}
          video={false}
          data-lk-theme="default"
          onError={(err) =>
            setError(
              err.message.toLowerCase().includes("full")
                ? "This room is full (10 viewer limit). Try again once someone leaves."
                : err.message
            )
          }
          onDisconnected={() => router.push("/")}
          options={{
            // Off, not adaptive: with a small, capped audience we'd rather
            // spend the bandwidth than have LiveKit shrink the encode to
            // match whatever size the viewer's tile happens to render at.
            adaptiveStream: false,
            dynacast: true,
            publishDefaults: {
              screenShareEncoding: SCREEN_SHARE_ENCODING,
              videoCodec: "vp9",
            },
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <RoomHeader
            role={role}
            profile={profile}
            copied={copied}
            onCopyLink={copyLink}
            showLiveBadge={true}
          />
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <Stage />
              <StartAudio
                label="Click to enable audio"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-discord-blurple px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-discord-blurple-hover"
              />
              <StreamEndedNotice isBroadcaster={role === "broadcaster"} />
              <div className="flex flex-wrap items-center gap-2 border-t border-discord-border bg-discord-bg-tertiary p-3">
                <VolumeControl
                  volume={volume}
                  muted={muted}
                  onVolumeChange={(v) => {
                    setVolume(v);
                    setMuted(false);
                  }}
                  onToggleMute={() => setMuted((m) => !m)}
                />
                <TrackToggle source={Track.Source.Microphone} />
                <NoiseFilterToggle />
                {role === "broadcaster" ? (
                  <>
                    <TrackToggle source={Track.Source.Camera} />
                    <div className="ml-auto flex items-center gap-2">
                      <GoLiveButton />
                      <EndStreamButton />
                    </div>
                  </>
                ) : (
                  <DisconnectButton>Leave</DisconnectButton>
                )}
              </div>
            </div>
            <Chat room={ROOM_NAME} username={profile!.username} avatar={profile!.avatar} />
          </div>
          <RoomAudioRenderer />
          <ConnectionStateToast />
        </LiveKitRoom>
      )}
    </div>
  );
}
