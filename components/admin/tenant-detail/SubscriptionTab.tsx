'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, RefreshDouble, FastRightCircle, Calendar, WarningCircle, Plus, NavArrowDown, NavArrowUp, PageFlip } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import { SubscriptionActionModal, SubscriptionActionType, SubscriptionInfo, canStartSubscription, isSubscriptionActive } from '@/components/admin/subscription';
import {
  SubscriptionHistoryItem,
  CHANGE_TYPE_LABELS,
  INITIATED_BY_LABELS,
  getPlanName,
  getSubscriptionStatusBadge,
} from './types';

interface SubscriptionTabProps {
  tenantId: string;
  subscription: Record<string, unknown> | null;
  tenant: Record<string, unknown>;
  adminNames: Record<string, string>;
  onRefresh: () => void;
}

export default function SubscriptionTab({ tenantId, subscription, tenant, adminNames, onRefresh }: SubscriptionTabProps) {
  const [history, setHistory] = useState<SubscriptionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySortOrder, setHistorySortOrder] = useState<'desc' | 'asc'>('desc');

  // 구독 액션 모달
  const [actionModal, setActionModal] = useState(false);
  const [initialAction, setInitialAction] = useState<SubscriptionActionType | undefined>(undefined);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}?include=history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.subscriptionHistory || []);
      }
    } catch (error) {
      console.error('Failed to fetch subscription history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const resolveAdminName = (uid: unknown): string => {
    if (!uid || typeof uid !== 'string') return String(uid || '-');
    if (adminNames[uid]) return adminNames[uid];
    if (uid === 'system') return '시스템';
    if (uid === 'admin') return '관리자';
    return uid;
  };

  const renderStatusBadge = (status: unknown) => {
    const { style, label } = getSubscriptionStatusBadge(status);
    return <span className={style}>{label}</span>;
  };

  const sortedHistory = [...history].sort((a, b) => {
    const dateA = new Date(a.changedAt || 0).getTime();
    const dateB = new Date(b.changedAt || 0).getTime();
    return historySortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  return (
    <div className="space-y-6">
      {/* 현재 구독 정보 카드 */}
      {subscription ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          {/* 상단: 플랜명 + 가격 + 액션 버튼 */}
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-gray-900">{getPlanName(subscription.plan)}</h3>
                {renderStatusBadge(subscription.status)}
              </div>
              <div className="flex items-center gap-2">
                {isSubscriptionActive(subscription.status as SubscriptionInfo['status']) ? (
                  <>
                    <button
                      onClick={() => { setInitialAction('change_plan'); setActionModal(true); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <FastRightCircle className="w-3.5 h-3.5" />
                      플랜 변경
                    </button>
                    <button
                      onClick={() => { setInitialAction('adjust_period'); setActionModal(true); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      기간 조정
                    </button>
                    <button
                      onClick={() => { setInitialAction('cancel'); setActionModal(true); }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <WarningCircle className="w-3.5 h-3.5" />
                      해지
                    </button>
                  </>
                ) : canStartSubscription(subscription.status as SubscriptionInfo['status']) ? (
                  <button
                    onClick={() => { setInitialAction('start'); setActionModal(true); }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    구독 시작
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              {subscription.baseAmount && (subscription.baseAmount as number) !== (subscription.amount as number) ? (
                <>
                  <span className="text-2xl font-bold text-gray-900">
                    {((subscription.amount as number) ?? 0).toLocaleString()}
                    <span className="text-sm font-normal text-gray-500">원/월</span>
                  </span>
                  <span className="text-sm text-gray-400 line-through">
                    {((subscription.baseAmount as number) ?? 0).toLocaleString()}원
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold text-gray-900">
                  {((subscription.amount as number) ?? 0).toLocaleString()}
                  <span className="text-sm font-normal text-gray-500">원/월</span>
                </span>
              )}
            </div>
          </div>

          {/* 하단: 상세 정보 */}
          <div className="px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-gray-400 mb-1">구독 시작</p>
                <p className="text-sm font-medium text-gray-900">
                  {subscription.currentPeriodStart
                    ? new Date(subscription.currentPeriodStart as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">구독 종료</p>
                <p className="text-sm font-medium text-gray-900">
                  {subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">다음 결제</p>
                <p className={`text-sm font-medium ${subscription.nextBillingDate ? 'text-blue-600' : 'text-gray-400'}`}>
                  {subscription.nextBillingDate
                    ? new Date(subscription.nextBillingDate as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                    : '-'}
                </p>
                {Boolean(subscription.nextBillingDate) && ((subscription.baseAmount as number) || (subscription.amount as number) || 0) > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {((subscription.baseAmount as number) || (subscription.amount as number) || 0).toLocaleString()}원 결제 예정
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">결제수단</p>
                {subscription.billingKey ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                    <Check className="w-3.5 h-3.5" />
                    카드 등록됨
                  </span>
                ) : (
                  <span className="text-sm font-medium text-gray-400">미등록</span>
                )}
              </div>
            </div>

            {/* 예약된 플랜 변경 알림 */}
            {Boolean(subscription.pendingPlan) && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-start gap-3 bg-blue-50 rounded-lg p-3">
                  <FastRightCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800">플랜 변경 예약됨</p>
                    <p className="text-xs text-blue-600 mt-1">
                      {subscription.pendingChangeAt
                        ? new Date(subscription.pendingChangeAt as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                        : '다음 결제일'}부터{' '}
                      <span className="font-semibold">{getPlanName(subscription.pendingPlan as string)}</span>
                      {subscription.pendingAmount !== undefined && (
                        <> ({((subscription.pendingAmount as number) ?? 0).toLocaleString()}원/월)</>
                      )}
                      로 변경됩니다.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 해지 예정 알림 */}
            {subscription.status === 'pending_cancel' && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-start gap-3 bg-orange-50 rounded-lg p-3">
                  <WarningCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-800">해지 예정</p>
                    <p className="text-xs text-orange-600 mt-1">
                      {subscription.cancelAt
                        ? new Date(subscription.cancelAt as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                        : subscription.currentPeriodEnd
                          ? new Date(subscription.currentPeriodEnd as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                          : '-'}에 구독이 종료됩니다.
                      {Boolean(subscription.cancelReason) && (
                        <span className="block mt-1">사유: {subscription.cancelReason as string}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-xl p-8 text-center bg-gray-50">
          <RefreshDouble className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">구독 정보가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">이 매장은 아직 구독을 시작하지 않았습니다.</p>
          <button
            onClick={() => { setInitialAction('start'); setActionModal(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            구독 시작
          </button>
        </div>
      )}

      {/* 구독 변경 내역 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <PageFlip className="w-4 h-4" />
          구독 내역 ({history.length}건)
        </h3>
        {historyLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
            구독 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th
                    className="text-center px-3 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  >
                    <span className="inline-flex items-center gap-1">
                      처리일
                      {historySortOrder === 'desc' ? (
                        <NavArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <NavArrowUp className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">변경유형</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">플랜</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">상태</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">시작일</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">종료일</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">처리자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedHistory.map((record) => (
                  <tr key={record.recordId} className="hover:bg-gray-50">
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      {record.changedAt ? new Date(record.changedAt).toLocaleString('ko-KR') : '-'}
                    </td>
                    <td className="px-3 py-3 text-center text-sm text-gray-700">
                      {CHANGE_TYPE_LABELS[record.changeType] || record.changeType}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center">
                      {record.previousPlan && record.previousPlan !== record.plan ? (
                        <span>
                          <span className="text-gray-400">{getPlanName(record.previousPlan)}</span>
                          <span className="mx-1">→</span>
                          <span className="font-medium">{getPlanName(record.plan)}</span>
                        </span>
                      ) : (
                        getPlanName(record.plan)
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {renderStatusBadge(record.status)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      {record.periodStart ? new Date(record.periodStart).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      {record.periodEnd ? new Date(record.periodEnd).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center">
                      {record.changedBy ? (INITIATED_BY_LABELS[record.changedBy] || resolveAdminName(record.changedBy)) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 구독 액션 모달 */}
      <SubscriptionActionModal
        isOpen={actionModal}
        onClose={() => { setActionModal(false); setInitialAction(undefined); }}
        tenantId={tenantId}
        subscription={subscription as SubscriptionInfo | null}
        tenant={{
          tenantId,
          brandName: String(tenant.brandName || ''),
          email: String(tenant.email || ''),
        }}
        initialAction={initialAction}
        onSuccess={() => {
          onRefresh();
          fetchHistory();
        }}
      />
    </div>
  );
}
