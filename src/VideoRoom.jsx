import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  usePublish,
  useRemoteUsers,
  RemoteUser,
  useRTCClient,
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";

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
  // 1. Kết nối Agora
  useJoin({ appid: appId, channel: channelName, token, uid: uid }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // 2. Play video của chính mình (Local)
  useEffect(() => {
    if (!localCameraTrack || !localVideoRef.current) return;
    if (cameraOn) {
      localCameraTrack.play(localVideoRef.current);
    } else {
      localCameraTrack.stop();
    }
  }, [localCameraTrack, cameraOn]);

  // 3. Xử lý giao diện (Hard-code Layout)
  const totalUsers = remoteUsers.length + 1;

  // Render Video của mình
  const renderLocalVideo = () => (
    <div className="w-full h-full relative bg-gray-900 border border-gray-800">
      <div
        ref={localVideoRef}
        className="w-full h-full object-cover"
        style={{ transform: 'rotateY(180deg)' }} // Soi gương
      />
      {/* Tên hiển thị góc dưới */}
      <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
        BẠN {micOn ? '' : '(Tắt mic)'}
      </div>
      {/* Màn hình đen khi tắt cam */}
      {!cameraOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-white font-bold">
          CAMERA OFF
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col h-[100dvh] w-screen overflow-hidden">

      {/* --- KHU VỰC VIDEO (Chia layout cứng) --- */}
      <div className="flex-1 w-full h-full relative overflow-hidden">

        {/* TRƯỜNG HỢP 1: ĐANG CHỜ (Chưa có ai vào) -> Full màn hình */}
        {remoteUsers.length === 0 && (
          <div className="w-full h-full">
            {renderLocalVideo()}
            <div className="absolute top-10 left-0 w-full text-center">
              <span className="bg-black/60 px-4 py-2 rounded-full text-sm animate-pulse">
                Đang đợi người khác tham gia...
              </span>
            </div>
          </div>
        )}

        {/* TRƯỜNG HỢP 2: GỌI 1-1 (Messenger Style) -> Chia đôi */}
        {remoteUsers.length >= 1 && (
          <div className="flex flex-col md:flex-row w-full h-full">

            {/* Người khác (Remote) - Mobile: Trên / PC: Trái */}
            <div className="flex-1 w-full h-1/2 md:h-full md:w-1/2 bg-gray-800 relative border-b md:border-b-0 md:border-r border-gray-700">
              {/* LƯU Ý QUAN TRỌNG: Container RemoteUser bắt buộc phải có width/height 100% */}
              <RemoteUser
                user={remoteUsers[0]}
                className="w-full h-full object-cover"
                style={{ width: '100%', height: '100%' }}
              >
                {/* Fallback khi họ tắt cam */}
                {!remoteUsers[0].videoTrack && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-400 font-bold">
                    USER {remoteUsers[0].uid} (OFF CAM)
                  </div>
                )}
              </RemoteUser>
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded z-10">
                User {remoteUsers[0].uid}
              </div>
            </div>

            {/* Mình (Local) - Mobile: Dưới / PC: Phải */}
            <div className="flex-1 w-full h-1/2 md:h-full md:w-1/2 bg-gray-900 relative">
              {renderLocalVideo()}
            </div>
          </div>
        )}
      </div>

      {/* --- THANH ĐIỀU KHIỂN (Luôn nằm đáy) --- */}
      <div className="h-20 shrink-0 bg-[#1e1e1e] flex justify-center items-center gap-8 safe-area-bottom shadow-lg border-t border-gray-700">
        <button
          onClick={() => { localMicrophoneTrack.setEnabled(!micOn); setMicOn(!micOn); }}
          className={`p-4 rounded-full ${micOn ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-500'} text-white transition-all`}
        >
          {micOn ? <Mic /> : <MicOff />}
        </button>

        <button
          onClick={onLeave}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-xl transition-transform active:scale-95"
        >
          <PhoneOff size={28} />
        </button>

        <button
          onClick={() => {
            if (cameraOn) { localCameraTrack.setEnabled(false); }
            else { localCameraTrack.setEnabled(true); localCameraTrack.play(localVideoRef.current); }
            setCameraOn(!cameraOn);
          }}
          className={`p-4 rounded-full ${cameraOn ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-500'} text-white transition-all`}
        >
          {cameraOn ? <Video /> : <VideoOff />}
        </button>
      </div>
    </div>
  );
};
