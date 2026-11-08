import type { Page } from '@playwright/test';

declare global {
  interface Window { __testExportFiles?: Blob[] }
}

/** Inspect the real export output even on hosts that cancel OS file downloads. */
export async function captureExportFiles(page: Page) {
  await page.addInitScript(() => {
    const files: Blob[] = [];
    Object.defineProperty(window, '__testExportFiles', { value: files });
    const createURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = object => {
      if (object instanceof Blob) files.push(object);
      return createURL(object);
    };
  });
}

export async function exportedText(page: Page, type: string) {
  return page.evaluate(async mime => {
    const files = window.__testExportFiles ?? [];
    const file = files.findLast(blob => blob.type.split(';', 1)[0] === mime);
    if (!file) throw new Error(`No ${mime} export was generated`);
    return file.text();
  }, type);
}
