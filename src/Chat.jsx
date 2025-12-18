import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft } from 'lucide-react';
import AgoraRTC, { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

const API_URL = 'https://api.job-fs.me/api';
const MQTT_BROKER = 'wss://mqtt.job-fs.me';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e";

// Initialize client outside component to prevent re-creation on re-renders
const agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export default function Chat() {
  const [currentUserId] = useState(() => localStorage.getItem('userId'));

  const [mqttClient, setMqttClient] = useState(null);
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

    const client = mqtt.connect(MQTT_BROKER, {
      clientId: `web_${currentUserId}_${Math.random().toString(16).substring(2, 8)}`,
      keepalive: 60,
      clean: true,
    });

    client.on('connect', () => {
      console.log('✅ Connected to MQTT Broker');
      client.subscribe(`/user/${currentUserId}/private`);
    });

    client.on('message', (topic, payload) => {
      const data = JSON.parse(payload.toString());
      if (topic.startsWith('/chat/')) {
        setMessages((prev) => [...prev, mapMqttMessageToUI(data, currentUserId)]);
      }
    });

    setMqttClient(client);

    return () => {
      if (client) client.end();
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedUser || !mqttClient || !currentUserId) return;
    const roomId = getChannelName(currentUserId, selectedUser.userId);
    const topic = `/chat/${roomId}`;

    mqttClient.subscribe(topic);
    loadHistory(currentUserId, selectedUser.userId);

    return () => {
      mqttClient.unsubscribe(topic);
    };
  }, [selectedUser, mqttClient, currentUserId]);

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
    if (!mqttClient || !selectedUser) return;

    const payload = {
      token: localStorage.getItem('token'),
      sender: currentUserId,
      recipient: selectedUser.userId.toString(),
      type: type,
      content: content,
      timestamp: new Date().toISOString()
    };

    const roomId = getChannelName(currentUserId, selectedUser.userId);
    mqttClient.publish(`/chat/${roomId}`, JSON.stringify(payload));
    if (type === 'text') setInputMsg('');
  };

  const handleFileUpload = async (e) => {
    alert("Upload feature disabled for this demo.");
  };

  // --- INTERVIEW HANDLERS ---
  const handleStartCall = () => {
    if (!selectedUser) return;
    // 1. SYSTEM MSG: Start
    const sysMsg = {
      message: "📞 Cuộc phỏng vấn đã bắt đầu",
      myMessage: true,
      timestamp: new Date().toISOString(),
      type: 'system'
    };
    setMessages(prev => [...prev, sysMsg]);
    setIsInCall(true);
  };

  const handleRemoteJoined = () => {
    // 2. SYSTEM MSG: Joined
    const sysMsg = {
      message: "👤 Đã tham gia vào cuộc phỏng vấn",
      myMessage: false,
      timestamp: new Date().toISOString(),
      type: 'system'
    };
    setMessages(prev => [...prev, sysMsg]);
  };

  const handleCallEnded = () => {
    // 3. SYSTEM MSG: Ended
    // Check if the last message was already an end message to avoid duplicates
    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.message === "❌ Cuộc phỏng vấn đã kết thúc") return prev;

      return [...prev, {
        message: "❌ Cuộc phỏng vấn đã kết thúc",
        myMessage: true,
        timestamp: new Date().toISOString(),
        type: 'system'
      }];
    });
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

  return (
    <div className="flex bg-gray-100 relative overflow-hidden h-[100dvh]">

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
              onCallEnd={handleCallEnded}
            />
          </AgoraRTCProvider>
        </div>
      )}

      {/* SIDEBAR */}
      <div className={`w-full md:w-1/4 bg-white border-r flex-col ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-blue-600 text-white flex justify-between items-center">
          <h2 className="font-bold text-lg">Inbox</h2>
          <button onClick={handleLogout} className="hover:bg-blue-700 p-2 rounded-full"><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((user) => (
            <div
              key={user.userId}
              onClick={() => setSelectedUser(user)}
              className={`p-3 flex items-center cursor-pointer hover:bg-gray-100 border-b ${selectedUser?.userId === user.userId ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
            >
              <img src={user.avatarUrl || 'https://via.placeholder.com/40'} alt="" className="w-12 h-12 rounded-full mr-3 object-cover" />
              <div>
                <p className="font-semibold text-gray-800">{user.fullName}</p>
                <p className="text-sm text-gray-500 truncate">{user.lastMessage || "No messages"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT WINDOW */}
      <div className={`flex-1 flex flex-col bg-slate-50 h-full ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            <div className="p-3 bg-white border-b flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedUser(null)} className="md:hidden p-1"><ArrowLeft /></button>
                <img src={selectedUser.avatarUrl || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full" />
                <h3 className="font-bold text-gray-800">{selectedUser.fullName}</h3>
              </div>
              <button onClick={handleStartCall} className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200">
                <VideoIcon size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' }}>
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.myMessage ? 'justify-end' : 'justify-start'}`}>
                  {msg.type === 'system' ? (
                    <span className="bg-gray-200 text-gray-600 text-xs py-1 px-3 rounded-full my-2">{msg.message}</span>
                  ) : (
                    <div className={`max-w-[75%] p-3 shadow-md text-sm md:text-base rounded-2xl ${msg.myMessage ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'}`}>
                      {msg.message}
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-white border-t flex items-center gap-2">
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:border-blue-500"
                placeholder="Type a message..."
                value={inputMsg}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage('text', inputMsg)}
                onChange={(e) => setInputMsg(e.target.value)}
              />
              <button onClick={() => sendMessage('text', inputMsg)} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700">
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">Select a user to chat</div>
        )}
      </div>
    </div>
  );
}
