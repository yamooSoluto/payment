'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Check, Trash, Plus, WarningCircle, EditPencil, Xmark } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import { useTossSDK, getTossPayment } from '@/hooks/useTossSDK';
import { useAuth } from '@/contexts/AuthContext';

interface CardInfo {
  company: string;
  number: string;
  cardType?: string;
  ownerType?: string;
}

interface Card {
  id: string;
  cardInfo: CardInfo;
  alias?: string;
  isPrimary: boolean;
  createdAt: Date | string;
}

interface CardListProps {
  tenantId: string;
  email: string;
  authParam: string;
  onCardChange?: () => void;
}

export default function CardList({ tenantId, email, authParam, onCardChange }: CardListProps) {
  const { user } = useAuth();
  const { isReady: sdkReady, isLoading: sdkLoading } = useTossSDK();
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCardAlias, setNewCardAlias] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; cardId: string | null; cardNumber: string }>({
    isOpen: false,
    cardId: null,
    cardNumber: '',
  });
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCards = useCallback(async () => {
    // 인증 정보가 없으면 fetch 하지 않음
    const hasToken = authParam.includes('token=');
    if (!hasToken && !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const headers: Record<string, string> = {};
      // Firebase Auth Bearer token이 있으면 항상 추가 (SSO 토큰 만료 시 폴백용)
      if (user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      // URLSearchParams로 올바른 URL 구성 (authParam이 빈 문자열일 때 ?& 방지)
      const params = new URLSearchParams();
      if (authParam) {
        const authParams = new URLSearchParams(authParam);
        authParams.forEach((value, key) => params.set(key, value));
      }
      params.set('tenantId', tenantId);

      const response = await fetch(
        `/api/cards?${params.toString()}`,
        { headers }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch cards');
      }
      // 기본 카드가 맨 위로 오도록 정렬
      const sortedCards = (data.cards || []).sort((a: Card, b: Card) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return 0;
      });
      setCards(sortedCards);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류';
      console.error('Error fetching cards:', errorMessage, err);
      setError(`카드 목록을 불러오는데 실패했습니다: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [authParam, tenantId, user]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const handleAddCard = async () => {
    if (!sdkReady) {
      setError('결제 SDK가 준비되지 않았습니다.');
      return;
    }

    setIsAddingCard(true);
    setError(null);

    try {
      // V2 SDK: customerKey로 payment 인스턴스 생성
      const payment = getTossPayment(email);
      const aliasParam = newCardAlias ? `&cardAlias=${encodeURIComponent(newCardAlias)}` : '';
      const tenantParam = `&tenantId=${encodeURIComponent(tenantId)}`;
      const primaryParam = cards.length === 0 ? '' : '&setAsPrimary=false';

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/api/payments/update-card?${authParam}${aliasParam}${tenantParam}${primaryParam}`,
        failUrl: `${window.location.origin}/account/${tenantId}?${authParam}&error=card_add_failed`,
        customerEmail: email,
      });
    } catch (err) {
      console.error('카드 추가 실패:', err);
      setError(`카드 추가에 실패했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      setIsAddingCard(false);
    }
  };

  const handleSetPrimary = async (cardId: string) => {
    setError(null);

    // 낙관적 업데이트 (기본 카드가 맨 위로)
    const previousCards = [...cards];
    const updatedCards = cards.map(c => ({ ...c, isPrimary: c.id === cardId }));
    updatedCards.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return 0;
    });
    setCards(updatedCards);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // SSO token이 없으면 Firebase Auth Bearer token 사용
      if (!authParam.includes('token=') && user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch(`/api/cards/${cardId}/primary`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          ...(authParam.includes('token=')
            ? { token: authParam.replace('token=', '') }
            : { email }),
          tenantId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set primary card');
      }

      onCardChange?.();
    } catch (err) {
      console.error('Error setting primary card:', err);
      setCards(previousCards); // 롤백
      setError('주 결제 카드 변경에 실패했습니다.');
    }
  };

  const openDeleteConfirm = (card: Card) => {
    setDeleteConfirm({
      isOpen: true,
      cardId: card.id,
      cardNumber: card.cardInfo.number,
    });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm({ isOpen: false, cardId: null, cardNumber: '' });
  };

  const handleDeleteCard = async () => {
    const cardId = deleteConfirm.cardId;
    if (!cardId) return;

    setIsDeleting(true);
    setError(null);

    // 낙관적 업데이트
    const previousCards = [...cards];
    const deletedCard = cards.find(c => c.id === cardId);
    const remainingCards = cards.filter(c => c.id !== cardId);

    // 삭제된 카드가 primary였으면 첫 번째 카드를 primary로
    if (deletedCard?.isPrimary && remainingCards.length > 0) {
      remainingCards[0].isPrimary = true;
    }
    setCards(remainingCards);
    closeDeleteConfirm();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // SSO token이 없으면 Firebase Auth Bearer token 사용
      if (!authParam.includes('token=') && user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch(`/api/cards/${cardId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          ...(authParam.includes('token=')
            ? { token: authParam.replace('token=', '') }
            : { email }),
          tenantId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete card');
      }

      onCardChange?.();
    } catch (err) {
      console.error('Error deleting card:', err);
      setCards(previousCards); // 롤백
      setError(err instanceof Error ? err.message : '카드 삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUpdateAlias = async (cardId: string) => {
    setError(null);

    // 낙관적 업데이트
    const previousCards = [...cards];
    setCards(cards.map(c => c.id === cardId ? { ...c, alias: editingAlias || undefined } : c));
    setEditingCardId(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // SSO token이 없으면 Firebase Auth Bearer token 사용
      if (!authParam.includes('token=') && user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch(`/api/cards/${cardId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          ...(authParam.includes('token=')
            ? { token: authParam.replace('token=', '') }
            : { email }),
          tenantId,
          alias: editingAlias,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update card alias');
      }

      onCardChange?.();
    } catch (err) {
      console.error('Error updating card alias:', err);
      setCards(previousCards); // 롤백
      setError('카드 별칭 변경에 실패했습니다.');
    }
  };

  const startEditing = (card: Card) => {
    setEditingCardId(card.id);
    setEditingAlias(card.alias || '');
  };

  const cancelEditing = () => {
    setEditingCardId(null);
    setEditingAlias('');
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">결제 수단</h2>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">결제 수단</h2>
        {cards.length > 0 && (
          <span className="text-xs text-gray-400">{cards.length}/5</span>
        )}
      </div>

      {error && (
        <div className="mb-3 p-2 text-red-500 text-xs flex items-center gap-1.5">
          <WarningCircle width={14} height={14} strokeWidth={1.5} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 카드 목록 */}
      <div className="space-y-2 mb-4">
        {cards.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CreditCard width={40} height={40} strokeWidth={1.5} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">등록된 카드가 없습니다.</p>
          </div>
        ) : (
          cards.map((card) => (
            <div
              key={card.id}
              className="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              {editingCardId === card.id ? (
                /* 별칭 수정 모드 */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CreditCard width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {card.cardInfo.number}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingAlias}
                      onChange={(e) => setEditingAlias(e.target.value)}
                      placeholder="카드 별칭 입력"
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      maxLength={20}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdateAlias(card.id);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                    />
                    <button
                      onClick={() => handleUpdateAlias(card.id)}
                      className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      저장
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                    >
                      <Xmark width={16} height={16} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ) : (
                /* 일반 보기 모드 */
                <div className="flex items-start justify-between">
                  {/* 왼쪽: 카드 정보 */}
                  <div className="flex items-start gap-3">
                    <CreditCard width={20} height={20} strokeWidth={1.5} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-900">
                        {card.cardInfo.number}
                      </span>
                      <p className="text-xs text-gray-500">{card.alias || card.cardInfo.company}</p>
                    </div>
                  </div>
                  {/* 오른쪽: 아이콘 + 기본카드/기본설정 */}
                  <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    {card.isPrimary ? (
                      <span className="order-2 sm:order-1 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
                        <Check width={12} height={12} strokeWidth={2} />
                        기본 카드
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSetPrimary(card.id)}
                        className="order-2 sm:order-1 px-2 py-0.5 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                      >
                        기본 설정
                      </button>
                    )}
                    <div className="order-1 sm:order-2 flex items-center gap-1">
                      <button
                        onClick={() => startEditing(card)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                        title="별칭 수정"
                      >
                        <EditPencil width={16} height={16} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => openDeleteConfirm(card)}
                        disabled={card.isPrimary && cards.length === 1}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash width={16} height={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 카드 추가 */}
      {cards.length < 5 && (
        <>
          {showAddForm ? (
            <div className="pt-3 border-t space-y-3">
              <input
                type="text"
                value={newCardAlias}
                onChange={(e) => setNewCardAlias(e.target.value)}
                placeholder="카드 별칭 (선택)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                maxLength={20}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewCardAlias('');
                  }}
                  className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleAddCard}
                  disabled={sdkLoading || isAddingCard}
                  className="flex-1 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {isAddingCard ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    '추가'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-1"
            >
              <Plus width={16} height={16} strokeWidth={1.5} />
              카드 추가
            </button>
          )}
        </>
      )}

      {/* 안내 사항 */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="space-y-2 text-sm text-gray-500">
          <p className="flex items-start gap-2">
            <Check width={14} height={14} strokeWidth={2} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <span>유료 플랜 및 부가 서비스 등의 이용을 위해서 <span className="font-semibold text-gray-600">1개 이상</span>의 카드가 필요합니다.</span>
          </p>
          <p className="flex items-start gap-2">
            <Check width={14} height={14} strokeWidth={2} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <span>결제수단은 <span className="font-semibold text-gray-600">국내</span>에서 발급한 카드만 지원합니다. 해외카드는 지원하지 않습니다.</span>
          </p>
          <p className="flex items-start gap-2">
            <Check width={14} height={14} strokeWidth={2} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <span><span className="font-semibold text-gray-600">&apos;기본 카드&apos;</span>로 선택된 카드로 자동 결제가 진행됩니다.</span>
          </p>
          <p className="flex items-start gap-2">
            <Check width={14} height={14} strokeWidth={2} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <span>카드를 재발급 받거나 유효기간이 만료된 경우 새 카드 추가 후 <span className="font-semibold text-gray-600">&apos;기본 카드&apos;</span>로 등록해 주세요.</span>
          </p>
        </div>
      </div>

      {/* 카드 삭제 확인 모달 */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeDeleteConfirm}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Icon */}
            <div className="pt-8 pb-4 flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <Trash width={28} height={28} strokeWidth={1.5} className="text-red-600" />
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                카드를 삭제하시겠습니까?
              </h3>
              <p className="text-gray-500 text-sm mb-6">
                <span className="font-medium text-gray-700">{deleteConfirm.cardNumber}</span>
                <br />
                이 카드를 삭제하면 복구할 수 없습니다.
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={closeDeleteConfirm}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteCard}
                  disabled={isDeleting}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    '삭제'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
