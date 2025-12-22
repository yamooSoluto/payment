'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    ChannelIO?: (command: string, options?: Record<string, unknown>) => void;
    ChannelIOInitialized?: boolean;
  }
}

export default function ChannelTalk() {
  useEffect(() => {
    // Channel.io 스크립트 로드
    (function () {
      const w = window;
      if (w.ChannelIO) {
        return console.error('ChannelIO script included twice.');
      }
      const ch = function (...args: unknown[]) {
        ch.c(args);
      };
      ch.q = [] as unknown[][];
      ch.c = function (args: unknown[]) {
        ch.q.push(args);
      };
      w.ChannelIO = ch as typeof w.ChannelIO;

      function l() {
        if (w.ChannelIOInitialized) {
          return;
        }
        w.ChannelIOInitialized = true;
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.async = true;
        s.src = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
        const x = document.getElementsByTagName('script')[0];
        if (x.parentNode) {
          x.parentNode.insertBefore(s, x);
        }
      }

      if (document.readyState === 'complete') {
        l();
      } else {
        w.addEventListener('DOMContentLoaded', l);
        w.addEventListener('load', l);
      }
    })();

    // Channel.io 초기화
    if (window.ChannelIO) {
      window.ChannelIO('boot', {
        pluginKey: 'c63280b5-368d-4890-b507-a622bd98ff4e',
      });
    }

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (window.ChannelIO) {
        window.ChannelIO('shutdown');
      }
    };
  }, []);

  return null;
}
