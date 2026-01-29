'use client';

import { useState } from 'react';
import { Lock, Eye, EyeClosed } from 'iconoir-react';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  label?: string;
  showToggle?: boolean;
}

export default function PasswordInput({
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = '6자 이상',
  label = '비밀번호(PW)',
  showToggle = true,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all disabled:bg-gray-50 disabled:text-gray-600 disabled:border-gray-200"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? (
              <EyeClosed width={20} height={20} strokeWidth={1.5} />
            ) : (
              <Eye width={20} height={20} strokeWidth={1.5} />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
