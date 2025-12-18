import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft, Info, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import AgoraRTC from "agora-rtc-sdk-ng";
import { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

// --- CONFIG ---
const API_URL = 'http://localhost:8080/api';
const MQTT_BROKER = 'ws://localhost:9001';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e";

const agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export default function Chat() {
  const [currentUserId, setCurrentUserId] = useState(() => {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u).id : null;
  });

  // Data States
  const [client, setClient] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');

  // Call States
  const [isInCall, setIsInCall] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localCameraTrack, setLocalCameraTrack] = useState(null);
  const [localMicTrack, setLocalMicTrack] = useState(null);

  // Layout State (For Responsive Mobile View)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const messagesEndRef = useRef(null);

  // --- LAYOUT LISTENER ---
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- MQTT & DATA ---
  const getRoomId = (u1, u2) => {
    const ids = [String(u1), String(u2)].sort();
    return `${ids[0]}-${ids[1]}`;
  };

  useEffect(() => {
    if (!currentUserId) return;
    fetchInbox(currentUserId);

    const mqttClient = mqtt.connect(MQTT_BROKER, {
      clientId: `web_${currentUserId}_${Math.random().toString(16).substr(2, 6)}`,
      keepalive: 60, clean: true,
    });

    mqttClient.on('connect', () => mqttClient.subscribe(`/user/${currentUserId}/private`));
    mqttClient.on('message', (t, p) => {
      const d = JSON.parse(p.toString());
      setMessages(prev => [...prev, mapMsg(d, currentUserId)]);
    });

    setClient(mqttClient);
    return () => mqttClient.end();
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedUser || !client) return;
    const rid = getRoomId(currentUserId, selectedUser.userId);
    client.subscribe(`/chat/${rid}`);
    loadHistory(currentUserId, selectedUser.userId);
    return () => client.unsubscribe(`/chat/${rid}`);
  }, [selectedUser, client]);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const fetchInbox = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/chat/conversations?userId=${id}`, { headers: { token: localStorage.getItem('token') } });
      setConversations(res.data);
    } catch (e) { console.error(e); }
  };

  const loadHistory = async (u1, u2) => {
    try {
      const res = await axios.get(`${API_URL}/chat/messages`, {
        params: { senderId: u1, receiverId: u2, page: 0 },
        headers: { token: localStorage.getItem('token') }
      });
      if (res.data.data) setMessages(res.data.data.map(m => mapMsg(m, u1)).reverse());
    } catch { setMessages([]); }
  };

  const mapMsg = (d, myId) => ({
    message: d.content,
    myMessage: String(d.sender) === String(myId),
    timestamp: d.timestamp,
    type: d.type,
    fileUrl: d.type !== 'text' ? d.content : null
  });

  const sendMessage = (type, content) => {
    if (!content.trim() && type === 'text') return;
    const rid = getRoomId(currentUserId, selectedUser.userId);
    client.publish(`/chat/${rid}`, JSON.stringify({
      token: localStorage.getItem('token'),
      sender: currentUserId,
      recipient: selectedUser.userId.toString(),
      type, content, timestamp: new Date().toISOString()
    }));
    if (type === 'text') setInputMsg('');
  };

  // --- CALL HANDLERS ---
  const startCall = async () => {
    try {
      const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
      setLocalMicTrack(mic);
      setLocalCameraTrack(cam);
      setIsInCall(true);
    } catch (e) {
      alert("Please allow Camera/Mic access");
    }
  };

  const endCall = () => {
    setIsInCall(false);
    localCameraTrack?.close();
    localMicTrack?.close();
    setLocalCameraTrack(null);
    setLocalMicTrack(null);
  };

  // --- RENDER: VIDEO CALL ---
  if (isInCall && selectedUser) {
    return (
      <AgoraRTCProvider client={agoraClient}>
        <VideoRoom
          appId={AGORA_APP_ID}
          channelName={getRoomId(currentUserId, selectedUser.userId)}
          token={null}
          uid={currentUserId}
          onLeave={endCall}
          localCameraTrack={localCameraTrack}
          localMicrophoneTrack={localMicTrack}
          micOn={micOn} setMicOn={setMicOn}
          cameraOn={cameraOn} setCameraOn={setCameraOn}
        />
      </AgoraRTCProvider>
    );
  }

  // --- RENDER: CHAT VIEW ---
  // If Mobile and User Selected -> Show Chat Only
  // If Mobile and No User -> Show List Only
  // If Desktop -> Show Split Screen
  const showList = !isMobile || (isMobile && !selectedUser);
  const showChat = !isMobile || (isMobile && selectedUser);

  return (
    <div style={{ display: 'flex', height: '100dvh', width: '100vw', overflow: 'hidden', backgroundColor: 'white' }}>

      {/* SIDEBAR (User List) */}
      <div style={{
        display: showList ? 'flex' : 'none',
        flexDirection: 'column',
        width: isMobile ? '100%' : '350px',
        borderRight: '1px solid #e5e7eb'
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb', margin: 0 }}>Messages</h2>
          <button onClick={() => { localStorage.clear(); window.location.href = '/login' }} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <LogOut size={20} color="#64748b" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.map(u => (
            <div key={u.userId} onClick={() => setSelectedUser(u)} style={{
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
              backgroundColor: selectedUser?.userId === u.userId ? '#eff6ff' : 'transparent'
            }}>
              <img src={u.avatarUrl || "https://github.com/shadcn.png"} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              <div>
                <div style={{ fontWeight: 600, color: '#1e293b' }}>{u.fullName}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>{u.lastMessage || 'Start chat'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA */}
      <div style={{
        display: showChat ? 'flex' : 'none',
        flex: 1, flexDirection: 'column', backgroundColor: '#f8fafc'
      }}>
        {selectedUser ? (
          <>
            {/* Header */}
            <div style={{
              height: '64px', borderBottom: '1px solid #e5e7eb', backgroundColor: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isMobile && (
                  <button onClick={() => setSelectedUser(null)} style={{ border: 'none', background: 'transparent' }}>
                    <ArrowLeft size={24} />
                  </button>
                )}
                <img src={selectedUser.avatarUrl || "https://github.com/shadcn.png"} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} alt="" />
                <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{selectedUser.fullName}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={startCall} style={{ border: 'none', background: '#eff6ff', padding: '8px', borderRadius: '50%', color: '#2563eb', cursor: 'pointer' }}>
                  <VideoIcon size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.myMessage ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%', padding: '10px 14px', borderRadius: '16px',
                    backgroundColor: m.myMessage ? '#2563eb' : 'white',
                    color: m.myMessage ? 'white' : '#1e293b',
                    border: m.myMessage ? 'none' : '1px solid #e2e8f0',
                    borderTopRightRadius: m.myMessage ? 0 : 16,
                    borderTopLeftRadius: m.myMessage ? 16 : 0
                  }}>
                    {m.type === 'text' ? m.message : <img src={m.fileUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '12px', borderTop: '1px solid #e5e7eb', backgroundColor: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '800px', margin: '0 auto' }}>
                <ImageIcon size={24} color="#94a3b8" />
                <input
                  value={inputMsg}
                  onChange={e => setInputMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage('text', inputMsg)}
                  placeholder="Type a message..."
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: '24px', border: 'none',
                    backgroundColor: '#f1f5f9', outline: 'none', fontSize: '16px'
                  }}
                />
                <button onClick={() => sendMessage('text', inputMsg)} style={{ border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer' }}>
                  <Send size={24} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
}
