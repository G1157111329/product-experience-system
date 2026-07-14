export function isLegacyCopyConfirmed(commandSucceeded: boolean, clipboardWriteHandled: boolean): boolean {
  return commandSucceeded && clipboardWriteHandled;
}

function copyWithTextarea(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.readOnly = true;
    ta.style.position = 'fixed';
    ta.style.left = '0';
    ta.style.top = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.padding = '0';
    ta.style.border = '0';
    ta.style.opacity = '0.01';
    ta.style.fontSize = '16px';
    document.body.appendChild(ta);
    let clipboardWriteHandled = false;
    const handleCopy = (event: ClipboardEvent) => {
      if (!event.clipboardData) return;
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
      clipboardWriteHandled = true;
    };
    document.addEventListener('copy', handleCopy, { once: true });
    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    try {
      const copied = document.execCommand('copy');
      if (isLegacyCopyConfirmed(copied, clipboardWriteHandled)) resolve();
      else reject(new Error('copy failed'));
    } catch {
      reject(new Error('copy failed'));
    } finally {
      document.removeEventListener('copy', handleCopy);
      document.body.removeChild(ta);
    }
  });
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Intranet HTTP deployments often expose navigator.clipboard but reject
      // writeText outside secure contexts, so fall back to the legacy command.
    }
  }
  await copyWithTextarea(text);
}
