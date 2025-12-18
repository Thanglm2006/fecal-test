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
// STRICT PLAIN CSS to avoid Tailwind conflicts.
// Tailwind's preflight resets often collapse the video container or mess up the aspect ratio.
// We force the container to fill the parent and hide overflow.
const agoraVideoStyle = {
  width: "100%",
  height: "100%",
  position: "relative",
  overflow: "hidden",
  borderRadius: "0px",
  backgroundColor: "black" // Prevents white flashes
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
        // Correct API call based on specs: GET /api/call-token?channel=...&uid=...
        const res = await axios.get(`https://api.job-fs.me/api/call-token`, {
          params: {
            channel: channelName, // Parameter name MUST be 'channel'
            uid: uid
          },
          headers: { token: localStorage.getItem('token') }
        });

        // Strict token extraction
        const fetchedToken = res.data.token;

        if (fetchedToken) {
          setToken(fetchedToken);
        } else {
          setError("Invalid token response from server.");
        }
      } catch (err) {
        console.error("Failed to fetch Agora token", err);
        setError("Connection failed. Please try again.");
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
        <Loader2 className="animate-spin mb-4" size={40} />
        <p className="text-lg font-medium">Connecting securely...</p>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 text-white z-[9999] fixed inset-0 gap-6">
        <p className="text-red-400 text-xl font-semibold">{error || "Authentication Failed"}</p>
        <button
          onClick={onLeave}
          className="px-6 py-3 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors"
        >
          Back to Chat
        </button>
      </div>
    );
  }

  // Only mount Agora hooks when token is present
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
      // Explicit stop is good practice
      if (localCameraTrack) localCameraTrack.stop();
    };
  }, [localCameraTrack, cameraOn]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col w-full h-full">

      {/* --- VIDEO AREA --- */}
      <div className="flex-1 relative w-full h-full flex flex-col md:flex-row bg-black overflow-hidden">

        {/* --- REMOTE USER --- */}
        {/* Mobile: Top (flex-1) | Desktop: Left (w-1/2) */}
        <div className="relative flex-1 md:w-1/2 bg-gray-900 border-b md:border-b-0 md:border-r border-gray-800">
          {remoteUsers.length > 0 ? (
            <div style={agoraVideoStyle}>
              <RemoteUser
                user={remoteUsers[0]}
                playVideo={true}
                playAudio={true}
                // Pass style to the inner Agora player to ensure it covers the div
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 md:w-20 md:h-20 bg-gray-800 rounded-full animate-pulse flex items-center justify-center">
                <Loader2 size={32} className="text-gray-400 animate-spin" />
              </div>
              <p className="text-gray-400 text-sm font-medium">Waiting for response...</p>
            </div>
          )}
          <div className="absolute top-4 left-4 z-20 bg-black/40 px-3 py-1 rounded text-xs backdrop-blur-sm">
            Remote
          </div>
        </div>

        {/* --- LOCAL USER --- */}
        {/* Mobile: Bottom (h-1/3 or flex-1 based on pref) | Desktop: Right (w-1/2) */}
        <div className="relative h-1/3 md:h-auto md:w-1/2 md:flex-1 bg-gray-900">
          {cameraOn ? (
            <div
              ref={localVideoRef}
              style={{
                ...agoraVideoStyle,
                transform: 'scaleX(-1)' // Mirror local view
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
          <div className="absolute top-4 left-4 z-20 bg-black/40 px-3 py-1 rounded text-xs backdrop-blur-sm">
            You
          </div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-gray-800 flex items-center justify-center gap-8 py-6 pb-8 md:pb-6">
        <button
          onClick={() => setMicOn(prev => !prev)}
          className={`p-4 rounded-full transition-all active:scale-95 ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 text-white'}`}
        >
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button
          onClick={onLeave}
          className="p-5 rounded-full bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20 transition-all active:scale-95"
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
