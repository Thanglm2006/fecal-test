import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  usePublish,
  useRemoteUsers,
  RemoteUser,
  useRTCClient,
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Users, Monitor } from "lucide-react";
import AgoraRTC from "agora-rtc-sdk-ng";

export const VideoRoom = ({
  appId,
  channelName,
  token,
  uid,
  onLeave,
  localCameraTrack,
  localMicrophoneTrack,
  micOn,
  setMicOn,
  cameraOn,
  setCameraOn
}) => {
  // 1. Join Room & Publish Tracks
  useJoin({ appid: appId, channel: channelName, token, uid: uid }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);
  const client = useRTCClient();

  const [speaking, setSpeaking] = useState(new Set());
  const [isSharing, setIsSharing] = useState(false);
  const [screenTrack, setScreenTrack] = useState(null);

  // 2. Volume Indicator
  useEffect(() => {
    if (!client) return;
    client.enableAudioVolumeIndicator();
    const handleVolume = (volumes) => {
      const newSpeaking = new Set();
      volumes.forEach((v) => {
        if (v.volume > 10) newSpeaking.add(v.uid);
      });
      setSpeaking(newSpeaking);
    };
    client.on("volume-indicator", handleVolume);
    return () => client.off("volume-indicator", handleVolume);
  }, [client]);

  // 3. Play Local Video Manually
  useEffect(() => {
    if (!localCameraTrack || !localVideoRef.current) return;
    if (cameraOn) {
      localCameraTrack.play(localVideoRef.current);
    } else {
      localCameraTrack.stop();
    }
  }, [localCameraTrack, cameraOn]);

  // 4. Screen Share Logic
  const handleScreenShare = async () => {
    if (isSharing) {
      if (screenTrack) {
        await client.unpublish(screenTrack);
        screenTrack.close();
        setScreenTrack(null);
      }
      setIsSharing(false);
    } else {
      try {
        const track = await AgoraRTC.createScreenVideoTrack();
        await client.publish(track);
        setScreenTrack(track);
        setIsSharing(true);
        track.on('track-ended', () => {
          setIsSharing(false);
          setScreenTrack(null);
        });
      } catch (err) {
        console.error("Lỗi chia sẻ màn hình:", err);
      }
    }
  };

  // 5. Tính toán Layout Grid (Static Classes cho Tailwind)
  const totalUsers = 1 + remoteUsers.length;
  const getGridClass = () => {
    if (totalUsers === 1) return "grid-cols-1"; // 1 người: Full màn hình
    if (totalUsers === 2) return "grid-cols-1 md:grid-cols-2"; // 2 người: Chia đôi trên PC
    if (totalUsers <= 4) return "grid-cols-2"; // 3-4 người: Lưới 2x2
    if (totalUsers <= 6) return "grid-cols-2 md:grid-cols-3"; // 5-6 người: Lưới 3 cột
    return "grid-cols-3 md:grid-cols-4"; // >6 người: Lưới 4 cột
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#1a1b1e] text-white flex flex-col h-[100dvh] w-screen overflow-hidden">

      {/* --- HEADER --- */}
      <div className="absolute top-0 w-full z-10 p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md pointer-events-auto">
          <Users size={16} className="text-blue-400" />
          <span className="text-sm font-semibold tracking-wide">{channelName}</span>
        </div>
        <div className="md:hidden pointer-events-auto">
          <span className="text-xs bg-red-600/80 px-2 py-1 rounded text-white font-bold">
            {totalUsers} Online
          </span>
        </div>
      </div>

      {/* --- VIDEO GRID --- */}
      <div className={`flex-1 w-full h-full p-2 md:p-4 grid gap-2 md:gap-4 content-center ${getGridClass()}`}>

        {/* === LOCAL USER (YOU) === */}
        <div className={`relative w-full h-full min-h-[200px] bg-gray-800 rounded-xl overflow-hidden shadow-lg transition-all border-2 ${speaking.has(uid) ? 'border-green-500' : 'border-transparent'}`}>
          <div
            ref={localVideoRef}
            className="w-full h-full object-cover"
            style={{ transform: 'rotateY(180deg)' }} // Hiệu ứng gương
          />

          {/* Avatar khi tắt cam */}
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-700 z-10">
              <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                YOU
              </div>
            </div>
          )}

          {/* Label Tên */}
          <div className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-lg text-xs font-medium backdrop-blur-sm flex items-center gap-2 z-20">
            <span>Bạn (Me)</span>
            {!micOn && <MicOff size={14} className="text-red-500" />}
          </div>
        </div>

        {/* === REMOTE USERS === */}
        {remoteUsers.map((user) => (
          <div key={user.uid} className={`relative w-full h-full min-h-[200px] bg-gray-800 rounded-xl overflow-hidden shadow-lg border-2 transition-all ${speaking.has(user.uid) ? 'border-green-500' : 'border-transparent'}`}>
            {/* Component RemoteUser của Agora tự xử lý việc render video */}
            <RemoteUser
              user={user}
              className="w-full h-full object-cover"
              style={{ minHeight: '100%', minWidth: '100%' }} // Đảm bảo lấp đầy
            >
              {/* Fallback hiển thị khi User tắt cam (check videoTrack) */}
              {!user.videoTrack && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-700 z-10">
                  <div className="w-24 h-24 rounded-full bg-orange-600 flex items-center justify-center text-3xl font-bold text-white shadow-xl">
                    {String(user.uid).slice(-2)}
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-lg text-xs font-medium backdrop-blur-sm z-20 flex items-center gap-2 text-white">
                <span>User {user.uid}</span>
                {!user.audioTrack && <MicOff size={14} className="text-red-500" />}
              </div>
            </RemoteUser>
          </div>
        ))}
      </div>

      {/* --- FOOTER CONTROLS --- */}
      <div className="h-24 bg-[#1a1b1e] flex justify-center items-center gap-6 pb-6 safe-area-bottom z-50">
        {/* Nút Mic */}
        <button
          onClick={() => {
            localMicrophoneTrack.setEnabled(!micOn);
            setMicOn(!micOn);
          }}
          className={`p-4 rounded-full transition-all duration-200 shadow-lg ${micOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
        >
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        {/* Nút Camera */}
        <button
          onClick={() => {
            if (cameraOn) {
              localCameraTrack.setEnabled(false);
            } else {
              localCameraTrack.setEnabled(true);
            }
            setCameraOn(!cameraOn);
          }}
          className={`p-4 rounded-full transition-all duration-200 shadow-lg ${cameraOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
        >
          {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        {/* Nút Share Screen */}
        <button
          onClick={handleScreenShare}
          className={`p-4 rounded-full transition-all duration-200 shadow-lg ${isSharing ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
        >
          <Monitor size={24} />
        </button>

        {/* Nút Kết thúc */}
        <button
          onClick={onLeave}
          className="px-8 py-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xl flex items-center gap-2 font-bold transition-transform active:scale-95"
        >
          <PhoneOff size={24} />
          <span className="hidden md:inline">Kết thúc</span>
        </button>
      </div>
    </div>
  );
};
