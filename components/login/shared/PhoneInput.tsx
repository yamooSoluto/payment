'use client';

import { Phone, CheckCircle, WarningCircle } from 'iconoir-react';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onVerificationRequest: () => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  label?: string;
  isVerified?: boolean;
  verificationSent?: boolean;
  verificationLoading?: boolean;
  message?: { type: 'success' | 'error'; text: string } | null;
}

// Phone number formatting function
const formatPhone = (value: string) => {
  const numbers = value.replace(/[^0-9]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

export default function PhoneInput({
  value,
  onChange,
  onVerificationRequest,
  disabled = false,
  required = false,
  placeholder = '010-1234-5678',
  label = '연락처',
  isVerified = false,
  verificationSent = false,
  verificationLoading = false,
  message = null,
}: PhoneInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(formatPhone(e.target.value));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="tel"
            value={value}
            onChange={handleChange}
            className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all ${
              isVerified ? 'border-green-500 bg-green-50' : 'border-gray-300'
            }`}
            placeholder={placeholder}
            disabled={disabled || isVerified}
            required={required}
          />
        </div>
        {!verificationSent && (
          <button
            type="button"
            onClick={onVerificationRequest}
            disabled={verificationLoading || isVerified || disabled}
            className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {verificationLoading ? '발송중...' : isVerified ? '인증완료' : '인증요청'}
          </button>
        )}
      </div>
      {/* SMS verification message */}
      {message && (
        <p
          className={`mt-2 text-sm flex items-center gap-1 ${
            message.type === 'success' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <WarningCircle className="w-4 h-4" />
          )}
          {message.text}
        </p>
      )}
    </div>
  );
}
