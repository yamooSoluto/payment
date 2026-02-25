'use client';

import { useState, useEffect, ReactNode } from 'react';
import { CreditCard, Journal, Calendar, Settings } from 'iconoir-react';

interface Tab {
  id: string;
  label: string;
  icon: ReactNode;
}

const tabs: Tab[] = [
  { id: 'subscription', label: '구독 정보', icon: <Settings width={18} height={18} strokeWidth={1.5} /> },
  { id: 'cards', label: '결제 수단', icon: <CreditCard width={18} height={18} strokeWidth={1.5} /> },
  { id: 'payments', label: '결제 내역', icon: <Journal width={18} height={18} strokeWidth={1.5} /> },
  { id: 'history', label: '구독 내역', icon: <Calendar width={18} height={18} strokeWidth={1.5} /> },
];

interface AccountTabsProps {
  subscriptionContent: ReactNode;
  cardsContent: ReactNode;
  paymentsContent: ReactNode;
  historyContent: ReactNode;
  initialTab?: string;
}

export default function AccountTabs({
  subscriptionContent,
  cardsContent,
  paymentsContent,
  historyContent,
  initialTab,
}: AccountTabsProps) {
  const [activeTab, setActiveTab] = useState(initialTab || 'subscription');

  // URL hash로 탭 이동 지원
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      if (hash && tabs.some(t => t.id === hash)) {
        setActiveTab(hash);
      }
    };

    // 초기 로드 시 hash 확인
    handleHashChange();

    // hash 변경 이벤트 리스닝
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const getContent = () => {
    switch (activeTab) {
      case 'subscription':
        return subscriptionContent;
      case 'cards':
        return cardsContent;
      case 'payments':
        return paymentsContent;
      case 'history':
        return historyContent;
      default:
        return subscriptionContent;
    }
  };

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100/90 backdrop-blur-md border border-gray-200/60 shadow-sm p-1.5 rounded-2xl mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-md'
                : 'text-gray-400 hover:text-gray-600 hover:bg-white/60'
            }`}
          >
            <span className={activeTab === tab.id ? 'text-gray-800' : 'text-gray-400'}>
              {tab.icon}
            </span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{getContent()}</div>
    </div>
  );
}
