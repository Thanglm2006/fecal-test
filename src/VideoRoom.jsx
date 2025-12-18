import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  usePublish,
  useRemoteUsers,
  RemoteUser,
  useLocalMicrophoneTrack,
  useLocalCameraTrack
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";

export const VideoRoom = ({
  appId, channelName, token, uid, onLeave
}) => {
  // --- 1. LOCAL TRACKS ---
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  // Hook tạo track Audio & Video
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);

  // --- 2. JOIN & PUBLISH ---
  useJoin({ appid: appId, channel: channelName, token: token || null, uid }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();

  // Ref để hiển thị video local
  const localVideoRef = useRef(null);

  useEffect(() => {
    if (localCameraTrack && cameraOn && localVideoRef.current) {
      localCameraTrack.play(localVideoRef.current);
    }
    return () => {
      if (localCameraTrack) {
        localCameraTrack.stop();
      }
    };
  }, [localCameraTrack, cameraOn]);

  const toggleMic = () => {
    setMicOn(prev => !prev);
  };

  const toggleCamera = () => {
    setCameraOn(prev => !prev);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col w-full overflow-hidden" style={{ height: '100dvh' }}>

      {/* --- VIDEO GRID --- */}
      <div className="flex-1 relative w-full flex flex-col md:grid md:grid-cols-2 bg-gray-950 overflow-hidden">

        {/* REMOTE USER SECTION (Đối phương) */}
        <div className="relative flex-1 md:flex-none overflow-hidden bg-gray-900">
          {remoteUsers.length > 0 ? (
            <div className="absolute inset-0 w-full h-full">
              <RemoteUser
                user={remoteUsers[0]}
                playVideo={true}
                playAudio={true}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="absolute bottom-4 left-4 z-20 bg-black/60 px-3 py-1.5 rounded-full text-xs md:text-sm backdrop-blur-md">
                Đối phương
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-800 rounded-full animate-pulse flex items-center justify-center">
                <Video size={32} className="text-gray-600" />
              </div>
              <p className="text-gray-400 text-xs md:text-sm font-medium">Đang chờ đối phương...</p>
            </div>
          )}
        </div>

        {/* LOCAL USER SECTION (Bạn) */}
        <div className="relative flex-1 md:flex-none overflow-hidden bg-gray-900">
          {/* Video Container */}
          {cameraOn && (
            <div
              ref={localVideoRef}
              className="absolute inset-0 w-full h-full"
              style={{
                transform: 'scaleX(-1)', // Mirror effect
                objectFit: 'cover'
              }}
            />
          )}

          {/* Fallback khi tắt camera */}
          {!cameraOn && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900">
              <div className="text-center">
                <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-800 rounded-full mx-auto flex items-center justify-center mb-2">
                  <VideoOff size={28} className="text-gray-500" />
                </div>
                <p className="text-xs md:text-sm text-gray-500">Camera đang tắt</p>
              </div>
            </div>
          )}

          <div className="absolute bottom-4 left-4 z-20 bg-black/60 px-3 py-1.5 rounded-full text-xs md:text-sm backdrop-blur-md">
            Bạn {!micOn && '(Tắt mic)'}
          </div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="flex-shrink-0 bg-gray-900/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-center gap-4 md:gap-8 px-4 py-4 md:py-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={toggleMic}
          className={`p-3 md:p-4 rounded-full transition-all active:scale-90 touch-manipulation ${micOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/20'}`}
          aria-label={micOn ? "Tắt micro" : "Bật micro"}
        >
          {micOn ? <Mic size={20} className="md:w-6 md:h-6" /> : <MicOff size={20} className="md:w-6 md:h-6" />}
        </button>

        <button
          onClick={onLeave}
          className="p-4 md:p-5 rounded-full bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/30 transition-all active:scale-95 touch-manipulation"
          aria-label="Kết thúc cuộc gọi"
        >
          <PhoneOff size={24} className="md:w-8 md:h-8" fill="currentColor" />
        </button>

        <button
          onClick={toggleCamera}
          className={`p-3 md:p-4 rounded-full transition-all active:scale-90 touch-manipulation ${cameraOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/20'}`}
          aria-label={cameraOn ? "Tắt camera" : "Bật camera"}
        >
          {cameraOn ? <Video size={20} className="md:w-6 md:h-6" /> : <VideoOff size={20} className="md:w-6 md:h-6" />}
        </button>
      </div>
    </div>
  );
};
