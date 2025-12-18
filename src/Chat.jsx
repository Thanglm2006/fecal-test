import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft } from 'lucide-react';

// --- AGORA IMPORTS ---
import AgoraRTC, { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

const API_URL = 'https://api.job-fs.me/api';
const MQTT_BROKER = 'wss://mqtt.job-fs.me';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e";

// Initialize client outside to prevent re-creation
const agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export default function Chat() {
  const [currentUserId] = useState(() => localStorage.getItem('userId'));

  const [client, setClient] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');

  // --- STATE FOR VIDEO INTERVIEW ---
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
    const roomId = getChannelName(currentUserId, selectedUser.userId);
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

  // --- HELPER: Deterministic Channel Name ---
  const getChannelName = (uid1, uid2) => {
    const u1 = parseInt(uid1, 10);
    const u2 = parseInt(uid2, 10);
    return u1 < u2 ? `${u1}_${u2}` : `${u2}_${u1}`;
  };

  // --- API CALLS ---
  const fetchInbox = async (myId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/conversations?userId=${myId}`, {
        headers: { token: localStorage.getItem('token') }
      });
      setConversations(res.data);
    } catch (error) { console.error("Error load inbox:", error); }
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
    } catch (e) { console.error("Error load history:", e); setMessages([]); }
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

    const roomId = getChannelName(currentUserId, selectedUser.userId);
    client.publish(`/chat/${roomId}`, JSON.stringify(payload));
    if (type === 'text') setInputMsg('');
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    alert("Upload feature needs backend API signature.");
  };

  // --- INTERVIEW HANDLERS ---
  const handleStartCall = () => {
    if (!selectedUser) return;

    // 1. Inject System Message: Start
    const sysMsg = {
      message: "📞 Cuộc phỏng vấn đã bắt đầu",
      myMessage: true, // Right side
      timestamp: new Date().toISOString(),
      type: 'system'
    };
    setMessages(prev => [...prev, sysMsg]);

    setIsInCall(true);
  };

  // Callback passed to VideoRoom to detect when peer joins
  const handleRemoteJoined = () => {
    // 2. Inject System Message: Remote Joined
    const sysMsg = {
      message: "👤 Đã tham gia vào cuộc phỏng vấn",
      myMessage: false, // Left side
      timestamp: new Date().toISOString(),
      type: 'system'
    };
    setMessages(prev => [...prev, sysMsg]);
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

  const handleBackToList = () => {
    setSelectedUser(null);
  };

  // --- RENDER ---
  return (
    <div className="flex bg-gray-100 relative overflow-hidden" style={{ height: '100dvh' }}>

      {/* --- VIDEO CALL OVERLAY --- */}
      {isInCall && selectedUser && (
        <div className="absolute inset-0 z-[100] bg-black">
          <AgoraRTCProvider client={agoraClient}>
            <VideoRoom
              appId={AGORA_APP_ID}
              channelName={getChannelName(currentUserId, selectedUser.userId)}
              uid={currentUserId}
              onLeave={() => setIsInCall(false)}
              onRemoteJoined={handleRemoteJoined}
            />
          </AgoraRTCProvider>
        </div>
      )}

      {/* SIDEBAR */}
      <div className={`w-full md:w-1/4 bg-white border-r flex-col ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-blue-600 text-white flex justify-between items-center">
          <h2 className="font-bold text-lg">Messages</h2>
          <button onClick={handleLogout} className="hover:bg-blue-700 p-2 rounded-full transition-colors" aria-label="Logout">
            <LogOut size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((user) => (
            <div
              key={user.userId}
              onClick={() => setSelectedUser(user)}
              className={`p-3 flex items-center cursor-pointer hover:bg-gray-100 border-b border-gray-100 transition-colors ${selectedUser?.userId === user.userId ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
            >
              <img
                src={user.avatarUrl || 'https://via.placeholder.com/40'}
                alt={user.fullName}
                className="w-12 h-12 rounded-full mr-3 object-cover"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate text-gray-800">{user.fullName}</p>
                <p className="text-sm truncate text-gray-500">{user.lastMessage || "No messages"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT WINDOW */}
      <div className={`flex-1 flex flex-col bg-slate-50 h-full ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            {/* Header Chat */}
            <div className="p-3 md:p-4 bg-white border-b flex items-center shadow-sm justify-between flex-shrink-0">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <button
                  onClick={handleBackToList}
                  className="md:hidden text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors flex-shrink-0"
                  aria-label="Back"
                >
                  <ArrowLeft size={24} />
                </button>
                <img
                  src={selectedUser.avatarUrl || 'https://via.placeholder.com/40'}
                  alt={selectedUser.fullName}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-800 text-sm md:text-base truncate">{selectedUser.fullName}</h3>
                  <span className="text-[10px] md:text-xs text-green-500 flex items-center">● Active</span>
                </div>
              </div>
              <button
                onClick={handleStartCall}
                className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition-colors flex-shrink-0"
                aria-label="Start Video Interview"
              >
                <VideoIcon size={20} />
              </button>
            </div>

            {/* Message List */}
            <div
              className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4"
              style={{
                backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
                backgroundRepeat: 'repeat'
              }}
            >
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.myMessage ? 'justify-end' : 'justify-start'}`}>
                  {/* Handle System Messages */}
                  {msg.type === 'system' ? (
                    <div className="w-full text-center my-2">
                      <span className="bg-gray-200 text-gray-600 text-xs py-1 px-3 rounded-full">
                        {msg.message}
                      </span>
                    </div>
                  ) : (
                    <div className={`max-w-[75%] md:max-w-md p-3 shadow-md text-sm md:text-base ${msg.myMessage ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' : 'bg-white text-gray-800 rounded-2xl rounded-tl-none'}`}>
                      {msg.fileUrl ? (
                        <img src={msg.fileUrl} alt="Sent file" className="rounded-lg max-w-full" />
                      ) : (
                        msg.message
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div
              className="p-3 md:p-4 bg-white border-t flex items-center gap-2 md:gap-3 flex-shrink-0"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-full text-blue-600 transition-colors flex-shrink-0">
                <ImageIcon size={20} />
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              </label>
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:border-blue-500 min-w-0"
                placeholder="Type a message..."
                value={inputMsg}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage('text', inputMsg)}
                onChange={(e) => setInputMsg(e.target.value)}
              />
              <button
                onClick={() => sendMessage('text', inputMsg)}
                className="bg-blue-600 text-white p-2 md:p-3 rounded-full hover:bg-blue-700 transition-colors flex-shrink-0"
                aria-label="Send"
              >
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50 flex-col text-center text-gray-400 p-4">
            <p>Select a user to chat</p>
          </div>
        )}
      </div>
    </div>
  );
}
