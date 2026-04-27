import React, { useEffect, useMemo, useRef } from "react";

export type GifFrame = {
  bitmap: ImageBitmap;
  delayMs: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
};

export type LoadedGif = {
  width: number;
  height: number;
  frames: GifFrame[];
};

export function BouncyGifCanvas(props: { gif: LoadedGif | null; scale: number; speed: number; animSpeed: number; freeze: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    x: 40,
    y: 40,
    dx: 1,
    dy: 1,
    lastTs: 0,
    frameIdx: 0,
    frameAccMs: 0,
    seeded: false,
  });

  const target = useMemo(() => {
    const w = Math.max(1, Math.floor((props.gif?.width ?? 240) * props.scale));
    const h = Math.max(1, Math.floor((props.gif?.height ?? 160) * props.scale));
    return { w, h };
  }, [props.gif?.width, props.gif?.height, props.scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop);
      const st = stateRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      if (!st.seeded) {
        // Similar to the proven Python logic: top-left position + direction vector.
        st.dx = Math.random() > 0.5 ? 1 : -1;
        st.dy = Math.random() > 0.5 ? 1 : -1;
        st.x = Math.random() * Math.max(1, w - target.w);
        st.y = Math.random() * Math.max(1, h - target.h);
        st.seeded = true;
      }

      const deltaMs = st.lastTs ? ts - st.lastTs : 0;
      const dt = deltaMs / 1000;
      st.lastTs = ts;

      const movementPaused = props.freeze;
      if (!movementPaused) {
        const px = props.speed * dt;
        st.x += st.dx * px;
        st.y += st.dy * px;

        if (st.x <= 0 || st.x >= w - target.w) {
          st.dx *= -1;
          st.x = Math.max(0, Math.min(st.x, Math.max(0, w - target.w)));
        }

        if (st.y <= 0 || st.y >= h - target.h) {
          st.dy *= -1;
          st.y = Math.max(0, Math.min(st.y, Math.max(0, h - target.h)));
        }
      }

      // frame stepping
      const gif = props.gif;
      if (gif && gif.frames.length > 0 && !movementPaused) {
        st.frameAccMs += deltaMs * props.animSpeed;
        const cur = gif.frames[st.frameIdx]!;
        const delay = Math.max(10, cur.delayMs);
        if (st.frameAccMs >= delay) {
          st.frameAccMs -= delay;
          st.frameIdx = (st.frameIdx + 1) % gif.frames.length;
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!gif) {
        // Transparent overlay until a GIF is loaded.
        return;
      }

      const frame = gif.frames[st.frameIdx] ?? gif.frames[0]!;
      const scaleX = target.w / gif.width;
      const scaleY = target.h / gif.height;
      const drawX = st.x + frame.anchorOffsetX * scaleX;
      const drawY = st.y + frame.anchorOffsetY * scaleY;
      // Avoid edge bleeding artifacts (left edge appearing on the right side).
      ctx.imageSmoothingEnabled = false;
      const srcInset = frame.bitmap.width > 2 && frame.bitmap.height > 2 ? 1 : 0;
      // Extra cleanup for occasional right-edge color residue.
      const srcRightCrop = frame.bitmap.width > 6 ? 2 : 0;
      if (srcInset > 0 || srcRightCrop > 0) {
        const sx = srcInset;
        const sy = srcInset;
        const sw = frame.bitmap.width - srcInset * 2 - srcRightCrop;
        const sh = frame.bitmap.height - srcInset * 2;
        if (sw <= 0 || sh <= 0) return;
        // Keep source/destination ratio consistent (no horizontal stretch artifacts).
        const dx = Math.round(drawX + (sx / frame.bitmap.width) * target.w);
        const dy = Math.round(drawY + (sy / frame.bitmap.height) * target.h);
        const dw = Math.max(1, Math.round((sw / frame.bitmap.width) * target.w));
        const dh = Math.max(1, Math.round((sh / frame.bitmap.height) * target.h));
        ctx.drawImage(
          frame.bitmap,
          sx,
          sy,
          sw,
          sh,
          dx,
          dy,
          dw,
          dh,
        );
      } else {
        ctx.drawImage(frame.bitmap, Math.round(drawX), Math.round(drawY), target.w, target.h);
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [props.gif, props.freeze, props.speed, props.animSpeed, target.w, target.h]);

  // reset seed when new gif arrives
  useEffect(() => {
    stateRef.current.seeded = false;
    stateRef.current.frameIdx = 0;
    stateRef.current.frameAccMs = 0;
  }, [props.gif]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", cursor: "grab", WebkitAppRegion: "drag" }} />;
}

