'use client';

import { useState, ReactNode } from 'react';
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
}

export default function AccountTabs({
  subscriptionContent,
  cardsContent,
  paymentsContent,
  historyContent,
}: AccountTabsProps) {
  const [activeTab, setActiveTab] = useState('subscription');

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
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white text-yamoo-primary shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className={activeTab === tab.id ? 'text-yamoo-primary' : 'text-gray-400'}>
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
