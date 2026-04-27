export {};

declare global {
  interface Window {
    rp: {
      pickGif: () => Promise<{ filePath: string; dataBase64: string } | null>;
      getDefaultGif: () => Promise<{ filePath: string; dataBase64: string } | null>;
      notify: (title: string, body: string) => void;
      setAlwaysOnTop: (enabled: boolean) => Promise<void>;
      setFullScreenMode: (enabled: boolean) => Promise<void>;
      snapToPrimaryDisplay: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
      getDisplays: () => Promise<
        Array<{
          id: number;
          bounds: { x: number; y: number; width: number; height: number };
          workArea: { x: number; y: number; width: number; height: number };
          size: { width: number; height: number };
          scaleFactor: number;
          isPrimary: boolean;
        }>
      >;
      snapToDisplay: (displayId: number) => Promise<{ x: number; y: number; width: number; height: number } | null>;
      pushOverlayState: (state: {
        gifBytesBase64: string | null;
        scale: number;
        speed: number;
        animSpeed: number;
        freeze: boolean;
        visible: boolean;
      }) => void;
      onOverlayState: (cb: (state: { gifBytesBase64: string | null; scale: number; speed: number; animSpeed: number; freeze: boolean; visible: boolean }) => void) => void;
    };
  }
}

