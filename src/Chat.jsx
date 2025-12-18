import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft, Phone } from 'lucide-react';

// --- AGORA IMPORTS ---
import AgoraRTC, { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

const API_URL = 'https://api.job-fs.me/api';
const MQTT_BROKER = 'wss://mqtt.job-fs. me';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e";

const agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

export default function Chat() {
  const [currentUserId, setCurrentUserId] = useState(() => localStorage.getItem('userId'));
  const [client, setClient] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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

  // Focus input when selecting user on desktop
  useEffect(() => {
    if (selectedUser && window.innerWidth >= 768) {
      inputRef.current?.focus();
    }
  }, [selectedUser]);

  // --- API CALLS ---
  const fetchInbox = async (myId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/conversations? userId=${myId}`, {
        headers: { token: localStorage.getItem('token') }
      });
      setConversations(res.data);
    } catch (error) {
      console.error("Lỗi load inbox:", error);
    }
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
    } catch (e) {
      console.error("Lỗi load history:", e);
      setMessages([]);
    }
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
    const file = e.target.files[0];
    if (!file) return;
    alert("Tính năng upload ảnh cần backend API signature hoạt động.");
  };

  const handleStartCall = () => {
    if (!selectedUser) return;
    sendMessage('text', '📞 Đang bắt đầu cuộc gọi video...');
    setIsInCall(true);
  };

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

  const handleBackToList = () => {
    setSelectedUser(null);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // Filter conversations by search
  const filteredConversations = conversations.filter(user =>
    user.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- RENDER ---
  return (
    <div className="flex h-[100dvh] bg-gray-100 relative overflow-hidden">

      {/* --- VIDEO CALL OVERLAY --- */}
      {isInCall && selectedUser && (
        <div className="absolute inset-0 z-[100]">
          <AgoraRTCProvider client={agoraClient}>
            <VideoRoom
              appId={AGORA_APP_ID}
              channelName={getRoomId(currentUserId, selectedUser.userId)}
              token={null}
              uid={currentUserId}
              onLeave={() => setIsInCall(false)}
            />
          </AgoraRTCProvider>
        </div>
      )}

      {/* SIDEBAR - Conversation List */}
      <div className={`
        w-full md:w-80 lg:w-96 bg-white border-r border-gray-200 flex-col
        ${selectedUser ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex justify-between items-center mb-4">
            <h1 className="font-bold text-xl md:text-2xl text-gray-900">Chat</h1>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Đăng xuất"
            >
              <LogOut size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Tìm kiếm cuộc trò chuyện..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-100 rounded-full px-4 py-2.5 text-sm 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white
                         transition-all placeholder-gray-500"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
              <p className="text-sm">Không có cuộc trò chuyện nào</p>
            </div>
          ) : (
            filteredConversations.map((user) => (
              <div
                key={user.userId}
                onClick={() => setSelectedUser(user)}
                className={`
                  p-3 md:p-4 flex items-center cursor-pointer transition-all duration-150
                  hover:bg-gray-50 active:bg-gray-100
                  ${selectedUser?.userId === user.userId
                    ? 'bg-blue-50 md:bg-blue-50'
                    : 'bg-white'}
                `}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <img
                    src={user.avatarUrl || 'https://via.placeholder.com/48'}
                    alt={user.fullName}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover"
                  />
                  {/* Online indicator */}
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 
                                   border-2 border-white rounded-full" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 ml-3">
                  <div className="flex justify-between items-baseline">
                    <p className="font-semibold text-gray-900 truncate text-sm md:text-base">
                      {user.fullName}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatTime(user.lastMessageTime)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">
                    {user.lastMessage || "Chưa có tin nhắn"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CHAT WINDOW */}
      <div className={`
        flex-1 flex flex-col bg-white min-w-0
        ${!selectedUser ? 'hidden md:flex' : 'flex'}
      `}>
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="px-3 py-2.5 md:px-4 md:py-3 bg-white border-b border-gray-200 
                           flex items-center justify-between sticky top-0 z-10 shadow-sm">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                {/* Back button - Mobile only */}
                <button
                  onClick={handleBackToList}
                  className="md:hidden p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Quay lại"
                >
                  <ArrowLeft size={22} className="text-gray-700" />
                </button>

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <img
                    src={selectedUser.avatarUrl || 'https://via.placeholder.com/40'}
                    alt={selectedUser.fullName}
                    className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover"
                  />
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 
                                   border-2 border-white rounded-full" />
                </div>

                {/* User info */}
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm md:text-base truncate">
                    {selectedUser.fullName}
                  </h3>
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    Đang hoạt động
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 md:gap-2">
                <button
                  onClick={handleStartCall}
                  className="p-2.5 md:p-3 text-blue-600 hover:bg-blue-50 
                             rounded-full transition-colors"
                  aria-label="Gọi video"
                >
                  <VideoIcon size={20} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2"
              style={{
                backgroundColor: '#f0f2f5',
              }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <p className="text-sm">Bắt đầu cuộc trò chuyện</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.myMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`
                        max-w-[80%] sm:max-w-[70%] md:max-w-md 
                        px-3 py-2 md:px-4 md:py-2.5 
                        text-sm md:text-base break-words
                        ${msg.myMessage
                          ? 'bg-blue-600 text-white rounded-2xl rounded-br-md'
                          : 'bg-white text-gray-900 rounded-2xl rounded-bl-md shadow-sm'}
                      `}
                    >
                      {msg.type === 'image' || msg.type === 'Image' ? (
                        <img
                          src={msg.fileUrl || msg.message}
                          alt="Hình ảnh"
                          className="max-w-full rounded-lg cursor-pointer hover:opacity-90"
                          onClick={() => window.open(msg.fileUrl || msg.message, '_blank')}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                      )}

                      {/* Timestamp */}
                      <p className={`
                        text-[10px] mt-1 text-right
                        ${msg.myMessage ? 'text-blue-200' : 'text-gray-400'}
                      `}>
                        {formatTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div
              className="p-2 md:p-3 bg-white border-t border-gray-200 flex items-end gap-2"
              style={{ paddingBottom: 'max(0. 5rem, env(safe-area-inset-bottom))' }}
            >
              {/* Image upload */}
              <label className="p-2.5 hover:bg-gray-100 rounded-full cursor-pointer 
                               transition-colors flex-shrink-0">
                <ImageIcon size={22} className="text-blue-600" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                />
              </label>

              {/* Text input */}
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full bg-gray-100 rounded-full px-4 py-2.5 md:py-3 
                             text-sm md:text-base focus:outline-none focus:ring-2 
                             focus:ring-blue-500 focus:bg-white transition-all"
                  placeholder="Aa"
                  value={inputMsg}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage('text', inputMsg);
                    }
                  }}
                  onChange={(e) => setInputMsg(e.target.value)}
                />
              </div>

              {/* Send button */}
              <button
                onClick={() => sendMessage('text', inputMsg)}
                disabled={!inputMsg.trim()}
                className={`
                  p-2.5 md:p-3 rounded-full transition-all flex-shrink-0
                  ${inputMsg.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}
                `}
                aria-label="Gửi tin nhắn"
              >
                <Send size={20} />
              </button>
            </div>
          </>
        ) : (
          /* Empty state - Desktop only */
          <div className="flex-1 flex items-center justify-center bg-gray-50 flex-col text-center p-4">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <Send size={32} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-700 mb-1">Tin nhắn của bạn</h3>
            <p className="text-gray-500 text-sm">
              Chọn một cuộc trò chuyện để bắt đầu nhắn tin
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
