import { useState } from "react";
import AgoraRTC, { AgoraRTCProvider } from "agora-rtc-react";
import { VideoRoom } from "./VideoRoom";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

function Call() {
  const [joined, setJoined] = useState(false);

  // TẠO UID NGẪU NHIÊN ĐỂ KHÔNG BỊ TRÙNG KHI TEST 2 TAB
  const [uid] = useState(() => Math.floor(Math.random() * 100000));

  const APP_ID = "YOUR_APP_ID"; // Điền App ID của bạn
  const CHANNEL = "main-room";
  const TOKEN = null; // Để null nếu bạn đang chạy chế độ Test Mode (App ID only) trên Console

  return (
    <div style={{ width: "100vw", height: "100vh", backgroundColor: "black", display: "flex", justifyContent: "center", alignItems: "center" }}>
      {!joined ? (
        <div className="text-center">
          <h1 className="text-white text-3xl font-bold mb-4">Video Call App</h1>
          <p className="text-gray-400 mb-6">Your UID: {uid}</p>
          <button
            onClick={() => setJoined(true)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700"
          >
            Join Room
          </button>
        </div>
      ) : (
        <AgoraRTCProvider client={client}>
          <VideoRoom
            appId={APP_ID}
            channelName={CHANNEL}
            token={TOKEN}
            uid={uid}
            onLeave={() => setJoined(false)}
          />
        </AgoraRTCProvider>
      )}
    </div>
  );
}

export default Call;
