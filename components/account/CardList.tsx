'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Check, Trash, Plus, WarningCircle, EditPencil, Xmark } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import { useTossSDK, getTossPayments } from '@/hooks/useTossSDK';

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
  const { isReady: sdkReady, isLoading: sdkLoading } = useTossSDK();
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCardAlias, setNewCardAlias] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState('');

  const fetchCards = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/cards?${authParam}&tenantId=${encodeURIComponent(tenantId)}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch cards');
      }
      const data = await response.json();
      // 기본 카드가 맨 위로 오도록 정렬
      const sortedCards = (data.cards || []).sort((a: Card, b: Card) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return 0;
      });
      setCards(sortedCards);
    } catch (err) {
      console.error('Error fetching cards:', err);
      setError('카드 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [authParam, tenantId]);

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
      const tossPayments = getTossPayments();
      const aliasParam = newCardAlias ? `&cardAlias=${encodeURIComponent(newCardAlias)}` : '';
      const tenantParam = `&tenantId=${encodeURIComponent(tenantId)}`;
      const primaryParam = cards.length === 0 ? '' : '&setAsPrimary=false';

      await tossPayments.requestBillingAuth('카드', {
        customerKey: email,
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
      const response = await fetch(`/api/cards/${cardId}/primary`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm('이 카드를 삭제하시겠습니까?')) {
      return;
    }

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

    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
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
    }
  };

  const handleUpdateAlias = async (cardId: string) => {
    setError(null);

    // 낙관적 업데이트
    const previousCards = [...cards];
    setCards(cards.map(c => c.id === cardId ? { ...c, alias: editingAlias || undefined } : c));
    setEditingCardId(null);

    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
        <h2 className="text-lg font-semibold text-gray-900 mb-3">결제 수단</h2>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
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
                        onClick={() => handleDeleteCard(card.id)}
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
    </div>
  );
}
