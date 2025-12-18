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

// Inject the Plain CSS Style Block
const AgoraStyles = () => (
  <style>{`
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
    .remote-video-wrapper {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .local-video-wrapper {
      position: absolute;
      z-index: 50;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.2);
      background-color: #222;
      transition: all 0.3s ease;
    }
    
    /* MOBILE (< 768px): Fullscreen Remote + Top-Left PiP */
    @media (max-width: 767px) {
      .remote-player { width: 100% !important; height: 100% !important; object-fit: cover; }
      .local-video-wrapper { width: 100px; height: 133px; top: 16px; left: 16px; }
    }

    /* DESKTOP (>= 768px): 16:9 Cinema Mode + Bottom-Right PiP */
    @media (min-width: 768px) {
      .remote-video-wrapper { width: 100%; max-width: 1280px; aspect-ratio: 16 / 9; }
      .remote-player { width: 100% !important; height: 100% !important; object-fit: contain; }
      .local-video-wrapper { width: 240px; height: 135px; bottom: 100px; right: 30px; }
    }
  `}</style>
);

export const VideoRoom = ({ appId, channelName, uid, onLeave, onRemoteJoined }) => {
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
        setError("Connection failed.");
      } finally {
        setIsFetchingToken(false);
      }
    };

    if (channelName && uid) fetchToken();
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
        <button onClick={onLeave} className="px-6 py-3 bg-gray-700 rounded-full hover:bg-gray-600 transition-colors">
          Return to App
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
      />
    </>
  );
};

// --- AGORA LOGIC COMPONENT ---
const AgoraLogic = ({ appId, channelName, token, uid, onLeave, onRemoteJoined }) => {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);

  // INTERVIEW STATE
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);

  // --- TRACKS ---
  const { localMicrophoneTrack } = useLocalMicrophoneTrack(micOn && !interviewEnded);
  const { localCameraTrack } = useLocalCameraTrack(cameraOn && !interviewEnded);

  // --- JOIN & PUBLISH ---
  useJoin({ appid: appId, channel: channelName, token: token, uid: uid }, !interviewEnded);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // --- INTERVIEW LIFECYCLE LOGIC ---
  useEffect(() => {
    // 1. Detect when Remote User Joins
    if (remoteUsers.length > 0 && !interviewStarted) {
      setInterviewStarted(true);
      if (onRemoteJoined) onRemoteJoined(); // Trigger system message in Chat
    }

    // 2. Detect when Remote User Leaves AFTER Interview Started
    if (interviewStarted && remoteUsers.length === 0) {
      setInterviewEnded(true);
    }
  }, [remoteUsers, interviewStarted, onRemoteJoined]);

  // --- PLAY LOCAL VIDEO ---
  useEffect(() => {
    if (localCameraTrack && cameraOn && localVideoRef.current && !interviewEnded) {
      localCameraTrack.play(localVideoRef.current);
    }
    return () => {
      if (localCameraTrack) localCameraTrack.stop();
    };
  }, [localCameraTrack, cameraOn, interviewEnded]);

  // --- RENDER: INTERVIEW ENDED ---
  if (interviewEnded) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gray-900 flex flex-col items-center justify-center text-white px-4 text-center">
        <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <UserX size={40} className="text-gray-400" />
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mb-2">Interview Ended</h2>
        <p className="text-gray-400 mb-8 max-w-md">
          The other participant has left the call.
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

  // --- RENDER: ACTIVE INTERVIEW ---
  return (
    <div className="interview-container">

      {/* 1. REMOTE VIDEO (Main View) */}
      <div className="remote-video-wrapper">
        {remoteUsers.length > 0 ? (
          <RemoteUser
            user={remoteUsers[0]}
            playVideo={true}
            playAudio={true}
            className="remote-player" // Targeted by CSS
          />
        ) : (
          <div className="flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-800 rounded-full animate-pulse flex items-center justify-center mb-4 border border-gray-700">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
            </div>
            <p className="text-white font-medium">Waiting for participant...</p>
          </div>
        )}
      </div>

      {/* 2. LOCAL VIDEO (PiP) */}
      <div className="local-video-wrapper">
        {cameraOn ? (
          <div
            ref={localVideoRef}
            style={{ width: "100%", height: "100%", transform: "scaleX(-1)" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800 text-gray-500">
            <VideoOff size={24} />
          </div>
        )}
      </div>

      {/* 3. CONTROL BAR (Tailwind allowed here) */}
      <div className="absolute bottom-6 left-0 right-0 z-50 flex items-center justify-center gap-4">
        <div className="flex items-center gap-4 bg-gray-900/90 backdrop-blur-md px-6 py-4 rounded-full border border-gray-700 shadow-xl">
          <button
            onClick={() => setMicOn((prev) => !prev)}
            className={`p-3 rounded-full transition-all active:scale-95 ${micOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-white text-red-600"}`}
          >
            {micOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          <button
            onClick={onLeave}
            className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 transition-all active:scale-95 mx-2"
          >
            <PhoneOff size={28} fill="currentColor" />
          </button>

          <button
            onClick={() => setCameraOn((prev) => !prev)}
            className={`p-3 rounded-full transition-all active:scale-95 ${cameraOn ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-white text-red-600"}`}
          >
            {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
          </button>
        </div>
      </div>

    </div>
  );
};
