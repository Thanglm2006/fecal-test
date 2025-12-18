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

  const [isInCall, setIsInCall] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localCameraTrack, setLocalCameraTrack] = useState(null);
  const [localMicTrack, setLocalMicTrack] = useState(null);

  const messagesEndRef = useRef(null);
  const previewRef = useRef(null);
  const [showInfo, setShowInfo] = useState(false);

  // Use a more stable Room ID generation
  const getRoomId = (u1, u2) => {
    const ids = [String(u1), String(u2)].sort();
    return `${ids[0]}-${ids[1]}`;
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!currentUserId || !token) { window.location.href = '/login'; return; }

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

  useEffect(() => {
    if (!isPreview) return;
    let tracks = [];
    const startPreview = async () => {
      try {
        const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
        setLocalMicTrack(mic);
        setLocalCameraTrack(cam);
        tracks = [mic, cam];
        if (previewRef.current) cam.play(previewRef.current);
      } catch (err) { console.error("Preview error:", err); }
    };
    startPreview();
    return () => {
      tracks.forEach(t => { t.stop(); t.close(); });
    };
  }, [isPreview]);

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

  if (isInCall && selectedUser) {
    return (
      <AgoraRTCProvider client={agoraClient}>
        <VideoRoom
          appId={AGORA_APP_ID}
          channelName={getRoomId(currentUserId, selectedUser.userId)}
          token={null}
          uid={Number(currentUserId)} // Ensure UID is a number
          onLeave={() => { setIsInCall(false); localCameraTrack?.stop(); localMicTrack?.stop(); }}
          localCameraTrack={localCameraTrack}
          localMicrophoneTrack={localMicTrack}
          micOn={micOn} setMicOn={setMicOn}
          cameraOn={cameraOn} setCameraOn={setCameraOn}
        />
      </AgoraRTCProvider>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden relative">
      {isPreview && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md aspect-[9/16] bg-gray-900 rounded-3xl overflow-hidden relative border border-gray-700 shadow-2xl">
            <div ref={previewRef} className="w-full h-full" />
            {!cameraOn && <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-white font-medium">Camera Is Off</div>}
            <div className="absolute bottom-8 w-full flex justify-center gap-6 z-10">
              <button onClick={() => setMicOn(!micOn)} className={`p-4 rounded-full ${micOn ? 'bg-white/20 backdrop-blur-md' : 'bg-red-500'}`}>{micOn ? <Mic /> : <MicOff />}</button>
              <button onClick={() => setCameraOn(!cameraOn)} className={`p-4 rounded-full ${cameraOn ? 'bg-white/20 backdrop-blur-md' : 'bg-red-500'}`}>{cameraOn ? <Video /> : <VideoOff />}</button>
            </div>
          </div>
          <div className="flex w-full max-w-md gap-4 mt-6">
            <button onClick={() => setIsPreview(false)} className="flex-1 py-4 bg-gray-800 text-white rounded-2xl font-bold">Hủy</button>
            <button onClick={() => { setIsPreview(false); setIsInCall(true); }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold">Bắt đầu gọi</button>
          </div>
        </div>
      )}

      <div className={`w-full md:w-[350px] flex-col border-r h-full bg-white transition-all ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="h-16 px-6 flex items-center justify-between border-b shrink-0">
          <h1 className="font-bold text-2xl text-blue-600 tracking-tight">Messages</h1>
          <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(u => (
            <div key={u.userId} onClick={() => setSelectedUser(u)} className={`p-4 mx-2 my-1 rounded-xl flex gap-3 hover:bg-gray-50 cursor-pointer transition-colors ${selectedUser?.userId === u.userId ? 'bg-blue-50' : ''}`}>
              <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover bg-gray-200" alt="" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <p className="font-semibold text-gray-900 truncate">{u.fullName}</p>
                </div>
                <p className="text-sm text-gray-500 truncate">{u.lastMessage || 'Bắt đầu cuộc trò chuyện'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`flex-1 flex flex-col h-full bg-gray-50 ${!selectedUser ? 'hidden md:flex items-center justify-center text-gray-400' : 'flex'}`}>
        {selectedUser ? (
          <>
            <div className="h-16 px-4 flex items-center justify-between border-b bg-white/80 backdrop-blur-md sticky top-0 z-20 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20} /></button>
                <div className="relative">
                  <img src={selectedUser.avatarUrl} className="w-10 h-10 rounded-full object-cover" alt="" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                </div>
                <div>
                  <p className="font-bold text-gray-900 leading-tight">{selectedUser.fullName}</p>
                  <p className="text-[11px] text-green-600 font-medium">Đang hoạt động</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setIsPreview(true)} className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"><VideoIcon size={22} /></button>
                <button onClick={() => setShowInfo(!showInfo)} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-full hidden md:block transition-colors"><Info size={22} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.myMessage ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] md:max-w-[70%] px-4 py-2.5 rounded-2xl shadow-sm text-[15px] ${m.myMessage ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>
                    {m.type === 'text' ? m.message : <img src={m.fileUrl} className="rounded-lg max-w-full cursor-pointer hover:opacity-90" onClick={() => window.open(m.fileUrl)} />}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t sticky bottom-0">
              <div className="max-w-4xl mx-auto flex items-center gap-2">
                <label className="p-2 text-gray-400 hover:text-blue-600 cursor-pointer transition-colors"><ImageIcon size={22} /><input type="file" className="hidden" /></label>
                <input
                  value={inputMsg} onChange={e => setInputMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage('text', inputMsg)}
                  className="flex-1 bg-gray-100 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Nhập tin nhắn..."
                />
                <button onClick={() => sendMessage('text', inputMsg)} disabled={!inputMsg.trim()} className="p-3 bg-blue-600 text-white rounded-xl disabled:opacity-50 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"><Send size={20} /></button>
              </div>
            </div>
          </>
        ) : "Chọn một cuộc trò chuyện để bắt đầu"}
      </div>
    </div>
  );
}
