/**
 * بارگذاری @font-face فونت‌های نصب‌شده —
 * cssText فونت‌ها از دیتابیس می‌آید (فونت‌های پیش‌فرض از /fonts و
 * فونت‌های آپلودی از /uploads/fonts بارگذاری می‌شوند).
 * رندر خالص است (بدون هوک) — هم در سرور و هم کلاینت قابل استفاده است.
 * React تگ style را خودش به <head> منتقل می‌کند.
 */
export function FontStylesheets({ cssTexts }: { cssTexts: string[] }) {
  const nodes = cssTexts
    .map((cssText) => cssText.trim())
    .filter(Boolean)
    .map((cssText, i) => (
      <style
        key={`installed-font-${i}`}
        // قواعد @font-face تولیدشده توسط خود ما — بدون ورودی کاربر خام
        dangerouslySetInnerHTML={{ __html: cssText }}
      />
    ));

  return nodes.length > 0 ? <>{nodes}</> : null;
}
