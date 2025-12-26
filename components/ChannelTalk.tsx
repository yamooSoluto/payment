'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ChannelIO?: any;
    ChannelIOInitialized?: boolean;
  }
}

export default function ChannelTalk() {
  useEffect(() => {
    // 페이지 로드 완료 후 3초 뒤에 ChannelTalk 로드 (성능 최적화)
    const timeoutId = setTimeout(() => {
      loadChannelTalk();
    }, 3000);

    return () => {
      clearTimeout(timeoutId);
      if (window.ChannelIO) {
        window.ChannelIO('shutdown');
      }
    };
  }, []);

  const loadChannelTalk = () => {
    // Channel.io 스크립트 로드
    const w = window;
    if (w.ChannelIO) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch: any = function (...args: unknown[]) {
      ch.c(args);
    };
    ch.q = [] as unknown[][];
    ch.c = function (args: unknown[]) {
      ch.q.push(args);
    };
    w.ChannelIO = ch;

    if (!w.ChannelIOInitialized) {
      w.ChannelIOInitialized = true;
      const s = document.createElement('script');
      s.type = 'text/javascript';
      s.async = true;
      s.src = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
      s.onload = () => {
        // 스크립트 로드 완료 후 초기화
        if (window.ChannelIO) {
          window.ChannelIO('boot', {
            pluginKey: 'c63280b5-368d-4890-b507-a622bd98ff4e',
          });
        }
      };
      document.head.appendChild(s);
    }
  };

  return null;
}
