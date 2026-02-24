'use client';

import { useState, ReactNode } from 'react';
import { User, Sofa, Group } from 'iconoir-react';

interface TabConfig {
  id: string;
  label: string;
  Icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: 'account', label: '계정 관리', Icon: User },
  { id: 'stores', label: '매장 관리', Icon: Sofa },
  { id: 'managers', label: '매니저 관리', Icon: Group },
];

interface AccountPageTabsProps {
  accountContent: ReactNode;
  storesContent: ReactNode;
  managersContent: ReactNode;
}

export default function AccountPageTabs({
  accountContent,
  storesContent,
  managersContent,
}: AccountPageTabsProps) {
  const [activeTab, setActiveTab] = useState('account');

  const getContent = () => {
    switch (activeTab) {
      case 'account': return accountContent;
      case 'stores': return storesContent;
      case 'managers': return managersContent;
      default: return accountContent;
    }
  };

  return (
    <div>
      {/* Tab Navigation - Glassmorphism */}
      <div className="flex gap-1 bg-gray-100/90 backdrop-blur-md border border-gray-200/60 shadow-sm p-1.5 rounded-2xl mb-6">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === id
                ? 'bg-white text-gray-900 shadow-md'
                : 'text-gray-400 hover:text-gray-600 hover:bg-white/60'
            }`}
          >
            <Icon
              width={17}
              height={17}
              strokeWidth={1.5}
              className={activeTab === id ? 'text-gray-800' : 'text-gray-400'}
            />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden text-xs">{label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>{getContent()}</div>
    </div>
  );
}
