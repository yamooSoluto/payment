'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { NavArrowRight, Search } from 'iconoir-react';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  subcategory?: string | null;
}

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

// HTML에서 H2, H3 헤더를 추출하여 TOC 생성
function extractTOC(html: string): TOCItem[] {
  const toc: TOCItem[] = [];
  const regex = /<h([23])[^>]*>(.*?)<\/h[23]>/gi;
  let match;
  let counter = 0;

  while ((match = regex.exec(html)) !== null) {
    counter++;
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]*>/g, ''); // HTML 태그 제거
    toc.push({
      id: `heading-${counter}`,
      text,
      level,
    });
  }

  return toc;
}

// HTML에 ID 추가
function addIdsToHeadings(html: string): string {
  let counter = 0;
  return html.replace(/<h([23])([^>]*)>/gi, (match, level, attrs) => {
    counter++;
    return `<h${level}${attrs} id="heading-${counter}">`;
  });
}

export default function FAQPage() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedFaqId, setSelectedFaqId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await fetch('/api/faq');
        if (response.ok) {
          const data = await response.json();
          const faqList = data.web_faqs || data.faqs || [];
          setFaqs(faqList);
          // 첫 번째 카테고리 자동 선택 및 펼치기
          if (faqList.length > 0) {
            const firstCategory = faqList[0].category;
            setSelectedCategory(firstCategory);
            setExpandedCategories(new Set([firstCategory]));
            // 첫 번째 FAQ도 선택
            const firstFaq = faqList.find((f: FAQItem) => f.category === firstCategory);
            if (firstFaq) {
              setSelectedFaqId(firstFaq.id);
              if (firstFaq.subcategory) {
                setSelectedSubcategory(firstFaq.subcategory);
                setExpandedSubcategories(new Set([`${firstCategory}-${firstFaq.subcategory}`]));
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch FAQs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFaqs();
  }, []);

  // 카테고리별 그룹화
  const categories = Array.from(new Set(faqs.map(f => f.category)));

  // 카테고리별 하위 카테고리 목록
  const subcategoriesByCategory = useMemo(() => {
    const result: Record<string, string[]> = {};
    categories.forEach(category => {
      const subcats = Array.from(new Set(
        faqs
          .filter(f => f.category === category && f.subcategory)
          .map(f => f.subcategory!)
      ));
      result[category] = subcats;
    });
    return result;
  }, [faqs, categories]);

  // 카테고리/하위카테고리별 FAQ 그룹화
  const faqsByCategory = useMemo(() => {
    return categories.reduce((acc, category) => {
      acc[category] = {
        noSubcategory: faqs.filter(f => f.category === category && !f.subcategory),
        bySubcategory: (subcategoriesByCategory[category] || []).reduce((subAcc, subcategory) => {
          subAcc[subcategory] = faqs.filter(f => f.category === category && f.subcategory === subcategory);
          return subAcc;
        }, {} as Record<string, FAQItem[]>),
      };
      return acc;
    }, {} as Record<string, { noSubcategory: FAQItem[]; bySubcategory: Record<string, FAQItem[]> }>);
  }, [faqs, categories, subcategoriesByCategory]);

  // 검색 필터링
  const filteredFaqs = searchQuery
    ? faqs.filter(f =>
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : [];

  // 현재 선택된 FAQ
  const selectedFaq = useMemo(() => {
    return faqs.find(f => f.id === selectedFaqId);
  }, [faqs, selectedFaqId]);

  // 현재 FAQ의 TOC
  const currentTOC = useMemo(() => {
    if (!selectedFaq) return [];
    return extractTOC(selectedFaq.answer);
  }, [selectedFaq]);

  // 현재 FAQ의 HTML (ID 추가)
  const processedAnswer = useMemo(() => {
    if (!selectedFaq) return '';
    return addIdsToHeadings(selectedFaq.answer);
  }, [selectedFaq]);

  const handleFaqClick = useCallback((faq: FAQItem) => {
    setSelectedFaqId(faq.id);
    setSelectedCategory(faq.category);
    setSelectedSubcategory(faq.subcategory || null);
    setMobileMenuOpen(false);
    setActiveHeading(null);
    // 스크롤 맨 위로
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  }, []);

  const toggleSubcategory = useCallback((category: string, subcategory: string) => {
    const key = `${category}-${subcategory}`;
    setExpandedSubcategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  const handleCategoryClick = useCallback((category: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory(null);
    setSearchQuery('');
    // 카테고리 펼치기
    setExpandedCategories(prev => new Set([...prev, category]));
    // 해당 카테고리의 첫 번째 FAQ 선택
    const categoryData = faqsByCategory[category];
    const subcats = subcategoriesByCategory[category] || [];
    let firstFaq: FAQItem | undefined;

    // 하위 카테고리가 있으면 첫 번째 하위 카테고리의 첫 번째 FAQ
    if (subcats.length > 0) {
      firstFaq = categoryData?.bySubcategory[subcats[0]]?.[0];
      if (firstFaq) {
        setSelectedSubcategory(firstFaq.subcategory || null);
        setExpandedSubcategories(prev => new Set([...prev, `${category}-${subcats[0]}`]));
      }
    }
    // 없으면 하위 카테고리 없는 FAQ 중 첫 번째
    if (!firstFaq) {
      firstFaq = categoryData?.noSubcategory?.[0];
    }
    if (firstFaq) {
      setSelectedFaqId(firstFaq.id);
    }
  }, [faqsByCategory, subcategoriesByCategory]);

  const handleTOCClick = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveHeading(id);
    }
  }, []);

  // 스크롤 감지하여 현재 보이는 헤딩 추적
  useEffect(() => {
    if (currentTOC.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveHeading(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -80% 0px' }
    );

    currentTOC.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [currentTOC, selectedFaqId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (faqs.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">등록된 FAQ가 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* 모바일 메뉴 토글 버튼 */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed bottom-6 right-6 z-50 bg-blue-600 text-white p-4 rounded-full shadow-lg"
      >
        <NavArrowRight className={`w-6 h-6 transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 왼쪽 사이드바 - 전체 목차 */}
      <aside className={`
        fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-gray-50 border-r border-gray-200
        transform transition-transform duration-300 lg:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        overflow-y-auto
      `}>
        {/* 헤더 */}
        <div className="sticky top-0 bg-gray-50 border-b border-gray-200 p-4">
          <h1 className="text-xl font-bold text-gray-900 mb-4">자주 묻는 질문</h1>

          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            />
          </div>
        </div>

        {/* 목차 */}
        <nav className="p-4">
          {searchQuery ? (
            // 검색 결과
            <div>
              <p className="text-xs text-gray-500 mb-2">{filteredFaqs.length}건의 검색 결과</p>
              {filteredFaqs.map(faq => (
                <button
                  key={faq.id}
                  onClick={() => handleFaqClick(faq)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${selectedFaqId === faq.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                    }`}
                >
                  <span className="text-xs text-gray-400 block">
                    {faq.category}{faq.subcategory && ` > ${faq.subcategory}`}
                  </span>
                  <span className="line-clamp-2">{faq.question}</span>
                </button>
              ))}
            </div>
          ) : (
            // 카테고리별 목차 (3단계 계층)
            categories.map(category => {
              const categoryData = faqsByCategory[category];
              const subcats = subcategoriesByCategory[category] || [];
              const isExpanded = expandedCategories.has(category);

              return (
                <div key={category} className="mb-3">
                  {/* 카테고리 헤더 */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${selectedCategory === category
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-800 hover:bg-gray-100'
                      }`}
                  >
                    <NavArrowRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    {category}
                  </button>

                  {/* 펼쳐진 경우 하위 항목 표시 */}
                  {isExpanded && (
                    <div className="ml-2 mt-1 border-l-2 border-gray-200">
                      {/* 하위 카테고리들 */}
                      {subcats.map(subcategory => {
                        const subcatKey = `${category}-${subcategory}`;
                        const isSubExpanded = expandedSubcategories.has(subcatKey);
                        const subcatFaqs = categoryData?.bySubcategory[subcategory] || [];

                        return (
                          <div key={subcatKey}>
                            {/* 하위 카테고리 헤더 */}
                            <button
                              onClick={() => toggleSubcategory(category, subcategory)}
                              className={`w-full text-left pl-4 pr-2 py-1.5 text-sm font-medium transition-colors flex items-center gap-1 ${selectedSubcategory === subcategory
                                  ? 'text-blue-600'
                                  : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                              <NavArrowRight className={`w-3 h-3 transition-transform ${isSubExpanded ? 'rotate-90' : ''}`} />
                              {subcategory}
                              <span className="text-xs text-gray-400 ml-1">({subcatFaqs.length})</span>
                            </button>

                            {/* 하위 카테고리의 FAQ 목록 */}
                            {isSubExpanded && (
                              <div className="ml-3 border-l border-gray-100">
                                {subcatFaqs.map(faq => (
                                  <button
                                    key={faq.id}
                                    onClick={() => handleFaqClick(faq)}
                                    className={`w-full text-left pl-4 pr-2 py-1.5 text-sm transition-colors ${selectedFaqId === faq.id
                                        ? 'text-blue-600 border-l-2 border-blue-600 -ml-[2px] bg-blue-50/50'
                                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                      }`}
                                  >
                                    <span className="line-clamp-2">{faq.question}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* 하위 카테고리 없는 FAQ들 */}
                      {categoryData?.noSubcategory?.map(faq => (
                        <button
                          key={faq.id}
                          onClick={() => handleFaqClick(faq)}
                          className={`w-full text-left pl-4 pr-2 py-2 text-sm transition-colors ${selectedFaqId === faq.id
                              ? 'text-blue-600 border-l-2 border-blue-600 -ml-[2px] bg-blue-50/50'
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                          <span className="line-clamp-2">{faq.question}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </nav>

        {/* Powered by SOLUTO */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <span>Powered by</span>
            <img src="/soluto_black_cut.png" alt="SOLUTO" className="h-4 opacity-60" />
          </div>
        </div>
      </aside>

      {/* 모바일 오버레이 */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* 메인 컨텐츠 */}
      <main className="flex-1 min-h-screen">
        {selectedFaq ? (
          <div className="max-w-4xl mx-auto px-6 py-12">
            {/* 브레드크럼 */}
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
              <span>{selectedFaq.category}</span>
              {selectedFaq.subcategory && (
                <>
                  <NavArrowRight className="w-4 h-4" />
                  <span>{selectedFaq.subcategory}</span>
                </>
              )}
              <NavArrowRight className="w-4 h-4" />
              <span className="text-gray-900">{selectedFaq.question}</span>
            </div>

            {/* 질문 제목 */}
            <h1 className="text-3xl font-bold text-gray-900 mb-8">
              {selectedFaq.question}
            </h1>

            {/* 답변 내용 */}
            <div
              className="prose prose-lg max-w-none prose-headings:scroll-mt-20"
              dangerouslySetInnerHTML={{ __html: processedAnswer.replace(/(<summary[^>]*>)\s*(?:질문|답변)\s*/g, '$1') }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            FAQ를 선택해주세요.
          </div>
        )}
      </main>

      {/* 오른쪽 사이드바 - 페이지 내 목차 (PC only) */}
      {selectedFaq && currentTOC.length > 0 && (
        <aside className="hidden xl:block w-56 flex-shrink-0">
          <div className="sticky top-8 p-4">
            <nav className="space-y-1">
              {currentTOC.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleTOCClick(item.id)}
                  className={`w-full text-left text-sm py-1.5 transition-colors ${item.level === 3 ? 'pl-4' : 'pl-0'
                    } ${activeHeading === item.id
                      ? 'text-blue-600 font-medium'
                      : 'text-gray-500 hover:text-gray-900'
                    }`}
                >
                  {item.text}
                </button>
              ))}
            </nav>
          </div>
        </aside>
      )}

      {/* 프로즈 스타일 */}
      <style jsx global>{`
        .prose h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .prose h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .prose p {
          margin-bottom: 1rem;
          line-height: 1.75;
        }
        .prose ul,
        .prose ol {
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .prose ul {
          list-style: disc;
        }
        .prose ol {
          list-style: decimal;
        }
        .prose li {
          margin-bottom: 0.5rem;
        }
        .prose blockquote {
          border-left: 4px solid #3b82f6;
          padding-left: 1rem;
          margin-left: 0;
          margin-bottom: 1rem;
          background: #f8fafc;
          padding: 1rem;
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .prose code {
          background: #f3f4f6;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          font-size: 0.875em;
        }
        .prose pre {
          background: #1f2937;
          color: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin-bottom: 1rem;
        }
        .prose pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
        .prose hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 2rem 0;
        }
        .prose strong {
          font-weight: 600;
        }
        /* 테이블 스타일 */
        .prose table {
          border-collapse: collapse;
          width: 100%;
          margin: 1.5rem 0;
        }
        .prose table td,
        .prose table th {
          border: 1px solid #e5e7eb;
          padding: 0.75rem 1rem;
          text-align: left;
        }
        .prose table th {
          font-weight: 600;
          background-color: #f9fafb;
        }
        .prose table tr:nth-child(even) {
          background-color: #fafafa;
        }
        /* 링크 스타일 */
        .prose a {
          color: #3b82f6;
          text-decoration: underline;
        }
        .prose a:hover {
          color: #2563eb;
        }
        /* 아코디언/펼치기접기 스타일 */
        .prose details.faq-accordion {
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          margin: 1.5rem 0;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .prose summary.faq-accordion-summary {
          padding: 1.25rem 1.5rem;
          background: #f9fafb;
          cursor: pointer;
          font-weight: 600;
          font-size: 1.1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          list-style: none;
          transition: background-color 0.2s;
        }
        .prose summary.faq-accordion-summary:hover {
          background: #f3f4f6;
        }
        .prose summary.faq-accordion-summary::-webkit-details-marker {
          display: none;
        }
        .prose summary.faq-accordion-summary::before {
          content: '▶';
          font-size: 0.75rem;
          color: #6b7280;
          transition: transform 0.2s ease;
        }
        .prose details.faq-accordion[open] summary.faq-accordion-summary::before {
          transform: rotate(90deg);
        }
        .prose details.faq-accordion[open] summary.faq-accordion-summary {
          border-bottom: 1px solid #e5e7eb;
        }
        .prose div.faq-accordion-content,
        .prose div[data-details-content] {
          padding: 1.5rem;
          background: white;
        }
        .prose div.faq-accordion-content p:last-child,
        .prose div[data-details-content] p:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
