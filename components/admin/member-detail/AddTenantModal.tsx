'use client';

import { useState } from 'react';
import { Plus } from 'iconoir-react';
import { INDUSTRY_OPTIONS } from '@/lib/constants';
import Spinner from '@/components/admin/Spinner';
import { TenantInfo } from './types';

interface AddTenantModalProps {
  email: string;
  onClose: () => void;
  onSuccess: (newTenant: TenantInfo) => void;
}

export default function AddTenantModal({ email, onClose, onSuccess }: AddTenantModalProps) {
  const [form, setForm] = useState({ brandName: '', industry: '' });
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleAdd = async () => {
    if (!form.brandName.trim() || !form.industry) {
      alert('매장명과 업종을 입력해주세요.');
      return;
    }
    setAdding(true);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        const increment = prev < 30 ? 3 : prev < 60 ? 2 : 1;
        return Math.min(prev + increment, 90);
      });
    }, 500);

    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, brandName: form.brandName.trim(), industry: form.industry }),
      });
      clearInterval(progressInterval);

      const data = await response.json();
      if (response.ok) {
        setProgress(100);
        const newTenant: TenantInfo = {
          docId: data.tenantId, tenantId: data.tenantId,
          brandName: data.brandName || form.brandName.trim(),
          industry: data.industry || form.industry,
          createdAt: new Date().toISOString(), subscription: null,
        };
        setTimeout(() => {
          alert('매장이 추가되었습니다.');
          onSuccess(newTenant);
        }, 300);
      } else {
        alert(data.error || '매장 추가에 실패했습니다.');
        setProgress(0);
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Failed to add tenant:', error);
      alert('오류가 발생했습니다.');
      setProgress(0);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">새 매장 추가</h3>
          <p className="text-sm text-gray-500 mt-1">{email} 계정에 매장을 추가합니다</p>
        </div>
        {adding ? (
          <div className="p-8">
            <div className="flex flex-col items-center gap-4">
              <Spinner size="lg" />
              <div className="w-full">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>매장 생성 중...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center">매장을 생성하고 있습니다</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">매장명 <span className="text-red-500">*</span></label>
                <input type="text" value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="매장 이름을 입력하세요" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">업종 <span className="text-red-500">*</span></label>
                <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">업종을 선택하세요</option>
                  {INDUSTRY_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={handleAdd} disabled={!form.brandName.trim() || !form.industry} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />매장 추가
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
