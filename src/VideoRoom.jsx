import React, { useEffect, useRef, useState } from "react";
import { useJoin, usePublish, useRemoteUsers, RemoteUser } from "agora-rtc-react";
import { PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";

export const VideoRoom = ({
  appId, channelName, token, uid, onLeave,
  localCameraTrack, localMicrophoneTrack,
  micOn, setMicOn, cameraOn, setCameraOn
}) => {

  // --- 1. SETUP ---
  // Ensure UID is a Number to prevent join errors
  useJoin({ appid: appId, channel: channelName, token: token || null, uid: Number(uid) }, true);
  usePublish([localMicrophoneTrack, localCameraTrack]);

  const remoteUsers = useRemoteUsers();
  const localVideoRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Handle Resize for responsive layout
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- 2. LOCAL VIDEO PLAYBACK ---
  useEffect(() => {
    if (localCameraTrack && localVideoRef.current && cameraOn) {
      localCameraTrack.play(localVideoRef.current);
    }
  }, [localCameraTrack, cameraOn]);

  // --- 3. ACTIONS ---
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

  // --- 4. STYLES (INJECTED) ---
  // We inject this style to FORCE Agora's video player to cover the container
  const globalStyles = `
    .agora_video_player {
      object-fit: cover !important;
      width: 100% !important;
      height: 100% !important;
      position: absolute !important;
    }
  `;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh',
      backgroundColor: '#0f172a', zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      <style>{globalStyles}</style>

      {/* --- VIDEO AREA --- */}
      <div style={{
        flex: 1, display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        position: 'relative'
      }}>

        {/* REMOTE USER SLOT */}
        <div style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          borderBottom: isMobile ? '1px solid #334155' : 'none',
          borderRight: !isMobile ? '1px solid #334155' : 'none',
          backgroundColor: '#1e293b'
        }}>
          {remoteUsers.length > 0 ? (
            <div style={{ width: '100%', height: '100%', position: 'absolute' }}>
              <RemoteUser user={remoteUsers[0]} style={{ width: '100%', height: '100%' }} />
              <div style={{
                position: 'absolute', bottom: 16, left: 16,
                background: 'rgba(0,0,0,0.6)', color: 'white',
                padding: '4px 12px', borderRadius: 20, fontSize: '12px', zIndex: 10
              }}>
                Opponent ({remoteUsers[0].uid})
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
              <div style={{ marginBottom: 10 }}>Waiting...</div>
              <span style={{ fontSize: '12px' }}>Waiting for user to join</span>
            </div>
          )}
        </div>

        {/* LOCAL USER SLOT */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
          <div
            ref={localVideoRef}
            style={{ width: '100%', height: '100%', transform: 'rotateY(180deg)' }}
          />

          {!cameraOn && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b', color: '#94a3b8'
            }}>
              <VideoOff size={32} />
              <div style={{ marginTop: 8, fontSize: '12px' }}>Camera Off</div>
            </div>
          )}

          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(0,0,0,0.6)', color: 'white',
            padding: '4px 12px', borderRadius: 20, fontSize: '12px', zIndex: 10
          }}>
            You
          </div>
        </div>
      </div>

      {/* --- CONTROLS --- */}
      <div style={{
        height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '30px',
        backgroundColor: '#0f172a', borderTop: '1px solid #334155', paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        <button onClick={toggleMic} style={{
          width: 50, height: 50, borderRadius: '50%', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: micOn ? '#334155' : '#ef4444', color: 'white'
        }}>
          {micOn ? <Mic /> : <MicOff />}
        </button>

        <button onClick={onLeave} style={{
          width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: '#dc2626', color: 'white', boxShadow: '0 4px 12px rgba(220,38,38,0.4)'
        }}>
          <PhoneOff size={28} />
        </button>

        <button onClick={toggleCamera} style={{
          width: 50, height: 50, borderRadius: '50%', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: cameraOn ? '#334155' : '#ef4444', color: 'white'
        }}>
          {cameraOn ? <Video /> : <VideoOff />}
        </button>
      </div>
    </div>
  );
};
