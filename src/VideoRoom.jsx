import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  useJoin,
  usePublish,
  useRemoteUsers,
  RemoteUser,
  useLocalMicrophoneTrack,
  useLocalCameraTrack
} from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Loader2 } from "lucide-react";

// --- CSS STYLE ISOLATION ---
// Why? Tailwind utilities (flex, aspect-ratio) conflict with Agora's internal video rendering.
// Agora injects a <video> element that needs exact width/height matching its parent.
const videoContainerStyle = {
  width: "100%",
  height: "100%",
  position: "relative",
  overflow: "hidden",
  borderRadius: "0.5rem"
};

export const VideoRoom = ({ appId, channelName, uid, onLeave }) => {
  const [token, setToken] = useState(null);
  const [isFetchingToken, setIsFetchingToken] = useState(true);
  const [error, setError] = useState("");

  // --- 1. FETCH TOKEN ---
  useEffect(() => {
    const fetchToken = async () => {
      try {
        setIsFetchingToken(true);
        // Using the API endpoint provided in requirements
        const res = await axios.get(`https://api.job-fs.me/api/call-token`, {
          params: {
            channelName: channelName,
            uid: uid
          },
          headers: { token: localStorage.getItem('token') } // Assuming auth needed
        });

        // Handle response format variations (res.data.token or res.data)
        const fetchedToken = res.data.token || res.data;

        if (fetchedToken) {
          setToken(fetchedToken);
        } else {
          setError("Could not retrieve token.");
        }
      } catch (err) {
        console.error("Failed to fetch Agora token", err);
        setError("Failed to connect to call server.");
      } finally {
        setIsFetchingToken(false);
      }
    };

    if (channelName && uid) {
      fetchToken();
    }
  }, [channelName, uid]);

  if (isFetchingToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 text-white z-[9999] fixed inset-0">
        <Loader2 className="animate-spin mb-2" size={32} />
        <p>Connecting securely...</p>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 text-white z-[9999] fixed inset-0 gap-4">
        <p className="text-red-400">{error || "Invalid Token"}</p>
        <button onClick={onLeave} className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">
          Back to Chat
        </button>
      </div>
    );
  }

  // Only render the Agora Logic wrapper if we have a token
  return (
    <AgoraLogic
      appId={appId}
      channelName={channelName}
      token={token}
      uid={uid}
      onLeave={onLeave}
    />
  );
};

// --- AGORA LOGIC SUB-COMPONENT ---
// Separated to ensure hooks run only after token is ready
const AgoraLogic = ({ appId, channelName, token, uid, onLeave }) => {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  // --- LOCAL TRACKS ---
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn);

  // --- JOIN & PUBLISH ---
  useJoin({ appid: appId, channel: channelName, token: token, uid: uid }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // Play Local Video
  useEffect(() => {
    if (localCameraTrack && cameraOn && localVideoRef.current) {
      localCameraTrack.play(localVideoRef.current);
    }
    return () => {
      // Cleanup happens automatically by Agora hook mostly, 
      // but explicit stop prevents phantom tracks on unmount
      if (localCameraTrack) localCameraTrack.stop();
    };
  }, [localCameraTrack, cameraOn]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col w-full overflow-hidden" style={{ height: '100dvh' }}>

      {/* --- VIDEO GRID --- */}
      {/* Responsive Logic:
        - Mobile (flex-col): Stacked. Remote takes larger space (flex-1), Local is smaller.
        - Desktop (md:grid-cols-2): Side by side equal width.
      */}
      <div className="flex-1 relative w-full flex flex-col md:grid md:grid-cols-2 bg-gray-950 overflow-hidden">

        {/* --- REMOTE USER --- */}
        <div className="relative flex-1 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-800">
          {remoteUsers.length > 0 ? (
            <div style={videoContainerStyle}>
              {/* RemoteUser component from Agora manages the <video> tag internally */}
              <RemoteUser
                user={remoteUsers[0]}
                playVideo={true}
                playAudio={true}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div className="absolute top-4 left-4 z-20 bg-black/50 px-3 py-1 rounded text-xs backdrop-blur-md">
                Remote User
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-800 rounded-full animate-pulse flex items-center justify-center">
                <Loader2 size={32} className="text-gray-400 animate-spin" />
              </div>
              <p className="text-gray-400 text-sm font-medium">Waiting for response...</p>
            </div>
          )}
        </div>

        {/* --- LOCAL USER --- */}
        <div className="relative flex-1 bg-gray-900">
          {cameraOn ? (
            <div
              ref={localVideoRef}
              style={{
                ...videoContainerStyle,
                transform: 'scaleX(-1)' // Mirror effect for local user
              }}
            />
          ) : (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-700 rounded-full mx-auto flex items-center justify-center mb-2">
                  <VideoOff size={28} className="text-gray-500" />
                </div>
                <p className="text-sm text-gray-500">Camera Off</p>
              </div>
            </div>
          )}
          <div className="absolute top-4 left-4 z-20 bg-black/50 px-3 py-1 rounded text-xs backdrop-blur-md">
            You
          </div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="flex-shrink-0 bg-gray-900/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-center gap-6 py-6" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => setMicOn(prev => !prev)}
          className={`p-4 rounded-full transition-all active:scale-95 ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 text-white'}`}
        >
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button
          onClick={onLeave}
          className="p-5 rounded-full bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/30 transition-all active:scale-95"
        >
          <PhoneOff size={32} fill="currentColor" />
        </button>

        <button
          onClick={() => setCameraOn(prev => !prev)}
          className={`p-4 rounded-full transition-all active:scale-95 ${cameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 text-white'}`}
        >
          {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>
      </div>
    </div>
  );
};
