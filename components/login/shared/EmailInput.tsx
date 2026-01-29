'use client';

import { Mail } from 'iconoir-react';

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  label?: string;
}

export default function EmailInput({
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'email@example.com',
  label = '이메일(ID)',
}: EmailInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all disabled:bg-gray-50 disabled:text-gray-600 disabled:border-gray-200"
          placeholder={placeholder}
          required={required}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
