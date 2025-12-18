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
  // --- 1. LOCAL TRACKS (Tự tạo track tại đây) ---
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  // Hook tạo track Audio & Video
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);

  // --- 2. JOIN & PUBLISH ---
  useJoin({ appid: appId, channel: channelName, token: token || null, uid }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();

  // Ref để hiển thị video local nếu cần custom (nhưng Agora SDK mới hỗ trợ LocalUser component, tuy nhiên dùng ref như bạn cũng ok)
  const localVideoRef = useRef(null);

  useEffect(() => {
    if (localCameraTrack && cameraOn) {
      localCameraTrack.play(localVideoRef.current);
    }
    return () => {
      // Cleanup nếu cần thiết, track tự stop khi component unmount nhờ hook
      if (localCameraTrack) localCameraTrack.stop();
    };
  }, [localCameraTrack, cameraOn]);

  const toggleMic = () => {
    setMicOn(prev => !prev);
    // Lưu ý: hook useLocalMicrophoneTrack sẽ tự động mute/unmute dựa trên biến micOn truyền vào
  };

  const toggleCamera = () => {
    setCameraOn(prev => !prev);
    // Tương tự, hook useLocalCameraTrack sẽ tự xử lý enable/disable
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col h-[100dvh] w-full overflow-hidden">

      {/* --- VIDEO GRID --- */}
      <div className="flex-1 relative w-full h-full flex flex-col md:flex-row bg-gray-950">

        {/* REMOTE USER SECTION (Đối phương) */}
        <div className="relative flex-1 border-b md:border-b-0 md:border-r border-white/10 overflow-hidden">
          {remoteUsers.length > 0 ? (
            <div className="absolute inset-0 w-full h-full">
              <RemoteUser
                user={remoteUsers[0]}
                className="w-full h-full object-cover"
                style={{ width: '100%', height: '100%' }} // Style cứng để đảm bảo full
              />
              <div className="absolute bottom-4 left-4 z-20 bg-black/40 px-3 py-1 rounded-full text-sm backdrop-blur-md">
                Đối phương
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
              <div className="w-20 h-20 bg-gray-800 rounded-full animate-pulse flex items-center justify-center">
                <Video size={32} className="text-gray-600" />
              </div>
              <p className="text-gray-400 text-sm font-medium">Đang chờ đối phương...</p>
            </div>
          )}
        </div>

        {/* LOCAL USER SECTION (Bạn) */}
        <div className="relative flex-1 overflow-hidden">
          {/* Video Container */}
          <div
            ref={localVideoRef}
            className="absolute inset-0 w-full h-full"
            style={{ transform: 'rotateY(180deg)', objectFit: 'cover' }}
          />

          {/* Fallback khi tắt camera */}
          {!cameraOn && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-800 rounded-full mx-auto flex items-center justify-center mb-2">
                  <VideoOff className="text-gray-500" />
                </div>
                <p className="text-xs text-gray-500">Camera đang tắt</p>
              </div>
            </div>
          )}

          <div className="absolute bottom-4 left-4 z-20 bg-black/40 px-3 py-1 rounded-full text-sm backdrop-blur-md">
            Bạn {micOn ? '' : '(Tắt mic)'}
          </div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="h-24 md:h-28 bg-gray-900/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-center gap-6 md:gap-10 px-6 safe-area-bottom pb-safe">
        <button
          onClick={toggleMic}
          className={`p-4 md:p-5 rounded-full transition-all active:scale-90 ${micOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/20'}`}
        >
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button
          onClick={onLeave}
          className="p-5 md:p-6 rounded-full bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/30 transition-all active:scale-95"
        >
          <PhoneOff size={32} fill="currentColor" />
        </button>

        <button
          onClick={toggleCamera}
          className={`p-4 md:p-5 rounded-full transition-all active:scale-90 ${cameraOn ? 'bg-gray-800 hover:bg-gray-700' : 'bg-red-500 shadow-lg shadow-red-500/20'}`}
        >
          {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>
      </div>
    </div>
  );
};
