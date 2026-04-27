import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "./state";
import { connectRealtime, RpSocket } from "./realtime";
import { Toasts } from "./Toasts";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function NumberParam(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  const inputId = `param-${props.label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <label htmlFor={inputId} className="muted" style={{ width: 120 }}>
        {props.label}
      </label>
      <input
        id={inputId}
        className="input"
        type="number"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => {
          const raw = Number(e.target.value);
          if (!Number.isFinite(raw)) return;
          props.onChange(clamp(raw, props.min, props.max));
        }}
      />
      <div className="pill">{props.unit}</div>
    </div>
  );
}

export function App() {
  const s = useAppState();
  const socketRef = useRef<RpSocket | null>(null);
  const [loadingGif, setLoadingGif] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const onlineSmokingCount = useMemo(() => s.members.filter((m) => m.isSmoking).length, [s.members]);

  useEffect(() => {
    (async () => {
      try {
        const displays = await window.rp.getDisplays();
        s.setDisplays(displays);
        const primary = displays.find((d) => d.isPrimary) ?? displays[0];
        if (primary) s.setSelectedDisplayId(primary.id);

        // Load bundled default GIF on startup (if nothing selected yet).
        if (!useAppState.getState().gifBytesBase64) {
          const def = await window.rp.getDefaultGif();
          if (def?.dataBase64) {
            s.setGifBytesBase64(def.dataBase64);
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.rp.pushOverlayState({
      gifBytesBase64: s.gifBytesBase64,
      scale: s.scale,
      speed: s.speed,
      animSpeed: s.animSpeed,
      freeze: s.majorityActive || !s.gifRunning,
      visible: s.gifVisible,
    });
  }, [s.gifBytesBase64, s.scale, s.speed, s.animSpeed, s.majorityActive, s.gifRunning, s.gifVisible]);

  async function pickGif() {
    setLoadingGif(true);
    try {
      const res = await window.rp.pickGif();
      if (!res) return;
      s.setGifBytesBase64(res.dataBase64);
      s.setGifVisible(true);
      s.setGifRunning(true);
      s.pushToast({ title: "GIF geladen", body: "Overlay wurde aktualisiert." });
    } catch (e: any) {
      s.pushToast({ title: "GIF Fehler", body: String(e?.message ?? e) });
    } finally {
      setLoadingGif(false);
    }
  }

  function join() {
    const code = s.roomCode.trim();
    const name = s.myName.trim();
    if (!code || !name) {
      s.pushToast({ title: "Fehlt was", body: "Bitte Raum-Code und Name angeben." });
      return;
    }

    socketRef.current?.close();
    const sock = connectRealtime(s.serverUrl);
    socketRef.current = sock;
    console.log(`[app] joining room ${code} as ${name}`);
    sock.send({ type: "joinRoom", code, name });
  }

  function setSmoking(next: boolean) {
    s.setIsSmoking(next);
    console.log(`[app] toggling smoking: ${next}`);
    socketRef.current?.send({ type: "toggleSmoking", isSmoking: next });
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    if (!s.joined) {
      s.pushToast({ title: "Chat", body: "Bitte zuerst joinen." });
      return;
    }
    console.log(`[app] sending chat: "${text.slice(0, 50)}${text.length > 50 ? "..." : ""}"`);
    socketRef.current?.send({ type: "chatMessage", text });
    setChatInput("");
  }

  async function toggleFullScreen(next: boolean) {
    s.setFullScreen(next);
    try {
      if (next) {
        const id = s.selectedDisplayId;
        if (typeof id === "number") await window.rp.snapToDisplay(id);
        else await window.rp.snapToPrimaryDisplay();
      }
      await window.rp.setFullScreenMode(next);
    } catch {
      s.pushToast({ title: "Fullscreen", body: "Konnte nicht gesetzt werden." });
    }
  }

  async function selectDisplay(id: number) {
    s.setSelectedDisplayId(id);
    if (!s.fullScreen) return;
    try {
      await window.rp.snapToDisplay(id);
    } catch {
      s.pushToast({ title: "Monitor", body: "Konnte Monitor nicht setzen." });
    }
  }

  return (
    <>
      <div className="app">
        <div className="sidebar">
          <div className="card">
            <div className="title">Raucherpause</div>
            <div className="muted">Desktop MVP (Raum-Code + Name)</div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="title" style={{ margin: 0 }}>
                Verbindung
              </div>
              <span className="pill">{s.joined ? "online" : "offline"}</span>
            </div>

            <div className="col">
              <label className="muted">Server URL</label>
              <input className="input" value={s.serverUrl} onChange={(e) => s.setServerUrl(e.target.value)} />
              <label className="muted">Raum-Code</label>
              <input className="input" value={s.roomCode} onChange={(e) => s.setRoomCode(e.target.value)} placeholder="z.B. TEAM1" />
              <label className="muted">Name</label>
              <input className="input" value={s.myName} onChange={(e) => s.setMyName(e.target.value)} placeholder="z.B. Henning" />
              <button className="btn primary" onClick={join}>
                Join
              </button>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="title" style={{ margin: 0 }}>
                Leute online
              </div>
              <span className="pill">
                {onlineSmokingCount}/{s.members.length} rauchen
              </span>
            </div>

            <div className="members">
              {s.members.length === 0 ? (
                <div className="muted">Noch niemand sichtbar.</div>
              ) : (
                s.members.map((m) => (
                  <div key={m.id} className="member">
                    <div className="memberName">
                      <span className={`dot ${m.isSmoking ? "danger" : "ok"}`} />
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {m.name} {m.id === s.myId ? "(du)" : ""}
                        </div>
                        <div className="muted">{m.isSmoking ? "auf Rauchen" : "da"}</div>
                      </div>
                    </div>
                    {m.id === s.myId ? (
                      <button className={`btn ${s.isSmoking ? "danger" : ""}`} onClick={() => setSmoking(!s.isSmoking)}>
                        {s.isSmoking ? "🚬 auf Rauchen" : "🚬 rauchen?"}
                      </button>
                    ) : (
                      <span className="pill">{m.isSmoking ? "🚬" : "✅"}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="title" style={{ margin: 0 }}>
                GIF / Bewegung
              </div>
              <span className="pill">{s.majorityActive ? "Mehrheit: AN" : "Mehrheit: AUS"}</span>
            </div>

            <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
              <span className="pill">Ganzer Screen: AUS</span>
              <span className="pill">Always on top: AUS</span>
              <button className="btn" onClick={() => void toggleFullScreen(true)}>
                Overlay neu setzen
              </button>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <div className="muted" style={{ width: 120 }}>
                Monitor
              </div>
              <select
                className="input"
                value={s.selectedDisplayId ?? ""}
                onChange={(e) => selectDisplay(Number(e.target.value))}
                disabled={s.displays.length === 0}
              >
                {s.displays.length === 0 ? (
                  <option value="">(keine Daten)</option>
                ) : (
                  s.displays.map((d, idx) => (
                    <option key={d.id} value={d.id}>
                      {`Monitor ${idx + 1}${d.isPrimary ? " (Primary)" : ""} – ${d.size.width}×${d.size.height} @${d.scaleFactor}x`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button className="btn" onClick={pickGif} disabled={loadingGif}>
              {loadingGif ? "Lade..." : "GIF auswählen"}
            </button>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn"
                onClick={() => {
                  const nextRunning = !s.gifRunning;
                  s.setGifRunning(nextRunning);
                  if (nextRunning) s.setGifVisible(true);
                }}
              >
                {s.gifRunning ? "⏸ Pause" : "▶ Start"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  s.setGifRunning(false);
                  s.setGifVisible(false);
                }}
              >
                ⏹ Stop
              </button>
            </div>

            <NumberParam
              label="Größe"
              min={0.2}
              max={3}
              step={0.05}
              value={s.scale}
              unit="x"
              onChange={(v) => s.setScale(clamp(v, 0.2, 3))}
            />
            <NumberParam
              label="Speed"
              min={40}
              max={800}
              step={10}
              value={s.speed}
              unit="px/s"
              onChange={(v) => s.setSpeed(clamp(v, 40, 800))}
            />
            <NumberParam
              label="Anim"
              min={0.25}
              max={6}
              step={0.05}
              value={s.animSpeed}
              unit="x"
              onChange={(v) => s.setAnimSpeed(clamp(v, 0.25, 6))}
            />
          </div>
        </div>

        <div className="main">
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div className="title" style={{ margin: 0 }}>
                  Raum-Chat
                </div>
                <div className="muted">
                  Nachrichten gehen an alle im aktuellen Raum.
                </div>
              </div>
              <span className="pill">Room: {s.roomCode || "-"}</span>
            </div>
          </div>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 420 }}>
            <div className="chatList">
              {s.chatMessages.length === 0 ? (
                <div className="muted">Noch keine Nachrichten.</div>
              ) : (
                s.chatMessages.map((m, idx) => (
                  <div key={`${m.id}-${m.createdAt}-${idx}`} className="chatMsg">
                    <div className="chatMeta">
                      <strong>{m.name}</strong>
                      <span className="muted">{new Date(m.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <div>{m.text}</div>
                  </div>
                ))
              )}
            </div>
            <div className="row">
              <input
                className="input"
                placeholder={s.joined ? "Nachricht schreiben..." : "Erst joinen, dann chatten"}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendChat();
                }}
                disabled={!s.joined}
              />
              <button className="btn primary" onClick={sendChat} disabled={!s.joined || !chatInput.trim()}>
                Senden
              </button>
            </div>
          </div>
        </div>
      </div>
      <Toasts />
    </>
  );
}

