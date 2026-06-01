import React, { useEffect, useRef, useState } from "react";
import { useAppState } from "./state";
import { connectRealtime, RpSocket } from "./realtime";
import { Toasts } from "./Toasts";

const ROOMS = ["Rauchen", "memes", "Chat"] as const;

export function App() {
  const s = useAppState();
  const socketRef = useRef<RpSocket | null>(null);
  const [myName, setMyName] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ file: File; preview: string } | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const connectedRef = useRef(false); // Track if we're connected
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  // Initialize server URL
  useEffect(() => {
    window.rp?.log("[app] initialized");
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  // Update badge when unread counts change
  useEffect(() => {
    const totalUnread = Object.values(s.unreadCounts).reduce((a, b) => a + b, 0);
    window.rp?.setBadgeCount(totalUnread);
  }, [s.unreadCounts]);

  // Clear unread only when switching rooms (don't include unreadCounts in deps)
  useEffect(() => {
    if (s.currentRoom) {
      s.clearUnread(s.currentRoom);
    }
  }, [s.currentRoom]);

  // Scroll to bottom when new messages arrive (if already at bottom)
  useEffect(() => {
    if (isScrolledToBottom && chatContainerRef.current) {
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [s.currentRoom, s.chatMessages, isScrolledToBottom]);

  // Handle scroll position tracking
  const handleChatScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50; // 50px threshold
      setIsScrolledToBottom(isAtBottom);
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      setIsScrolledToBottom(true);
    }
  };

  function joinRoom(roomName: typeof ROOMS[number]) {
    const name = myName.trim();
    if (!name) {
      s.pushToast({ title: "Fehler", body: "Bitte Name eingeben" });
      return;
    }

    // First time: connect to server and join
    if (!connectedRef.current) {
      const sock = connectRealtime(s.serverUrl);
      socketRef.current = sock;
      connectedRef.current = true;
      s.setMyName(name);
      window.rp?.log(`[app] connecting to server and joining room ${roomName}`);
      sock.send({ type: "joinRoom", roomName, name });
    } else {
      // Already connected: just change room (send joinRoom again)
      s.setMyName(name);
      window.rp?.log(`[app] changing to room ${roomName}`);
      socketRef.current?.send({ type: "joinRoom", roomName, name });
    }
  }

  function setSmoking(next: boolean) {
    s.setIsSmoking(next);
    socketRef.current?.send({ type: "toggleSmoking", isSmoking: next });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Size limit: 5MB for images/gifs
    if (file.size > 5 * 1024 * 1024) {
      s.pushToast({ title: "Datei zu groß", body: "Max. 5MB" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setSelectedFile({ file, preview: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;

        // Size limit: 5MB
        if (file.size > 5 * 1024 * 1024) {
          s.pushToast({ title: "Datei zu groß", body: "Max. 5MB" });
          return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setSelectedFile({ file, preview: dataUrl });
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text && !selectedFile) {
      s.pushToast({ title: "Leer", body: "Text oder Datei eingeben" });
      return;
    }

    if (!s.currentRoom) {
      s.pushToast({ title: "Fehler", body: "Nicht in Raum" });
      return;
    }

    const payload: any = {
      type: "chatMessage",
      text,
    };
    if (selectedFile) {
      payload.fileDataUrl = selectedFile.preview;
    }

    socketRef.current?.send(payload);
    setChatInput("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  if (!s.currentRoom) {
    return (
      <div className="app">
        <div className="sidebar">
          <div className="card">
            <div className="title">Raucherpause</div>
            <div className="muted">Raum-Auswahl</div>
          </div>

          <div className="card">
            <label className="muted">Dein Name</label>
            <input
              className="input"
              placeholder=""
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom("Chat")}
            />
          </div>

          <div className="card">
            <div className="title" style={{ marginBottom: 15 }}>
              Wähle einen Raum
            </div>
            {ROOMS.map((room) => (
              <button key={room} className="btn primary" style={{ marginBottom: 10, width: "100%" }} onClick={() => joinRoom(room)}>
                {room}
              </button>
            ))}
          </div>
        </div>

        <div className="main">
          <div style={{ textAlign: "center", opacity: 0.5, marginTop: 100 }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>👋</div>
            <div>Wähle einen Raum um zu beginnen</div>
          </div>
        </div>

        <Toasts />
      </div>
    );
  }

  const onlineSmokingCount = s.members.filter((m) => m.isSmoking).length;

  return (
    <>
      <div className="app">
        <div className="sidebar">
          {/* Room Switcher */}
          <div className="card">
            <div className="title" style={{ marginBottom: 10 }}>Wechsle Raum</div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              {ROOMS.map((room) => (
                <button
                  key={room}
                  className={`btn ${s.currentRoom === room ? "primary" : ""}`}
                  onClick={() => joinRoom(room)}
                  style={{ width: "100%" }}
                >
                  {room}
                </button>
              ))}
            </div>
          </div>

          {/* Room Header */}
          <div className="card">
            <div className="title" style={{ margin: 0 }}>{s.currentRoom}</div>
            <button
              className="btn"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => {
                s.setCurrentRoom(null);
              }}
            >
              Raum verlassen
            </button>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="title" style={{ margin: 0 }}>
                Online ({s.members.length})
              </div>
              {s.currentRoom === "Rauchen" && (
                <span className="pill">
                  {onlineSmokingCount}/{s.members.length} rauchen
                </span>
              )}
            </div>

            <div className="members">
              {s.members.length === 0 ? (
                <div className="muted">Niemand online</div>
              ) : (
                s.members.map((m) => (
                  <div key={m.id} className="member">
                    <div className="memberName">
                      {s.currentRoom === "Rauchen" && <span className={`dot ${m.isSmoking ? "danger" : "ok"}`} />}
                      <div style={{ fontWeight: 700, display: "flex", gap: "3px", alignItems: "center" }}>
                        <span>{m.name}</span>
                        {m.isSmoking && <span>🚬</span>}
                        {m.id === s.myId && <span style={{ fontSize: "13px", opacity: 0.7 }}>(du)</span>}
                      </div>
                    </div>
                    {m.id === s.myId && s.currentRoom === "Rauchen" && (
                      <button
                        className={`btn ${s.isSmoking ? "danger" : ""}`}
                        onClick={() => setSmoking(!s.isSmoking)}
                        style={{ padding: "4px 10px", fontSize: "12px", whiteSpace: "nowrap" }}
                      >
                        {s.isSmoking ? "🚬" : "✅"}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {s.majorityActive && (
              <div style={{ padding: 10, background: "rgba(255, 0, 0, 0.1)", borderRadius: 4, marginTop: 10 }}>
                <div style={{ fontWeight: 700, color: "red" }}>⚠️ Mehrheit raucht!</div>
              </div>
            )}
          </div>
        </div>

        <div className="main">
          <div className="card" style={{ flex: 1, overflow: "auto", position: "relative" }} ref={chatContainerRef} onScroll={handleChatScroll}>
            {s.currentRoom && s.chatMessages[s.currentRoom].map((msg) => (
              <div key={`${msg.id}-${msg.createdAt}`} style={{ marginBottom: 15 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#666" }}>
                  {msg.name}
                  <span style={{ fontSize: 12, marginLeft: 10, opacity: 0.6 }}>
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {msg.text && <div style={{ marginTop: 5 }}>{msg.text}</div>}
                {msg.fileDataUrl && (
                  <div style={{ marginTop: 10 }}>
                    <img
                      src={msg.fileDataUrl}
                      style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 4 }}
                      alt="file"
                    />
                  </div>
                )}
              </div>
            ))}
            {!isScrolledToBottom && (
              <button
                onClick={scrollToBottom}
                style={{
                  position: "absolute",
                  bottom: 20,
                  right: 20,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "#4a9eff",
                  border: "none",
                  color: "white",
                  fontSize: 20,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
                  zIndex: 10,
                }}
                title="Zur neuesten Nachricht springen"
              >
                ↓
              </button>
            )}
          </div>

          <div className="card">
            {selectedFile && (
              <div
                style={{
                  marginBottom: 10,
                  padding: 10,
                  background: "#f5f5f5",
                  borderRadius: 4,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <img src={selectedFile.preview} style={{ maxHeight: 60, borderRadius: 4 }} alt="preview" />
                <button className="btn" onClick={() => setSelectedFile(null)}>
                  ✕
                </button>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                className="input"
                placeholder="Nachricht..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                onPaste={handlePaste}
                style={{ flex: 1 }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button className="btn" onClick={() => fileInputRef.current?.click()}>
                📎
              </button>
              <button className="btn primary" onClick={sendChat}>
                Senden
              </button>
            </div>
          </div>
        </div>
      </div>

      {s.majorityActive && s.currentRoom === "Rauchen" && overlayVisible && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            flexDirection: "column",
          }}
        >
          <button
            className="btn"
            style={{
              position: "absolute",
              top: 20,
              right: 20,
              width: 40,
              height: 40,
              padding: 0,
              fontSize: 20,
            }}
            onClick={() => setOverlayVisible(false)}
          >
            ✕
          </button>
          <div style={{ fontSize: 80, fontWeight: 900, color: "red", textAlign: "center", lineHeight: 1 }}>
            DU MUSST<br />
            RAUCHEN
          </div>
        </div>
      )}

      <Toasts />
    </>
  );
}

