'use client';

import { useRef, useEffect, useCallback, forwardRef, type ComponentProps } from 'react';

/**
 * UndoableInput / UndoableTextarea
 *
 * React controlled input은 매 keystroke마다 value를 덮어쓰면서
 * 브라우저 네이티브 undo(Ctrl+Z) 히스토리를 파괴합니다.
 *
 * 이 컴포넌트는 defaultValue + ref로 DOM을 직접 관리하면서
 * 외부 prop 변경만 선택적으로 동기화합니다.
 *
 * 사용법: <input> → <UndoableInput>, <textarea> → <UndoableTextarea>
 * API는 동일합니다. value + onChange 그대로 사용.
 */

// ── Input ──
type InputProps = Omit<ComponentProps<'input'>, 'onChange' | 'value' | 'defaultValue'> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export const UndoableInput = forwardRef<HTMLInputElement, InputProps>(
  ({ value, onChange, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLInputElement>(null);
    const lastSynced = useRef(value);

    // forwardRef + innerRef 통합
    const setRef = useCallback(
      (el: HTMLInputElement | null) => {
        (innerRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
        if (typeof forwardedRef === 'function') forwardedRef(el);
        else if (forwardedRef) forwardedRef.current = el;
      },
      [forwardedRef],
    );

    // 외부에서 값이 바뀔 때만 DOM 동기화 (사용자 입력 중에는 건드리지 않음)
    useEffect(() => {
      if (innerRef.current && value !== lastSynced.current) {
        innerRef.current.value = value ?? '';
        lastSynced.current = value;
      }
    }, [value]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        lastSynced.current = e.target.value;
        onChange(e);
      },
      [onChange],
    );

    return (
      <input
        ref={setRef}
        defaultValue={value ?? ''}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
UndoableInput.displayName = 'UndoableInput';

// ── Textarea ──
type TextareaProps = Omit<ComponentProps<'textarea'>, 'onChange' | 'value' | 'defaultValue'> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
};

export const UndoableTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ value, onChange, ...props }, forwardedRef) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const lastSynced = useRef(value);

    const setRef = useCallback(
      (el: HTMLTextAreaElement | null) => {
        (innerRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
        if (typeof forwardedRef === 'function') forwardedRef(el);
        else if (forwardedRef) forwardedRef.current = el;
      },
      [forwardedRef],
    );

    useEffect(() => {
      if (innerRef.current && value !== lastSynced.current) {
        innerRef.current.value = value ?? '';
        lastSynced.current = value;
      }
    }, [value]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        lastSynced.current = e.target.value;
        onChange(e);
      },
      [onChange],
    );

    return (
      <textarea
        ref={setRef}
        defaultValue={value ?? ''}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
UndoableTextarea.displayName = 'UndoableTextarea';