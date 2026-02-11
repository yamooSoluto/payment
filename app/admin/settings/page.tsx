'use client';

import Link from 'next/link';
import { Page, Settings, InfoCircle, Database } from 'iconoir-react';

const settingsMenus = [
  {
    name: '홈페이지 설정',
    description: '로고, 파비콘, 메뉴, 링크 미리보기(OG) 설정을 관리합니다.',
    href: '/admin/settings/general',
    icon: Settings,
  },
  {
    name: '약관 / 개인정보처리방침',
    description: '이용약관 및 개인정보처리방침을 관리합니다.',
    href: '/admin/settings/terms',
    icon: Page,
  },
  {
    name: 'FAQ',
    description: '자주 묻는 질문을 관리합니다.',
    href: '/admin/settings/faq',
    icon: InfoCircle,
  },
  {
    name: '벡터 템플릿',
    description: '라이브러리 데이터의 예상 질문 및 keyData 매핑 템플릿을 관리합니다.',
    href: '/admin/settings/vector-templates',
    icon: Database,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsMenus.map((menu) => {
          const Icon = menu.icon;
          return (
            <Link
              key={menu.href}
              href={menu.href}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{menu.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">{menu.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
