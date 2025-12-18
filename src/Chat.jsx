import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft, Info, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import AgoraRTC from "agora-rtc-sdk-ng";
import AgoraRTCProvider from "agora-rtc-react";
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

  // Trạng thái gọi
  const [isInCall, setIsInCall] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  // Media Devices
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localCameraTrack, setLocalCameraTrack] = useState(null);
  const [localMicTrack, setLocalMicTrack] = useState(null);

  const messagesEndRef = useRef(null);
  const previewRef = useRef(null);
  const [showInfo, setShowInfo] = useState(false);

  // --- INIT MQTT ---
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
      if (t.startsWith('/chat/')) setMessages(prev => [...prev, mapMsg(d, currentUserId)]);
    });

    setClient(mqttClient);
    return () => mqttClient.end();
  }, [currentUserId]);

  // --- LOAD CHAT ---
  useEffect(() => {
    if (!selectedUser || !client) return;
    const rid = getRoomId(currentUserId, selectedUser.userId);
    client.subscribe(`/chat/${rid}`);
    loadHistory(currentUserId, selectedUser.userId);
    return () => client.unsubscribe(`/chat/${rid}`);
  }, [selectedUser]);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), [messages]);

  // --- PREVIEW ---
  useEffect(() => {
    if (!isPreview) return;
    let mounted = true;
    const startPreview = async () => {
      if (localCameraTrack) localCameraTrack.close();
      if (localMicTrack) localMicTrack.close();

      // Tạo track mới
      const [mic, cam] = await Promise.all([
        AgoraRTC.createMicrophoneAudioTrack(),
        AgoraRTC.createCameraVideoTrack()
      ]);

      if (!mounted) { mic.close(); cam.close(); return; }
      setLocalMicTrack(mic); setLocalCameraTrack(cam);
      cam.play(previewRef.current);
    };
    startPreview();
    return () => mounted = false;
  }, [isPreview]);

  // Toggle Track Logic
  useEffect(() => { if (localMicTrack) localMicTrack.setEnabled(micOn); }, [micOn, localMicTrack]);
  useEffect(() => {
    if (!localCameraTrack) return;
    localCameraTrack.setEnabled(cameraOn);
    if (cameraOn && isPreview && previewRef.current) localCameraTrack.play(previewRef.current);
  }, [cameraOn, localCameraTrack, isPreview]);

  // --- API & UTILS ---
  const fetchInbox = async (id) => {
    try { setConversations((await axios.get(`${API_URL}/chat/inbox/${id}`, { headers: { token: localStorage.getItem('token') } })).data); } catch { }
  };
  const loadHistory = async (u1, u2) => {
    try {
      const res = await axios.get(`${API_URL}/chat/messages`, { params: { user1: u1, user2: u2, page: 0 }, headers: { token: localStorage.getItem('token') } });
      if (res.data.data) setMessages(res.data.data.map(m => mapMsg(m, u1)).reverse());
    } catch { setMessages([]); }
  };
  const mapMsg = (d, myId) => ({
    message: d.content, myMessage: String(d.sender) === String(myId),
    timestamp: d.timestamp, type: d.type, fileUrl: d.type !== 'text' ? d.content : null
  });
  const sendMessage = (type, content) => {
    if (!content.trim() && type === 'text') return;
    const rid = getRoomId(currentUserId, selectedUser.userId);
    client.publish(`/chat/${rid}`, JSON.stringify({
      token: localStorage.getItem('token'), sender: currentUserId, recipient: selectedUser.userId.toString(),
      type, content, timestamp: new Date().toISOString()
    }));
    if (type === 'text') setInputMsg('');
  };
  const getRoomId = (u1, u2) => String(u1) < String(u2) ? `${u1}-${u2}` : `${u2}-${u1}`;

  // --- RENDER CHÍNH ---

  // Nếu đang gọi video -> Render VideoRoom CHIẾM TOÀN BỘ, ẩn Chat đi
  if (isInCall && selectedUser) {
    return (
      <AgoraRTCProvider client={agoraClient}>
        <VideoRoom
          appId={AGORA_APP_ID}
          channelName={getRoomId(currentUserId, selectedUser.userId)}
          token={null}
          uid={currentUserId}
          onLeave={() => { setIsInCall(false); localCameraTrack?.close(); localMicTrack?.close(); }}
          localCameraTrack={localCameraTrack} localMicrophoneTrack={localMicTrack}
          micOn={micOn} setMicOn={setMicOn} cameraOn={cameraOn} setCameraOn={setCameraOn}
        />
      </AgoraRTCProvider>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden relative">

      {/* 1. PREVIEW MODAL */}
      {isPreview && (
        <div className="absolute inset-0 z-[50] bg-black/95 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm aspect-[3/4] bg-gray-900 rounded-xl overflow-hidden relative border border-gray-700">
            <div ref={previewRef} className="w-full h-full object-cover"></div>
            {!cameraOn && <div className="absolute inset-0 flex items-center justify-center text-white font-bold">CAM OFF</div>}
            <div className="absolute bottom-4 w-full flex justify-center gap-6">
              <button onClick={() => setMicOn(!micOn)} className={`p-4 rounded-full ${micOn ? 'bg-white text-black' : 'bg-red-500 text-white'}`}>{micOn ? <Mic /> : <MicOff />}</button>
              <button onClick={() => setCameraOn(!cameraOn)} className={`p-4 rounded-full ${cameraOn ? 'bg-white text-black' : 'bg-red-500 text-white'}`}>{cameraOn ? <Video /> : <VideoOff />}</button>
            </div>
          </div>
          <div className="flex w-full max-w-sm gap-3 mt-4">
            <button onClick={() => setIsPreview(false)} className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-bold">Hủy</button>
            <button onClick={() => { setIsPreview(false); setIsInCall(true); }} className="flex-1 py-3 bg-green-600 text-white rounded-lg font-bold">Vào gọi</button>
          </div>
        </div>
      )}

      {/* 2. SIDEBAR (User List) */}
      <div className={`w-full md:w-[320px] flex-col border-r h-full bg-white ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="h-16 px-4 flex items-center justify-between border-b bg-gray-50 shrink-0">
          <h1 className="font-bold text-xl text-blue-600">Chat App</h1>
          <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }}><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(u => (
            <div key={u.userId} onClick={() => setSelectedUser(u)} className={`p-4 flex gap-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 ${selectedUser?.userId === u.userId ? 'bg-blue-50' : ''}`}>
              <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover bg-gray-300" />
              <div className="overflow-hidden">
                <p className="font-semibold truncate">{u.fullName}</p>
                <p className="text-sm text-gray-500 truncate">{u.lastMessage || 'Chưa có tin nhắn'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. MAIN CHAT */}
      <div className={`flex-1 flex flex-col h-full relative ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            {/* Header Chat */}
            <div className="h-16 px-4 flex items-center justify-between border-b shadow-sm shrink-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-2 -ml-2"><ArrowLeft /></button>
                <img src={selectedUser.avatarUrl} className="w-9 h-9 rounded-full object-cover" />
                <div>
                  <p className="font-bold text-sm md:text-base">{selectedUser.fullName}</p>
                  <span className="text-xs text-green-500">● Online</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsPreview(true)} className="p-2 text-blue-600 bg-blue-50 rounded-full"><VideoIcon size={20} /></button>
                <button onClick={() => setShowInfo(!showInfo)} className="p-2 text-blue-600 bg-blue-50 rounded-full hidden md:block"><Info size={20} /></button>
              </div>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f2f4f7] min-h-0">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.myMessage ? 'justify-end' : ''}`}>
                  <div className={`max-w-[85%] md:max-w-[60%] px-4 py-2 rounded-2xl text-[15px] ${m.myMessage ? 'bg-blue-600 text-white' : 'bg-white text-black shadow-sm border'}`}>
                    {m.type === 'text' ? m.message : <img src={m.fileUrl} className="rounded-lg max-w-full" onClick={() => window.open(m.fileUrl)} />}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t bg-white shrink-0 flex items-center gap-2 safe-area-bottom">
              <label className="p-2 text-gray-500"><ImageIcon /> <input type=\"file\" className=\"hidden\" onChange={(e) => {/*Upload logic*/ }} /></label>
              <input
                value={inputMsg} onChange={e => setInputMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage('text', inputMsg)}
                className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Nhập tin nhắn..."
              />
              <button onClick={() => sendMessage('text', inputMsg)} disabled={!inputMsg.trim()} className="p-2.5 bg-blue-600 text-white rounded-full disabled:opacity-50"><Send size={18} /></button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50">Chọn tin nhắn để xem</div>
        )}
      </div>

      {/* 4. INFO PANEL */}
      {showInfo && selectedUser && (
        <div className="w-[300px] border-l bg-white hidden lg:flex flex-col items-center pt-10">
          <img src={selectedUser.avatarUrl} className="w-24 h-24 rounded-full mb-4 object-cover border-4 border-gray-100" />
          <h2 className="text-xl font-bold">{selectedUser.fullName}</h2>
        </div>
      )}
    </div>
  );
}
