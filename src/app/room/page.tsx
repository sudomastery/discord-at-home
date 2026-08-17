"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ConnectionStateToast,
  ControlBar,
  GridLayout,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  StartAudio,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
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

function GoLiveButton() {
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();

  return (
    <button
      onClick={() =>
        localParticipant.setScreenShareEnabled(!isScreenShareEnabled, SCREEN_SHARE_CAPTURE)
      }
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
        isScreenShareEnabled
          ? "bg-discord-red hover:bg-discord-red-hover"
          : "bg-discord-blurple hover:bg-discord-blurple-hover"
      }`}
    >
      {isScreenShareEnabled ? (
        <>
          <span className="h-2 w-2 rounded-full bg-white" /> Stop
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
    <header className="flex items-center gap-2 overflow-x-auto border-b border-discord-border bg-discord-bg-secondary px-3 py-3 sm:gap-3 sm:px-4">
      <Link
        href="/"
        className="shrink-0 text-sm text-discord-text-muted hover:text-discord-text-bright"
      >
        &larr; Leave
      </Link>
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [broadcasterKey, setBroadcasterKeyState] = useState<string | null>(null);
  const [role, setRole] = useState<"viewer" | "broadcaster" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"invite" | "broadcaster" | null>(null);

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
              <div className="flex items-center gap-2 overflow-x-auto border-t border-discord-border bg-discord-bg-tertiary pl-3">
                <ControlBar
                  controls={{
                    microphone: true,
                    camera: true,
                    screenShare: false,
                    leave: true,
                    chat: false,
                    settings: false,
                  }}
                />
                {role === "broadcaster" && (
                  <div className="pr-3">
                    <GoLiveButton />
                  </div>
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
