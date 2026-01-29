'use client';

import { useState } from 'react';
import { Copy, Check, EditPencil, Trash, Link } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import { CustomLink, Member } from './types';

interface CustomLinkTableProps {
  customLinks: CustomLink[];
  loading: boolean;
  tenants?: Member[];
  onEdit: (link: CustomLink) => void;
  onDelete: (link: CustomLink) => void;
  onCopyLink: (linkId: string) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getLinkStatus(link: CustomLink): { label: string; color: string } {
  if (link.status === 'disabled') {
    return { label: '비활성', color: 'bg-gray-100 text-gray-600' };
  }
  const now = new Date();
  const validUntil = new Date(link.validUntil);
  const validFrom = new Date(link.validFrom);
  if (now < validFrom) {
    return { label: '대기', color: 'bg-yellow-100 text-yellow-700' };
  }
  if (now > validUntil) {
    return { label: '만료', color: 'bg-red-100 text-red-600' };
  }
  if (link.maxUses > 0 && link.currentUses >= link.maxUses) {
    return { label: '소진', color: 'bg-orange-100 text-orange-600' };
  }
  return { label: '활성', color: 'bg-green-100 text-green-600' };
}

export default function CustomLinkTable({
  customLinks,
  loading,
  tenants = [],
  onEdit,
  onDelete,
  onCopyLink,
}: CustomLinkTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLink = async (linkId: string) => {
    onCopyLink(linkId);
    setCopiedId(linkId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-center py-20">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  if (customLinks.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="text-center py-20 text-gray-500">
          <Link className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>생성된 커스텀 링크가 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">플랜</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">금액</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">타입</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">대상회원</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">생성일</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">유효기간</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">링크</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">상태</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customLinks.map((link) => {
              const status = getLinkStatus(link);
              return (
                <tr key={link.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{link.planName}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {link.customAmount
                      ? `${link.customAmount.toLocaleString()}원`
                      : <span className="text-gray-400">플랜 가격</span>
                    }
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                      link.billingType === 'onetime'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {link.billingType === 'onetime' ? '1회성' : '정기'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {link.targetEmail ? (
                      <div>
                        {link.targetUserName && (
                          <p className="font-medium text-gray-900">{link.targetUserName}</p>
                        )}
                        <p className="text-gray-600 text-xs">{link.targetEmail}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">제한없음</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(link.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    <div>{formatDate(link.validFrom)}</div>
                    <div className="text-gray-400">~ {formatDate(link.validUntil)}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                        {link.id}
                      </code>
                      <button
                        onClick={() => handleCopyLink(link.id)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                        title="링크 복사"
                      >
                        {copiedId === link.id ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    {link.memo && (
                      <p className="text-xs text-gray-500 mt-1">{link.memo}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEdit(link)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="수정"
                      >
                        <EditPencil className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => onDelete(link)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        title="비활성화"
                      >
                        <Trash className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
