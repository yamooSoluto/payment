import { Eye, Xmark, Check } from 'iconoir-react';
import { Plan } from './types';

interface PlanPreviewModalProps {
  showPreview: boolean;
  plans: Plan[];
  gridCols: number;
  onClose: () => void;
}

export default function PlanPreviewModal({
  showPreview,
  plans,
  gridCols,
  onClose,
}: PlanPreviewModalProps) {
  if (!showPreview) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-100 rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 bg-white border-b">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold">요금제 페이지 미리보기</h2>
            <span className="text-sm text-gray-500">({gridCols}열 레이아웃)</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {/* 요금제 페이지 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              요금제 선택
            </h1>
            <p className="text-gray-600">
              비즈니스에 맞는 플랜을 선택하세요. 모든 플랜은 1달 무료체험이 가능합니다.
            </p>
          </div>

          {/* 플랜 카드 그리드 */}
          <div className={`grid gap-6 max-w-5xl mx-auto ${
            gridCols === 3
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
          }`}>
            {plans
              .filter((plan) => plan.isActive || plan.displayMode === 'coming_soon')
              .map((plan) => (
                <div key={plan.id} className="flex flex-col">
                  {/* Tagline */}
                  {plan.tagline && (
                    <div className="text-center mb-3">
                      <span className="text-gray-800 font-medium text-sm">
                        🔥 {plan.tagline}
                      </span>
                    </div>
                  )}

                  {/* 카드 */}
                  <div
                    className={`flex flex-col relative flex-1 rounded-2xl p-5 bg-white border transition-all duration-300 ${
                      plan.popular
                        ? 'border-2 border-yellow-400 shadow-lg'
                        : 'border-gray-200 shadow-sm'
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 text-xs font-semibold px-3 py-1 rounded-full shadow">
                          인기
                        </span>
                      </div>
                    )}

                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-gray-900 mb-3">{plan.name}</h3>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-gray-900">
                          {plan.isNegotiable ? (
                            plan.minPrice && plan.maxPrice ? (
                              `${(plan.minPrice / 10000).toLocaleString()}~${(plan.maxPrice / 10000).toLocaleString()}만원`
                            ) : '협의'
                          ) : plan.price === 0 ? 'Free' : `₩${plan.price.toLocaleString()}`}
                        </span>
                        <span className="text-gray-500 text-sm">/월</span>
                      </div>
                    </div>

                    <ul className="space-y-2 mb-4 flex-1">
                      {plan.features.slice(0, 5).map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-600 text-sm">{feature}</span>
                        </li>
                      ))}
                      {plan.features.length > 5 && (
                        <li className="text-sm text-gray-400">
                          +{plan.features.length - 5}개 더...
                        </li>
                      )}
                    </ul>

                    <button
                      disabled
                      className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm cursor-not-allowed ${
                        !plan.isActive && plan.displayMode === 'coming_soon'
                          ? 'bg-gray-200 text-gray-400'
                          : plan.popular
                          ? 'bg-yellow-400 text-gray-900'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {!plan.isActive && plan.displayMode === 'coming_soon'
                        ? '준비중'
                        : plan.isNegotiable ? '문의하기' : plan.price === 0 ? '무료 체험하기' : '구독하기'}
                    </button>
                  </div>
                </div>
              ))}
          </div>

          {plans.filter((p) => p.isActive || p.displayMode === 'coming_soon').length === 0 && (
            <div className="text-center py-12 text-gray-500">
              활성화된 플랜이 없습니다.
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t text-center">
          <p className="text-sm text-gray-500">
            이 미리보기는 실제 요금제 페이지의 레이아웃을 보여줍니다.
          </p>
        </div>
      </div>
    </div>
  );
}
