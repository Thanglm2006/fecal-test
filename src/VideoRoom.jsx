import React, { useEffect, useRef, useState } from "react";
import {
  useJoin,
  usePublish,
  useRemoteUsers,
  RemoteUser,
  useRTCClient,
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Users, MoreVertical, Monitor } from "lucide-react";
import AgoraRTC from "agora-rtc-sdk-ng";

export const VideoRoom = ({ appId, channelName, token, uid, onLeave, localCameraTrack, localMicrophoneTrack, micOn, setMicOn, cameraOn, setCameraOn, remoteUserName }) => {
  useJoin({ appid: appId, channel: channelName, token, uid: uid }, true);

  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);
  const client = useRTCClient();

  const [speaking, setSpeaking] = useState(new Set());
  const [isSharing, setIsSharing] = useState(false);
  const [screenTrack, setScreenTrack] = useState(null);

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

  useEffect(() => {
    if (!localCameraTrack || !localVideoRef.current) return;
    localCameraTrack.play(localVideoRef.current);
    return () => {
      // No close here, handled in parent
    };
  }, [localCameraTrack]);

  const handleScreenShare = async () => {
    if (isSharing) {
      await client.unpublish(screenTrack);
      screenTrack.close();
      setScreenTrack(null);
      setIsSharing(false);
    } else {
      try {
        const track = await AgoraRTC.createScreenVideoTrack({});
        await client.publish(track);
        setScreenTrack(track);
        setIsSharing(true);
        track.on('track-ended', handleScreenShare);
      } catch (err) {
        console.error("Error sharing screen:", err);
      }
    }
  };

  const totalUsers = 1 + remoteUsers.length;
  const cols = Math.ceil(Math.sqrt(totalUsers));

  // Dynamic Grid Layout Logic
  const getGridClass = () => `grid grid-cols-1 sm:grid-cols-${Math.min(cols, 2)} md:grid-cols-${Math.min(cols, 3)} lg:grid-cols-${Math.min(cols, 4)}`;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#202124] text-white flex flex-col h-[100dvh]">
      <div className="flex justify-between items-center p-4 absolute top-0 w-full z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-2">
          <span className="bg-[#3c4043] p-1.5 rounded-full"><Users size={16} /></span>
          <span className="text-sm font-medium tracking-wide">{channelName}</span>
        </div>
        <div className="md:hidden">
          <span className="text-xs text-gray-300">{remoteUsers.length > 0 ? "Đang gọi..." : "Đang chờ..."}</span>
        </div>
      </div>

      <div className={`flex-1 p-2 md:p-4 grid gap-2 md:gap-4 items-center justify-center content-center ${getGridClass()}`}>
        {/* Local User */}
        <div className={`relative w-full h-full rounded-2xl overflow-hidden shadow-lg border border-transparent hover:border-blue-500 transition-all group ${speaking.has(uid) ? 'border-green-500' : ''}`}>
          <div ref={localVideoRef} className="w-full h-full object-cover">
            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                  YOU
                </div>
              </div>
            )}
          </div>
          <div className="absolute bottom-3 left-3 bg-black/40 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm flex items-center gap-1">
            Bạn
            {!micOn && <MicOff size={12} className="text-red-500" />}
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreVertical className="text-white drop-shadow-md" />
          </div>
        </div>

        {/* Remote Users */}
        {remoteUsers.map((user) => (
          <div key={user.uid} className={`relative w-full h-full rounded-2xl overflow-hidden shadow-lg ${speaking.has(user.uid) ? 'border-2 border-green-500' : ''}`}>
            <RemoteUser user={user} className="w-full h-full object-cover" playVideo={true} playAudio={true}>
              <div className="absolute bottom-3 left-3 bg-black/40 px-2 py-1 rounded text-xs font-medium backdrop-blur-sm">
                {remoteUserName || `User ${user.uid}`}
                {!user.hasAudio && <MicOff size={12} className="text-red-500 ml-1" />}
              </div>
            </RemoteUser>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="h-20 bg-[#202124] flex justify-center items-center gap-4 md:gap-6 pb-4 md:pb-0 safe-area-bottom">
        <button
          onClick={() => {
            localMicrophoneTrack.setEnabled(!micOn);
            setMicOn(!micOn);
          }}
          className={`p-3 md:p-4 rounded-full border border-gray-600 transition-all duration-200 ${micOn ? 'bg-[#3c4043] hover:bg-[#474a4d] text-white' : 'bg-[#ea4335] border-transparent text-white'}`}
          title={micOn ? "Tắt mic" : "Bật mic"}
        >
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        <button
          onClick={() => {
            if (cameraOn) {
              localCameraTrack.setEnabled(false);
              localCameraTrack.stop();
            } else {
              localCameraTrack.setEnabled(true);
              localCameraTrack.play(localVideoRef.current);
            }
            setCameraOn(!cameraOn);
          }}
          className={`p-3 md:p-4 rounded-full border border-gray-600 transition-all duration-200 ${cameraOn ? 'bg-[#3c4043] hover:bg-[#474a4d] text-white' : 'bg-[#ea4335] border-transparent text-white'}`}
          title={cameraOn ? "Tắt camera" : "Bật camera"}
        >
          {cameraOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          onClick={handleScreenShare}
          className={`p-3 md:p-4 rounded-full border border-gray-600 transition-all duration-200 ${isSharing ? 'bg-[#ea4335] border-transparent text-white' : 'bg-[#3c4043] hover:bg-[#474a4d] text-white'}`}
          title={isSharing ? "Dừng chia sẻ" : "Chia sẻ màn hình"}
        >
          <Monitor size={20} />
        </button>

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
