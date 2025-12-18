import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  useLocalMicrophoneTrack,
  useLocalCameraTrack,
  usePublish,
  useRemoteUsers,
  RemoteUser,
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Users, MoreVertical } from "lucide-react";

export const VideoRoom = ({ appId, channelName, token, uid, onLeave }) => {
  // 1. Join logic
  useJoin({ appid: appId, channel: channelName, token, uid: uid }, true);

  // 2. Local Tracks
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);

  // 3. Publish
  usePublish([localMicrophoneTrack, localCameraTrack]);

  // 4. Remote Users
  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // 5. Play Local Video
  useEffect(() => {
    if (!localCameraTrack || !localVideoRef.current) return;
    localCameraTrack.play(localVideoRef.current);
    return () => {
      // Cleanup handled by Agora SDK usually
    };
  }, [localCameraTrack]);

  // --- LAYOUT LOGIC ---
  // Tính toán grid dựa trên số lượng người (Local + Remote)
  const totalUsers = 1 + remoteUsers.length;

  // Class grid responsive: 
  // - 1 người: full màn hình
  // - 2 người: chia đôi (mobile: trên-dưới, desktop: trái-phải)
  // - >2 người: grid 2x2
  const getGridClass = () => {
    if (totalUsers === 1) return "grid-cols-1";
    if (totalUsers === 2) return "grid-cols-1 md:grid-cols-2";
    return "grid-cols-2";
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#202124] text-white flex flex-col h-[100dvh]">
      {/* HEADER (Giống Google Meet) */}
      <div className="flex justify-between items-center p-4 absolute top-0 w-full z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-2">
          <span className="bg-[#3c4043] p-1.5 rounded-full"><Users size={16} /></span>
          <span className="text-sm font-medium tracking-wide">{channelName}</span>
        </div>
        <div className="md:hidden">
          {/* Mobile Title */}
          <span className="text-xs text-gray-300">{remoteUsers.length > 0 ? "Đang gọi..." : "Đang chờ..."}</span>
        </div>
      </div>

      {/* MAIN VIDEO GRID */}
      <div className={`flex-1 p-2 md:p-4 grid gap-2 md:gap-4 items-center justify-center content-center ${getGridClass()}`}>

        {/* Local User (YOU) */}
        <div className="relative w-full h-full min-h-[200px] md:min-h-[300px] bg-[#3c4043] rounded-2xl overflow-hidden shadow-lg border border-transparent hover:border-blue-500 transition-all group">
          <div ref={localVideoRef} className={`w-full h-full object-cover ${!cameraOn ? 'hidden' : ''} scale-x-[-1]`} /> {/* Mirror effect */}

          {/* Avatar khi tắt cam */}
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                YOU
              </div>
            </div>
          )}

          {/* Name Tag */}
          <div className="absolute bottom-3 left-3 bg-black/40 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm flex items-center gap-1">
            Bạn
            {!micOn && <MicOff size={12} className="text-red-500" />}
          </div>

          {/* Icon giữa màn hình khi user đang nói (Visual effect - giả lập) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="text-white drop-shadow-md" />
          </div>
        </div>

        {/* Remote Users */}
        {remoteUsers.map((user) => (
          <div key={user.uid} className="relative w-full h-full min-h-[200px] md:min-h-[300px] bg-[#3c4043] rounded-2xl overflow-hidden shadow-lg">
            <RemoteUser user={user} className="w-full h-full object-cover" />

            {/* Name Tag */}
            <div className="absolute bottom-3 left-3 bg-black/40 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm">
              User {user.uid}
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER CONTROL BAR (Chuẩn Google Meet) */}
      <div className="h-20 bg-[#202124] flex justify-center items-center gap-4 md:gap-6 pb-4 md:pb-0 safe-area-bottom">

        {/* Mic Toggle */}
        <button
          onClick={() => setMicOn(!micOn)}
          className={`p-3 md:p-4 rounded-full border border-gray-600 transition-all duration-200 ${micOn
              ? 'bg-[#3c4043] hover:bg-[#474a4d] text-white'
              : 'bg-[#ea4335] border-transparent text-white'
            }`}
          title={micOn ? "Tắt mic" : "Bật mic"}
        >
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Camera Toggle */}
        <button
          onClick={() => setCameraOn(!cameraOn)}
          className={`p-3 md:p-4 rounded-full border border-gray-600 transition-all duration-200 ${cameraOn
              ? 'bg-[#3c4043] hover:bg-[#474a4d] text-white'
              : 'bg-[#ea4335] border-transparent text-white'
            }`}
          title={cameraOn ? "Tắt camera" : "Bật camera"}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* End Call (Pill Shape on Desktop) */}
        <button
          onClick={onLeave}
          className="px-6 md:px-8 py-3 md:py-0 h-12 md:h-14 rounded-full bg-[#ea4335] hover:bg-[#d93025] text-white shadow-lg flex items-center gap-2 transition-transform active:scale-95"
          title="Kết thúc cuộc gọi"
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};
