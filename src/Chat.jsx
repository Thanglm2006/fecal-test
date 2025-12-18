import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft, Info } from 'lucide-react';
import AgoraRTC from "agora-rtc-sdk-ng";
import { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";
import "./App.css"; // Import the CSS

const API_URL = 'http://localhost:8080/api';
const MQTT_BROKER = 'ws://localhost:9001';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e";

const agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export default function Chat() {
  const [currentUserId, setCurrentUserId] = useState(() => {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u).id : null;
  });

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

  const messagesEndRef = useRef(null);

  // --- LOGIC ---
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

  // --- API ---
  const fetchInbox = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/chat/inbox/${id}`, { headers: { token: localStorage.getItem('token') } });
      setConversations(res.data);
    } catch (e) { console.error(e); }
  };

  const loadHistory = async (u1, u2) => {
    try {
      const res = await axios.get(`${API_URL}/chat/messages`, {
        params: { user1: u1, user2: u2, page: 0 },
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

  const startCall = async () => {
    try {
      const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
      setLocalMicTrack(mic);
      setLocalCameraTrack(cam);
      setIsInCall(true);
    } catch (e) {
      alert("Cannot access camera/mic");
      console.error(e);
    }
  };

  // --- RENDER ---
  if (isInCall && selectedUser) {
    return (
      <AgoraRTCProvider client={agoraClient}>
        <VideoRoom
          appId={AGORA_APP_ID}
          channelName={getRoomId(currentUserId, selectedUser.userId)}
          token={null}
          uid={currentUserId}
          onLeave={() => {
            setIsInCall(false);
            localCameraTrack?.close();
            localMicTrack?.close();
          }}
          localCameraTrack={localCameraTrack}
          localMicrophoneTrack={localMicTrack}
          micOn={micOn} setMicOn={setMicOn}
          cameraOn={cameraOn} setCameraOn={setCameraOn}
        />
      </AgoraRTCProvider>
    );
  }

  // The 'chat-active' class controls visibility on mobile via CSS
  return (
    <div className={`app-container ${selectedUser ? 'chat-active' : ''}`}>

      {/* --- SIDEBAR LIST --- */}
      <div className="sidebar mobile-view-sidebar">
        <div className="chat-header">
          <h2 style={{ fontWeight: 'bold', fontSize: '20px', color: '#2563eb' }}>Messages</h2>
          <button onClick={() => { localStorage.clear(); window.location.href = '/login' }} style={{ border: 'none', background: 'transparent' }}>
            <LogOut size={20} color="#666" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.map(u => (
            <div
              key={u.userId}
              onClick={() => setSelectedUser(u)}
              style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
            >
              <img src={u.avatarUrl || "https://github.com/shadcn.png"} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              <div>
                <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{u.lastMessage || 'Start chat'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- CHAT AREA --- */}
      <div className="chat-area mobile-view-chat">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Mobile Back Button */}
                <button className="hide-on-desktop" onClick={() => setSelectedUser(null)} style={{ border: 'none', background: 'transparent' }}>
                  <ArrowLeft size={24} />
                </button>
                <img src={selectedUser.avatarUrl || "https://github.com/shadcn.png"} style={{ width: 40, height: 40, borderRadius: '50%' }} alt="" />
                <strong>{selectedUser.fullName}</strong>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={startCall} style={{ border: 'none', background: '#eff6ff', padding: 8, borderRadius: '50%', color: '#2563eb', cursor: 'pointer' }}>
                  <VideoIcon size={20} />
                </button>
                <button style={{ border: 'none', background: 'transparent', color: '#6b7280' }}>
                  <Info size={20} />
                </button>
              </div>
            </div>

            <div className="messages-list">
              {messages.map((m, i) => (
                <div key={i} className={`message-row ${m.myMessage ? 'row-right' : 'row-left'}`}>
                  <div className={`msg-bubble ${m.myMessage ? 'msg-mine' : 'msg-theirs'}`}>
                    {m.type === 'text' ? m.message : <img src={m.fileUrl} style={{ maxWidth: '100%', borderRadius: 8 }} />}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
              <div className="input-wrapper">
                <ImageIcon size={24} color="#9ca3af" />
                <input
                  className="chat-input"
                  value={inputMsg}
                  onChange={e => setInputMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage('text', inputMsg)}
                  placeholder="Type a message..."
                />
                <button onClick={() => sendMessage('text', inputMsg)} style={{ border: 'none', background: 'transparent', color: '#2563eb' }}>
                  <Send size={24} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
