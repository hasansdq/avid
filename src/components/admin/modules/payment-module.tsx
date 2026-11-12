"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgePercent,
  Banknote,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Infinity as InfinityIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  TicketPercent,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { JalaliDateField } from "@/components/admin/shared/jalali-date-field";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { btnGradient, tileGradient } from "@/components/admin/shared/styles";
import type { DiscountCode, PaymentSettings } from "@/components/admin/types";
import { PAYMENT_GATEWAYS } from "@/lib/payment";
import {
  DISCOUNT_PAYMENT_TYPES,
  DISCOUNT_VALUE_TYPES,
  type DiscountPaymentType,
  type DiscountValueType,
} from "@/lib/discount";
import { faDate, faDigits } from "@/lib/fa";

/** مبلغ تومانی با جداکننده‌ی هزارگان فارسی */
function faAmount(n: number): string {
  return faDigits(n.toLocaleString("en-US"));
}

/** تبدیل ورودی رقمی (فارسی/انگلیسی با جداکننده) به عدد */
function parseAmount(v: string): number {
  const faToEn = v.replace(/[۰-۹]/g, (d) =>
    String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
  );
  const digits = faToEn.replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

/** تبدیل تاریخ به قالب ورودی date (YYYY-MM-DD) */
function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

/* — پیش‌نوانس تنظیمات درگاه (همه‌چیز رشته؛ هنگام ذخیره تبدیل می‌شود) — */
interface PaymentDraft {
  gateway: string;
  zarinpalMerchantId: string;
  paypingApiKey: string;
  installmentCount: string;
}

function toDraft(s: PaymentSettings): PaymentDraft {
  return {
    gateway: s.gateway,
    zarinpalMerchantId: s.zarinpalMerchantId,
    paypingApiKey: s.paypingApiKey,
    installmentCount: String(s.installmentCount),
  };
}

/* ------------------------------------------------------------------ */
/*  کارت تنظیمات درگاه پرداخت و طرح اقساطی                             */
/* ------------------------------------------------------------------ */

function GatewayCard({
  settings,
  onSaved,
}: {
  settings: PaymentSettings | null;
  onSaved: (s: PaymentSettings) => void;
}) {
  const [draft, setDraft] = useState<PaymentDraft | null>(
    settings ? toDraft(settings) : null
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [settings]);

  if (!draft) {
    return (
      <div className="glass flex items-center gap-3 rounded-2xl p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-teal-600" />
        در حال دریافت تنظیمات پرداخت...
      </div>
    );
  }

  const set = (patch: Partial<PaymentDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const installmentCount = Math.max(
    1,
    Math.min(36, parseAmount(draft.installmentCount) || 3)
  );

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await apiFetch<PaymentSettings>(
        "/api/admin/payment-settings",
        {
          method: "PUT",
          body: JSON.stringify({
            gateway: draft.gateway,
            zarinpalMerchantId: draft.zarinpalMerchantId,
            paypingApiKey: draft.paypingApiKey,
            installmentCount,
          }),
        }
      );
      onSaved(saved);
      toast.success("تنظیمات درگاه پرداخت ذخیره شد");
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass space-y-5 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span
          className={`flex size-10 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-teal-500/20`}
        >
          <CreditCard className="size-5 text-white" strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-foreground sm:text-base">
            تنظیمات درگاه پرداخت و طرح اقساطی
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">
            درگاه پیش‌ثبت‌نام (زرین‌پال / پی‌پینگ) و پیش‌فرض طرح اقساطی —
            شهریه‌ی هر دوره در فرم خودش تعیین می‌شود
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* — ستون درگاه — */}
        <div className="space-y-4 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-4 dark:border-white/[0.07] dark:bg-white/[0.02]">
          <div className="space-y-2">
            <Label className="text-xs font-black text-foreground/90">
              درگاه پرداخت
            </Label>
            <Select
              value={draft.gateway}
              onValueChange={(v) => set({ gateway: v })}
              dir="rtl"
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]">
                {draft.gateway in PAYMENT_GATEWAYS ? (
                  <span className="truncate">
                    {PAYMENT_GATEWAYS[
                      draft.gateway as keyof typeof PAYMENT_GATEWAYS
                    ].label}
                  </span>
                ) : (
                  <SelectValue placeholder="درگاه را انتخاب کنید" />
                )}
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(PAYMENT_GATEWAYS) as (keyof typeof PAYMENT_GATEWAYS)[]
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {PAYMENT_GATEWAYS[key].label}
                    <span className="block text-[0.6rem] text-muted-foreground">
                      {PAYMENT_GATEWAYS[key].hint}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draft.gateway === "zarinpal" && (
            <div className="space-y-2">
              <Label
                htmlFor="zarinpal-merchant"
                className="text-xs font-black text-foreground/90"
              >
                شناسه پذیرنده زرین‌پال (Merchant ID)
              </Label>
              <Input
                id="zarinpal-merchant"
                value={draft.zarinpalMerchantId}
                onChange={(e) =>
                  set({ zarinpalMerchantId: e.target.value.trim() })
                }
                placeholder="مثلاً: 1a2b3c4d-..."
                dir="ltr"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
              <p className="text-[0.6rem] leading-5 text-muted-foreground">
                درگاه زرین‌پال PG v4 است؛ مبالغ به‌صورت خودکار به ریال تبدیل
                می‌شوند.
              </p>
            </div>
          )}

          {draft.gateway === "payping" && (
            <div className="space-y-2">
              <Label
                htmlFor="payping-key"
                className="text-xs font-black text-foreground/90"
              >
                توکن API پی‌پینگ
              </Label>
              <Input
                id="payping-key"
                value={draft.paypingApiKey}
                onChange={(e) => set({ paypingApiKey: e.target.value.trim() })}
                placeholder="Bearer Token پی‌پینگ"
                dir="ltr"
                className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
              />
              <p className="text-[0.6rem] leading-5 text-muted-foreground">
                پی‌پینگ v2 — مبالغ به تومان ارسال می‌شوند و شناسه‌ی ثبت‌نام
                (clientRefId) برای تطبیق دقیق تراکنش ارسال می‌شود.
              </p>
            </div>
          )}

          {draft.gateway === "test" && (
            <p className="flex items-start gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 p-3 text-[0.65rem] font-semibold leading-5 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              حالت آزمایشی: کل چرخه‌ی پرداخت بدون اتصال واقعی شبیه‌سازی
              می‌شود — مناسب تست فرم و پنل.
            </p>
          )}

          {draft.gateway === "none" && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-[0.65rem] font-semibold leading-5 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300">
              <XCircle className="mt-0.5 size-3.5 shrink-0" />
              پرداخت آنلاین غیرفعال است؛ فرم پیش‌ثبت‌نام بدون پرداخت کار
              می‌کند و کارشناسان برای پرداخت تماس می‌گیرند.
            </p>
          )}
        </div>

        {/* — ستون طرح اقساطی — */}
        <div className="space-y-4 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-4 dark:border-white/[0.07] dark:bg-white/[0.02]">
          <div className="space-y-2">
            <Label
              htmlFor="installment-count"
              className="flex items-center gap-1.5 text-xs font-black text-foreground/90"
            >
              <CalendarClock className="size-3.5 text-violet-600 dark:text-violet-300" />
              تعداد اقساط پیش‌فرض
            </Label>
            <Input
              id="installment-count"
              value={draft.installmentCount}
              onChange={(e) => set({ installmentCount: e.target.value })}
              inputMode="numeric"
              placeholder="3"
              dir="ltr"
              className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
            />
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-teal-500/25 bg-teal-500/[0.08] px-3.5 py-2.5 text-[0.65rem] font-bold leading-5 text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300">
            <Banknote className="mt-0.5 size-3.5 shrink-0" />
            این تعداد فقط برای دوره‌هایی کاربرد دارد که طرح اختصاصی ندارند؛
            برای هر دوره می‌توانید تعداد و تاریخ سررسید اقساط را در فرم
            ایجاد/ویرایش همان دوره (بخش «دوره‌ها») تعیین کنید. پیش‌فرض ۳ قسط
            است و سررسیدها در نبود تعریف، ۳۰ روز از تاریخ ثبت‌نام فاصله دارند.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button
          onClick={save}
          disabled={saving}
          className={`h-10 rounded-xl px-6 text-xs font-black ${btnGradient}`}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              در حال ذخیره...
            </>
          ) : (
            <>
              <Save className="size-4" />
              ذخیره تنظیمات پرداخت
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  دیالوگ ایجاد/ویرایش کد تخفیف                                       */
/* ------------------------------------------------------------------ */

interface DiscountDraft {
  code: string;
  paymentType: DiscountPaymentType;
  valueType: DiscountValueType;
  value: string;
  maxUses: string;
  expiresAt: string; // YYYY-MM-DD
  active: boolean;
  note: string;
}

const EMPTY_DISCOUNT: DiscountDraft = {
  code: "",
  paymentType: "both",
  valueType: "percent",
  value: "",
  maxUses: "0",
  expiresAt: "",
  active: true,
  note: "",
};

function DiscountFormDialog({
  editing,
  open,
  onOpenChange,
  onSaved,
}: {
  editing: DiscountCode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DiscountDraft>(EMPTY_DISCOUNT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(
        editing
          ? {
              code: editing.code,
              paymentType:
                (editing.paymentType in DISCOUNT_PAYMENT_TYPES
                  ? editing.paymentType
                  : "both") as DiscountPaymentType,
              valueType:
                (editing.valueType in DISCOUNT_VALUE_TYPES
                  ? editing.valueType
                  : "percent") as DiscountValueType,
              value: String(editing.value),
              maxUses: String(editing.maxUses),
              expiresAt: toDateInput(editing.expiresAt),
              active: editing.active,
              note: editing.note ?? "",
            }
          : EMPTY_DISCOUNT
      );
    }
  }, [open, editing]);

  const set = (patch: Partial<DiscountDraft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const isPercent = draft.valueType === "percent";

  async function save() {
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      toast.error("کد باید ۳ تا ۳۲ نویسه از حروف و ارقام انگلیسی باشد.");
      return;
    }
    const value = parseAmount(draft.value);
    if (value <= 0) {
      toast.error("مقدار تخفیف را وارد کنید.");
      return;
    }
    if (isPercent && value > 100) {
      toast.error("درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد.");
      return;
    }
    if (!isPercent && value < 1000) {
      toast.error("مبلغ ثابت تخفیف باید دست‌کم ۱٫۰۰۰ تومان باشد.");
      return;
    }
    const maxUses = parseAmount(draft.maxUses);
    if (draft.expiresAt && Number.isNaN(new Date(draft.expiresAt).getTime())) {
      toast.error("تاریخ انقضا معتبر نیست.");
      return;
    }

    setSaving(true);
    try {
      const body = JSON.stringify({
        code,
        paymentType: draft.paymentType,
        valueType: draft.valueType,
        value,
        maxUses,
        expiresAt: draft.expiresAt || null,
        active: draft.active,
        note: draft.note.trim(),
      });
      if (editing) {
        await apiFetch(`/api/admin/discount-codes/${editing.id}`, {
          method: "PUT",
          body,
        });
        toast.success("کد تخفیف ویرایش شد");
      } else {
        await apiFetch("/api/admin/discount-codes", {
          method: "POST",
          body,
        });
        toast.success(`کد تخفیف «${code}» ایجاد شد`);
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-base">
            {editing ? `ویرایش کد «${editing.code}»` : "کد تخفیف جدید"}
          </DialogTitle>
          <DialogDescription className="leading-6">
            کدهای تخفیف برای پرداخت نقدی، اقساطی یا هر دو تعریف می‌شوند و
            در فرم پیش‌ثبت‌نام قابل استفاده‌اند.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dc-code" className="text-xs font-black text-foreground/90">
              متن کد
            </Label>
            <Input
              id="dc-code"
              value={draft.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              placeholder="مثلاً: AVID1404"
              dir="ltr"
              className="h-11 rounded-xl bg-foreground/[0.03] text-left font-bold tracking-wide uppercase dark:bg-white/[0.04]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black text-foreground/90">
              معتبر برای
            </Label>
            <Select
              value={draft.paymentType}
              onValueChange={(v) => {
                if (v === "") return;
                set({ paymentType: v as DiscountPaymentType });
              }}
              dir="rtl"
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(DISCOUNT_PAYMENT_TYPES) as DiscountPaymentType[]
                ).map((key) => (
                  <SelectItem key={key} value={key}>
                    {DISCOUNT_PAYMENT_TYPES[key].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black text-foreground/90">
              نوع مقدار
            </Label>
            <Select
              value={draft.valueType}
              onValueChange={(v) => {
                if (v === "") return;
                set({ valueType: v as DiscountValueType });
              }}
              dir="rtl"
            >
              <SelectTrigger className="h-11 w-full rounded-xl bg-foreground/[0.03] text-sm dark:bg-white/[0.04]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DISCOUNT_VALUE_TYPES) as DiscountValueType[]).map(
                  (key) => (
                    <SelectItem key={key} value={key}>
                      {DISCOUNT_VALUE_TYPES[key].label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="dc-value"
              className="text-xs font-black text-foreground/90"
            >
              {isPercent ? "درصد تخفیف (۱ تا ۱۰۰)" : "مبلغ تخفیف (تومان)"}
            </Label>
            <Input
              id="dc-value"
              value={draft.value}
              onChange={(e) => set({ value: e.target.value })}
              inputMode="numeric"
              placeholder={isPercent ? "15" : "500000"}
              dir="ltr"
              className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
            />
            <p className="text-[0.6rem] leading-5 text-muted-foreground">
              {DISCOUNT_VALUE_TYPES[draft.valueType].hint}
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="dc-max-uses"
              className="text-xs font-black text-foreground/90"
            >
              حداکثر استفاده
            </Label>
            <Input
              id="dc-max-uses"
              value={draft.maxUses}
              onChange={(e) => set({ maxUses: e.target.value })}
              inputMode="numeric"
              placeholder="0 = نامحدود"
              dir="ltr"
              className="h-11 rounded-xl bg-foreground/[0.03] text-left dark:bg-white/[0.04]"
            />
            <p className="text-[0.6rem] leading-5 text-muted-foreground">
              صفر یعنی بدون محدودیت — هر ثبت‌نام یک استفاده مصرف می‌کند.
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="dc-expires"
              className="text-xs font-black text-foreground/90"
            >
              تاریخ انقضا (اختیاری)
            </Label>
            <JalaliDateField
              id="dc-expires"
              value={draft.expiresAt}
              onChange={(expiresAt) => set({ expiresAt })}
              placeholder="انتخاب تاریخ — خالی یعنی بدون انقضا"
              clearable
              ariaLabel="تاریخ انقضای کد تخفیف — تقویم شمسی"
            />
            <p className="text-[0.6rem] leading-5 text-muted-foreground">
              {draft.expiresAt
                ? "برای حذف انقضا، تاریخ را با «پاک کردن» از بین ببرید."
                : "خالی یعنی بدون انقضا."}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dc-note" className="text-xs font-black text-foreground/90">
            یادداشت داخلی (اختیاری)
          </Label>
          <Textarea
            id="dc-note"
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="مثلاً: کمپین نوروز — فقط برای کارشناسان"
            rows={2}
            className="rounded-xl bg-foreground/[0.03] text-sm leading-6 dark:bg-white/[0.04]"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.02] p-3">
          <div className="space-y-0.5">
            <Label htmlFor="dc-active" className="text-sm font-bold">
              فعال
            </Label>
            <p className="text-[0.65rem] text-muted-foreground">
              کدهای غیرفعال در فرم پیش‌ثبت‌نام پذیرفته نمی‌شوند.
            </p>
          </div>
          <Switch
            id="dc-active"
            checked={draft.active}
            onCheckedChange={(v) => set({ active: v })}
          />
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            onClick={save}
            disabled={saving}
            className={`h-10 rounded-xl px-6 text-xs font-black ${btnGradient}`}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال ذخیره...
              </>
            ) : (
              <>
                <Save className="size-4" />
                {editing ? "ذخیره تغییرات" : "ایجاد کد"}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-10 rounded-xl px-6 text-xs font-bold"
          >
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  بخش کدهای تخفیف                                                    */
/* ------------------------------------------------------------------ */

function DiscountCodesSection({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setCodes(await apiFetch<DiscountCode[]>("/api/admin/discount-codes"));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let active = 0;
    let totalUses = 0;
    for (const c of codes ?? []) {
      if (c.active) active += 1;
      totalUses += c.usedCount;
    }
    return { active, total: codes?.length ?? 0, totalUses };
  }, [codes]);

  async function toggleActive(code: DiscountCode) {
    setBusyId(code.id);
    try {
      const updated = await apiFetch<DiscountCode>(
        `/api/admin/discount-codes/${code.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ active: !code.active }),
        }
      );
      setCodes((prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev
      );
      toast.success(
        updated.active
          ? `کد «${updated.code}» فعال شد`
          : `کد «${updated.code}» غیرفعال شد`
      );
      onChanged?.();
    } catch (error) {
      toastApiError(error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(code: DiscountCode) {
    try {
      await apiFetch(`/api/admin/discount-codes/${code.id}`, {
        method: "DELETE",
      });
      toast.success(`کد «${code.code}» حذف شد`);
      await load();
      onChanged?.();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /** برچسب نوع پرداخت کد */
  function payTypeMeta(c: DiscountCode) {
    const isBoth = c.paymentType === "both";
    const isInst = c.paymentType === "installment";
    return {
      label: DISCOUNT_PAYMENT_TYPES[
        (c.paymentType in DISCOUNT_PAYMENT_TYPES
          ? c.paymentType
          : "both") as DiscountPaymentType
      ].label,
      className: isBoth
        ? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:border-teal-400/25 dark:bg-teal-400/10 dark:text-teal-300"
        : isInst
          ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    };
  }

  /** وضعیت کد: فعال / غیرفعال / منقضی / تکمیل ظرفیت */
  function stateMeta(c: DiscountCode) {
    // expiresAt در سمت کلاینت رشته‌ی ISO است (JSON) — با new Date هر دو حالت پوشش داده می‌شود
    const expired =
      c.expiresAt && new Date(c.expiresAt).getTime() < Date.now();
    const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
    if (expired)
      return {
        label: "منقضی",
        className:
          "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
      };
    if (exhausted)
      return {
        label: "تکمیل ظرفیت",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
      };
    if (!c.active)
      return {
        label: "غیرفعال",
        className:
          "border-foreground/15 bg-foreground/[0.05] text-muted-foreground",
      };
    return {
      label: "فعال",
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    };
  }

  /** ردیف استفاده: «۳ از ۱۰» یا «۴ · نامحدود» */
  function usesLabel(c: DiscountCode) {
    if (c.maxUses > 0) {
      return `${faDigits(c.usedCount)} از ${faDigits(c.maxUses)}`;
    }
    return `${faDigits(c.usedCount)} · نامحدود`;
  }

  /** مقدار تخفیف به متن */
  function valueLabel(c: DiscountCode) {
    if (c.valueType === "percent") return `${faDigits(c.value)}٪`;
    return `${faAmount(c.value)} تومان`;
  }

  const showSkeleton = loading && !codes;
  const showEmpty = !showSkeleton && codes !== null && codes.length === 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 items-center justify-center rounded-xl ${tileGradient} shadow-lg shadow-violet-500/20`}
          >
            <TicketPercent className="size-5 text-white" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-foreground sm:text-base">
              کدهای تخفیف پیش‌ثبت‌نام
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              تعریف کد برای پرداخت نقدی/اقساطی + درصد یا مبلغ ثابت
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-full border-foreground/15 bg-foreground/[0.04] px-3 py-1.5 text-xs font-black tabular-nums text-muted-foreground"
          >
            {faDigits(stats.active)} فعال از {faDigits(stats.total)}
          </Badge>
          <Button
            variant="outline"
            size="icon"
            onClick={() => load()}
            disabled={loading}
            aria-label="به‌روزرسانی کدها"
            title="به‌روزرسانی"
            className="size-10 rounded-xl"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className={`h-10 rounded-xl px-5 text-xs font-black ${btnGradient}`}
          >
            <Plus className="size-4" />
            کد جدید
          </Button>
        </div>
      </div>

      {showSkeleton ? (
        <>
          <div className="hidden md:block">
            <TableSkeleton rows={4} cols={6} />
          </div>
          <div className="space-y-3 md:hidden" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
            ))}
          </div>
        </>
      ) : showEmpty ? (
        <EmptyState
          icon={BadgePercent}
          title="هنوز کد تخفیفی تعریف نشده"
          description="اولین کد تخفیف را برای پرداخت نقدی یا اقساطی پیش‌ثبت‌نام‌ها بسازید؛ کد در فرم پیش‌ثبت‌نام سایت قابل استفاده خواهد بود."
        >
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            size="sm"
            className={`rounded-xl ${btnGradient}`}
          >
            <Plus className="size-4" />
            ساخت اولین کد
          </Button>
        </EmptyState>
      ) : codes ? (
        <>
          {/* — جدول دسکتاپ — */}
          <div className="glass hidden overflow-hidden rounded-2xl md:block">
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کد</TableHead>
                    <TableHead>معتبر برای</TableHead>
                    <TableHead>مقدار</TableHead>
                    <TableHead>استفاده</TableHead>
                    <TableHead>انقضا</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead className="text-left">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((c) => {
                    const payType = payTypeMeta(c);
                    const state = stateMeta(c);
                    const busy = busyId === c.id;
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <span
                            dir="ltr"
                            className="inline-block rounded-lg bg-foreground/[0.05] px-2.5 py-1 text-xs font-black tracking-wider text-foreground dark:bg-white/[0.07]"
                          >
                            {c.code}
                          </span>
                          {c.note ? (
                            <p className="mt-1 max-w-44 truncate text-[0.6rem] text-muted-foreground">
                              {c.note}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                              payType.className
                            )}
                          >
                            {payType.label}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-bold tabular-nums text-foreground">
                          {valueLabel(c)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-bold tabular-nums text-muted-foreground">
                          {usesLabel(c)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {c.expiresAt ? (
                            <span className="flex items-center gap-1.5">
                              <CalendarDays className="size-3.5 text-teal-600/70 dark:text-teal-300/70" />
                              {faDate(c.expiresAt)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground/70">
                              <InfinityIcon className="size-3.5" />
                              بدون انقضا
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => toggleActive(c)}
                            disabled={busy}
                            aria-label={
                              c.active
                                ? `غیرفعال‌سازی ${c.code}`
                                : `فعال‌سازی ${c.code}`
                            }
                            title={c.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                            className={cn(
                              "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold transition-opacity hover:opacity-80",
                              state.className,
                              busy && "opacity-50"
                            )}
                          >
                            {busy ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : c.active ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <XCircle className="size-3" />
                            )}
                            {state.label}
                          </button>
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditing(c);
                                setDialogOpen(true);
                              }}
                              aria-label={`ویرایش ${c.code}`}
                              title="ویرایش"
                              className="size-8 rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <ConfirmDelete
                              title={`حذف کد «${c.code}»`}
                              description="این کد تخفیف برای همیشه حذف می‌شود. ثبت‌نام‌هایی که قبلاً با این کد ثبت شده‌اند دست‌نخورده می‌مانند. مطمئن هستید؟"
                              onConfirm={() => handleDelete(c)}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`حذف ${c.code}`}
                                title="حذف"
                                className="size-8 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </ConfirmDelete>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* — کارت‌های موبایل — */}
          <div className="space-y-3 md:hidden">
            {codes.map((c) => {
              const payType = payTypeMeta(c);
              const state = stateMeta(c);
              const busy = busyId === c.id;
              return (
                <article key={c.id} className="glass space-y-3 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      dir="ltr"
                      className="inline-block rounded-lg bg-foreground/[0.05] px-2.5 py-1 text-sm font-black tracking-wider text-foreground dark:bg-white/[0.07]"
                    >
                      {c.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      disabled={busy}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.65rem] font-bold",
                        state.className,
                        busy && "opacity-50"
                      )}
                    >
                      {busy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : c.active ? (
                        <CheckCircle2 className="size-3" />
                      ) : (
                        <XCircle className="size-3" />
                      )}
                      {state.label}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[0.6rem] font-bold">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1",
                        payType.className
                      )}
                    >
                      {payType.label}
                    </span>
                    <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-foreground">
                      {valueLabel(c)}
                    </span>
                    <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-muted-foreground">
                      {usesLabel(c)} استفاده
                    </span>
                    {c.expiresAt ? (
                      <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-muted-foreground">
                        انقضا: {faDate(c.expiresAt)}
                      </span>
                    ) : null}
                  </div>

                  {c.note ? (
                    <p className="text-[0.65rem] leading-5 text-muted-foreground">
                      {c.note}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-end gap-1.5 border-t border-foreground/[0.07] pt-3 dark:border-white/[0.07]">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(c);
                        setDialogOpen(true);
                      }}
                      aria-label={`ویرایش ${c.code}`}
                      title="ویرایش"
                      className="size-9 rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <ConfirmDelete
                      title={`حذف کد «${c.code}»`}
                      description="این کد تخفیف برای همیشه حذف می‌شود. مطمئن هستید؟"
                      onConfirm={() => handleDelete(c)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`حذف ${c.code}`}
                        title="حذف"
                        className="size-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </ConfirmDelete>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      <DiscountFormDialog
        editing={editing}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={load}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  ماژول اصلی «تنظیمات درگاه پرداخت»                                  */
/* ------------------------------------------------------------------ */

/**
 * ماژول «تنظیمات درگاه پرداخت» —
 * انتخاب و پیکربندی درگاه (زرین‌پال / پی‌پینگ / آزمایشی)، پیش‌فرض طرح
 * اقساطی و مدیریت کدهای تخفیف پیش‌ثبت‌نام (نقدی/اقساطی).
 */
export function PaymentModule() {
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setSettings(
        await apiFetch<PaymentSettings>("/api/admin/payment-settings")
      );
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="تنظیمات درگاه پرداخت"
        description="درگاه پرداخت (زرین‌پال / پی‌پینگ)، طرح اقساطی و کدهای تخفیف پیش‌ثبت‌نام"
      >
        {settings ? (
          <Badge
            variant="outline"
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-black",
              settings.gateway === "none"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300"
            )}
          >
            <CreditCard className="size-3.5" />
            {PAYMENT_GATEWAYS[
              settings.gateway as keyof typeof PAYMENT_GATEWAYS
            ]?.label ?? "درگاه"}
          </Badge>
        ) : (
          <Skeleton className="h-7 w-28 rounded-full" />
        )}
      </ModuleHeader>

      <GatewayCard settings={settings} onSaved={setSettings} />
      <DiscountCodesSection />
    </div>
  );
}
