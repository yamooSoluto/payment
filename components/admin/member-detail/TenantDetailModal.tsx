'use client';

import { useState } from 'react';
import { Xmark, FloppyDisk, WarningCircle } from 'iconoir-react';
import { INDUSTRY_OPTIONS, INDUSTRY_LABEL_TO_CODE } from '@/lib/constants';
import Spinner from '@/components/admin/Spinner';
import {
  SubscriptionActionType,
  SubscriptionInfo,
  canStartSubscription,
  isSubscriptionActive,
  StartSubscriptionForm,
  PlanChangeForm,
  PeriodAdjustForm,
  CancelSubscriptionForm,
} from '@/components/admin/subscription';
import { TenantInfo, Member } from './types';

interface TenantDetailModalProps {
  tenant: TenantInfo;
  member: Member;
  onClose: () => void;
  onSuccess: (updatedTenant: Partial<TenantInfo>) => void;
  onRefresh: () => void;
}

export default function TenantDetailModal({ tenant, member, onClose, onSuccess, onRefresh }: TenantDetailModalProps) {
  const [tab, setTab] = useState<'info' | 'subscription'>('info');
  const [form, setForm] = useState({
    brandName: tenant.brandName,
    industry: tenant.industry ? (INDUSTRY_LABEL_TO_CODE[tenant.industry] || tenant.industry) : '',
    plan: tenant.subscription?.plan || 'basic',
    status: tenant.subscription?.status || '',
    currentPeriodStart: tenant.subscription?.currentPeriodStart?.split('T')[0] || '',
    currentPeriodEnd: tenant.subscription?.currentPeriodEnd?.split('T')[0] || '',
    nextBillingDate: tenant.subscription?.nextBillingDate?.split('T')[0] || '',
  });
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [inlineAction, setInlineAction] = useState<SubscriptionActionType | null>(null);

  const handleSave = async () => {
    if (!form.brandName.trim()) { alert('매장명을 입력해주세요.'); return; }
    setSaving(true);
    setProgress(0);

    try {
      setProgress(30);
      const tenantResponse = await fetch(`/api/admin/tenants/${tenant.tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: form.brandName.trim(), industry: form.industry || undefined }),
      });

      if (!tenantResponse.ok) {
        const data = await tenantResponse.json();
        alert(data.error || '매장 정보 수정에 실패했습니다.');
        setProgress(0); return;
      }

      setProgress(60);
      const originalSub = tenant.subscription;
      const subscriptionChanged =
        form.plan !== (originalSub?.plan || 'basic') ||
        form.status !== (originalSub?.status || '') ||
        form.currentPeriodStart !== (originalSub?.currentPeriodStart?.split('T')[0] || '') ||
        form.currentPeriodEnd !== (originalSub?.currentPeriodEnd?.split('T')[0] || '') ||
        form.nextBillingDate !== (originalSub?.nextBillingDate?.split('T')[0] || '');

      if (form.status && subscriptionChanged) {
        const subResponse = await fetch(`/api/admin/subscriptions/${tenant.tenantId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan: form.plan, status: form.status,
            currentPeriodStart: form.currentPeriodStart || undefined,
            currentPeriodEnd: form.currentPeriodEnd || undefined,
            nextBillingDate: form.nextBillingDate || undefined,
          }),
        });
        if (!subResponse.ok) {
          const data = await subResponse.json();
          alert(data.error || '구독 정보 수정에 실패했습니다.');
          setProgress(0); return;
        }
      }

      setProgress(100);
      setTimeout(() => {
        alert('매장 정보가 수정되었습니다.');
        onSuccess({
          brandName: form.brandName.trim(),
          industry: form.industry || tenant.industry,
          subscription: tenant.subscription ? {
            ...tenant.subscription, plan: form.plan, status: form.status,
            currentPeriodStart: form.currentPeriodStart || tenant.subscription.currentPeriodStart,
            currentPeriodEnd: form.currentPeriodEnd || tenant.subscription.currentPeriodEnd,
            nextBillingDate: form.nextBillingDate || tenant.subscription.nextBillingDate,
          } : form.status ? {
            plan: form.plan, status: form.status, amount: 0,
            currentPeriodStart: form.currentPeriodStart || null,
            currentPeriodEnd: form.currentPeriodEnd || null,
            nextBillingDate: form.nextBillingDate || null,
            pricePolicy: null, priceProtectedUntil: null, originalAmount: null,
          } : null,
        });
      }, 300);
    } catch (error) {
      console.error('Failed to save tenant detail:', error);
      alert('오류가 발생했습니다.');
      setProgress(0);
    } finally {
      setSaving(false);
    }
  };

  const sub = tenant.subscription;
  const status = sub?.status as SubscriptionInfo['status'] | undefined;
  const hasActiveSub = isSubscriptionActive(status);
  const canStart = canStartSubscription(status);
  const hasPendingPlan = !!sub?.pendingPlan;
  const hasPendingCancel = sub?.status === 'pending_cancel';
  const hasPendingAction = hasPendingPlan || hasPendingCancel;

  const handleFormSuccess = () => { setInlineAction(null); onRefresh(); onClose(); };
  const tenantBasicInfo = { tenantId: tenant.tenantId, brandName: tenant.brandName, email: member.email || '' };
  const subscriptionInfo: SubscriptionInfo | null = sub ? {
    tenantId: tenant.tenantId, plan: sub.plan as SubscriptionInfo['plan'],
    status: sub.status as SubscriptionInfo['status'], amount: sub.amount,
    currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd,
    nextBillingDate: sub.nextBillingDate, pendingPlan: sub.pendingPlan as SubscriptionInfo['plan'] | null,
  } : null;

  const handleCancelPending = async (type: 'plan' | 'cancel') => {
    try {
      const res = await fetch(`/api/admin/subscriptions/${tenant.tenantId}/pending?type=${type}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { alert(data.error || '예약 취소에 실패했습니다.'); return; }
      alert(data.message);
      onRefresh();
    } catch { alert('예약 취소에 실패했습니다.'); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <div><h3 className="text-lg font-bold text-gray-900">매장 수정</h3><p className="text-sm text-gray-500">{tenant.brandName}</p></div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><Xmark className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 relative">
          {saving && (
            <div className="absolute inset-0 bg-white/90 z-10 flex flex-col items-center justify-center">
              <Spinner size="lg" />
              <div className="w-48 mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2"><span>저장 중...</span><span>{Math.round(progress)}%</span></div>
                <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} /></div>
              </div>
            </div>
          )}

          <div className="flex border-b border-gray-200 mb-4">
            <button onClick={() => setTab('info')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'info' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>매장 정보</button>
            <button onClick={() => setTab('subscription')} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'subscription' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>구독 정보</button>
          </div>

          {tab === 'info' && (
            <div className="space-y-4">
              <div className="text-left">
                <label className="block text-sm font-medium text-gray-700 mb-1">매장명 <span className="text-red-500">*</span></label>
                <input type="text" value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="매장 이름" />
              </div>
              <div className="text-left">
                <label className="block text-sm font-medium text-gray-700 mb-1">업종</label>
                <select value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">선택 안 함</option>
                  {INDUSTRY_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                </select>
              </div>
            </div>
          )}

          {tab === 'subscription' && (
            <div className="space-y-4">
              <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">현재 구독</h4>
                  {sub?.status && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${sub.status === 'active' ? 'bg-green-100 text-green-700' : sub.status === 'trial' ? 'bg-purple-100 text-purple-700' : sub.status === 'pending_cancel' ? 'bg-orange-100 text-orange-700' : sub.status === 'canceled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                      {sub.status === 'active' ? '구독중' : sub.status === 'trial' ? '체험' : sub.status === 'pending_cancel' ? '해지 예정' : sub.status === 'canceled' ? '해지' : sub.status === 'expired' ? '만료' : sub.status}
                    </span>
                  )}
                </div>
                {sub ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">플랜</span><span className="font-medium">{sub.plan === 'basic' ? 'Basic' : sub.plan === 'business' ? 'Business' : sub.plan === 'trial' ? 'Trial' : sub.plan}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">이용 기간</span><span className="font-medium">{sub.currentPeriodStart?.split('T')[0] || '-'} ~ {sub.currentPeriodEnd?.split('T')[0] || '-'}</span></div>
                    {sub.nextBillingDate && <div className="flex justify-between"><span className="text-gray-500">다음 결제일</span><span className="font-medium">{sub.nextBillingDate.split('T')[0]}</span></div>}
                  </div>
                ) : (<p className="text-sm text-gray-500">구독 정보가 없습니다.</p>)}
              </div>

              {hasActiveSub && hasPendingAction ? (
                <div className="text-center py-6 text-gray-500">
                  <WarningCircle className="w-10 h-10 mx-auto mb-2 text-amber-400" />
                  <p className="font-medium text-gray-700">{hasPendingPlan ? `플랜 변경 예약: ${sub?.plan} → ${sub?.pendingPlan}` : '해지 예약됨'}</p>
                  <p className="text-sm mt-1 mb-3">다른 작업을 하려면 먼저 예약을 취소해주세요.</p>
                  <button onClick={() => handleCancelPending(hasPendingPlan ? 'plan' : 'cancel')} className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors">예약 취소</button>
                </div>
              ) : hasActiveSub ? (
                <div className="space-y-3">
                  <div className="flex border-b border-gray-200">
                    <button onClick={() => setInlineAction(inlineAction === 'change_plan' ? null : 'change_plan')} className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${inlineAction === 'change_plan' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>플랜 변경</button>
                    <button onClick={() => setInlineAction(inlineAction === 'adjust_period' ? null : 'adjust_period')} className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${inlineAction === 'adjust_period' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>기간 조정</button>
                    <button onClick={() => setInlineAction(inlineAction === 'cancel' ? null : 'cancel')} className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${inlineAction === 'cancel' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>해지</button>
                  </div>
                  {inlineAction === 'change_plan' && <PlanChangeForm tenantId={tenant.tenantId} subscription={subscriptionInfo} tenant={tenantBasicInfo} onSuccess={handleFormSuccess} onCancel={() => setInlineAction(null)} />}
                  {inlineAction === 'adjust_period' && <PeriodAdjustForm tenantId={tenant.tenantId} subscription={subscriptionInfo} tenant={tenantBasicInfo} onSuccess={handleFormSuccess} onCancel={() => setInlineAction(null)} />}
                  {inlineAction === 'cancel' && <CancelSubscriptionForm tenantId={tenant.tenantId} subscription={subscriptionInfo} tenant={tenantBasicInfo} onSuccess={handleFormSuccess} onCancel={() => setInlineAction(null)} />}
                </div>
              ) : canStart ? (
                <StartSubscriptionForm tenantId={tenant.tenantId} subscription={subscriptionInfo} tenant={tenantBasicInfo} onSuccess={handleFormSuccess} onCancel={onClose} />
              ) : null}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 shrink-0">
          <button onClick={onClose} className={`${tab === 'info' ? 'flex-1' : 'w-full'} px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50`}>
            {tab === 'info' ? '취소' : '닫기'}
          </button>
          {tab === 'info' && (
            <button onClick={handleSave} disabled={saving || !form.brandName.trim()} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? (<><Spinner size="sm" color="#ffffff" /><span className="ml-1">저장 중...</span></>) : (<><FloppyDisk className="w-4 h-4" />저장</>)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
