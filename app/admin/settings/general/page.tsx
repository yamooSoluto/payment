'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Upload, NavArrowUp, NavArrowDown, Check, Xmark, Link as LinkIcon, MediaImage, Menu, Label, Building, Phone, Mail } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

interface MenuItem {
  id: string;
  name: string;
  path: string;
  visible: boolean;
  order: number;
}

interface FooterCompanyInfo {
  companyName: string;
  ceo: string;
  address: string;
  businessNumber: string;
  ecommerceNumber: string;
  privacyOfficer: string;
}

interface FooterCustomerService {
  phone: string;
  channelTalkName: string;
  operatingHours: string;
  closedDays: string;
  email: string;
}

interface FooterSettings {
  // 레이아웃 설정
  showCompanyInfo: boolean;
  showCustomerService: boolean;
  showTermsLinks: boolean;
  showCopyright: boolean;
  // 회사 정보
  companyInfo: FooterCompanyInfo;
  // 고객센터
  customerService: FooterCustomerService;
  // 저작권
  copyrightText: string;
}

interface SiteSettings {
  // 사이트 기본 정보
  siteName: string;
  // 로고 & 파비콘
  logoUrl: string;
  faviconUrl: string;
  // 메뉴 설정
  menuItems: MenuItem[];
  // 링크 미리보기 (OG)
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  // 푸터 설정
  footer: FooterSettings;
}

const defaultMenuItems: MenuItem[] = [
  { id: 'about', name: '소개', path: '/about', visible: true, order: 0 },
  { id: 'trial', name: '무료체험', path: '/trial', visible: true, order: 1 },
  { id: 'plan', name: '요금제', path: '/plan', visible: true, order: 2 },
  { id: 'faq', name: 'FAQ', path: '/faq', visible: true, order: 3 },
  { id: 'portal', name: '포탈', path: 'https://app.yamoo.ai.kr', visible: true, order: 4 },
  { id: 'account', name: '마이페이지', path: '/account', visible: true, order: 5 },
];

const defaultFooterSettings: FooterSettings = {
  showCompanyInfo: true,
  showCustomerService: true,
  showTermsLinks: true,
  showCopyright: true,
  companyInfo: {
    companyName: '주식회사 솔루투',
    ceo: '김채윤',
    address: '경기도 화성시 메타폴리스로 42, 902호',
    businessNumber: '610-86-36594',
    ecommerceNumber: '2025-화성동탄-3518',
    privacyOfficer: '김채윤',
  },
  customerService: {
    phone: '1544-1288',
    channelTalkName: '야무 YAMOO',
    operatingHours: '평일 10:00~17:00 (점심 12:00~13:00)',
    closedDays: '토, 일, 공휴일 휴무',
    email: 'yamoo@soluto.co.kr',
  },
  copyrightText: 'YAMOO All rights reserved.',
};

export default function GeneralSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: 'YAMOO',
    logoUrl: '',
    faviconUrl: '',
    menuItems: defaultMenuItems,
    ogTitle: '',
    ogDescription: '',
    ogImageUrl: '',
    footer: defaultFooterSettings,
  });

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const ogImageInputRef = useRef<HTMLInputElement>(null);

  // 설정 불러오기
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/admin/settings');
        if (response.ok) {
          const data = await response.json();
          if (data.settings) {
            // 저장된 메뉴와 기본 메뉴 병합 (새로운 기본 메뉴 항목 자동 추가)
            let menuItems = data.settings.menuItems || [];
            if (menuItems.length > 0) {
              const savedIds = new Set(menuItems.map((item: MenuItem) => item.id));
              const newItems = defaultMenuItems.filter(item => !savedIds.has(item.id));
              if (newItems.length > 0) {
                const maxOrder = Math.max(...menuItems.map((item: MenuItem) => item.order), -1);
                menuItems = [
                  ...menuItems,
                  ...newItems.map((item, idx) => ({ ...item, order: maxOrder + 1 + idx }))
                ];
              }
            } else {
              menuItems = defaultMenuItems;
            }

            setSettings({
              siteName: data.settings.siteName || 'YAMOO',
              logoUrl: data.settings.logoUrl || '',
              faviconUrl: data.settings.faviconUrl || '',
              menuItems,
              ogTitle: data.settings.ogTitle || '',
              ogDescription: data.settings.ogDescription || '',
              ogImageUrl: data.settings.ogImageUrl || '',
              footer: data.settings.footer || defaultFooterSettings,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // 설정 저장
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (response.ok) {
        alert('설정이 저장되었습니다.');
      } else {
        alert('저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 이미지 업로드
  const handleImageUpload = async (
    file: File,
    type: 'logo' | 'favicon' | 'ogImage'
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      const response = await fetch('/api/admin/settings/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (type === 'logo') {
          setSettings(prev => ({ ...prev, logoUrl: data.url }));
        } else if (type === 'favicon') {
          setSettings(prev => ({ ...prev, faviconUrl: data.url }));
        } else if (type === 'ogImage') {
          setSettings(prev => ({ ...prev, ogImageUrl: data.url }));
        }
      } else {
        alert('이미지 업로드에 실패했습니다.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('업로드 중 오류가 발생했습니다.');
    }
  };

  // 메뉴 이름 변경
  const handleMenuNameChange = (id: string, name: string) => {
    setSettings(prev => ({
      ...prev,
      menuItems: prev.menuItems.map(item =>
        item.id === id ? { ...item, name } : item
      ),
    }));
  };

  // 메뉴 경로 변경
  const handleMenuPathChange = (id: string, path: string) => {
    setSettings(prev => ({
      ...prev,
      menuItems: prev.menuItems.map(item =>
        item.id === id ? { ...item, path } : item
      ),
    }));
  };

  // 메뉴 표시 여부 토글
  const handleMenuVisibilityToggle = (id: string) => {
    setSettings(prev => ({
      ...prev,
      menuItems: prev.menuItems.map(item =>
        item.id === id ? { ...item, visible: !item.visible } : item
      ),
    }));
  };

  // 메뉴 순서 변경
  const handleMenuOrderChange = (id: string, direction: 'up' | 'down') => {
    setSettings(prev => {
      const items = [...prev.menuItems].sort((a, b) => a.order - b.order);
      const index = items.findIndex(item => item.id === id);

      if (direction === 'up' && index > 0) {
        const temp = items[index].order;
        items[index].order = items[index - 1].order;
        items[index - 1].order = temp;
      } else if (direction === 'down' && index < items.length - 1) {
        const temp = items[index].order;
        items[index].order = items[index + 1].order;
        items[index + 1].order = temp;
      }

      return { ...prev, menuItems: items };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">홈페이지 설정</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? (
            <>
              <Spinner size="sm" />
              저장 중...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              저장
            </>
          )}
        </button>
      </div>

      {/* 사이트명 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Label className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">사이트명</h2>
        </div>

        <div>
          <input
            type="text"
            value={settings.siteName}
            onChange={(e) => setSettings(prev => ({ ...prev, siteName: e.target.value }))}
            placeholder="YAMOO"
            className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-400 mt-1.5">브라우저 탭에 표시되는 이름입니다.</p>
        </div>
      </div>

      {/* 로고 & 파비콘 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <MediaImage className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">로고 & 파비콘</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 로고 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              로고 이미지
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              {settings.logoUrl ? (
                <div className="relative">
                  <img
                    src={settings.logoUrl}
                    alt="Logo"
                    className="max-h-20 mx-auto object-contain"
                  />
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, logoUrl: '' }))}
                    className="absolute top-0 right-0 p-1 bg-red-100 rounded-full hover:bg-red-200"
                  >
                    <Xmark className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="cursor-pointer py-4"
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">클릭하여 업로드</p>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG (권장: 200x50)</p>
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'logo');
                }}
              />
            </div>
          </div>

          {/* 파비콘 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              파비콘
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              {settings.faviconUrl ? (
                <div className="relative inline-block">
                  <img
                    src={settings.faviconUrl}
                    alt="Favicon"
                    className="w-16 h-16 mx-auto object-contain"
                  />
                  <button
                    onClick={() => setSettings(prev => ({ ...prev, faviconUrl: '' }))}
                    className="absolute -top-2 -right-2 p-1 bg-red-100 rounded-full hover:bg-red-200"
                  >
                    <Xmark className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => faviconInputRef.current?.click()}
                  className="cursor-pointer py-4"
                >
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">클릭하여 업로드</p>
                  <p className="text-xs text-gray-400 mt-1">ICO, PNG (권장: 32x32)</p>
                </div>
              )}
              <input
                ref={faviconInputRef}
                type="file"
                accept=".ico,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'favicon');
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 네비게이션 메뉴 설정 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Menu className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">네비게이션 메뉴</h2>
        </div>

        <div className="space-y-3">
          {settings.menuItems
            .sort((a, b) => a.order - b.order)
            .map((item, index) => (
              <div
                key={item.id}
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  item.visible ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => handleMenuOrderChange(item.id, 'up')}
                    disabled={index === 0}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <NavArrowUp className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleMenuOrderChange(item.id, 'down')}
                    disabled={index === settings.menuItems.length - 1}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <NavArrowDown className="w-4 h-4 text-gray-500" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-gray-400 mb-1">메뉴명</label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleMenuNameChange(item.id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-gray-400 mb-1">경로/URL</label>
                  <input
                    type="text"
                    value={item.path}
                    onChange={(e) => handleMenuPathChange(item.id, e.target.value)}
                    placeholder="/about 또는 https://..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <label className="relative inline-flex items-center cursor-pointer gap-2">
                  <input
                    type="checkbox"
                    checked={item.visible}
                    onChange={() => handleMenuVisibilityToggle(item.id)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className={`text-xs font-medium min-w-[28px] ${item.visible ? 'text-blue-600' : 'text-gray-400'}`}>
                    {item.visible ? '표시' : '숨김'}
                  </span>
                </label>
              </div>
            ))}
        </div>
      </div>

      {/* 링크 미리보기 (OG) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <LinkIcon className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">링크 미리보기 (OG 태그)</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          카카오톡 등에서 링크 공유 시 표시되는 정보입니다.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                제목
              </label>
              <input
                type="text"
                value={settings.ogTitle}
                onChange={(e) => setSettings(prev => ({ ...prev, ogTitle: e.target.value }))}
                placeholder="야무 - CS 자동화 솔루션"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                설명
              </label>
              <textarea
                value={settings.ogDescription}
                onChange={(e) => setSettings(prev => ({ ...prev, ogDescription: e.target.value }))}
                placeholder="매장 운영을 더 스마트하게"
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                미리보기 이미지
              </label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                {settings.ogImageUrl ? (
                  <div className="relative">
                    <img
                      src={settings.ogImageUrl}
                      alt="OG Image"
                      className="max-h-32 mx-auto object-contain rounded"
                    />
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, ogImageUrl: '' }))}
                      className="absolute top-0 right-0 p-1 bg-red-100 rounded-full hover:bg-red-200"
                    >
                      <Xmark className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => ogImageInputRef.current?.click()}
                    className="cursor-pointer py-2"
                  >
                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <p className="text-sm text-gray-500">클릭하여 업로드</p>
                    <p className="text-xs text-gray-400 mt-1">권장: 800x400</p>
                  </div>
                )}
                <input
                  ref={ogImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file, 'ogImage');
                  }}
                />
              </div>
            </div>
          </div>

          {/* 미리보기 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              미리보기
            </label>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              {settings.ogImageUrl ? (
                <img
                  src={settings.ogImageUrl}
                  alt="Preview"
                  className="w-full aspect-[2/1] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/1] bg-gray-200 flex items-center justify-center">
                  <MediaImage className="w-12 h-12 text-gray-400" />
                </div>
              )}
              <div className="p-3">
                <p className="font-medium text-gray-900 text-sm truncate">
                  {settings.ogTitle || '제목을 입력하세요'}
                </p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {settings.ogDescription || '설명을 입력하세요'}
                </p>
                <p className="text-xs text-gray-400 mt-2">yamoo.ai.kr</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 푸터 설정 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Building className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">하단 푸터</h2>
        </div>

        {/* 표시 설정 */}
        <div className="mb-6 pb-6 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-3">섹션 표시 설정</p>
          <div className="flex flex-wrap gap-4">
            {[
              { key: 'showCompanyInfo', label: '회사 정보' },
              { key: 'showCustomerService', label: '고객센터' },
              { key: 'showTermsLinks', label: '약관 링크' },
              { key: 'showCopyright', label: '저작권' },
            ].map(({ key, label }) => (
              <label key={key} className="relative inline-flex items-center cursor-pointer gap-2">
                <input
                  type="checkbox"
                  checked={settings.footer[key as keyof FooterSettings] as boolean}
                  onChange={() => setSettings(prev => ({
                    ...prev,
                    footer: { ...prev.footer, [key]: !prev.footer[key as keyof FooterSettings] }
                  }))}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 회사 정보 */}
          <div className={`space-y-4 ${!settings.footer.showCompanyInfo ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-gray-500" />
              <p className="text-sm font-medium text-gray-700">회사 정보</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">회사명</label>
                <input
                  type="text"
                  value={settings.footer.companyInfo.companyName}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      companyInfo: { ...prev.footer.companyInfo, companyName: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCompanyInfo}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">대표자</label>
                <input
                  type="text"
                  value={settings.footer.companyInfo.ceo}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      companyInfo: { ...prev.footer.companyInfo, ceo: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCompanyInfo}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">주소</label>
                <input
                  type="text"
                  value={settings.footer.companyInfo.address}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      companyInfo: { ...prev.footer.companyInfo, address: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCompanyInfo}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">사업자등록번호</label>
                <input
                  type="text"
                  value={settings.footer.companyInfo.businessNumber}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      companyInfo: { ...prev.footer.companyInfo, businessNumber: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCompanyInfo}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">통신판매신고번호</label>
                <input
                  type="text"
                  value={settings.footer.companyInfo.ecommerceNumber}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      companyInfo: { ...prev.footer.companyInfo, ecommerceNumber: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCompanyInfo}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">개인정보관리책임자</label>
                <input
                  type="text"
                  value={settings.footer.companyInfo.privacyOfficer}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      companyInfo: { ...prev.footer.companyInfo, privacyOfficer: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCompanyInfo}
                />
              </div>
            </div>
          </div>

          {/* 고객센터 정보 */}
          <div className={`space-y-4 ${!settings.footer.showCustomerService ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-500" />
              <p className="text-sm font-medium text-gray-700">고객센터</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">전화번호</label>
                <input
                  type="text"
                  value={settings.footer.customerService.phone}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      customerService: { ...prev.footer.customerService, phone: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCustomerService}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">채널톡 이름</label>
                <input
                  type="text"
                  value={settings.footer.customerService.channelTalkName}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      customerService: { ...prev.footer.customerService, channelTalkName: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCustomerService}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">운영시간</label>
                <input
                  type="text"
                  value={settings.footer.customerService.operatingHours}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      customerService: { ...prev.footer.customerService, operatingHours: e.target.value }
                    }
                  }))}
                  placeholder="평일 10:00~17:00 (점심 12:00~13:00)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCustomerService}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">휴무일</label>
                <input
                  type="text"
                  value={settings.footer.customerService.closedDays}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      customerService: { ...prev.footer.customerService, closedDays: e.target.value }
                    }
                  }))}
                  placeholder="토, 일, 공휴일 휴무"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCustomerService}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">이메일</label>
                <input
                  type="email"
                  value={settings.footer.customerService.email}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    footer: {
                      ...prev.footer,
                      customerService: { ...prev.footer.customerService, email: e.target.value }
                    }
                  }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!settings.footer.showCustomerService}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 저작권 텍스트 */}
        <div className={`mt-6 pt-6 border-t border-gray-100 ${!settings.footer.showCopyright ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-gray-500" />
            <p className="text-sm font-medium text-gray-700">저작권 표시</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Copyright {new Date().getFullYear()}.</span>
            <input
              type="text"
              value={settings.footer.copyrightText}
              onChange={(e) => setSettings(prev => ({
                ...prev,
                footer: { ...prev.footer, copyrightText: e.target.value }
              }))}
              placeholder="YAMOO All rights reserved."
              className="flex-1 max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!settings.footer.showCopyright}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
