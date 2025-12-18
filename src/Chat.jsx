import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import axios from 'axios';
import { Send, Image as ImageIcon, LogOut, Video as VideoIcon, ArrowLeft, Info, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import AgoraRTC from "agora-rtc-sdk-ng";
import AgoraRTCProvider, { useRTCClient } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

const API_URL = 'http://localhost:8080/api';
const MQTT_BROKER = 'ws://localhost:9001';
const AGORA_APP_ID = "b3631d59f31c43fab2da714ff9b9a79e"; // Thay bằng App ID của bạn

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

  // Preview track creation
  useEffect(() => {
    if (!isPreview) {
      localCameraTrack?.close();
      localMicTrack?.close();
      return;
    }

    async function createTracks() {
      try {
        const mic = await AgoraRTC.createMicrophoneAudioTrack({ deviceId: selectedMic ? { exact: selectedMic } : undefined });
        const cam = await AgoraRTC.createCameraVideoTrack({ deviceId: selectedCamera ? { exact: selectedCamera } : undefined });
        setLocalMicTrack(mic);
        setLocalCameraTrack(cam);
        if (cameraOn) cam.play(previewRef.current);
      } catch (err) {
        console.error("Error creating tracks:", err);
      }
    }

    createTracks();

    return () => {
      localCameraTrack?.close();
      localMicTrack?.close();
    };
  }, [isPreview, selectedCamera, selectedMic]);

  useEffect(() => {
    localMicTrack?.setEnabled(micOn);
  }, [micOn, localMicTrack]);

  useEffect(() => {
    if (cameraOn) {
      localCameraTrack?.setEnabled(true);
      localCameraTrack?.play(previewRef.current);
    } else {
      localCameraTrack?.setEnabled(false);
      localCameraTrack?.stop();
    }
  }, [cameraOn, localCameraTrack]);

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

  const handleBackToList = () => {
    setSelectedUser(null);
  };

  return (
    <div className="flex h-[100dvh] bg-gray-100 relative overflow-hidden">
      {isPreview && (
        <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center">
          <div className="relative w-96 h-96 bg-[#3c4043] rounded-2xl overflow-hidden">
            <div ref={previewRef} className="w-full h-full object-cover"></div>
            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full bg-purple-600 flex items-center justify-center text-4xl font-bold text-white">
                  YOU
                </div>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col items-center gap-4">
            <select value={selectedCamera} onChange={(e) => setSelectedCamera(e.target.value)} className="bg-gray-800 text-white p-2 rounded">
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label}
                </option>
              ))}
            </select>
            <select value={selectedMic} onChange={(e) => setSelectedMic(e.target.value)} className="bg-gray-800 text-white p-2 rounded">
              {mics.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4 flex gap-4">
            <button onClick={() => setMicOn(!micOn)} className={`p-3 rounded-full ${micOn ? 'bg-gray-600' : 'bg-red-500'}`}>
              {micOn ? <Mic size={20} color="white" /> : <MicOff size={20} color="white" />}
            </button>
            <button onClick={() => setCameraOn(!cameraOn)} className={`p-3 rounded-full ${cameraOn ? 'bg-gray-600' : 'bg-red-500'}`}>
              {cameraOn ? <Video size={20} color="white" /> : <VideoOff size={20} color="white" />}
            </button>
            <button onClick={handleJoinCall} className="p-3 bg-green-500 rounded-full text-white">
              Join Call
            </button>
            <button onClick={() => setIsPreview(false)} className="p-3 bg-red-500 rounded-full text-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isInCall && selectedUser && (
        <div className="absolute inset-0 z-[100] w-full h-full bg-black">
          <AgoraRTCProvider client={agoraClient}>
            <VideoRoom
              appId={AGORA_APP_ID}
              channelName={getRoomId(currentUserId, selectedUser.userId)}
              token={null}
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

      <div className={`w-full md:w-1/4 bg-white border-r flex flex-col ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-blue-600 text-white flex justify-between items-center h-16 shrink-0">
          <h2 className="font-bold text-lg">Tin nhắn</h2>
          <button onClick={handleLogout}><LogOut size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((user) => (
            <div
              key={user.userId}
              onClick={() => setSelectedUser(user)}
              className={`p-3 flex items-center cursor-pointer hover:bg-gray-100 border-b border-gray-100 ${selectedUser?.userId === user.userId ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
            >
              <img src={user.avatarUrl} alt="avt" className="w-12 h-12 rounded-full object-cover mr-3" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate text-gray-800">{user.fullName}</p>
                <p className="text-sm truncate text-gray-500">{user.lastMessage || "Chưa có tin nhắn"}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={`flex-1 flex flex-col bg-slate-50 h-full ${!selectedUser ? 'hidden md:flex' : 'flex'}`}>
        {selectedUser ? (
          <>
            <div className="p-3 md:p-4 bg-white border-b flex items-center shadow-sm justify-between sticky top-0 z-10 h-16 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={handleBackToList} className="md:hidden text-gray-600 hover:bg-gray-100 p-1 rounded-full">
                  <ArrowLeft size={24} />
                </button>
                <img src={selectedUser.avatarUrl} alt="avt" className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <h3 className="font-bold text-gray-800 text-sm md:text-base">{selectedUser.fullName}</h3>
                  <span className="text-[10px] md:text-xs text-green-500 flex items-center">● Đang hoạt động</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleStartCall} className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition">
                  <VideoIcon size={20} />
                </button>
                <button onClick={() => setShowInfo(!showInfo)} className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200 transition hidden md:block">
                  <Info size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.myMessage ? 'justify-end' : 'justify-start'}`}>
                  {!msg.myMessage && <img src={selectedUser.avatarUrl} alt="avt" className="w-8 h-8 rounded-full mr-2 self-end mb-1" />}
                  <div className={`max-w-[75%] md:max-w-md p-3 shadow-md text-sm md:text-base ${msg.myMessage ? 'bg-blue-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white text-gray-800 rounded-r-2xl rounded-tl-2xl'}`}>
                    {msg.type !== 'text' ? (
                      <img src={msg.fileUrl} alt="attachment" className="rounded-lg max-w-full cursor-pointer" onClick={() => window.open(msg.fileUrl, '_blank')} />
                    ) : (
                      <p className="break-words">{msg.message}</p>
                    )}
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] opacity-70">
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {msg.myMessage && <span className="text-[10px] opacity-70 ml-2">✓✓</span>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-3 md:p-4 bg-white border-t flex items-center gap-2 md:gap-3 sticky bottom-0 shrink-0 safe-area-bottom">
              <label className="cursor-pointer p-2 hover:bg-gray-100 rounded-full text-blue-600">
                <ImageIcon size={20} />
                <input type="file" className="hidden" accept="*/*" onChange={handleFileUpload} />
              </label>
              <input
                className="flex-1 border border-gray-300 rounded-full pl-4 pr-4 py-2 md:py-3 text-sm md:text-base focus:outline-none focus:border-blue-500"
                placeholder="Nhập tin nhắn..."
                type="text"
                value={inputMsg}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage('text', inputMsg)}
                onChange={(e) => setInputMsg(e.target.value)}
              />
              <button onClick={() => sendMessage('text', inputMsg)} className="bg-blue-600 text-white p-2 md:p-3 rounded-full hover:bg-blue-700">
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50 flex-col text-center text-gray-400 p-4">
            <p>Chọn một người để bắt đầu trò chuyện</p>
          </div>
        )}
      </div>

      {selectedUser && showInfo && (
        <div className="hidden md:flex w-1/4 bg-white border-l flex-col">
          <div className="p-4 border-b bg-blue-600 text-white flex justify-between items-center">
            <h2 className="font-bold text-lg">Thông tin</h2>
            <button onClick={() => setShowInfo(false)}><ArrowLeft size={20} /></button>
          </div>
          <div className="p-4 flex flex-col items-center">
            <img src={selectedUser.avatarUrl} alt="avt" className="w-24 h-24 rounded-full object-cover mb-4 border-4 border-gray-100" />
            <p className="font-bold text-xl">{selectedUser.fullName}</p>
            <p className="text-gray-500 mt-2">Đang hoạt động</p>
          </div>
        </div>
      )}
    </div>
  );
}
