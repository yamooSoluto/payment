'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import React from 'react';

const features = [
  {
    category: '기본 기능',
    items: [
      { name: 'AI 자동 답변', trial: true, basic: true, business: true, enterprise: true },
      { name: '업무 처리 메세지 요약 전달', trial: true, basic: true, business: true, enterprise: true },
      { name: '수동 답변 메세지 자동 보정', trial: true, basic: false, business: true, enterprise: true },
    ],
  },
  {
    category: '문의 처리',
    items: [
      { name: '월 문의 건수', trial: '제한 없음', basic: '300건', business: '무제한', enterprise: '무제한' },
      { name: '데이터 추가', trial: '제한적', basic: '무제한', business: '무제한', enterprise: '무제한' },
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

export default function ComparisonTable() {
  const [isOpen, setIsOpen] = useState(false);

  const renderCell = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="w-5 h-5 text-green-500 mx-auto" />
      ) : (
        <X className="w-5 h-5 text-gray-300 mx-auto" />
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
            <ChevronUp className="w-5 h-5" />
          </>
        ) : (
          <>
            <span>상세 기능 비교표 보기</span>
            <ChevronDown className="w-5 h-5" />
          </>
        )}
      </button>

      {isOpen && (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left p-4 font-semibold text-gray-900 border-b">기능</th>
                <th className="text-center p-4 font-semibold text-gray-900 border-b min-w-[100px]">
                  Trial
                </th>
                <th className="text-center p-4 font-semibold text-gray-900 border-b min-w-[100px]">
                  Basic
                </th>
                <th className="text-center p-4 font-semibold text-gray-900 border-b min-w-[100px]">
                  Business
                </th>
                <th className="text-center p-4 font-semibold text-gray-900 border-b min-w-[100px]">
                  Enterprise
                </th>
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
                      <td className="p-4 text-gray-600">{item.name}</td>
                      <td className="p-4 text-center">{renderCell(item.trial)}</td>
                      <td className="p-4 text-center">{renderCell(item.basic)}</td>
                      <td className="p-4 text-center">{renderCell(item.business)}</td>
                      <td className="p-4 text-center">{renderCell(item.enterprise)}</td>
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
