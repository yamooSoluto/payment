'use client';

import { useState } from 'react';
import { ViewGrid, Check } from 'iconoir-react';

interface GridSelectorProps {
  currentCols: number;
  onSelectCols: (cols: number) => void;
  saving?: boolean;
}

export default function GridSelector({
  currentCols,
  onSelectCols,
  saving = false,
}: GridSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (cols: number) => {
    onSelectCols(cols);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        title="그리드 열 수 변경"
      >
        <ViewGrid className="w-4 h-4 text-gray-600" />
        <span className="hidden sm:inline text-sm text-gray-700">
          {currentCols}열
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 min-w-[120px]">
            {[1, 2, 3, 4].map((cols) => (
              <button
                key={cols}
                onClick={() => handleSelect(cols)}
                disabled={saving}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                  currentCols === cols ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                } disabled:opacity-50`}
              >
                <span>{cols}열 보기</span>
                {currentCols === cols && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
