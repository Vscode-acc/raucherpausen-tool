import React, { useEffect, useState } from "react";
import { BouncyGifCanvas, type LoadedGif } from "./BouncyGifCanvas";
import { decodeAndTrimGif } from "./gif/decodeAndTrimGif";

type OverlayState = {
  gifBytesBase64: string | null;
  scale: number;
  speed: number;
  animSpeed: number;
  freeze: boolean;
  visible: boolean;
};

const defaultState: OverlayState = {
  gifBytesBase64: null,
  scale: 1,
  speed: 420,
  animSpeed: 5,
  freeze: false,
  visible: true,
};

export function OverlayApp() {
  const [overlay, setOverlay] = useState<OverlayState>(defaultState);
  const [gif, setGif] = useState<LoadedGif | null>(null);

  useEffect(() => {
    let disposed = false;
    window.rp.onOverlayState(async (next) => {
      setOverlay(next);
      if (!next.gifBytesBase64) {
        setGif(null);
        return;
      }
      try {
        const buf = Uint8Array.from(atob(next.gifBytesBase64), (c) => c.charCodeAt(0)).buffer;
        const decoded = await decodeAndTrimGif(buf);
        if (!disposed) setGif(decoded);
      } catch {
        if (!disposed) setGif(null);
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  return (
    <div className="overlayRoot">
      <BouncyGifCanvas gif={overlay.visible ? gif : null} scale={overlay.scale} speed={overlay.speed} animSpeed={overlay.animSpeed} freeze={overlay.freeze} />
      {overlay.freeze && <div className="bubble">DU MUSS RAUCHEN</div>}
    </div>
  );
}
