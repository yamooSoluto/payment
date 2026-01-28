'use client';

import { useState } from 'react';
import { NavArrowDown, NavArrowUp, Check, Xmark } from 'iconoir-react';
import React from 'react';

const features = [
  {
    category: '기본 기능',
    items: [
      { name: 'AI 자동 답변', trial: true, basic: true, business: true, enterprise: true },
      { name: '업무 처리 메세지 요약 전달', trial: true, basic: true, business: true, enterprise: true },
      { name: '답변 메시지 AI 보정', trial: true, basic: false, business: true, enterprise: true },
    ],
  },
  {
    category: '문의 처리',
    items: [
      { name: '월 문의 건수', trial: '제한 없음', basic: '300건', business: '무제한', enterprise: '무제한' },
      { name: '데이터 추가', trial: '무제한', basic: '무제한', business: '무제한', enterprise: '무제한' },
    ],
  },
  {
    category: '연동 기능',
    items: [
      { name: '미니맵 연동 및 활용', trial: false, basic: false, business: true, enterprise: true },
      { name: '예약 및 재고 연동', trial: false, basic: false, business: true, enterprise: true },
    ],
  },
  {
    category: '엔터프라이즈',
    items: [
      { name: '데이터 초기 세팅 및 관리', trial: false, basic: false, business: false, enterprise: true },
      { name: '다지점/브랜드 지원', trial: false, basic: false, business: false, enterprise: true },
      { name: '맞춤형 자동화 컨설팅', trial: false, basic: false, business: false, enterprise: true },
      { name: '데이터 리포트 & 통계', trial: false, basic: false, business: false, enterprise: true },
    ],
  },
];

interface ComparisonTableProps {
  comingSoonPlanIds?: string[];
}

export default function ComparisonTable({ comingSoonPlanIds = [] }: ComparisonTableProps) {
  const [isOpen, setIsOpen] = useState(true);

  const renderCell = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check width={20} height={20} strokeWidth={1.5} className="text-green-500 mx-auto" />
      ) : (
        <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-300 mx-auto" />
      );
    }
    return <span className="text-sm text-gray-700">{value}</span>;
  };

  return (
    <div className="mt-12">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 mx-auto text-yamoo-dark font-semibold hover:opacity-80 transition-opacity"
      >
        {isOpen ? (
          <>
            <span>상세 기능 비교표 접기</span>
            <NavArrowUp width={20} height={20} strokeWidth={1.5} />
          </>
        ) : (
          <>
            <span>상세 기능 비교표 보기</span>
            <NavArrowDown width={20} height={20} strokeWidth={1.5} />
          </>
        )}
      </button>

      {isOpen && (
        <div className="mt-8 overflow-x-auto">
          <table className="border-collapse min-w-[600px] max-w-4xl mx-auto">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-3 sm:p-4 font-semibold text-gray-900 border-b whitespace-nowrap w-[220px]">기능</th>
                {['trial', 'basic', 'business', 'enterprise'].map((planId) => (
                  <th key={planId} className="text-center p-2 sm:p-4 font-semibold text-gray-900 border-b text-xs sm:text-base w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <span>{planId.charAt(0).toUpperCase() + planId.slice(1)}</span>
                      {comingSoonPlanIds.includes(planId) && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded-full">준비중</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((category) => (
                <React.Fragment key={category.category}>
                  <tr className="bg-gray-100">
                    <td
                      colSpan={5}
                      className="p-3 font-semibold text-gray-700 text-sm"
                    >
                      {category.category}
                    </td>
                  </tr>
                  {category.items.map((item, index) => (
                    <tr key={`${category.category}-${index}`} className="border-b hover:bg-gray-50">
                      <td className="p-3 sm:p-4 text-gray-600 text-sm sm:text-base whitespace-nowrap">{item.name}</td>
                      <td className="p-2 sm:p-4 text-center">{renderCell(item.trial)}</td>
                      <td className="p-2 sm:p-4 text-center">{renderCell(item.basic)}</td>
                      <td className="p-2 sm:p-4 text-center">{renderCell(item.business)}</td>
                      <td className="p-2 sm:p-4 text-center">{renderCell(item.enterprise)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
