"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Link2,
  Loader2,
  PanelBottom,
  PanelTop,
  Pencil,
  Plus,
  Rocket,
  Save,
  Trash2,
  TriangleAlert,
  Type,
  type LucideIcon,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { ConfirmDelete } from "@/components/admin/shared/confirm-delete";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { FontPicker } from "@/components/admin/shared/font-picker";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import { PublishSwitch } from "@/components/admin/shared/publish-switch";
import { btnGradient } from "@/components/admin/shared/styles";
import type {
  ModuleProps,
  NavLink,
  SiteSettings,
} from "@/components/admin/types";
import { faDigits } from "@/lib/fa";
import { cn } from "@/lib/utils";

/* — انواع و ثابت‌ها — */

type LinkSection = "header" | "footer";
type LinkKind = "internal" | "external";

/** فرم لینک — همه‌ی ورودی‌های متنی رشته هستند و هنگام ذخیره تبدیل می‌شوند */
interface LinkForm {
  label: string;
  kind: LinkKind;
  /** مقدار مقصد داخلی انتخاب‌شده یا «custom» برای مسیر دلخواه */
  preset: string;
  /** مسیر داخلی دلخواه (مثل /about یا #section) */
  path: string;
  /** آدرس کامل لینک خارجی */
  externalUrl: string;
  openInNewTab: boolean;
  isButton: boolean;
  published: boolean;
  sortOrder: string;
}

/** پیش‌نویس فونت‌های هدر و فوتر */
interface FontDraft {
  headerFont: string;
  footerFont: string;
}

/** کلید فونت پیش‌فرض (وزیرمتن) — برای مقدار اولیه‌ی انتخابگرها */
const DEFAULT_FONT_KEY = "vazirmatn";

/** مقصدهای داخلی پیشنهادی برای انتخاب سریع */
const INTERNAL_PRESETS: { value: string; label: string }[] = [
  { value: "#home", label: "خانه" },
  { value: "#courses", label: "دوره‌ها" },
  { value: "#register", label: "ثبت‌نام" },
  { value: "#videos", label: "ویدئوها" },
  { value: "#testimonials", label: "نظرات کاربران" },
  { value: "/register", label: "صفحه‌ی ثبت‌نام" },
];

const SECTION_META: Record<
  LinkSection,
  {
    title: string;
    description: string;
    previewLabel: string;
    emptyTitle: string;
    icon: LucideIcon;
  }
> = {
  header: {
    title: "بخش هدر",
    description: "لینک‌های منوی ناوبری و دکمه‌ی برجسته (CTA) نوار بالای سایت",
    previewLabel: "پیش‌نمایش نوار بالای سایت",
    emptyTitle: "هنوز لینکی در هدر ثبت نشده است",
    icon: PanelTop,
  },
  footer: {
    title: "بخش فوتر",
    description: "لینک‌های ستون «دسترسی سریع» پاورقی سایت",
    previewLabel: "پیش‌نمایش ستون «دسترسی سریع»",
    emptyTitle: "هنوز لینکی در فوتر ثبت نشده است",
    icon: PanelBottom,
  },
};

/* — زیرکامپوننت‌های نمایشی — */

/** نوار پیش‌نمایش زنده — لینک‌ها به شکلی که در سایت دیده می‌شوند (فقط بصری) */
function PreviewStrip({
  section,
  links,
  primaryCtaId,
}: {
  section: LinkSection;
  links: NavLink[];
  primaryCtaId: string | undefined;
}) {
  const menuLinks = links.filter((l) => !l.isButton);
  const cta = links.find((l) => l.id === primaryCtaId);

  return (
    <div className="rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] p-3.5 dark:border-white/[0.07] dark:bg-white/[0.02]">
      <p className="mb-2.5 text-[0.65rem] font-bold text-muted-foreground">
        {SECTION_META[section].previewLabel}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {menuLinks.map((l) => (
          <span
            key={l.id}
            className={cn(
              "rounded-full border border-foreground/10 bg-foreground/[0.04] px-3 py-1 text-xs font-semibold text-muted-foreground",
              !l.published && "opacity-50 line-through"
            )}
            title={l.published ? l.label : `${l.label} — پنهان از سایت`}
          >
            {l.label}
            {l.kind === "external" ? (
              <ExternalLink className="ms-1 inline size-3 align-middle" />
            ) : null}
          </span>
        ))}
        {cta ? (
          <span className="flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-teal-400 to-emerald-500 px-4 py-1.5 text-xs font-bold text-teal-950 shadow-lg shadow-teal-500/25">
            <Rocket className="size-3.5" />
            {cta.label}
          </span>
        ) : null}
        {links.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            لینکی برای نمایش وجود ندارد
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** یک ردیف لینک در فهرست بخش */
function LinkRow({
  link,
  section,
  index,
  total,
  primaryCtaId,
  movingId,
  onEdit,
  onMove,
  onToggle,
  onDelete,
}: {
  link: NavLink;
  section: LinkSection;
  index: number;
  total: number;
  primaryCtaId: string | undefined;
  movingId: string | null;
  onEdit: (link: NavLink) => void;
  onMove: (link: NavLink, dir: -1 | 1) => void;
  onToggle: (link: NavLink, next: boolean) => void;
  onDelete: (link: NavLink) => Promise<void>;
}) {
  const isMoving = movingId === link.id;
  const lockMoves = movingId !== null;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3 sm:flex-row sm:items-center dark:bg-white/[0.02]">
      {/* کنترل ترتیب */}
      <div className="flex items-center gap-1.5">
        <span
          className="min-w-6 text-center text-[0.65rem] font-black text-muted-foreground"
          title="ترتیب فعلی"
        >
          {faDigits(link.sortOrder)}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-lg"
          disabled={index === 0 || lockMoves}
          onClick={() => onMove(link, -1)}
          aria-label={`انتقال لینک «${link.label}» به بالا`}
          title="انتقال به بالا"
        >
          {isMoving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-lg"
          disabled={index === total - 1 || lockMoves}
          onClick={() => onMove(link, 1)}
          aria-label={`انتقال لینک «${link.label}» به پایین`}
          title="انتقال به پایین"
        >
          <ArrowDown className="size-4" />
        </Button>
      </div>

      {/* برچسب، نشان‌ها و آدرس */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-black text-foreground">
            {link.label}
          </span>
          {link.kind === "external" ? (
            <Badge className="rounded-full border-0 bg-violet-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
              خارجی
            </Badge>
          ) : (
            <Badge className="rounded-full border-0 bg-teal-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">
              داخلی
            </Badge>
          )}
          {link.target === "blank" ? (
            <Badge className="rounded-full border-0 bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
              تب جدید
            </Badge>
          ) : null}
          {section === "header" && link.isButton ? (
            link.id === primaryCtaId ? (
              <Badge className="rounded-full border-0 bg-emerald-500/15 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                CTA اصلی
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="rounded-full border-foreground/10 bg-foreground/[0.04] px-2 py-0.5 text-[0.6rem] font-bold text-muted-foreground"
              >
                دکمه
              </Badge>
            )
          ) : null}
        </div>
        <span
          dir="ltr"
          className="mt-1 flex items-center gap-1.5 truncate text-left text-[0.7rem] text-muted-foreground"
          title={link.url}
        >
          {link.kind === "external" ? (
            <ExternalLink className="size-3 shrink-0" />
          ) : (
            <Link2 className="size-3 shrink-0" />
          )}
          {link.url || "—"}
        </span>
      </div>

      {/* وضعیت انتشار و عملیات */}
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <PublishSwitch
          published={link.published}
          onToggle={(next) => onToggle(link, next)}
          disabled={isMoving}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(link)}
            aria-label={`ویرایش لینک ${link.label}`}
            title="ویرایش"
          >
            <Pencil className="size-4" />
          </Button>
          <ConfirmDelete
            title="حذف لینک"
            description={`لینک «${link.label}» برای همیشه حذف می‌شود. مطمئن هستید؟`}
            onConfirm={() => onDelete(link)}
          >
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`حذف لینک ${link.label}`}
              title="حذف"
            >
              <Trash2 className="size-4" />
            </Button>
          </ConfirmDelete>
        </div>
      </div>
    </li>
  );
}

/** کارک یک بخش (هدر یا فوتر) — پیش‌نمایش + فهرست لینک‌ها */
function LinksSection({
  section,
  links,
  movingId,
  onAdd,
  onEdit,
  onMove,
  onToggle,
  onDelete,
}: {
  section: LinkSection;
  links: NavLink[];
  movingId: string | null;
  onAdd: (section: LinkSection) => void;
  onEdit: (link: NavLink) => void;
  onMove: (link: NavLink, dir: -1 | 1) => void;
  onToggle: (link: NavLink, next: boolean) => void;
  onDelete: (link: NavLink) => Promise<void>;
}) {
  const meta = SECTION_META[section];
  const buttonLinks = links.filter((l) => l.isButton);
  const primaryCtaId = buttonLinks.find((l) => l.published)?.id;

  return (
    <section
      className="glass space-y-4 rounded-2xl p-5 sm:p-6"
      aria-labelledby={`hf-section-${section}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 shadow-lg shadow-teal-500/20">
            <meta.icon className="size-5 text-white" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2
              id={`hf-section-${section}`}
              className="text-sm font-black text-foreground sm:text-base"
            >
              {meta.title}
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {meta.description} · {faDigits(links.length)} لینک
            </p>
          </div>
        </div>
        <Button
          onClick={() => onAdd(section)}
          size="sm"
          className={`rounded-xl ${btnGradient}`}
        >
          <Plus className="size-4" />
          افزودن لینک
        </Button>
      </div>

      <PreviewStrip section={section} links={links} primaryCtaId={primaryCtaId} />

      {/* هشدار چند دکمه‌ای بودن CTA هدر — فقط اولین دکمه در سایت رندر می‌شود */}
      {section === "header" && buttonLinks.length > 1 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[0.7rem] leading-5 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            فقط اولین لینکِ دکمه‌ایِ فعال به‌عنوان دکمه‌ی اصلی (CTA) هدر نمایش
            داده می‌شود؛ لینک‌های دکمه‌ایِ دیگر در سایت نمایش داده نمی‌شوند.
          </p>
        </div>
      ) : null}

      {links.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-10 text-center">
          <meta.icon
            className="size-6 text-muted-foreground"
            strokeWidth={1.8}
          />
          <p className="text-sm font-bold text-foreground">{meta.emptyTitle}</p>
          <Button
            size="sm"
            onClick={() => onAdd(section)}
            className={`rounded-xl ${btnGradient}`}
          >
            <Plus className="size-4" />
            افزودن اولین لینک
          </Button>
        </div>
      ) : (
        <ul className="max-h-[70vh] space-y-2.5 overflow-y-auto pe-1">
          {links.map((link, index) => (
            <LinkRow
              key={link.id}
              link={link}
              section={section}
              index={index}
              total={links.length}
              primaryCtaId={primaryCtaId}
              movingId={movingId}
              onEdit={onEdit}
              onMove={onMove}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** فیلد فرم با برچسب و راهنما */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-[0.7rem] leading-5 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/* — ماژول اصلی — */

/**
 * ماژول «ویرایش هدر و فوتر» — مدیریت لینک‌ها و دکمه‌های هدر و فوتر سایت
 * + انتخاب فونت هدر و فوتر (ذخیره در تنظیمات سایت).
 */
export function HeaderFooterModule({ setActive }: ModuleProps) {
  const [links, setLinks] = useState<NavLink[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSection, setDialogSection] = useState<LinkSection>("header");
  const [editing, setEditing] = useState<NavLink | null>(null);
  const [form, setForm] = useState<LinkForm | null>(null);
  const [saving, setSaving] = useState(false);

  const [movingId, setMovingId] = useState<string | null>(null);

  const [fontDraft, setFontDraft] = useState<FontDraft | null>(null);
  const [fontSaved, setFontSaved] = useState<FontDraft | null>(null);
  const [fontsLoading, setFontsLoading] = useState(true);
  const [savingFonts, setSavingFonts] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLinks(await apiFetch<NavLink[]>("/api/admin/nav-links"));
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFonts = useCallback(async () => {
    try {
      setFontsLoading(true);
      const settings = await apiFetch<SiteSettings>("/api/admin/settings");
      const next: FontDraft = {
        headerFont: settings.headerFont || DEFAULT_FONT_KEY,
        footerFont: settings.footerFont || DEFAULT_FONT_KEY,
      };
      setFontDraft(next);
      setFontSaved(next);
    } catch (error) {
      toastApiError(error);
    } finally {
      setFontsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadFonts();
  }, [loadFonts]);

  const headerLinks = links?.filter((l) => l.section === "header") ?? [];
  const footerLinks = links?.filter((l) => l.section === "footer") ?? [];

  const fontDirty =
    fontDraft !== null &&
    fontSaved !== null &&
    (fontDraft.headerFont !== fontSaved.headerFont ||
      fontDraft.footerFont !== fontSaved.footerFont);

  const set = <K extends keyof LinkForm>(key: K, value: LinkForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const setFont = (key: keyof FontDraft, value: string) => {
    setFontDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  /* — فرم ایجاد/ویرایش — */

  function openCreate(section: LinkSection) {
    const sectionLinks = links?.filter((l) => l.section === section) ?? [];
    const nextOrder =
      sectionLinks.length > 0
        ? Math.max(...sectionLinks.map((l) => l.sortOrder)) + 1
        : 1;
    setEditing(null);
    setDialogSection(section);
    setForm({
      label: "",
      kind: "internal",
      preset: "#home",
      path: "",
      externalUrl: "",
      openInNewTab: false,
      isButton: false,
      published: true,
      sortOrder: String(nextOrder),
    });
    setDialogOpen(true);
  }

  function openEdit(link: NavLink) {
    const kind: LinkKind = link.kind === "external" ? "external" : "internal";
    const isPreset =
      kind === "internal" && INTERNAL_PRESETS.some((p) => p.value === link.url);
    setEditing(link);
    setDialogSection(link.section === "footer" ? "footer" : "header");
    setForm({
      label: link.label,
      kind,
      preset: kind === "internal" ? (isPreset ? link.url : "custom") : "#home",
      path: kind === "internal" && !isPreset ? link.url : "",
      externalUrl: kind === "external" ? link.url : "",
      openInNewTab: link.target === "blank",
      isButton: link.isButton,
      published: link.published,
      sortOrder: String(link.sortOrder),
    });
    setDialogOpen(true);
  }

  /** تغییر نوع مقصد — لینک خارجی همیشه در تب جدید باز می‌شود */
  function switchKind(kind: LinkKind) {
    setForm((prev) =>
      prev
        ? { ...prev, kind, openInNewTab: kind === "external" ? true : prev.openInNewTab }
        : prev
    );
  }

  async function handleSave() {
    if (!form || saving) return;

    const label = form.label.trim();
    if (label.length < 2 || label.length > 60) {
      toast.error("برچسب لینک باید بین ۲ تا ۶۰ نویسه باشد.");
      return;
    }

    let url: string;
    if (form.kind === "internal") {
      url = (form.preset === "custom" ? form.path : form.preset).trim();
      if (!url.startsWith("/") && !url.startsWith("#")) {
        toast.error("آدرس داخلی باید با «/» یا «#» شروع شود.");
        return;
      }
      if (url.length > 300) {
        toast.error("آدرس داخلی حداکثر می‌تواند ۳۰۰ نویسه باشد.");
        return;
      }
    } else {
      url = form.externalUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        toast.error("آدرس خارجی باید با http یا https شروع شود.");
        return;
      }
      if (url.length > 500) {
        toast.error("آدرس خارجی حداکثر می‌تواند ۵۰۰ نویسه باشد.");
        return;
      }
    }

    const sortOrder = Math.max(0, Math.round(Number(form.sortOrder)) || 0);
    const target: string =
      form.kind === "external" ? "blank" : form.openInNewTab ? "blank" : "same";

    const payload = {
      label,
      section: dialogSection,
      url,
      kind: form.kind,
      target,
      isButton: dialogSection === "header" && form.isButton,
      published: form.published,
      sortOrder,
    };

    setSaving(true);
    try {
      if (editing) {
        await apiFetch<NavLink>(`/api/admin/nav-links/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("لینک با موفقیت ویرایش شد");
      } else {
        await apiFetch<NavLink>("/api/admin/nav-links", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("لینک جدید ایجاد شد");
      }
      setDialogOpen(false);
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  }

  /* — عملیات ردیف‌ها — */

  /** تغییر ترتیب: جابه‌جایی با همسایه و بازشماری ۱..n کل بخش */
  async function moveLink(link: NavLink, dir: -1 | 1) {
    if (!links || movingId) return;
    const sectionLinks = links.filter((l) => l.section === link.section);
    const idx = sectionLinks.findIndex((l) => l.id === link.id);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= sectionLinks.length) return;

    const reordered = [...sectionLinks];
    [reordered[idx], reordered[targetIdx]] = [
      reordered[targetIdx],
      reordered[idx],
    ];

    // فقط لینک‌هایی که ترتیبشان واقعاً تغییر کرده به‌روزرسانی می‌شوند
    const updates = reordered
      .map((l, i) => ({ id: l.id, next: i + 1, prev: l.sortOrder }))
      .filter((u) => u.next !== u.prev);
    if (updates.length === 0) return;

    setMovingId(link.id);
    try {
      await Promise.all(
        updates.map((u) =>
          apiFetch(`/api/admin/nav-links/${u.id}`, {
            method: "PUT",
            body: JSON.stringify({ sortOrder: u.next }),
          })
        )
      );
      toast.success("ترتیب لینک‌ها به‌روزرسانی شد");
      await load();
    } catch (error) {
      toastApiError(error);
    } finally {
      setMovingId(null);
    }
  }

  /** تغییر انتشار با به‌روزرسانی خوش‌بینانه و بازگشت در صورت خطا */
  async function togglePublish(link: NavLink, next: boolean) {
    if (!links) return;
    setLinks(
      (prev) =>
        prev?.map((l) => (l.id === link.id ? { ...l, published: next } : l)) ??
        prev
    );
    try {
      await apiFetch<NavLink>(`/api/admin/nav-links/${link.id}`, {
        method: "PUT",
        body: JSON.stringify({ published: next }),
      });
      toast.success(
        next ? "لینک در سایت نمایش داده می‌شود" : "لینک از سایت پنهان شد"
      );
    } catch (error) {
      setLinks(
        (prev) =>
          prev?.map(
            (l) => (l.id === link.id ? { ...l, published: link.published } : l)
          ) ?? prev
      );
      toastApiError(error);
    }
  }

  async function handleDelete(link: NavLink) {
    try {
      await apiFetch(`/api/admin/nav-links/${link.id}`, { method: "DELETE" });
      toast.success(`لینک «${link.label}» حذف شد`);
      await load();
    } catch (error) {
      toastApiError(error);
      throw error;
    }
  }

  /* — ذخیره فونت‌ها — */

  async function handleSaveFonts() {
    if (!fontDraft || savingFonts) return;
    setSavingFonts(true);
    try {
      const updated = await apiFetch<SiteSettings>("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          headerFont: fontDraft.headerFont,
          footerFont: fontDraft.footerFont,
        }),
      });
      const next: FontDraft = {
        headerFont: updated.headerFont || DEFAULT_FONT_KEY,
        footerFont: updated.footerFont || DEFAULT_FONT_KEY,
      };
      setFontDraft(next);
      setFontSaved(next);
      toast.success("فونت‌های هدر و فوتر ذخیره شد");
    } catch (error) {
      toastApiError(error);
    } finally {
      setSavingFonts(false);
    }
  }

  /* — رندر — */

  return (
    <div className="space-y-6 pb-4">
      <ModuleHeader
        title="ویرایش هدر و فوتر"
        description="مدیریت لینک‌ها و دکمه‌های هدر و فوتر سایت — اتصال به صفحات داخلی یا لینک‌های خارجی"
      />

      {loading && !links ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="glass h-72 animate-pulse rounded-2xl" />
          ))}
          <div className="glass h-64 animate-pulse rounded-2xl" />
        </div>
      ) : !links ? (
        <EmptyState
          icon={PanelTop}
          title="دریافت لینک‌ها ناموفق بود"
          description="برای نمایش لینک‌های هدر و فوتر دوباره تلاش کنید."
        >
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="rounded-xl"
          >
            تلاش مجدد
          </Button>
        </EmptyState>
      ) : (
        <>
          <LinksSection
            section="header"
            links={headerLinks}
            movingId={movingId}
            onAdd={openCreate}
            onEdit={openEdit}
            onMove={moveLink}
            onToggle={togglePublish}
            onDelete={handleDelete}
          />
          <LinksSection
            section="footer"
            links={footerLinks}
            movingId={movingId}
            onAdd={openCreate}
            onEdit={openEdit}
            onMove={moveLink}
            onToggle={togglePublish}
            onDelete={handleDelete}
          />
        </>
      )}

      {/* فونت هدر و فوتر */}
      <section
        className="glass space-y-5 rounded-2xl p-5 sm:p-6"
        aria-labelledby="hf-fonts-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 shadow-lg shadow-violet-500/20">
              <Type className="size-5 text-white" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h2
                id="hf-fonts-title"
                className="text-sm font-black text-foreground sm:text-base"
              >
                فونت هدر و فوتر
              </h2>
              <p className="text-xs leading-5 text-muted-foreground">
                فونت نوار بالای سایت و پاورقی — از بین فونت‌های نصب‌شده‌ی سایت
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-xs font-bold"
            onClick={() => setActive("fonts")}
          >
            <Type className="size-4" />
            کتابخانه‌ی فونت‌ها
          </Button>
        </div>

        {fontsLoading && !fontDraft ? (
          <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-border bg-foreground/[0.02]">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : !fontDraft ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-foreground/[0.02] py-10 text-center">
            <Type
              className="size-6 text-muted-foreground"
              strokeWidth={1.8}
            />
            <p className="text-sm font-bold text-foreground">
              دریافت فونت‌های فعلی ناموفق بود
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadFonts}
              className="rounded-xl"
            >
              تلاش مجدد
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <Field
              label="فونت هدر (نوار بالای سایت)"
              htmlFor="hf-header-font"
              hint="فونتی که لوگو، منوی ناوبری و دکمه‌ی نوار بالای سایت با آن نمایش داده می‌شود."
            >
              <FontPicker
                value={fontDraft.headerFont}
                onChange={(v) => setFont("headerFont", v)}
                disabled={savingFonts}
              />
            </Field>
            <Field
              label="فونت فوتر (پاورقی)"
              htmlFor="hf-footer-font"
              hint="فونت متن‌ها و ستون‌های پاورقی سایت."
            >
              <FontPicker
                value={fontDraft.footerFont}
                onChange={(v) => setFont("footerFont", v)}
                disabled={savingFonts}
              />
            </Field>
          </div>
        )}
      </section>

      {/* نوار ذخیره فونت‌ها */}
      {fontDraft ? (
        <div className="glass sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            {fontDirty
              ? "تغییرات فونت ذخیره‌نشده دارید."
              : "فونت‌ها پس از رفرش صفحه‌ی اصلی اعمال می‌شوند."}
          </p>
          <Button
            onClick={handleSaveFonts}
            disabled={!fontDirty || savingFonts}
            className={`h-10 w-full rounded-xl sm:w-auto ${btnGradient}`}
          >
            {savingFonts ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {savingFonts ? "در حال ذخیره..." : "ذخیره فونت‌ها"}
          </Button>
        </div>
      ) : null}

      {/* دیالوگ ایجاد/ویرایش لینک */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          dir="rtl"
          className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-xl"
        >
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle className="text-base">
              {editing
                ? "ویرایش لینک"
                : `افزودن لینک به ${dialogSection === "header" ? "هدر" : "فوتر"}`}
            </DialogTitle>
            <DialogDescription>
              برچسب و مقصد لینک را مشخص کنید؛ لینک‌های داخلی به بخش‌های سایت و
              لینک‌های خارجی به سایت‌های دیگر متصل می‌شوند.
            </DialogDescription>
          </DialogHeader>

          {form ? (
            <div className="space-y-4">
              <Field label="برچسب لینک" htmlFor="nav-label">
                <Input
                  id="nav-label"
                  value={form.label}
                  onChange={(e) => set("label", e.target.value)}
                  placeholder="مثلاً: وبلاگ"
                  maxLength={60}
                />
              </Field>

              <div className="space-y-2">
                <Label>نوع مقصد</Label>
                <Tabs
                  value={form.kind}
                  onValueChange={(v) =>
                    switchKind(v === "external" ? "external" : "internal")
                  }
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="internal" className="flex-1">
                      <Link2 className="size-4" />
                      صفحه داخلی
                    </TabsTrigger>
                    <TabsTrigger value="external" className="flex-1">
                      <ExternalLink className="size-4" />
                      لینک خارجی
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {form.kind === "internal" ? (
                <div className="space-y-4">
                  <Field
                    label="مقصد پیشنهادی"
                    htmlFor="nav-preset"
                    hint="مقصدهای رایج سایت یا «مسیر دلخواه…» برای آدرس سفارشی."
                  >
                    <Select
                      value={form.preset}
                      onValueChange={(v) => {
                        if (v === "") return;
                        set("preset", v);
                      }}
                    >
                      <SelectTrigger id="nav-preset" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERNAL_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className="flex items-center justify-between gap-3">
                              <span>{p.label}</span>
                              <span
                                dir="ltr"
                                className="text-[0.65rem] text-muted-foreground"
                              >
                                {p.value}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">مسیر دلخواه…</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {form.preset === "custom" ? (
                    <Field
                      label="مسیر دلخواه"
                      htmlFor="nav-path"
                      hint="باید با «/» (صفحه) یا «#» (بخشی از صفحه‌ی اصلی) شروع شود — مثلاً /about یا #courses"
                    >
                      <Input
                        id="nav-path"
                        dir="ltr"
                        className="text-left"
                        value={form.path}
                        onChange={(e) => set("path", e.target.value)}
                        placeholder="/about"
                      />
                    </Field>
                  ) : null}
                </div>
              ) : (
                <Field
                  label="آدرس خارجی"
                  htmlFor="nav-external"
                  hint="باید با http:// یا https:// شروع شود؛ لینک‌های خارجی همیشه در تب جدید باز می‌شوند."
                >
                  <Input
                    id="nav-external"
                    dir="ltr"
                    className="text-left"
                    value={form.externalUrl}
                    onChange={(e) => set("externalUrl", e.target.value)}
                    placeholder="https://example.com"
                  />
                </Field>
              )}

              <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]">
                <div className="space-y-0.5">
                  <Label htmlFor="nav-blank" className="text-sm font-bold">
                    باز شدن در تب جدید
                  </Label>
                  <p className="text-[0.65rem] leading-4 text-muted-foreground">
                    لینک‌های خارجی همیشه در تب جدید باز می‌شوند.
                  </p>
                </div>
                <Switch
                  id="nav-blank"
                  checked={form.kind === "external" || form.openInNewTab}
                  disabled={form.kind === "external"}
                  onCheckedChange={(v) => set("openInNewTab", v)}
                />
              </div>

              {dialogSection === "header" ? (
                <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]">
                  <div className="space-y-0.5">
                    <Label htmlFor="nav-button" className="text-sm font-bold">
                      نمایش به‌شکل دکمه برجسته
                    </Label>
                    <p className="text-[0.65rem] leading-4 text-muted-foreground">
                      دکمه‌ی CTA هدر؛ اولین لینکِ دکمه‌ای به‌عنوان دکمه‌ی اصلی
                      هدر نمایش داده می‌شود.
                    </p>
                  </div>
                  <Switch
                    id="nav-button"
                    checked={form.isButton}
                    onCheckedChange={(v) => set("isButton", v)}
                  />
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="ترتیب نمایش"
                  htmlFor="nav-sortOrder"
                  hint="عدد کوچک‌تر = ابتدای لیست"
                >
                  <Input
                    id="nav-sortOrder"
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(e) => set("sortOrder", e.target.value)}
                  />
                </Field>
                <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.02] p-3 dark:bg-white/[0.02]">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="nav-published"
                      className="text-sm font-bold"
                    >
                      نمایش در سایت
                    </Label>
                    <p className="text-[0.65rem] leading-4 text-muted-foreground">
                      لینک‌های غیرفعال فقط در پنل دیده می‌شوند.
                    </p>
                  </div>
                  <Switch
                    id="nav-published"
                    checked={form.published}
                    onCheckedChange={(v) => set("published", v)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              onClick={handleSave}
              disabled={saving}
              className={`rounded-xl ${btnGradient}`}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "ذخیره تغییرات" : "افزودن لینک"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="rounded-xl"
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
