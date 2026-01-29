'use client';

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onTermsClick: () => void;
  onPrivacyClick: () => void;
  id?: string;
  disabled?: boolean;
}

export default function TermsCheckbox({
  checked,
  onChange,
  onTermsClick,
  onPrivacyClick,
  id = 'agreeToTerms',
  disabled = false,
}: TermsCheckboxProps) {
  return (
    <div className="flex items-start gap-2 pt-2">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 text-yamoo-primary border-gray-300 rounded focus:ring-yamoo-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={disabled}
      />
      <label htmlFor={id} className="text-sm text-gray-600 cursor-pointer">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onTermsClick();
          }}
          className="text-yamoo-dark hover:underline"
        >
          이용약관
        </button>
        {' '}및{' '}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onPrivacyClick();
          }}
          className="text-yamoo-dark hover:underline"
        >
          개인정보처리방침
        </button>
        에 동의합니다. <span className="text-red-500">(필수)</span>
      </label>
    </div>
  );
}
