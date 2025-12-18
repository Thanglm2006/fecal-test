import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon } from 'lucide-react';

// --- AGORA IMPORTS ---
import AgoraRTC, { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

const API_URL = 'http://localhost:8080/api';
const MQTT_BROKER = 'ws://localhost:9001';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e"; // <--- ĐIỀN APP ID CỦA BẠN VÀO ĐÂY

// Tạo Client Agora ở ngoài component để tránh re-create
const agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export default function Chat() {
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem('userId'));

  const [client, setClient] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');

  // --- STATE CHO VIDEO CALL ---
  const [isInCall, setIsInCall] = useState(false);

  const messagesEndRef = useRef(null);

  // --- 1. SETUP MQTT & CHAT ---
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!currentUserId || !token) {
      window.location.href = '/login';
      return;
    }

    fetchInbox(currentUserId);

    const mqttClient = mqtt.connect(MQTT_BROKER, {
      clientId: `web_${currentUserId}_${Math.random().toString(16).substring(2, 8)}`,
      keepalive: 60,
      clean: true,
    });

    mqttClient.on('connect', () => {
      console.log('✅ Connected to MQTT Broker');
      mqttClient.subscribe(`/user/${currentUserId}/private`);
    });

    mqttClient.on('message', (topic, payload) => {
      const data = JSON.parse(payload.toString());
      if (topic.startsWith('/chat/')) {
        setMessages((prev) => [...prev, mapMqttMessageToUI(data, currentUserId)]);
      }
    });

    setClient(mqttClient);

    return () => {
      if (mqttClient) mqttClient.end();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedUser || !client || !currentUserId) return;
    const roomId = getRoomId(currentUserId, selectedUser.userId);
    const topic = `/chat/${roomId}`;

    client.subscribe(topic);
    loadHistory(currentUserId, selectedUser.userId);

    return () => {
      client.unsubscribe(topic);
    };
  }, [selectedUser, client, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- API CALLS ---
  const fetchInbox = async (myId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/conversations?userId=${myId}`, {
        headers: { token: localStorage.getItem('token') }
      });
      setConversations(res.data);
    } catch (error) { console.error("Lỗi load inbox:", error); }
  };

  const loadHistory = async (senderId, receiverId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/messages`, {
        params: { senderId: senderId, receiverId: receiverId, page: 0 },
        headers: { token: localStorage.getItem('token') }
      });

      if (res.data.data && Array.isArray(res.data.data)) {
        const uiMessages = res.data.data.map(apiMsg => ({
          message: apiMsg.content,
          myMessage: String(apiMsg.senderId || apiMsg.sender) === String(senderId) || apiMsg.sent === true,
          fileUrl: apiMsg.fileUrl,
          timestamp: apiMsg.timestamp,
          type: apiMsg.type
        }));
        setMessages(uiMessages.reverse());
      } else {
        setMessages([]);
      }
    } catch (e) { console.error("Lỗi load history:", e); setMessages([]); }
  };

  const sendMessage = async (type = 'text', content) => {
    if (!content.trim() && type === 'text') return;
    if (!client || !selectedUser) return;

    const payload = {
      token: localStorage.getItem('token'),
      sender: currentUserId,
      recipient: selectedUser.userId.toString(),
      type: type,
      content: content,
      timestamp: new Date().toISOString()
    };
    const roomId = getRoomId(currentUserId, selectedUser.userId);
    client.publish(`/chat/${roomId}`, JSON.stringify(payload));
    if (type === 'text') setInputMsg('');
  };

  const handleFileUpload = async (e) => {
    // ... (Giữ nguyên logic upload ảnh của bạn)
    // Code upload ảnh ở đây (đã rút gọn để tập trung vào logic gọi)
    const file = e.target.files[0];
    if (!file) return;
    // Gọi API lấy signature -> Upload Cloudinary -> Gọi sendMessage('image', url)
    // (Bạn copy lại logic cũ vào đây nhé)
  };

  // --- LOGIC VIDEO CALL ---

  const handleStartCall = () => {
    if (!selectedUser) return;

    // 1. Gửi tin nhắn tự động báo cho bên kia biết
    // Dùng emoji đặc biệt để bên kia dễ nhận biết
    sendMessage('text', '📞 Đang bắt đầu cuộc gọi video... Bấm vào icon máy quay để tham gia!');

    // 2. Mở giao diện gọi
    setIsInCall(true);
  };

  // --- UTILS ---
  const getRoomId = (uid1, uid2) => {
    const id1 = String(uid1);
    const id2 = String(uid2);
    return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
  };

  const mapMqttMessageToUI = (mqttData, myId) => {
    return {
      message: mqttData.content,
      myMessage: String(mqttData.sender) === String(myId),
      timestamp: mqttData.timestamp,
      type: mqttData.type,
      fileUrl: (mqttData.type === 'image' || mqttData.type === 'Image') ? mqttData.content : null
    };
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  // --- RENDER ---
  return (
    <div className="flex h-screen bg-gray-100 relative">

      {/* --- VIDEO CALL OVERLAY --- */}
      {/* Hiển thị đè lên toàn bộ app nếu đang gọi */}
      {isInCall && selectedUser && (
        <div className="absolute inset-0 z-50">
          <AgoraRTCProvider client={agoraClient}>
            <VideoRoom
              appId={AGORA_APP_ID}
              // Quan trọng: Channel Name chính là Room ID của Chat -> 2 người sẽ vào cùng phòng
              channelName={getRoomId(currentUserId, selectedUser.userId)}
              token={null} // Để null nếu test mode, hoặc gọi API lấy token nếu production
              uid={currentUserId} // Dùng luôn User ID của hệ thống làm UID Agora
              onLeave={() => setIsInCall(false)}
            />
          </AgoraRTCProvider>
        </div>
      )}

      {/* Sidebar */}
      <div className="w-1/4 bg-white border-r flex flex-col">
        <div className="p-4 border-b bg-blue-600 text-white flex justify-between items-center">
          <h2 className="font-bold text-lg">Tin nhắn</h2>
          <button onClick={handleLogout}><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((user) => (
            <div
              key={user.userId}
              onClick={() => setSelectedUser(user)}
              className={`p-3 flex items-center cursor-pointer hover:bg-gray-100 ${selectedUser?.userId === user.userId ? 'bg-blue-50 border-l-4 border-blue-600' : ''}`}
            >
              <img src={user.avatarUrl || 'https://via.placeholder.com/40'} className="w-12 h-12 rounded-full mr-3 object-cover" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{user.fullName}</p>
                <p className="text-sm truncate text-gray-500">{user.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {selectedUser ? (
          <>
            {/* Header Chat - THÊM NÚT CALL Ở ĐÂY */}
            <div className="p-4 bg-white border-b flex items-center shadow-sm justify-between">
              <div className="flex items-center">
                <img src={selectedUser.avatarUrl || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full mr-3 object-cover" />
                <div>
                  <h3 className="font-bold text-gray-800">{selectedUser.fullName}</h3>
                  <span className="text-xs text-green-500 flex items-center">● Đang hoạt động</span>
                </div>
              </div>

              {/* Button Video Call */}
              <button
                onClick={handleStartCall}
                className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition"
                title="Gọi Video"
              >
                <VideoIcon size={24} />
              </button>
            </div>

            {/* Message List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundRepeat: 'repeat' }}>
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.myMessage ? 'justify-end' : 'justify-start'}`}>
                  {!msg.myMessage && <img src={selectedUser.avatarUrl} className="w-8 h-8 rounded-full mr-2 self-end mb-1" />}

                  <div className={`max-w-xs md:max-w-md p-3 shadow-md ${msg.myMessage ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' : 'bg-white text-gray-800 rounded-2xl rounded-tl-none'}`}>
                    {(msg.type === 'Image' || msg.type === 'image') ? (
                      <img src={msg.fileUrl || msg.message} className="rounded-lg max-h-60 cursor-pointer" onClick={() => window.open(msg.fileUrl, '_blank')} />
                    ) : (
                      <p>{msg.message}</p>
                    )}
                    <span className="text-[10px] block text-right mt-1 opacity-70">
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t flex items-center gap-3">
              <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-full text-blue-600">
                <ImageIcon size={24} />
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              </label>
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-full pl-5 pr-10 py-3 focus:outline-none focus:border-blue-500"
                placeholder="Nhập tin nhắn..."
                value={inputMsg}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage('text', inputMsg)}
                onChange={(e) => setInputMsg(e.target.value)}
              />
              <button onClick={() => sendMessage('text', inputMsg)} className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700">
                <Send size={20} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50 flex-col text-center text-gray-400">
            <p>Chọn đoạn chat để bắt đầu</p>
          </div>
        )}
      </div>
    </div>
  );
}
