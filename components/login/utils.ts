/**
 * Format phone number to 010-1234-5678 format
 */
export const formatPhone = (value: string): string => {
  const numbers = value.replace(/[^0-9]/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

/**
 * Format timer seconds to mm:ss format
 */
export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password (minimum 6 characters)
 */
export const validatePassword = (password: string): boolean => {
  return password.length >= 6;
};

/**
 * Validate phone number (minimum 10 digits)
 */
export const validatePhone = (phone: string): boolean => {
  const numbers = phone.replace(/[^0-9]/g, '');
  return numbers.length >= 10;
};

/**
 * Check if two passwords match
 */
export const validatePasswordMatch = (password: string, confirmPassword: string): boolean => {
  return password === confirmPassword;
};
