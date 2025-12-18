import React, { useEffect, useRef } from "react";
import { useJoin, usePublish, useRemoteUsers, RemoteUser } from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import "./App.css"; // Ensure you import the CSS

export const VideoRoom = ({
  appId, channelName, token, uid, onLeave,
  localCameraTrack, localMicrophoneTrack,
  micOn, setMicOn, cameraOn, setCameraOn
}) => {

  // 1. Join logic
  useJoin({ appid: appId, channel: channelName, token: token || null, uid: Number(uid) }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);

  // 2. Local Video Playback
  useEffect(() => {
    if (localCameraTrack && localVideoRef.current && cameraOn) {
      localCameraTrack.play(localVideoRef.current);
    }
  }, [localCameraTrack, cameraOn]);

  const toggleMic = async () => {
    if (localMicrophoneTrack) {
      await localMicrophoneTrack.setEnabled(!micOn);
      setMicOn(!micOn);
    }
  };

  const toggleCamera = async () => {
    if (localCameraTrack) {
      await localCameraTrack.setEnabled(!cameraOn);
      setCameraOn(!cameraOn);
      if (!cameraOn && localVideoRef.current) {
        localCameraTrack.play(localVideoRef.current);
      }
    }
  };

  return (
    <div className="video-room-container">

      <div className="video-grid">
        {/* --- REMOTE USER --- */}
        <div className="video-slot">
          {remoteUsers.length > 0 ? (
            <>
              {/* The class "video-slot" combined with App.css rules forces this to cover */}
              <RemoteUser
                user={remoteUsers[0]}
                style={{ width: '100%', height: '100%' }}
              />
              <div className="user-label">Opponent</div>
            </>
          ) : (
            <div className="status-overlay">
              <div style={{ marginBottom: 10 }}>Wait...</div>
              <span>Waiting for user to join</span>
            </div>
          )}
        </div>

        {/* --- LOCAL USER --- */}
        <div className="video-slot local-mirror">
          <div ref={localVideoRef} style={{ width: '100%', height: '100%' }} />

          {!cameraOn && (
            <div className="status-overlay">
              <VideoOff size={32} />
              <span style={{ marginTop: 8 }}>Camera Off</span>
            </div>
          )}

          <div className="user-label">You</div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div className="controls-bar">
        <button className={`control-btn ${micOn ? 'btn-normal' : 'btn-danger'}`} onClick={toggleMic}>
          {micOn ? <Mic /> : <MicOff />}
        </button>

        <button className="control-btn btn-danger" onClick={onLeave} style={{ width: 70, height: 70 }}>
          <PhoneOff size={32} />
        </button>

        <button className={`control-btn ${cameraOn ? 'btn-normal' : 'btn-danger'}`} onClick={toggleCamera}>
          {cameraOn ? <Video /> : <VideoOff />}
        </button>
      </div>
    </div>
  );
};
