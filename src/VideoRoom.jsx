import React, { useEffect, useRef, useState } from "react";
import { useJoin, usePublish, useRemoteUsers, RemoteUser } from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";

export const VideoRoom = ({
  appId, channelName, token, uid, onLeave,
  localCameraTrack, localMicrophoneTrack,
  micOn, setMicOn, cameraOn, setCameraOn
}) => {
  // 1. Join and Publish
  // Ensure uid is cast to Number to avoid type mismatches
  useJoin({ appid: appId, channel: channelName, token: token || null, uid: Number(uid) }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // Debugging state to help you see what's happening
  const [debugInfo, setDebugInfo] = useState("Connecting...");

  useEffect(() => {
    setDebugInfo(`Room: ${channelName} | Users: ${remoteUsers.length}`);
  }, [channelName, remoteUsers]);

  // Handle Local Video Playback
  useEffect(() => {
    if (localCameraTrack && localVideoRef.current && cameraOn) {
      localCameraTrack.play(localVideoRef.current);
    }
    return () => {
      if (localCameraTrack) localCameraTrack.stop();
    };
  }, [localCameraTrack, cameraOn]);

  const toggleMic = async () => {
    if (localMicrophoneTrack) {
      await localMicrophoneTrack.setEnabled(!micOn);
      setMicOn(!micOn);
    }
  };

  const toggleCamera = async () => {
    if (localCameraTrack) {
      await localCameraTrack.setEnabled(!cameraOn);
      setCameraOn(!cameraOn);
      // Re-play video if turning back on
      if (!cameraOn && localVideoRef.current) {
        localCameraTrack.play(localVideoRef.current);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col h-[100dvh] w-screen overflow-hidden">
      {/* NUCLEAR CSS FIX: 
         Agora injects a video element that often ignores parent bounds.
         This style tag forces the video to cover the div perfectly.
      */}
      <style>{`
        .agora_video_player {
          object-fit: cover !important;
        }
      `}</style>

      {/* --- DEBUG BAR (Remove in production if needed) --- */}
      <div className="absolute top-0 left-0 w-full bg-black/50 text-white text-[10px] p-1 z-50 text-center pointer-events-none">
        {debugInfo}
      </div>

      {/* --- VIDEO GRID --- */}
      {/* Mobile: 2 Rows (Remote Top, Local Bottom) | Desktop: 2 Cols (Left/Right) */}
      <div className="flex-1 grid grid-rows-2 md:grid-rows-1 md:grid-cols-2 w-full h-full relative">

        {/* 1. REMOTE USER (Top on Mobile, Left on Desktop) */}
        <div className="relative w-full h-full bg-gray-900 border-b md:border-b-0 md:border-r border-gray-800 overflow-hidden group">
          {remoteUsers.length > 0 ? (
            <div className="w-full h-full relative">
              {/* RemoteUser component must be wrapped in a full width/height container */}
              <RemoteUser
                user={remoteUsers[0]}
                style={{ width: '100%', height: '100%' }}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-4 left-4 z-10 bg-black/60 backdrop-blur text-white px-3 py-1 rounded-full text-sm font-medium">
                Remote User ({remoteUsers[0].uid})
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full text-gray-500 space-y-4">
              <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center animate-pulse">
                <Video size={32} />
              </div>
              <p className="text-sm">Waiting for other user...</p>
            </div>
          )}
        </div>

        {/* 2. LOCAL USER (Bottom on Mobile, Right on Desktop) */}
        <div className="relative w-full h-full bg-black overflow-hidden">
          {/* We use a div ref for local video */}
          <div
            ref={localVideoRef}
            className="w-full h-full object-cover"
            style={{ transform: 'rotateY(180deg)' }}
          />

          {/* Camera Off Overlay */}
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-2">
                  <VideoOff className="text-gray-400" />
                </div>
                <p className="text-gray-400 text-sm">Camera Off</p>
              </div>
            </div>
          )}

          <div className="absolute bottom-4 left-4 z-10 bg-black/60 backdrop-blur text-white px-3 py-1 rounded-full text-sm font-medium">
            You {micOn ? '' : '(Muted)'}
          </div>
        </div>
      </div>

      {/* --- CONTROLS FOOTER --- */}
      {/* Uses pb-[env(safe-area-inset-bottom)] for iPhone Home Bar */}
      <div className="shrink-0 bg-gray-900 border-t border-gray-800 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-center gap-8 py-6">
          <button
            onClick={toggleMic}
            className={`p-4 rounded-full transition-all active:scale-95 ${micOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-500 text-white shadow-lg shadow-red-500/30'}`}
          >
            {micOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          <button
            onClick={onLeave}
            className="p-5 rounded-full bg-red-600 text-white shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all active:scale-95 mx-2"
          >
            <PhoneOff size={32} />
          </button>

          <button
            onClick={toggleCamera}
            className={`p-4 rounded-full transition-all active:scale-95 ${cameraOn ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-500 text-white shadow-lg shadow-red-500/30'}`}
          >
            {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
};
