import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft, Info, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import AgoraRTC from "agora-rtc-sdk-ng";
import { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

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
  const [isPreview, setIsPreview] = useState(false);

  // Device States
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localCameraTrack, setLocalCameraTrack] = useState(null);
  const [localMicTrack, setLocalMicTrack] = useState(null);

  const messagesEndRef = useRef(null);
  const previewRef = useRef(null);
  const [showInfo, setShowInfo] = useState(false);

  // --- UTILS ---
  const getRoomId = (u1, u2) => {
    // FORCE STRING CONVERSION TO ENSURE CONSISTENCY
    const ids = [String(u1), String(u2)].sort();
    return `${ids[0]}-${ids[1]}`;
  };

  // --- EFFECTS ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!currentUserId || !token) { window.location.href = '/login'; return; }

    fetchInbox(currentUserId);

    // MQTT Setup
    const mqttClient = mqtt.connect(MQTT_BROKER, {
      clientId: `web_${currentUserId}_${Math.random().toString(16).substr(2, 6)}`,
      keepalive: 60, clean: true,
    });

    mqttClient.on('connect', () => {
      console.log("MQTT Connected");
      mqttClient.subscribe(`/user/${currentUserId}/private`);
    });

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

  // Preview Handling
  useEffect(() => {
    if (!isPreview) return;

    let activeTracks = [];
    const startPreview = async () => {
      try {
        const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
        setLocalMicTrack(mic);
        setLocalCameraTrack(cam);
        activeTracks = [mic, cam];
        if (previewRef.current) cam.play(previewRef.current);
      } catch (err) { console.error("Preview error:", err); }
    };

    startPreview();

    return () => {
      // Cleanup tracks if we cancel preview (but keep them if we enter call)
      // Logic handled in button handlers mostly, but good to have safety here
    };
  }, [isPreview]);

  // --- API CALLS ---
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

  // --- RENDER HELPERS ---
  const handleStartCall = () => {
    setIsPreview(false);
    setIsInCall(true);
  };

  const handleCancelPreview = () => {
    setIsPreview(false);
    localCameraTrack?.stop(); localCameraTrack?.close();
    localMicTrack?.stop(); localMicTrack?.close();
    setLocalCameraTrack(null);
    setLocalMicTrack(null);
  };

  const handleLeaveCall = () => {
    setIsInCall(false);
    localCameraTrack?.stop(); localCameraTrack?.close();
    localMicTrack?.stop(); localMicTrack?.close();
    setLocalCameraTrack(null);
    setLocalMicTrack(null);
  };

  // --- VIEW: VIDEO CALL ---
  if (isInCall && selectedUser) {
    return (
      <AgoraRTCProvider client={agoraClient}>
        <VideoRoom
          appId={AGORA_APP_ID}
          channelName={getRoomId(currentUserId, selectedUser.userId)}
          token={null}
          uid={currentUserId}
          onLeave={handleLeaveCall}
          localCameraTrack={localCameraTrack}
          localMicrophoneTrack={localMicTrack}
          micOn={micOn} setMicOn={setMicOn}
          cameraOn={cameraOn} setCameraOn={setCameraOn}
        />
      </AgoraRTCProvider>
    );
  }

  // --- VIEW: MAIN CHAT ---
  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden relative">

      {/* PREVIEW MODAL */}
      {isPreview && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-900 rounded-3xl overflow-hidden border border-gray-800 shadow-2xl flex flex-col">
            <div className="relative aspect-[3/4] bg-black">
              <div ref={previewRef} className="w-full h-full" />
              {!cameraOn && <div className="absolute inset-0 flex items-center justify-center text-white">Camera Off</div>}
            </div>
            <div className="p-6 bg-gray-900 space-y-6">
              <div className="flex justify-center gap-8">
                <button onClick={() => setMicOn(!micOn)} className={`p-4 rounded-full ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500'}`}>{micOn ? <Mic className="text-white" /> : <MicOff className="text-white" />}</button>
                <button onClick={() => setCameraOn(!cameraOn)} className={`p-4 rounded-full ${cameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500'}`}>{cameraOn ? <Video className="text-white" /> : <VideoOff className="text-white" />}</button>
              </div>
              <div className="flex gap-3">
                <button onClick={handleCancelPreview} className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-700">Cancel</button>
                <button onClick={handleStartCall} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 shadow-lg shadow-blue-900/20">Join Call</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR (USER LIST) - Hidden on mobile if user selected */}
      <div className={`
        flex-col border-r h-full bg-white transition-all w-full md:w-[350px] shrink-0
        ${selectedUser ? 'hidden md:flex' : 'flex'}
      `}>
        <div className="h-16 px-6 flex items-center justify-between border-b shrink-0 bg-white">
          <h1 className="font-bold text-2xl text-blue-600 tracking-tight">Chats</h1>
          <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map(u => (
            <div key={u.userId} onClick={() => setSelectedUser(u)} className={`p-3 rounded-xl flex gap-3 hover:bg-gray-50 cursor-pointer transition-colors ${selectedUser?.userId === u.userId ? 'bg-blue-50' : ''}`}>
              <img src={u.avatarUrl || "https://github.com/shadcn.png"} className="w-12 h-12 rounded-full object-cover bg-gray-200" alt="" />
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="font-semibold text-gray-900 truncate">{u.fullName}</p>
                <p className="text-sm text-gray-500 truncate">{u.lastMessage || 'Start a conversation'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA - Hidden on mobile if NO user selected */}
      <div className={`
        flex-1 flex flex-col h-full bg-gray-50 relative w-full
        ${!selectedUser ? 'hidden md:flex items-center justify-center' : 'flex'}
      `}>
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b bg-white/90 backdrop-blur sticky top-0 z-10 shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-600"><ArrowLeft size={22} /></button>
                <img src={selectedUser.avatarUrl || "https://github.com/shadcn.png"} className="w-10 h-10 rounded-full object-cover" alt="" />
                <div>
                  <p className="font-bold text-gray-900 leading-tight">{selectedUser.fullName}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-green-500 rounded-full block"></span>
                    <p className="text-xs text-gray-500">Online</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsPreview(true)} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"><VideoIcon size={22} /></button>
                <button onClick={() => setShowInfo(!showInfo)} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-full hidden md:block"><Info size={22} /></button>
              </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f3f4f6]">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.myMessage ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-2xl shadow-sm text-[15px] break-words ${m.myMessage
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                    }`}>
                    {m.type === 'text' ? (
                      m.message
                    ) : (
                      <img
                        src={m.fileUrl}
                        className="rounded-lg max-w-full cursor-pointer hover:opacity-90 mt-1"
                        onClick={() => window.open(m.fileUrl)}
                        alt="attachment"
                      />
                    )}
                    <div className={`text-[10px] mt-1 opacity-70 ${m.myMessage ? 'text-blue-100' : 'text-gray-400'}`}>
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 md:p-4 bg-white border-t shrink-0 pb-[env(safe-area-inset-bottom)]">
              <div className="max-w-4xl mx-auto flex items-end gap-2">
                <label className="p-3 text-gray-400 hover:text-blue-600 cursor-pointer hover:bg-gray-100 rounded-full transition-colors mb-0.5">
                  <ImageIcon size={22} />
                  <input type="file" className="hidden" />
                </label>
                <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                  <textarea
                    rows={1}
                    value={inputMsg}
                    onChange={e => setInputMsg(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage('text', inputMsg);
                      }
                    }}
                    className="w-full bg-transparent outline-none resize-none text-gray-800 max-h-32"
                    placeholder="Type a message..."
                  />
                </div>
                <button
                  onClick={() => sendMessage('text', inputMsg)}
                  disabled={!inputMsg.trim()}
                  className="p-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all mb-0.5"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Info size={32} />
            </div>
            <p>Select a conversation to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
