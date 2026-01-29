'use client';

import { useState } from 'react';
import Spinner from '@/components/admin/Spinner';
import { TenantInfo, Member, getPlanName } from './types';

interface EditSubHistoryModalProps {
  tenant: TenantInfo;
  member: Member;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditSubHistoryModal({ tenant, member, onClose, onSuccess }: EditSubHistoryModalProps) {
  const [form, setForm] = useState({
    currentPeriodStart: tenant.subscription?.currentPeriodStart?.split('T')[0] || '',
    currentPeriodEnd: tenant.subscription?.currentPeriodEnd?.split('T')[0] || '',
    nextBillingDate: tenant.subscription?.nextBillingDate?.split('T')[0] || '',
    status: tenant.subscription?.status || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.docId}/subscription`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPeriodStart: form.currentPeriodStart || null,
          currentPeriodEnd: form.currentPeriodEnd || null,
          nextBillingDate: form.nextBillingDate || null,
          status: form.status || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('구독 정보가 수정되었습니다.');
        onSuccess();
      } else {
        alert(data.error || '수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to update subscription:', error);
      alert('수정 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">구독 정보 수정</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex text-sm"><span className="text-gray-500 w-16 shrink-0">이메일</span><span className="text-gray-900">{member.email || '-'}</span></div>
            <div className="flex text-sm"><span className="text-gray-500 w-16 shrink-0">매장</span><span className="text-gray-900">{tenant.brandName}</span></div>
            <div className="flex text-sm"><span className="text-gray-500 w-16 shrink-0">회원명</span><span className="text-gray-900">{member.name || '-'}</span></div>
            <div className="flex text-sm"><span className="text-gray-500 w-16 shrink-0">연락처</span><span className="text-gray-900">{member.phone || '-'}</span></div>
            <div className="flex text-sm"><span className="text-gray-500 w-16 shrink-0">플랜</span><span className="text-gray-900">{tenant.subscription?.plan ? getPlanName(tenant.subscription.plan) : '-'}</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">시작일</label>
            <input type="date" value={form.currentPeriodStart} onChange={(e) => setForm({ ...form, currentPeriodStart: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">종료일</label>
            <input type="date" value={form.currentPeriodEnd} onChange={(e) => setForm({ ...form, currentPeriodEnd: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">다음 결제일</label>
            <input type="date" value={form.nextBillingDate} onChange={(e) => setForm({ ...form, nextBillingDate: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="trialing">체험</option>
              <option value="active">구독중</option>
              <option value="expired">만료</option>
              <option value="canceled">해지</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">취소</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Spinner /> : null}저장
          </button>
        </div>
      </div>
    </div>
  );
}
