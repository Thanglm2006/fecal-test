import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  usePublish,
  useRemoteUsers,
  RemoteUser,
  useLocalMicrophoneTrack,
  useLocalCameraTrack
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, RotateCcw } from "lucide-react";

export const VideoRoom = ({
  appId, channelName, token, uid, onLeave
}) => {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [isLocalVideoLarge, setIsLocalVideoLarge] = useState(false); // Toggle để swap video

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);

  useJoin({ appid: appId, channel: channelName, token: token || null, uid }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // Fix Agora + Tailwind conflict:  Force styles after Agora renders
  useEffect(() => {
    if (localCameraTrack && cameraOn && localVideoRef.current) {
      localCameraTrack.play(localVideoRef.current);

      // Fix conflict: Override Agora's injected styles
      const fixAgoraStyles = () => {
        const videoElement = localVideoRef.current?.querySelector('video');
        if (videoElement) {
          videoElement.style.width = '100%';
          videoElement.style.height = '100%';
          videoElement.style.objectFit = 'cover';
          videoElement.style.transform = 'rotateY(180deg)'; // Mirror effect
        }
      };

      // Run immediately and after a short delay (Agora may inject styles async)
      fixAgoraStyles();
      const timeoutId = setTimeout(fixAgoraStyles, 100);
      const intervalId = setInterval(fixAgoraStyles, 500); // Keep checking

      return () => {
        clearTimeout(timeoutId);
        clearInterval(intervalId);
        if (localCameraTrack) localCameraTrack.stop();
      };
    }
  }, [localCameraTrack, cameraOn]);

  // Fix remote video styles
  useEffect(() => {
    const fixRemoteStyles = () => {
      document.querySelectorAll('[class*="agora"]').forEach(el => {
        const video = el.querySelector('video');
        if (video) {
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.objectFit = 'cover';
        }
      });
    };

    const intervalId = setInterval(fixRemoteStyles, 500);
    return () => clearInterval(intervalId);
  }, [remoteUsers]);

  const toggleMic = () => setMicOn(prev => !prev);
  const toggleCamera = () => setCameraOn(prev => !prev);
  const swapVideos = () => setIsLocalVideoLarge(prev => !prev);

  const hasRemoteUser = remoteUsers.length > 0;

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col h-[100dvh] w-full overflow-hidden">

      {/* --- MAIN VIDEO AREA (Messenger Style:  Full screen + PIP) --- */}
      <div className="flex-1 relative w-full h-full bg-gray-950 overflow-hidden">

        {/* LARGE VIDEO (Full Screen) */}
        <div className="absolute inset-0 w-full h-full">
          {isLocalVideoLarge || !hasRemoteUser ? (
            // Show LOCAL as large
            <>
              <div
                ref={!isLocalVideoLarge || !hasRemoteUser ? localVideoRef : null}
                className="w-full h-full bg-gray-900"
                style={{
                  position: 'absolute',
                  inset: 0,
                }}
              />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <div className="text-center">
                    <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-800 rounded-full mx-auto flex items-center justify-center mb-3">
                      <VideoOff size={40} className="text-gray-500" />
                    </div>
                    <p className="text-sm text-gray-400">Camera đang tắt</p>
                  </div>
                </div>
              )}
              {!hasRemoteUser && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                  <div className="text-center">
                    <div className="w-20 h-20 md:w-24 md:h-24 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-lg font-medium">Đang kết nối...</p>
                    <p className="text-sm text-gray-400 mt-1">Chờ đối phương tham gia</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            // Show REMOTE as large
            <div className="w-full h-full">
              <RemoteUser
                user={remoteUsers[0]}
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'absolute',
                  inset: 0,
                }}
              />
              <div className="absolute top-4 left-4 z-20 bg-black/50 px-3 py-1.5 rounded-full text-sm backdrop-blur-md flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Đang kết nối
              </div>
            </div>
          )}
        </div>

        {/* SMALL VIDEO (Picture-in-Picture - Messenger Style) */}
        {hasRemoteUser && (
          <div
            onClick={swapVideos}
            className="absolute top-4 right-4 z-30 w-28 h-40 sm:w-32 sm:h-44 md:w-40 md:h-56 
                       rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 
                       cursor-pointer hover:border-white/40 transition-all duration-200
                       hover:scale-105 active:scale-95"
          >
            {isLocalVideoLarge ? (
              // Show REMOTE as small
              <RemoteUser
                user={remoteUsers[0]}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              // Show LOCAL as small (default Messenger behavior)
              <>
                <div
                  ref={localVideoRef}
                  className="w-full h-full bg-gray-800"
                  style={{ position: 'absolute', inset: 0 }}
                />
                {!cameraOn && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                    <VideoOff size={24} className="text-gray-500" />
                  </div>
                )}
              </>
            )}

            {/* Swap indicator */}
            <div className="absolute bottom-2 right-2 bg-black/50 p-1. 5 rounded-full backdrop-blur-sm">
              <RotateCcw size={14} />
            </div>
          </div>
        )}

        {/* Call duration timer (Optional - Messenger style) */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-black/50 px-4 py-1.5 rounded-full text-sm backdrop-blur-md">
          <CallTimer />
        </div>
      </div>

      {/* --- CONTROLS (Messenger Style - Bottom floating) --- */}
      <div className="absolute bottom-0 left-0 right-0 z-40">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none"
          style={{ height: '150%', bottom: 0, top: 'auto' }} />

        <div className="relative px-6 pb-8 pt-6 md:pb-10 md: pt-8 flex items-center justify-center gap-4 md:gap-6"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>

          {/* Mute button */}
          <button
            onClick={toggleMic}
            className={`p-4 md:p-5 rounded-full transition-all duration-200 active:scale-90 
                       ${micOn
                ? 'bg-white/20 hover: bg-white/30 backdrop-blur-md'
                : 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30'}`}
            aria-label={micOn ? 'Tắt mic' : 'Bật mic'}
          >
            {micOn ? <Mic size={22} /> : <MicOff size={22} />}
          </button>

          {/* End call button */}
          <button
            onClick={onLeave}
            className="p-5 md:p-6 rounded-full bg-red-600 hover:bg-red-700 
                       shadow-xl shadow-red-600/40 transition-all duration-200 
                       active:scale-95 hover: scale-105"
            aria-label="Kết thúc cuộc gọi"
          >
            <PhoneOff size={28} fill="currentColor" />
          </button>

          {/* Camera toggle button */}
          <button
            onClick={toggleCamera}
            className={`p-4 md:p-5 rounded-full transition-all duration-200 active:scale-90 
                       ${cameraOn
                ? 'bg-white/20 hover:bg-white/30 backdrop-blur-md'
                : 'bg-red-500 hover: bg-red-600 shadow-lg shadow-red-500/30'}`}
            aria-label={cameraOn ? 'Tắt camera' : 'Bật camera'}
          >
            {cameraOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
};

// Simple call timer component
const CallTimer = () => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return <span className="font-mono">{formatTime(seconds)}</span>;
};
