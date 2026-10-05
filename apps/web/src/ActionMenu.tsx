import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';

export function ActionMenu({
  label = '更多',
  ariaLabel = '更多任务操作',
  disabled = false,
  placement = 'above',
  items,
}: {
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  placement?: 'above' | 'below';
  items: Array<{
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    danger?: boolean;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const tabCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOpen = open && !disabled;

  function clearTabClose() {
    if (tabCloseTimer.current !== null) {
      clearTimeout(tabCloseTimer.current);
      tabCloseTimer.current = null;
    }
  }

  function enabledItems() {
    return Array.from(
      popupRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
  }

  function focusEdge(edge: 'first' | 'last') {
    const buttons = enabledItems();
    (edge === 'first' ? buttons[0] : buttons.at(-1))?.focus();
  }

  function openMenu(edge: 'first' | 'last' = 'first') {
    if (disabled) return;
    clearTabClose();
    initialFocus.current = edge;
    setOpen(true);
    if (isOpen) focusEdge(edge);
  }

  function closeMenu(returnFocus = false) {
    clearTabClose();
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) return;
    function closeOutside(event: Event) {
      if (!rootRef.current?.contains(event.target as Node)) closeMenu();
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    focusEdge(initialFocus.current);
    return () => {
      clearTabClose();
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, [isOpen]);

  function handleMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      // Let the browser move focus before removing the focused menu item.
      clearTabClose();
      tabCloseTimer.current = setTimeout(() => {
        tabCloseTimer.current = null;
        setOpen(false);
      }, 0);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = enabledItems();
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
      : event.key === 'ArrowDown' ? (currentIndex + 1) % buttons.length
      : currentIndex < 0 ? buttons.length - 1
      : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  }

  return (
    <div className="action-menu" ref={rootRef}>
      <button
        type="button"
        className="action-menu-trigger text-button"
        ref={triggerRef}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => isOpen ? closeMenu(true) : openMenu()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
          } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            event.stopPropagation();
            closeMenu(true);
          }
        }}
      >
        {label}<CaretDownIcon size={13} aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          className={`action-menu-popup placement-${placement}`}
          ref={popupRef}
          onKeyDown={handleMenuKey}
        >
          {items.map((item, index) => (
            <button
              type="button"
              key={`${item.label}-${index}`}
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              className={item.danger ? 'danger-text' : undefined}
              onClick={() => {
                if (disabled || item.disabled) return;
                closeMenu(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
