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

// Tạo client Agora ở ngoài component để tránh tạo lại khi re-render
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
  const [showInfo, setShowInfo] = useState(false);

  // Preview states
  const [isPreview, setIsPreview] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localCameraTrack, setLocalCameraTrack] = useState(null);
  const [localMicTrack, setLocalMicTrack] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [mics, setMics] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');

  const messagesEndRef = useRef(null);
  const previewRef = useRef(null);

  // --- 1. Init Data & MQTT ---
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

  // --- 2. Load Conversation ---
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

  // --- 3. Handle Tracks for Preview ---
  useEffect(() => {
    if (!isPreview) return;

    let mounted = true;
    async function createTracks() {
      try {
        if (localCameraTrack) localCameraTrack.close();
        if (localMicTrack) localMicTrack.close();

        const mic = await AgoraRTC.createMicrophoneAudioTrack({ deviceId: selectedMic ? { exact: selectedMic } : undefined });
        const cam = await AgoraRTC.createCameraVideoTrack({ deviceId: selectedCamera ? { exact: selectedCamera } : undefined });

        if (!mounted) {
          mic.close();
          cam.close();
          return;
        }

        setLocalMicTrack(mic);
        setLocalCameraTrack(cam);
        if (cameraOn && previewRef.current) cam.play(previewRef.current);
      } catch (err) {
        console.error("Error creating tracks:", err);
      }
    }

    createTracks();

    return () => {
      mounted = false;
    };
  }, [isPreview, selectedCamera, selectedMic]); // Re-run when device changes

  useEffect(() => {
    if (localMicTrack) localMicTrack.setEnabled(micOn);
  }, [micOn, localMicTrack]);

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

  // --- API Calls ---
  const fetchInbox = async (myId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/inbox/${myId}`, {
        headers: { token: localStorage.getItem('token') }
      });
      setConversations(res.data);
    } catch (error) { console.error("Lỗi load inbox:", error); }
  };

  const loadHistory = async (senderId, receiverId) => {
    try {
      const res = await axios.get(`${API_URL}/chat/messages`, {
        params: { user1: senderId, user2: receiverId, page: 0 },
        headers: { token: localStorage.getItem('token') }
      });

      if (res.data.data && Array.isArray(res.data.data)) {
        const uiMessages = res.data.data.map(apiMsg => ({
          message: apiMsg.content,
          myMessage: apiMsg.sent,
          fileUrl: apiMsg.fileUrl,
          timestamp: apiMsg.timestamp,
          type: apiMsg.type,
          status: 'sent'
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
    const file = e.target.files[0];
    if (!file) return;

    try {
      const token = localStorage.getItem('token');
      const sigRes = await axios.get(`${API_URL}/chat/signature`, { headers: { token } });
      const { signature, timestamp, api_key, cloud_name, folder } = sigRes.data;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', api_key);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folder);

      const cloudRes = await axios.post(`https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`, formData);
      sendMessage('file', cloudRes.data.secure_url);
    } catch (err) { alert("Lỗi upload file: " + err.message); }
  };

  // --- Call Handlers ---
  const handleStartCall = async () => {
    if (!selectedUser) return;
    const cams = await AgoraRTC.getCameras();
    setCameras(cams);
    if (cams.length) setSelectedCamera(cams[0].deviceId);

    const mikes = await AgoraRTC.getMicrophones();
    setMics(mikes);
    if (mikes.length) setSelectedMic(mikes[0].deviceId);

    setIsPreview(true);
  };

  const handleJoinCall = () => {
    sendMessage('text', '📞 Đang bắt đầu cuộc gọi video...');
    setIsPreview(false);
    setIsInCall(true);
  };

  const handleLeaveCall = () => {
    setIsInCall(false);
    localCameraTrack?.close();
    localMicTrack?.close();
    setLocalCameraTrack(null);
    setLocalMicTrack(null);
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
      fileUrl: mqttData.type !== 'text' ? mqttData.content : null,
      status: 'sent'
    };
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  return (
    <div className="flex h-[100dvh] bg-gray-100 relative overflow-hidden">

      {/* === PREVIEW MODAL === */}
      {isPreview && (
        <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-lg aspect-video bg-gray-800 rounded-2xl overflow-hidden shadow-2xl border border-gray-700">
            <div ref={previewRef} className="w-full h-full object-cover"></div>
            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white">
                  YOU
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col items-center gap-4 w-full max-w-md">
            <div className="flex gap-2 w-full">
              <select value={selectedCamera} onChange={(e) => setSelectedCamera(e.target.value)} className="flex-1 bg-gray-800 text-white p-3 rounded-lg border border-gray-600 text-sm">
                {cameras.map((cam) => <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId.slice(0, 5)}...`}</option>)}
              </select>
              <select value={selectedMic} onChange={(e) => setSelectedMic(e.target.value)} className="flex-1 bg-gray-800 text-white p-3 rounded-lg border border-gray-600 text-sm">
                {mics.map((mic) => <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `Mic ${mic.deviceId.slice(0, 5)}...`}</option>)}
              </select>
            </div>

            <div className="flex gap-6 mt-2">
              <button onClick={() => setMicOn(!micOn)} className={`p-4 rounded-full transition-colors ${micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}>
                {micOn ? <Mic size={24} color="white" /> : <MicOff size={24} color="white" />}
              </button>
              <button onClick={() => setCameraOn(!cameraOn)} className={`p-4 rounded-full transition-colors ${cameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-500 hover:bg-red-600'}`}>
                {cameraOn ? <Video size={24} color="white" /> : <VideoOff size={24} color="white" />}
              </button>
            </div>

            <div className="flex gap-4 w-full mt-4">
              <button onClick={() => setIsPreview(false)} className="flex-1 py-3 bg-gray-700 rounded-xl text-white font-semibold hover:bg-gray-600 transition">
                Hủy
              </button>
              <button onClick={handleJoinCall} className="flex-1 py-3 bg-green-600 rounded-xl text-white font-bold hover:bg-green-700 transition shadow-lg shadow-green-900/20">
                Tham gia ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === VIDEO ROOM (FULLSCREEN OVERLAY) === */}
      {isInCall && selectedUser && (
        <div className="fixed inset-0 z-[9999] w-screen h-screen bg-black">
          <AgoraRTCProvider client={agoraClient}>
            <VideoRoom
              appId={AGORA_APP_ID}
              channelName={getRoomId(currentUserId, selectedUser.userId)}
              token={null} // Lưu ý: Nếu bật Certificate ở Agora Console, bạn cần Token thật ở đây
              uid={currentUserId}
              onLeave={handleLeaveCall}
              localCameraTrack={localCameraTrack}
              localMicrophoneTrack={localMicTrack}
              micOn={micOn}
              setMicOn={setMicOn}
              cameraOn={cameraOn}
              setCameraOn={setCameraOn}
              remoteUserName={selectedUser.fullName}
            />
          </AgoraRTCProvider>
        </div>
      )}

      {/* === LEFT SIDEBAR (CHAT LIST) === */}
      <div className={`w-full md:w-1/4 bg-white border-r flex flex-col h-full ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-blue-600 text-white flex justify-between items-center h-16 shrink-0">
          <h2 className="font-bold text-lg">Tin nhắn</h2>
          <button onClick={handleLogout} className="hover:bg-blue-700 p-2 rounded-full transition"><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((user) => (
            <div
              key={user.userId}
              onClick={() => setSelectedUser(user)}
              className={`p-3 flex items-center cursor-pointer hover:bg-gray-100 border-b border-gray-100 transition-colors ${selectedUser?.userId === user.userId ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
            >
              <img src={user.avatarUrl} alt="avt" className="w-12 h-12 rounded-full object-cover mr-3 border border-gray-200" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate text-gray-800">{user.fullName}</p>
                <p className="text-sm truncate text-gray-500">{user.lastMessage || "Chưa có tin nhắn"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* === RIGHT MAIN CHAT === */}
      <div className={`flex-1 flex flex-col bg-slate-50 h-full ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            {/* Header Chat */}
            <div className="p-3 md:p-4 bg-white border-b flex items-center shadow-sm justify-between sticky top-0 z-10 h-16 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedUser(null)} className="md:hidden text-gray-600 hover:bg-gray-100 p-2 rounded-full">
                  <ArrowLeft size={24} />
                </button>
                <img src={selectedUser.avatarUrl} alt="avt" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                <div>
                  <h3 className="font-bold text-gray-800 text-sm md:text-base">{selectedUser.fullName}</h3>
                  <span className="text-[10px] md:text-xs text-green-500 flex items-center font-medium">● Đang hoạt động</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleStartCall} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition">
                  <VideoIcon size={22} />
                </button>
                <button onClick={() => setShowInfo(!showInfo)} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition hidden md:block">
                  <Info size={22} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 bg-[#f0f2f5]">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.myMessage ? 'justify-end' : 'justify-start'}`}>
                  {!msg.myMessage && <img src={selectedUser.avatarUrl} alt="avt" className="w-8 h-8 rounded-full mr-2 self-end mb-1 border border-white" />}
                  <div className={`max-w-[75%] md:max-w-md p-3 shadow-sm text-sm md:text-base ${msg.myMessage ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' : 'bg-white text-gray-800 rounded-2xl rounded-tl-none border border-gray-200'}`}>
                    {msg.type !== 'text' ? (
                      <img src={msg.fileUrl} alt="attachment" className="rounded-lg max-w-full cursor-pointer hover:opacity-90" onClick={() => window.open(msg.fileUrl, '_blank')} />
                    ) : (
                      <p className="break-words leading-relaxed">{msg.message}</p>
                    )}
                    <div className={`flex justify-end items-center mt-1 text-[10px] ${msg.myMessage ? 'text-blue-100' : 'text-gray-400'}`}>
                      <span>
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 md:p-4 bg-white border-t flex items-center gap-2 md:gap-3 sticky bottom-0 shrink-0 safe-area-bottom">
              <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-full text-blue-600 transition">
                <ImageIcon size={22} />
                <input type="file" className="hidden" accept="*/*" onChange={handleFileUpload} />
              </label>
              <input
                className="flex-1 bg-gray-100 border-none rounded-full pl-4 pr-4 py-2.5 md:py-3 text-sm md:text-base focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
                placeholder="Nhập tin nhắn..."
                type="text"
                value={inputMsg}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage('text', inputMsg)}
                onChange={(e) => setInputMsg(e.target.value)}
              />
              <button onClick={() => sendMessage('text', inputMsg)} disabled={!inputMsg.trim()} className="bg-blue-600 text-white p-2.5 md:p-3 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition shadow-md">
                <Send size={18} className="ml-0.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-slate-50 flex-col text-center p-8">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <VideoIcon size={40} className="text-blue-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-700">Chào mừng bạn!</h3>
            <p className="text-gray-500 mt-2 max-w-xs">Chọn một người từ danh sách bên trái để bắt đầu trò chuyện hoặc gọi video.</p>
          </div>
        )}
      </div>

      {/* Info Sidebar */}
      {selectedUser && showInfo && (
        <div className="hidden md:flex w-1/4 bg-white border-l flex-col">
          <div className="p-4 border-b bg-white text-gray-800 flex justify-between items-center h-16">
            <h2 className="font-bold text-lg">Thông tin hội thoại</h2>
            <button onClick={() => setShowInfo(false)} className="hover:bg-gray-100 p-2 rounded-full"><ArrowLeft size={20} /></button>
          </div>
          <div className="p-6 flex flex-col items-center">
            <img src={selectedUser.avatarUrl} alt="avt" className="w-32 h-32 rounded-full object-cover mb-4 border-4 border-gray-100 shadow-md" />
            <p className="font-bold text-xl text-gray-900">{selectedUser.fullName}</p>
            <p className="text-green-600 font-medium mt-1 text-sm bg-green-50 px-3 py-1 rounded-full">● Đang hoạt động</p>
          </div>
        </div>
      )}
    </div>
  );
}
