'use client';

import { useState } from 'react';
import { Xmark, Building, CheckCircle } from 'iconoir-react';
import { Loader2 } from 'lucide-react';

interface EnterpriseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EnterpriseModal({ isOpen, onClose }: EnterpriseModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    companyName: '',
    storeCount: '',
    monthlyInquiries: '',
    message: '',
  });
  const [errors, setErrors] = useState({
    name: false,
    phone: false,
    companyName: false,
    storeCount: false,
    monthlyInquiries: false,
    message: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (!isOpen) return null;

  const validatePhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 11;
  };

  const validateForm = (): boolean => {
    const newErrors = {
      name: formData.name.trim().length < 2,
      phone: !validatePhone(formData.phone.trim()),
      companyName: formData.companyName.trim().length < 2,
      storeCount: formData.storeCount.trim() === '',
      monthlyInquiries: formData.monthlyInquiries === '',
      message: formData.message.trim().length < 10,
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(Boolean);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name in errors) {
      setErrors((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError('');

    const submitData = {
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      companyName: formData.companyName.trim(),
      storeCount: formData.storeCount.trim(),
      monthlyInquiries: formData.monthlyInquiries,
      message: formData.message.trim(),
    };

    try {
      const response = await fetch('/api/enterprise-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Network response was not ok');
      }

      setIsSuccess(true);
    } catch (error) {
      console.error('Form submission error:', error);
      setSubmitError('문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: '', phone: '', companyName: '', storeCount: '', monthlyInquiries: '', message: '' });
    setErrors({ name: false, phone: false, companyName: false, storeCount: false, monthlyInquiries: false, message: false });
    setIsSuccess(false);
    setSubmitError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-gray-900 to-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yamoo-primary rounded-lg flex items-center justify-center">
              <Building width={20} height={20} strokeWidth={1.5} className="text-gray-900" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Enterprise 문의</h2>
              <p className="text-sm text-gray-300">맞춤형 솔루션을 제안해드립니다</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} className="text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {isSuccess ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle width={32} height={32} strokeWidth={1.5} className="text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                문의가 접수되었습니다!
              </h3>
              <p className="text-gray-600 mb-6">
                담당자가 빠르게 연락드리겠습니다.
              </p>
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                확인
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  성함 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="홍길동"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none ${
                    errors.name ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">이름을 2자 이상 입력해주세요</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  연락처 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="010-1234-5678"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none ${
                    errors.phone ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.phone && (
                  <p className="text-red-500 text-xs mt-1">올바른 연락처를 입력해주세요</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  회사명 / 브랜드명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  placeholder="주식회사 야무"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none ${
                    errors.companyName ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.companyName && (
                  <p className="text-red-500 text-xs mt-1">회사명을 2자 이상 입력해주세요</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    매장 수 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="storeCount"
                    value={formData.storeCount}
                    onChange={handleInputChange}
                    placeholder="5"
                    min="1"
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none ${
                      errors.storeCount ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {errors.storeCount && (
                    <p className="text-red-500 text-xs mt-1">매장 수를 입력해주세요</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    월 문의 건수 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="monthlyInquiries"
                    value={formData.monthlyInquiries}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none ${
                      errors.monthlyInquiries ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">선택</option>
                    <option value="0-100">0 ~ 100건</option>
                    <option value="101-200">101 ~ 200건</option>
                    <option value="201-300">201 ~ 300건</option>
                    <option value="301-400">301 ~ 400건</option>
                    <option value="401-500">401 ~ 500건</option>
                    <option value="501-1000">501 ~ 1,000건</option>
                    <option value="1000+">1,000건 이상</option>
                  </select>
                  {errors.monthlyInquiries && (
                    <p className="text-red-500 text-xs mt-1">월 문의 건수를 선택해주세요</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  문의 내용 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="문의하실 내용을 입력해주세요.&#10;(다지점 운영, 맞춤형 기능, 연동 요청 등)"
                  rows={4}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none resize-none ${
                    errors.message ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                {errors.message && (
                  <p className="text-red-500 text-xs mt-1">문의 내용을 10자 이상 입력해주세요</p>
                )}
              </div>

              {submitError && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-4 rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    접수 중...
                  </>
                ) : (
                  '문의 접수하기'
                )}
              </button>

              <p className="text-center text-sm text-gray-500">
                담당자가 확인 후 연락드리겠습니다.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
