/**
 * Tracks native IME composition so autosave never persists phonetic interim
 * input such as "haochi1" before the user commits the Chinese characters.
 */
export function createCompositionController() {
  let composing = false;

  return {
    start() {
      composing = true;
    },
    change(value: string): string | null {
      return composing ? null : value;
    },
    end(value: string): string {
      composing = false;
      return value;
    },
    blur(value: string): string | null {
      return composing ? null : value;
    },
    get isComposing() {
      return composing;
    },
  };
}
