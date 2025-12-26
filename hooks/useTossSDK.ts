'use client';

import { useEffect, useState } from 'react';

interface TossSDKState {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
}

// 전역 상태로 SDK 로딩 상태 관리 (중복 로딩 방지)
let sdkLoadPromise: Promise<void> | null = null;
let sdkLoaded = false;

const loadTossSDK = (): Promise<void> => {
  if (sdkLoaded && window.TossPayments) {
    return Promise.resolve();
  }

  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise((resolve, reject) => {
    if (window.TossPayments) {
      sdkLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v1/payment';
    script.async = true;
    script.onload = () => {
      sdkLoaded = true;
      resolve();
    };
    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('토스페이먼츠 SDK를 불러오는데 실패했습니다.'));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
};

export function useTossSDK(): TossSDKState {
  const [state, setState] = useState<TossSDKState>({
    isReady: sdkLoaded && typeof window !== 'undefined' && !!window.TossPayments,
    isLoading: !sdkLoaded,
    error: null,
  });

  useEffect(() => {
    if (state.isReady) return;

    loadTossSDK()
      .then(() => {
        setState({ isReady: true, isLoading: false, error: null });
      })
      .catch((err) => {
        setState({ isReady: false, isLoading: false, error: err.message });
      });
  }, [state.isReady]);

  return state;
}

export function getTossPayments() {
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  if (!clientKey) {
    throw new Error('토스 클라이언트 키가 설정되지 않았습니다.');
  }
  if (!window.TossPayments) {
    throw new Error('토스페이먼츠 SDK가 로드되지 않았습니다.');
  }
  return window.TossPayments(clientKey);
}
