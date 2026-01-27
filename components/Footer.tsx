'use client';

import { useState, useEffect } from 'react';
import { ChatBubble, Mail, Copy, Check, Building, MapPin, Phone } from 'iconoir-react';
import Link from 'next/link';

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
  showCompanyInfo: boolean;
  showCustomerService: boolean;
  showTermsLinks: boolean;
  showCopyright: boolean;
  companyInfo: FooterCompanyInfo;
  customerService: FooterCustomerService;
  copyrightText: string;
}

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

export default function Footer() {
  const [copied, setCopied] = useState(false);
  const [footerSettings, setFooterSettings] = useState<FooterSettings>(defaultFooterSettings);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          if (data.settings?.footer) {
            setFooterSettings(data.settings.footer);
          }
        }
      } catch (error) {
        console.error('Failed to fetch footer settings:', error);
      }
    };

    fetchSettings();
  }, []);

  const openChannelTalk = () => {
    if (window.ChannelIO) {
      window.ChannelIO('showMessenger');
    }
  };

  const handleCopyEmail = async () => {
    const email = footerSettings.customerService.email;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textArea = document.createElement('textarea');
      textArea.value = email;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const { companyInfo, customerService } = footerSettings;

  return (
    <>
      <footer className="bg-gray-800 py-8 px-4 mt-auto">
        <div className="max-w-5xl mx-auto text-sm text-gray-300">
          {/* PC: 2열 레이아웃 (중앙 정렬), 모바일: 1열 */}
          <div className="flex flex-col md:flex-row md:justify-center md:gap-24">
            {/* 좌측: 회사 정보 */}
            {footerSettings.showCompanyInfo && (
              <div className="space-y-2">
                <p className="font-semibold text-white">Company</p>
                <div className="space-y-1">
                  {companyInfo.companyName && (
                    <>
                      <div className="flex items-center gap-2 md:hidden">
                        <Building width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                        <p>{companyInfo.companyName}</p>
                      </div>
                      <div className="hidden md:flex items-center gap-2">
                        <Building width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                        <p>{companyInfo.companyName}{companyInfo.ceo && ` | 대표자: ${companyInfo.ceo}`}</p>
                      </div>
                    </>
                  )}
                  {companyInfo.address && (
                    <div className="flex items-center gap-2">
                      <MapPin width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                      <p>{companyInfo.address}</p>
                    </div>
                  )}
                  {companyInfo.ceo && <p className="md:hidden">대표자: {companyInfo.ceo}</p>}
                  {companyInfo.businessNumber && <p className="mt-2 md:mt-1">사업자등록번호: {companyInfo.businessNumber}</p>}
                  {companyInfo.ecommerceNumber && <p className="md:hidden">통신판매신고번호: {companyInfo.ecommerceNumber}</p>}
                  {companyInfo.privacyOfficer && <p className="md:hidden">개인정보관리책임자: {companyInfo.privacyOfficer}</p>}
                  {(companyInfo.ecommerceNumber || companyInfo.privacyOfficer) && (
                    <p className="hidden md:block">
                      {[
                        companyInfo.ecommerceNumber && `통신판매신고번호: ${companyInfo.ecommerceNumber}`,
                        companyInfo.privacyOfficer && `개인정보관리책임자: ${companyInfo.privacyOfficer}`
                      ].filter(Boolean).join(' | ')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 우측: 고객센터 */}
            {footerSettings.showCustomerService && (
              <div className={`${footerSettings.showCompanyInfo ? 'mt-4 pt-4 border-t border-gray-700 md:mt-0 md:pt-0 md:border-t-0' : ''} space-y-2`}>
                <p className="font-semibold text-white">고객센터</p>
                {(customerService.phone || customerService.channelTalkName) && (
                  <div>
                    <div className="flex items-center gap-4">
                      {customerService.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                          <span>{customerService.phone}</span>
                        </div>
                      )}
                      {customerService.channelTalkName && (
                        <div className="flex items-center gap-1.5">
                          <ChatBubble width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                          <button
                            onClick={openChannelTalk}
                            className="text-yamoo-primary hover:underline font-medium"
                          >
                            {customerService.channelTalkName}
                          </button>
                        </div>
                      )}
                    </div>
                    {customerService.operatingHours && (
                      <p className="text-gray-400 text-xs mt-1 ml-5">
                        {customerService.operatingHours}
                      </p>
                    )}
                    {customerService.closedDays && (
                      <p className="text-gray-500 text-xs ml-5">{customerService.closedDays}</p>
                    )}
                  </div>
                )}
                {customerService.email && (
                  <div className="flex items-center gap-2">
                    <Mail width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                    <span>{customerService.email}</span>
                    <button
                      onClick={handleCopyEmail}
                      className="p-1 hover:bg-gray-800 rounded transition-colors"
                      title="이메일 복사"
                    >
                      {copied ? (
                        <Check width={16} height={16} strokeWidth={1.5} className="text-green-400" />
                      ) : (
                        <Copy width={16} height={16} strokeWidth={1.5} className="text-gray-400 hover:text-white" />
                      )}
                    </button>
                    {copied && <span className="text-xs text-green-400">복사됨</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 하단: 약관 링크 + 저작권 */}
          {(footerSettings.showTermsLinks || footerSettings.showCopyright) && (
            <div className="mt-6 pt-4 border-t border-gray-700 flex flex-col md:flex-row md:justify-center md:items-center gap-2 md:gap-6">
              {footerSettings.showTermsLinks && (
                <div className="flex gap-4">
                  <Link
                    href="/terms"
                    target="_blank"
                    className="text-gray-300 hover:text-yamoo-primary underline underline-offset-2 transition-colors"
                  >
                    이용약관
                  </Link>
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="text-gray-300 hover:text-yamoo-primary underline underline-offset-2 transition-colors"
                  >
                    개인정보처리방침
                  </Link>
                </div>
              )}
              {footerSettings.showCopyright && (
                <p className="text-gray-500 text-xs">
                  Copyright {new Date().getFullYear()}. {footerSettings.copyrightText}
                </p>
              )}
            </div>
          )}
        </div>
      </footer>

    </>
  );
}
