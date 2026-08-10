import { useEffect } from 'react';

/* Acessibilidade do modal, tudo amarrado ao ciclo de vida dele: enquanto está montado,
 * Esc fecha, Tab circula só entre os elementos de dentro e a página de trás não rola.
 * Ao desmontar, o foco volta pro elemento que abriu o modal — sem isso quem navega por
 * teclado é jogado de volta pro início da página a cada ferramenta usada. */
export function useModalA11y(overlayRef, onClose) {
  useEffect(() => {
    const overlay = overlayRef.current;
    const previouslyFocused = document.activeElement;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !overlay) return;

      // Recalculado a cada Tab de propósito: o conteúdo do modal muda ao longo do fluxo
      // (dropzone some, botão de download aparece), então uma lista fixa ficaria errada.
      const focusable = Array.from(
        overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [overlayRef, onClose]);
}
