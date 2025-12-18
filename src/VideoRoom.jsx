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
import { PhoneOff, Mic, MicOff, Video, VideoOff, Loader2, UserX } from "lucide-react";

// --- CSS STYLE ISOLATION ---
// STRICT PLAIN CSS for Video Containers
// We use a Picture-in-Picture (PiP) layout logic here.

// 1. Remote Video: Covers the entire background
const remoteVideoStyle = {
  width: "100%",
  height: "100%",
  position: "absolute",
  top: "0",
  left: "0",
  zIndex: 0, // Behind everything
  objectFit: "cover",
  backgroundColor: "#1a1a1a"
};

// 2. Local Video: Floating PiP (Bottom-Right)
// Note: Size is handled via dynamic style prop based on screen width logic or fixed px
const localVideoStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "12px",
  objectFit: "cover",
  transform: "scaleX(-1)", // Mirror effect
  backgroundColor: "#2d2d2d"
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
        const res = await axios.get(`https://api.job-fs.me/api/call-token`, {
          params: {
            channel: channelName,
            uid: uid
          },
          headers: { token: localStorage.getItem('token') }
        });

        const fetchedToken = res.data.token;
        if (fetchedToken) {
          setToken(fetchedToken);
        } else {
          setError("Invalid token response.");
        }
      } catch (err) {
        console.error("Token fetch failed", err);
        setError("Connection failed.");
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
        <p className="text-lg font-medium">Preparing Interview...</p>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 text-white z-[9999] fixed inset-0 gap-6">
        <p className="text-red-400 text-xl font-semibold">{error || "Setup Failed"}</p>
        <button
          onClick={onLeave}
          className="px-6 py-3 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors"
        >
          Return to App
        </button>
      </div>
    );
  }

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
  const [interviewEnded, setInterviewEnded] = useState(false);

  // Tracks if the other person has ever joined. 
  // Used to distinguish "waiting for them to join" vs "they hung up".
  const hasPeerJoinedRef = useRef(false);

  // --- LOCAL TRACKS ---
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn && !interviewEnded);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn && !interviewEnded);

  // --- JOIN & PUBLISH ---
  useJoin({ appid: appId, channel: channelName, token: token, uid: uid }, !interviewEnded);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // --- INTERVIEW LOGIC: AUTO-END ---
  useEffect(() => {
    // 1. Detect if peer joined
    if (remoteUsers.length > 0) {
      hasPeerJoinedRef.current = true;
    }

    // 2. If peer WAS here, but now list is empty -> They left.
    if (hasPeerJoinedRef.current && remoteUsers.length === 0) {
      handleInterviewEnded();
    }
  }, [remoteUsers]);

  const handleInterviewEnded = () => {
    setInterviewEnded(true);
    // Optional: Auto-close after 3 seconds if desired
    // setTimeout(onLeave, 3000); 
  };

  // Play Local Video
  useEffect(() => {
    if (localCameraTrack && cameraOn && localVideoRef.current && !interviewEnded) {
      localCameraTrack.play(localVideoRef.current);
    }
    return () => {
      if (localCameraTrack) localCameraTrack.stop();
    };
  }, [localCameraTrack, cameraOn, interviewEnded]);

  // --- RENDER: ENDED STATE ---
  if (interviewEnded) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gray-900 flex flex-col items-center justify-center text-white px-4 text-center">
        <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <UserX size={40} className="text-gray-400" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mb-2">Interview Ended</h2>
        <p className="text-gray-400 mb-8 max-w-md">
          The other participant has left the call. You can now return to the chat.
        </p>
        <button
          onClick={onLeave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-semibold transition-all transform active:scale-95"
        >
          Close Session
        </button>
      </div>
    );
  }

  // --- RENDER: ACTIVE CALL ---
  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white overflow-hidden">

      {/* 1. REMOTE VIDEO (Full Screen Background) */}
      <div className="absolute inset-0 z-0">
        {remoteUsers.length > 0 ? (
          <div style={remoteVideoStyle}>
            {/* Force Agora's internal video to cover container. 
              Agora injects a div, so we style that div via the `style` prop of RemoteUser 
            */}
            <RemoteUser
              user={remoteUsers[0]}
              playVideo={true}
              playAudio={true}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-sm">
            <div className="w-20 h-20 bg-gray-800 rounded-full animate-pulse flex items-center justify-center mb-4 border border-gray-700">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
            </div>
            <p className="text-lg font-semibold text-white">Waiting for other party...</p>
            <p className="text-sm text-gray-400 mt-2">The interview will start when they join.</p>
          </div>
        )}
      </div>

      {/* 2. LOCAL VIDEO (Picture-in-Picture) */}
      {/* Logic: Floating above controls.
         Width: clamp(120px, 30vw, 240px) handles mobile (120px) vs desktop (240px) seamlessly.
      */}
      <div
        className="absolute z-50 shadow-2xl transition-all duration-300 ease-in-out"
        style={{
          bottom: '100px', // Leaves space for control bar
          right: '20px',
          width: 'clamp(120px, 30vw, 240px)',
          aspectRatio: '3/4', // Portrait orientation looks better for PiP self-view
          borderRadius: '12px',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.2)',
          backgroundColor: '#000'
        }}
      >
        {cameraOn ? (
          <div ref={localVideoRef} style={localVideoStyle} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-gray-500">
            <VideoOff size={20} />
          </div>
        )}
      </div>

      {/* 3. CONTROLS (Floating Bottom Bar) */}
      <div className="absolute bottom-6 left-0 right-0 z-50 flex items-center justify-center gap-6">
        {/* Glassmorphism Container */}
        <div className="flex items-center gap-4 bg-gray-900/80 backdrop-blur-md px-6 py-4 rounded-full border border-gray-700 shadow-xl">

          <button
            onClick={() => setMicOn((prev) => !prev)}
            className={`p-3 rounded-full transition-all active:scale-95 ${micOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-white text-red-600"
              }`}
          >
            {micOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          <button
            onClick={onLeave} // Manual leave
            className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 transition-all active:scale-95 mx-2"
          >
            <PhoneOff size={28} fill="currentColor" />
          </button>

          <button
            onClick={() => setCameraOn((prev) => !prev)}
            className={`p-3 rounded-full transition-all active:scale-95 ${cameraOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-white text-red-600"
              }`}
          >
            {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
};
