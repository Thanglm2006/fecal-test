import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft, Info, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import AgoraRTC from "agora-rtc-sdk-ng";
import AgoraRTCProvider from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

const API_URL = 'http://localhost:8080/api';
const MQTT_BROKER = 'ws://localhost:9001';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e"; // Thay bằng App ID của bạn

// Client Agora tạo 1 lần duy nhất
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
  const [showInfo, setShowInfo] = useState(false);

  // Media Device States
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localCameraTrack, setLocalCameraTrack] = useState(null);
  const [localMicTrack, setLocalMicTrack] = useState(null);

  const messagesEndRef = useRef(null);
  const previewRef = useRef(null);

  // --- INIT & MQTT ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!currentUserId || !token) {
      window.location.href = '/login';
      return;
    }
    fetchInbox(currentUserId);

    const mqttClient = mqtt.connect(MQTT_BROKER, {
      clientId: `web_${currentUserId}_${Math.random().toString(16).substring(2, 8)}`,
      keepalive: 60, clean: true,
    });

    mqttClient.on('connect', () => {
      mqttClient.subscribe(`/user/${currentUserId}/private`);
    });

    mqttClient.on('message', (topic, payload) => {
      const data = JSON.parse(payload.toString());
      if (topic.startsWith('/chat/')) {
        setMessages((prev) => [...prev, mapMessage(data, currentUserId)]);
      }
    });

    setClient(mqttClient);
    return () => mqttClient.end();
  }, [currentUserId]);

  // --- LOAD MESSAGES ---
  useEffect(() => {
    if (!selectedUser || !client) return;
    const roomId = getRoomId(currentUserId, selectedUser.userId);
    client.subscribe(`/chat/${roomId}`);
    loadHistory(currentUserId, selectedUser.userId);
    return () => client.unsubscribe(`/chat/${roomId}`);
  }, [selectedUser]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, selectedUser]); // Scroll khi có tin nhắn mới hoặc đổi user

  // --- PREVIEW CAMERA ---
  useEffect(() => {
    if (!isPreview) return;
    let mounted = true;

    async function startPreview() {
      // Clear old tracks
      if (localCameraTrack) localCameraTrack.close();
      if (localMicTrack) localMicTrack.close();

      const mic = await AgoraRTC.createMicrophoneAudioTrack();
      const cam = await AgoraRTC.createCameraVideoTrack();

      if (!mounted) { mic.close(); cam.close(); return; }

      setLocalMicTrack(mic);
      setLocalCameraTrack(cam);
      if (cameraOn && previewRef.current) cam.play(previewRef.current);
    }
    startPreview();
    return () => mounted = false;
  }, [isPreview]);

  // Toggle Cam/Mic logic
  useEffect(() => { if (localMicTrack) localMicTrack.setEnabled(micOn); }, [micOn, localMicTrack]);
  useEffect(() => {
    if (!localCameraTrack) return;
    if (cameraOn) {
      localCameraTrack.setEnabled(true);
      if (previewRef.current) localCameraTrack.play(previewRef.current);
    } else {
      localCameraTrack.setEnabled(false);
      localCameraTrack.stop();
    }
  }, [cameraOn, localCameraTrack]);


  // --- HELPERS ---
  const fetchInbox = async (id) => {
    try {
      const res = await axios.get(`${API_URL}/chat/inbox/${id}`, { headers: { token: localStorage.getItem('token') } });
      setConversations(res.data);
    } catch (e) { }
  };

  const loadHistory = async (u1, u2) => {
    try {
      const res = await axios.get(`${API_URL}/chat/messages`, { params: { user1: u1, user2: u2, page: 0 }, headers: { token: localStorage.getItem('token') } });
      if (res.data.data) setMessages(res.data.data.map(m => mapMessage(m, u1)).reverse());
    } catch (e) { setMessages([]); }
  };

  const mapMessage = (data, myId) => ({
    message: data.content,
    myMessage: String(data.sender) === String(myId),
    timestamp: data.timestamp,
    type: data.type,
    fileUrl: data.type !== 'text' ? data.content : null
  });

  const sendMessage = (type, content) => {
    if (!content.trim() && type === 'text') return;
    const roomId = getRoomId(currentUserId, selectedUser.userId);
    const payload = {
      token: localStorage.getItem('token'),
      sender: currentUserId, recipient: selectedUser.userId.toString(),
      type, content, timestamp: new Date().toISOString()
    };
    client.publish(`/chat/${roomId}`, JSON.stringify(payload));
    if (type === 'text') setInputMsg('');
  };

  const getRoomId = (u1, u2) => String(u1) < String(u2) ? `${u1}-${u2}` : `${u2}-${u1}`;

  // --- RENDER ---
  return (
    // FIX: Sử dụng 100dvh để tránh bị mất phần dưới trên Mobile
    <div className="flex h-[100dvh] w-full bg-white relative overflow-hidden">

      {/* 1. CALL OVERLAY (Luôn đè lên trên cùng) */}
      {isInCall && (
        <div className="fixed inset-0 z-[9999] w-full h-full bg-black">
          <AgoraRTCProvider client={agoraClient}>
            <VideoRoom
              appId={AGORA_APP_ID}
              channelName={getRoomId(currentUserId, selectedUser.userId)}
              token={null} // Nếu dùng App Certificate, phải gọi API lấy token và truyền vào đây
              uid={currentUserId}
              onLeave={() => { setIsInCall(false); localCameraTrack?.close(); localMicTrack?.close(); }}
              localCameraTrack={localCameraTrack} localMicrophoneTrack={localMicTrack}
              micOn={micOn} setMicOn={setMicOn} cameraOn={cameraOn} setCameraOn={setCameraOn}
            />
          </AgoraRTCProvider>
        </div>
      )}

      {/* 2. PREVIEW MODAL */}
      {isPreview && (
        <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4">
          {/* Preview UI tối giản */}
          <div className="w-full max-w-sm bg-gray-900 rounded-2xl overflow-hidden aspect-[3/4] relative shadow-2xl">
            <div ref={previewRef} className="w-full h-full object-cover"></div>
            {!cameraOn && <div className="absolute inset-0 flex items-center justify-center text-white font-bold">CAMERA OFF</div>}
            <div className="absolute bottom-6 left-0 w-full flex justify-center gap-6">
              <button onClick={() => setMicOn(!micOn)} className={`p-4 rounded-full ${micOn ? 'bg-white text-black' : 'bg-red-500 text-white'}`}>{micOn ? <Mic /> : <MicOff />}</button>
              <button onClick={() => setCameraOn(!cameraOn)} className={`p-4 rounded-full ${cameraOn ? 'bg-white text-black' : 'bg-red-500 text-white'}`}>{cameraOn ? <Video /> : <VideoOff />}</button>
            </div>
          </div>
          <div className="flex gap-4 mt-6 w-full max-w-sm">
            <button onClick={() => setIsPreview(false)} className="flex-1 py-3 bg-gray-700 rounded-xl text-white font-semibold">Hủy</button>
            <button onClick={() => { setIsPreview(false); setIsInCall(true); }} className="flex-1 py-3 bg-green-500 rounded-xl text-white font-bold">Bắt đầu gọi</button>
          </div>
        </div>
      )}

      {/* 3. LIST USERS (Sidebar) - Ẩn trên mobile khi đã chọn user */}
      <div className={`w-full md:w-[350px] flex-col border-r bg-white h-full ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="h-16 flex items-center justify-between px-4 border-b bg-white">
          <h1 className="text-xl font-bold">Chats</h1>
          <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }}><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map(u => (
            <div key={u.userId} onClick={() => setSelectedUser(u)} className={`p-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer ${selectedUser?.userId === u.userId ? 'bg-blue-50' : ''}`}>
              <img src={u.avatarUrl} className="w-12 h-12 rounded-full object-cover bg-gray-200" />
              <div className="overflow-hidden">
                <p className="font-semibold truncate">{u.fullName}</p>
                <p className="text-sm text-gray-500 truncate">{u.lastMessage || 'Bắt đầu trò chuyện'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. MAIN CHAT AREA */}
      <div className={`flex-1 flex flex-col h-full bg-white min-w-0 ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            {/* Header */}
            <div className="h-16 border-b flex items-center justify-between px-4 shrink-0 bg-white shadow-sm z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedUser(null)} className="md:hidden"><ArrowLeft /></button>
                <img src={selectedUser.avatarUrl} className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <p className="font-bold leading-tight">{selectedUser.fullName}</p>
                  <p className="text-xs text-green-600">Đang hoạt động</p>
                </div>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setIsPreview(true)} className="text-blue-600"><VideoIcon /></button>
                <button onClick={() => setShowInfo(!showInfo)} className="hidden md:block text-blue-600"><Info /></button>
              </div>
            </div>

            {/* Message List - Quan trọng: min-h-0 để scroll hoạt động trong flex column */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F0F2F5] min-h-0">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.myMessage ? 'justify-end' : ''}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl text-[15px] ${m.myMessage ? 'bg-blue-600 text-white' : 'bg-white text-black shadow-sm'}`}>
                    {m.type === 'text' ? m.message : <img src={m.fileUrl} className="rounded-lg max-w-full" />}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area - Sticky Bottom */}
            <div className="p-3 bg-white border-t shrink-0 flex items-center gap-2 safe-area-bottom">
              <label className="p-2 text-blue-600 cursor-pointer"><ImageIcon /> <input type="file" className="hidden" onChange={(e) => {/* logic upload */ }} /></label>
              <input
                value={inputMsg} onChange={e => setInputMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage('text', inputMsg)}
                className="flex-1 bg-gray-100 rounded-full px-4 py-2 outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Nhắn tin..."
              />
              <button onClick={() => sendMessage('text', inputMsg)} className="p-2 text-blue-600"><Send /></button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">Chọn tin nhắn để xem</div>
        )}
      </div>

      {/* 5. INFO SIDEBAR (Desktop only) */}
      {showInfo && selectedUser && (
        <div className="w-[300px] border-l bg-white hidden lg:flex flex-col items-center p-6">
          <img src={selectedUser.avatarUrl} className="w-24 h-24 rounded-full mb-4 object-cover" />
          <h2 className="text-xl font-bold">{selectedUser.fullName}</h2>
        </div>
      )}
    </div>
  );
}
