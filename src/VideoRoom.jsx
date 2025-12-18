import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  useLocalMicrophoneTrack,
  useLocalCameraTrack,
  usePublish,
  useRemoteUsers,
  RemoteUser,
} from "agora-rtc-react";
import { X, Mic, MicOff, Video, VideoOff } from "lucide-react"; // Icon controls

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

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent z-10 flex justify-between items-center text-white">
        <div>
          <h2 className="text-lg font-bold">Đang gọi...</h2>
          <p className="text-sm opacity-80">Room: {channelName}</p>
        </div>
        <div className="bg-red-600/20 px-3 py-1 rounded-full border border-red-500 text-xs">
          {remoteUsers.length > 0 ? "Đã kết nối" : "Đang chờ người khác..."}
        </div>
      </div>

      {/* Grid Video Container */}
      <div className="flex-1 flex flex-wrap p-4 gap-4 justify-center items-center overflow-hidden">

        {/* Local User */}
        <div className="relative overflow-hidden rounded-xl shadow-2xl border-2 border-blue-500 w-full md:w-1/2 h-1/2 md:h-full bg-black">
          <div ref={localVideoRef} className="w-full h-full object-cover" />
          <span className="absolute bottom-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-sm">Bạn (Tôi)</span>
          {!cameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-white">Camera Off</div>
          )}
        </div>

        {/* Remote Users */}
        {remoteUsers.map((user) => (
          <div key={user.uid} className="relative overflow-hidden rounded-xl shadow-2xl border-2 border-green-500 w-full md:w-1/2 h-1/2 md:h-full bg-black">
            <RemoteUser user={user} className="w-full h-full object-cover" />
            <span className="absolute bottom-4 left-4 bg-black/50 text-white px-2 py-1 rounded text-sm">User: {user.uid}</span>
          </div>
        ))}
      </div>

      {/* Control Bar */}
      <div className="h-20 bg-gray-800 flex justify-center items-center gap-6 pb-4">
        <button
          onClick={() => setMicOn(!micOn)}
          className={`p-4 rounded-full ${micOn ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-500 hover:bg-red-600'} text-white transition`}
        >
          {micOn ? <Mic /> : <MicOff />}
        </button>

        <button
          onClick={onLeave}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg transform hover:scale-110 transition"
        >
          <X size={32} />
        </button>

        <button
          onClick={() => setCameraOn(!cameraOn)}
          className={`p-4 rounded-full ${cameraOn ? 'bg-gray-600 hover:bg-gray-500' : 'bg-red-500 hover:bg-red-600'} text-white transition`}
        >
          {cameraOn ? <Video /> : <VideoOff />}
        </button>
      </div>
    </div>
  );
};
