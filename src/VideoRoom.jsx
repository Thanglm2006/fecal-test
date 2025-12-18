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

// --- STRICT GOOGLE MEET STYLE CSS ---
// We use Plain CSS for layout to avoid Tailwind conflicts with Video Elements
const AgoraStyles = () => (
  <style>{`
    /* 1. CONTAINER: Fixed, Black, Z-Index High */
    .interview-container {
      width: 100vw;
      height: 100dvh;
      background-color: #000;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 9999;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }

    /* 2. STAGE: The 16:9 Cinema Display */
    .video-stage {
      position: relative;
      background-color: #1a1a1a;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    /* 3. REMOTE VIDEO: Main Focus */
    .remote-player {
      width: 100% !important;
      height: 100% !important;
    }

    /* 4. LOCAL PIP: Absolute inside Stage */
    .local-pip-wrapper {
      position: absolute;
      z-index: 50;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      border: 1px solid rgba(255,255,255,0.2);
      background-color: #222;
      transition: all 0.3s ease;
    }

    /* --- RESPONSIVE LOGIC --- */

    /* DESKTOP (>= 768px) */
    @media (min-width: 768px) {
      /* Google Meet Standard Stage */
      .video-stage {
        width: 100%;
        max-width: 1280px;
        aspect-ratio: 16 / 9;
        border-radius: 0;
      }
      .remote-player {
        object-fit: contain !important;
      }
      /* PiP: Bottom-Right */
      .local-pip-wrapper {
        width: 280px;
        height: 157px; /* 16:9 aspect */
        bottom: 24px;
        right: 24px;
      }
    }

    /* MOBILE (< 768px) */
    @media (max-width: 767px) {
      /* Fullscreen Vertical Video */
      .video-stage {
        width: 100%;
        height: 100%;
        aspect-ratio: auto; /* Remove 16:9 constraint */
      }
      .remote-player {
        object-fit: cover !important;
      }
      /* PiP: Top-Left (Draggable style) */
      .local-pip-wrapper {
        width: 110px;
        height: 160px; /* Portrait aspect */
        top: 16px;
        left: 16px;
      }
    }
  `}</style>
);

export const VideoRoom = ({ appId, channelName, uid, onLeave, onRemoteJoined, onCallEnd }) => {
  const [token, setToken] = useState(null);
  const [isFetchingToken, setIsFetchingToken] = useState(true);
  const [error, setError] = useState("");

  // --- 1. FETCH TOKEN ---
  useEffect(() => {
    const fetchToken = async () => {
      try {
        setIsFetchingToken(true);
        const res = await axios.get(`https://api.job-fs.me/api/call-token`, {
          params: { channel: channelName, uid: uid },
          headers: { token: localStorage.getItem('token') }
        });

        if (res.data && res.data.token) {
          setToken(res.data.token);
        } else {
          setError("Invalid token response.");
        }
      } catch (err) {
        console.error("Token fetch failed", err);
        setError("Connection failed. Please try again.");
      } finally {
        setIsFetchingToken(false);
      }
    };

    if (channelName && uid) fetchToken();
  }, [channelName, uid]);

  if (isFetchingToken) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 text-white z-[9999] fixed inset-0">
        <Loader2 className="animate-spin mb-4 text-blue-500" size={48} />
        <p className="text-lg font-medium tracking-wide">Securing Interview Room...</p>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-gray-900 text-white z-[9999] fixed inset-0 gap-6">
        <p className="text-red-400 text-xl font-semibold">{error || "Setup Failed"}</p>
        <button onClick={onLeave} className="px-8 py-3 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors border border-gray-700">
          Return to Chat
        </button>
      </div>
    );
  }

  return (
    <>
      <AgoraStyles />
      <AgoraLogic
        appId={appId}
        channelName={channelName}
        token={token}
        uid={uid}
        onLeave={onLeave}
        onRemoteJoined={onRemoteJoined}
        onCallEnd={onCallEnd}
      />
    </>
  );
};

// --- AGORA LOGIC COMPONENT ---
const AgoraLogic = ({ appId, channelName, token, uid, onLeave, onRemoteJoined, onCallEnd }) => {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  // INTERVIEW LIFECYCLE STATE
  const [hasStarted, setHasStarted] = useState(false); // True once REMOTE joins
  const [isEnded, setIsEnded] = useState(false);       // True if user hangs up OR remote leaves after start

  // --- TRACKS ---
  // Disable tracks immediately if interview ended to stop camera light
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn && !isEnded);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn && !isEnded);

  // --- JOIN & PUBLISH ---
  useJoin({ appid: appId, channel: channelName, token: token, uid: uid }, !isEnded);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // --- 1. LIFECYCLE MONITORING ---
  useEffect(() => {
    // A. Detect Start
    if (remoteUsers.length > 0 && !hasStarted) {
      setHasStarted(true);
      if (onRemoteJoined) onRemoteJoined();
    }

    // B. Detect End (Remote user left AFTER start)
    if (hasStarted && remoteUsers.length === 0 && !isEnded) {
      handleEndCall("Remote participant left.");
    }
  }, [remoteUsers, hasStarted, isEnded, onRemoteJoined]);

  // --- 2. END CALL LOGIC ---
  const handleEndCall = (reason) => {
    console.log("Interview Ending:", reason);
    setIsEnded(true);
    if (onCallEnd) onCallEnd(); // Trigger Chat System Message "❌"
  };

  // --- 3. PLAY LOCAL VIDEO ---
  useEffect(() => {
    if (localCameraTrack && cameraOn && localVideoRef.current && !isEnded) {
      localCameraTrack.play(localVideoRef.current);
    }
    return () => {
      if (localCameraTrack) localCameraTrack.stop();
    };
  }, [localCameraTrack, cameraOn, isEnded]);


  // --- RENDER: INTERVIEW ENDED ---
  if (isEnded) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gray-950 flex flex-col items-center justify-center text-white px-4 text-center animate-in fade-in duration-300">
        <div className="w-24 h-24 bg-gray-900 rounded-full flex items-center justify-center mb-6 border border-gray-800 shadow-xl">
          <UserX size={48} className="text-red-500" />
        </div>
        <h2 className="text-3xl font-bold mb-3 tracking-tight">Interview Ended</h2>
        <p className="text-gray-400 mb-8 max-w-md text-lg">
          The session has been concluded. You may now return to the chat.
        </p>
        <button
          onClick={onLeave}
          className="bg-white text-black px-10 py-4 rounded-full font-bold hover:bg-gray-200 transition-all transform active:scale-95 shadow-lg shadow-white/10"
        >
          Return to Chat
        </button>
      </div>
    );
  }

  // --- RENDER: ACTIVE INTERVIEW ---
  return (
    <div className="interview-container">

      {/* 1. STAGE (Holds Videos) */}
      <div className="video-stage">

        {/* Remote Video (Main) */}
        {remoteUsers.length > 0 ? (
          <RemoteUser
            user={remoteUsers[0]}
            playVideo={true}
            playAudio={true}
            className="remote-player" // CSS handles sizing
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-4">
            <div className="w-20 h-20 bg-gray-800/50 rounded-full animate-pulse flex items-center justify-center mb-6 border border-gray-700">
              <Loader2 size={40} className="text-blue-500 animate-spin" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Waiting for candidate...</h3>
            <p className="text-gray-400 max-w-xs">The interview will begin automatically when they join.</p>
          </div>
        )}

        {/* Local Video (PiP) - Only render if camera on */}
        <div className="local-pip-wrapper">
          {cameraOn ? (
            <div
              ref={localVideoRef}
              style={{ width: "100%", height: "100%", transform: "scaleX(-1)" }} // Mirror effect
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-gray-500">
              <VideoOff size={32} />
              <span className="text-xs mt-2 uppercase font-bold tracking-wider">Camera Off</span>
            </div>
          )}
        </div>

      </div>

      {/* 2. CONTROL BAR 
          Positioned Fixed Bottom Center (Outside Stage)
          Using Tailwind for styling, but Fixed Layout for Position
      */}
      <div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center gap-6"
        style={{ width: 'max-content' }}
      >
        <div className="flex items-center gap-4 bg-gray-900/80 backdrop-blur-xl px-8 py-4 rounded-full border border-gray-700/50 shadow-2xl">

          {/* Mic Toggle */}
          <button
            onClick={() => setMicOn((prev) => !prev)}
            className={`p-4 rounded-full transition-all duration-200 active:scale-90 ${micOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
              }`}
          >
            {micOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          {/* End Call - Triggers System End */}
          <button
            onClick={() => handleEndCall("User clicked hangup")}
            className="p-5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/40 transition-all duration-200 transform hover:scale-105 active:scale-95 mx-2"
          >
            <PhoneOff size={32} fill="currentColor" />
          </button>

          {/* Camera Toggle */}
          <button
            onClick={() => setCameraOn((prev) => !prev)}
            className={`p-4 rounded-full transition-all duration-200 active:scale-90 ${cameraOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
              }`}
          >
            {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
          </button>
        </div>
      </div>

    </div>
  );
};
