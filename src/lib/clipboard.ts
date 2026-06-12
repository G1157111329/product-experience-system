function copyWithTextarea(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.readOnly = true;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    try {
      const copied = document.execCommand('copy');
      if (copied) resolve();
      else reject(new Error('copy failed'));
    } catch {
      reject(new Error('copy failed'));
    } finally {
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
