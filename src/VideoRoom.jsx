import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  usePublish,
  useRemoteUsers,
  RemoteUser,
  useRTCClient,
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, Users } from "lucide-react";
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
  useJoin({ appid: appId, channel: channelName, token, uid: uid }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);
  const client = useRTCClient();
  const [isSharing, setIsSharing] = useState(false);

  // Play Local Video
  useEffect(() => {
    if (!localCameraTrack || !localVideoRef.current) return;
    if (cameraOn) {
      localCameraTrack.play(localVideoRef.current);
    } else {
      localCameraTrack.stop();
    }
  }, [localCameraTrack, cameraOn]);

  // Screen Share
  const handleScreenShare = async () => {
    // Logic share screen giữ nguyên...
    // (Giản lược đoạn này để tập trung vào Layout, bạn có thể copy lại logic cũ nếu cần)
  };

  const totalUsers = 1 + remoteUsers.length;

  // --- LOGIC LAYOUT MỚI (CHẮC CHẮN HIỆN) ---
  const renderLayout = () => {
    // CASE 1: CHỈ CÓ MÌNH (Đang chờ) - Full màn hình
    if (remoteUsers.length === 0) {
      return (
        <div className="w-full h-full relative">
          <LocalVideoView
            videoRef={localVideoRef}
            cameraOn={cameraOn}
            isFull={true}
            micOn={micOn}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-full text-white font-medium animate-pulse">
              Đang chờ người khác tham gia...
            </div>
          </div>
        </div>
      );
    }

    // CASE 2: GỌI 1-1 (Giống Messenger) - Chia đôi màn hình
    if (remoteUsers.length === 1) {
      return (
        <div className="flex flex-col md:flex-row w-full h-full bg-black">
          {/* Remote User (Người bên kia) - Ưu tiên hiển thị to */}
          <div className="flex-1 relative border-b md:border-b-0 md:border-r border-gray-800 overflow-hidden">
            <RemoteUser
              user={remoteUsers[0]}
              style={{ width: '100%', height: '100%' }}
              className="w-full h-full object-cover"
            >
              <FallbackAvatar uid={remoteUsers[0].uid} />
            </RemoteUser>
            <UserInfoLabel uid={remoteUsers[0].uid} isRemote={true} />
          </div>

          {/* Local User (Mình) */}
          <div className="flex-1 relative overflow-hidden">
            <LocalVideoView videoRef={localVideoRef} cameraOn={cameraOn} micOn={micOn} />
          </div>
        </div>
      );
    }

    // CASE 3: GỌI NHÓM (>2 người) - Grid
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1 p-1 w-full h-full bg-black auto-rows-fr">
        {/* Render Mình */}
        <div className="relative bg-gray-900 rounded-lg overflow-hidden">
          <LocalVideoView videoRef={localVideoRef} cameraOn={cameraOn} micOn={micOn} />
        </div>
        {/* Render Others */}
        {remoteUsers.map(user => (
          <div key={user.uid} className="relative bg-gray-900 rounded-lg overflow-hidden">
            <RemoteUser
              user={user}
              style={{ width: '100%', height: '100%' }}
              className="w-full h-full object-cover"
            >
              <FallbackAvatar uid={user.uid} />
            </RemoteUser>
            <UserInfoLabel uid={user.uid} isRemote={true} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col h-[100dvh] w-screen overflow-hidden">
      {/* HEADER */}
      <div className="absolute top-0 w-full z-20 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none flex justify-between">
        <div className="bg-black/20 backdrop-blur px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
          <Users size={14} /> <span className="text-xs font-bold">{channelName}</span>
        </div>
      </div>

      {/* VIDEO CONTAINER */}
      <div className="flex-1 w-full relative overflow-hidden bg-[#121212]">
        {renderLayout()}
      </div>

      {/* CONTROLS */}
      <div className="h-20 bg-black/90 backdrop-blur flex justify-center items-center gap-6 safe-area-bottom z-30 border-t border-white/10">
        <ControlButton
          isOn={micOn}
          onClick={() => { localMicrophoneTrack.setEnabled(!micOn); setMicOn(!micOn); }}
          onIcon={<Mic />} offIcon={<MicOff />}
          type="normal"
        />
        <ControlButton
          isOn={cameraOn}
          onClick={() => {
            if (cameraOn) { localCameraTrack.setEnabled(false); }
            else { localCameraTrack.setEnabled(true); }
            setCameraOn(!cameraOn);
          }}
          onIcon={<Video />} offIcon={<VideoOff />}
          type="normal"
        />
        <button onClick={onLeave} className="p-4 rounded-full bg-red-600 active:bg-red-700 shadow-lg transform transition active:scale-95">
          <PhoneOff size={28} fill="white" />
        </button>
      </div>
    </div>
  );
};

// --- SUB COMPONENTS (Tách ra để code gọn, dễ debug) ---

const LocalVideoView = ({ videoRef, cameraOn, isFull, micOn }) => (
  <div className="w-full h-full bg-gray-800 relative group">
    <div
      ref={videoRef}
      className="w-full h-full object-cover"
      style={{ transform: 'rotateY(180deg)' }}
    />
    {!cameraOn && (
      <div className="absolute inset-0 flex items-center justify-center bg-[#2C2C2C]">
        <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-xl font-bold border-4 border-[#1f1f1f]">YOU</div>
      </div>
    )}
    <div className="absolute bottom-3 right-3 bg-black/60 px-2 py-1 rounded text-xs font-bold backdrop-blur-sm flex items-center gap-2">
      YOU {!micOn && <MicOff size={12} className="text-red-500" />}
    </div>
  </div>
);

const UserInfoLabel = ({ uid, isRemote }) => (
  <div className="absolute bottom-3 left-3 bg-black/50 px-2 py-1 rounded text-xs text-white/90 font-medium backdrop-blur-sm z-10">
    {isRemote ? `User ${uid}` : 'Bạn'}
  </div>
);

const FallbackAvatar = ({ uid }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-[#2C2C2C] z-[1]">
    <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold border-4 border-[#1f1f1f]">
      {String(uid).slice(-2)}
    </div>
  </div>
);

const ControlButton = ({ isOn, onClick, onIcon, offIcon }) => (
  <button
    onClick={onClick}
    className={`p-3 rounded-full transition-all duration-200 ${isOn ? 'bg-[#333] hover:bg-[#444] text-white' : 'bg-white text-black'}`}
  >
    {isOn ? React.cloneElement(onIcon, { size: 24 }) : React.cloneElement(offIcon, { size: 24 })}
  </button>
);
