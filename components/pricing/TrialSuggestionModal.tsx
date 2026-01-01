'use client';

import { Sparks, Xmark } from 'iconoir-react';
import { cn } from '@/lib/utils';

interface TrialSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToTrial: () => void;
  onProceedAnyway: () => void;
  planName: string;
}

export default function TrialSuggestionModal({
  isOpen,
  onClose,
  onGoToTrial,
  onProceedAnyway,
  planName,
}: TrialSuggestionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
        >
          <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
        </button>

        {/* Icon */}
        <div className="pt-8 pb-4 flex justify-center">
          <div className="w-16 h-16 bg-gradient-to-br from-yamoo-primary to-yellow-400 rounded-full flex items-center justify-center shadow-lg shadow-yamoo-primary/30">
            <Sparks width={32} height={32} strokeWidth={1.5} className="text-gray-900" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 text-center">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            무료체험을 먼저 해보시겠어요?
          </h3>
          <p className="text-gray-600 text-sm mb-6">
            <span className="font-semibold text-yamoo-dark">{planName}</span> 플랜을 선택하셨습니다.<br />
            1개월 무료체험으로 야무를 먼저 경험해보세요!<br />
            <span className="text-xs text-gray-500 mt-1 block">
              무료체험 후에도 언제든 구독하실 수 있습니다.
            </span>
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={onGoToTrial}
              className="w-full py-3 px-4 rounded-lg bg-yamoo-primary text-gray-900 font-semibold hover:bg-yamoo-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Sparks width={18} height={18} strokeWidth={2} />
              무료체험 먼저하기
            </button>
            <button
              onClick={onProceedAnyway}
              className="w-full py-3 px-4 rounded-lg border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              바로 구독하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
