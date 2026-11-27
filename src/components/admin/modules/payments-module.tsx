"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Inbox,
  Phone,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { apiFetch, toastApiError } from "@/components/admin/api";
import { EmptyState } from "@/components/admin/shared/empty-state";
import { InstallmentsDialog } from "@/components/admin/shared/installments-dialog";
import { UserPaymentsDialog } from "@/components/admin/shared/user-payments-dialog";
import {
  CashPaymentsSection,
  useCashPayments,
} from "@/components/admin/shared/cash-payments";
import { ModuleHeader } from "@/components/admin/shared/module-header";
import {
  InstallmentsOverviewStats,
  RecentPaidSection,
  RemainingSection,
  faAmount,
  useInstallmentsOverview,
} from "@/components/admin/shared/installments-overview";
import { TableSkeleton } from "@/components/admin/shared/table-skeleton";
import { tileGradient } from "@/components/admin/shared/styles";
import type {
  EnrollmentWithInstallments,
  User,
  UserWithStats,
} from "@/components/admin/types";
import { faDigits } from "@/lib/fa";

/**
 * ماژول «پرداختی‌ها» — خانه‌ی همه‌ی موارد مالی کاربران (زیرمجموعه‌ی
 * «کاربران و ثبت‌نام»):
 *  • خلاصه‌ی وضعیت اقساط کاربران (کارت‌های آماری)
 *  • همه‌ی اقساط باقیمانده کاربران + ثبت دستی پرداخت
 *  • اقساط پرداخت‌شده‌ی اخیر
 *  • پرداخت‌های نقدی (یک‌جا) + ویرایش دستی مبلغ/وضعیت
 *  • وضعیت اقساط هر کاربر + دیالوگ پرداختی‌ها و مدیریت اقساط
 */

/** پاسخ GET /api/admin/users?payments=has */
interface UsersListResponse {
  users: UserWithStats[];
  total: number;
  page: number;
  pageCount: number;
}

/** نام نمایشی کاربر (یا شماره‌ی او اگر نامی نداشت) */
function displayName(
  u: Pick<User, "firstName" | "lastName" | "phone">
): string {
  const name = `${u.firstName} ${u.lastName}`.trim();
  return name || faDigits(u.phone);
}

/** نشان شمارنده‌ی کوچک کنار عنوان تب‌های ماژول */
function TabPill({
  count,
  tone,
}: {
  count: number | undefined;
  tone: "emerald" | "amber" | "violet" | "teal";
}) {
  const tones = {
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    teal: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  } as const;
  if (count === undefined) {
    return (
      <span
        aria-hidden
        className="size-3.5 shrink-0 animate-pulse rounded-full bg-foreground/10"
      />
    );
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-black tabular-nums",
        tones[tone]
      )}
    >
      {faDigits(count)}
    </span>
  );
}

export function PaymentsModule() {
  /* — نمای کلی اقساط (خلاصه + اقساط اخیر/باقیمانده) — */
  const overview = useInstallmentsOverview();

  /* — پرداخت‌های نقدی (ثبت‌نام‌های یک‌جا) — */
  const cash = useCashPayments();

  /* — فهرست کاربران دارای پرداخت/اقساط (وضعیت اقساط هر کاربر) — */
  const [users, setUsers] = useState<UserWithStats[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");

  /* — دیالوگ پرداختی‌ها و اقساط یک کاربر + مدیریت اقساط یک ثبت‌نام — */
  const [paymentsUser, setPaymentsUser] = useState<User | null>(null);
  const [installmentsTarget, setInstallmentsTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  /* — جست‌وجو با تأخیر — */
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  /** دریافت کاربران دارای پرداخت/اقساط بر اساس فیلترها */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        payments: "has",
      });
      if (query) params.set("q", query);
      const data = await apiFetch<UsersListResponse>(
        `/api/admin/users?${params.toString()}`
      );
      setUsers(data.users);
      setTotal(data.total);
      setPageCount(data.pageCount);
      // اگر صفحه‌ی فعلی بعد از فیلتر خالی شده باشد، به آخرین صفحه برگرد
      if (data.users.length === 0 && data.page > data.pageCount) {
        setPage(data.pageCount);
      }
    } catch (error) {
      toastApiError(error);
    } finally {
      setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  /** باز کردن مدیریت اقساط از داخل دیالوگ پرداختی کاربر */
  function manageInstallments(enrollment: EnrollmentWithInstallments) {
    setPaymentsUser(null);
    setInstallmentsTarget({ id: enrollment.id, title: enrollment.course });
  }

  /** تازه‌سازی کامل — فهرست کاربران + نمای کلی اقساط + پرداخت‌های نقدی */
  function refreshAll() {
    void load();
    overview.reload(true);
    void cash.reload(true);
  }

  /** تغییر وضعیت یک پرداخت نقدی — به‌روزرسانی خوش‌بینانه + تازه‌سازی بی‌صدا */
  function handleCashStatusChanged(id: string, status: string) {
    cash.updateStatus(id, status);
    void cash.reload(true);
  }

  const showSkeleton = loading && !users;
  const showEmpty = !showSkeleton && users !== null && users.length === 0;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="پرداختی‌ها"
        description="پرداخت‌های نقدی، وضعیت اقساط کاربران، اقساط باقیمانده و پرداخت‌های اخیر — تسویه‌ی دستی و مدیریت پرداخت‌های هر کاربر"
      >
        <Badge
          variant="outline"
          className="rounded-full border-foreground/15 bg-foreground/[0.04] px-3.5 py-1.5 text-xs font-black tabular-nums text-muted-foreground"
        >
          {faDigits(cash.stats.total)} پرداخت نقدی
        </Badge>
        <Badge
          variant="outline"
          className="rounded-full border-foreground/15 bg-foreground/[0.04] px-3.5 py-1.5 text-xs font-black tabular-nums text-muted-foreground"
        >
          {faDigits(total)} کاربر دارای پرداخت
        </Badge>
      </ModuleHeader>

      {/* — خلاصه‌ی وضعیت اقساط (سربرگ + کارت‌های آماری) — ثابت بالای تب‌ها — */}
      <InstallmentsOverviewStats
        data={overview.data}
        loading={overview.loading}
        refreshing={overview.refreshing}
        onRefresh={() => overview.reload(true)}
      />

      {/* — تب‌های ماژول: اقساط باقیمانده / اقساط پرداخت‌شده‌ی اخیر / وضعیت اقساط کاربران — */}
      <Tabs defaultValue="remaining" dir="rtl" className="gap-5">
        <TabsList className="glass h-auto w-full flex-wrap justify-start gap-1 rounded-2xl p-1.5 sm:w-auto">
          <TabsTrigger
            value="remaining"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <Hourglass className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            اقساط باقیمانده
            <TabPill count={overview.data?.remaining.length} tone="amber" />
          </TabsTrigger>
          <TabsTrigger
            value="recent-paid"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            اقساط پرداخت‌شده‌ی اخیر
            <TabPill count={overview.data?.recentPaid.length} tone="emerald" />
          </TabsTrigger>
          <TabsTrigger
            value="cash"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <Banknote className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
            پرداخت‌های نقدی
            <TabPill count={cash.payments?.length} tone="teal" />
          </TabsTrigger>
          <TabsTrigger
            value="users"
            className="flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <Users className="size-4 shrink-0 text-violet-600 dark:text-violet-300" />
            وضعیت اقساط کاربران
            <TabPill count={total} tone="violet" />
          </TabsTrigger>
        </TabsList>

        {/* — تب «همه‌ی اقساط باقیمانده کاربران» (پیش‌فرض) — */}
        <TabsContent value="remaining">
          <RemainingSection
            data={overview.data}
            onChanged={() => overview.reload(true)}
          />
        </TabsContent>

        {/* — تب «اقساط پرداخت‌شده‌ی اخیر» — */}
        <TabsContent value="recent-paid">
          <RecentPaidSection data={overview.data} />
        </TabsContent>

        {/* — تب «پرداخت‌های نقدی» (یک‌جا) — */}
        <TabsContent value="cash">
          <CashPaymentsSection
            payments={cash.payments}
            stats={cash.stats}
            loading={cash.loading}
            refreshing={cash.refreshing}
            onReload={() => void cash.reload(true)}
            onStatusChanged={handleCashStatusChanged}
          />
        </TabsContent>

        {/* — تب «وضعیت اقساط کاربران»: جست‌وجو + جدول/کارت‌ها + صفحه‌بندی — */}
        <TabsContent value="users" className="space-y-5">
          {/* — فیلترها: جست‌وجو + به‌روزرسانی — */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="جستجوی نام یا شماره موبایل..."
                aria-label="جستجوی کاربر دارای پرداخت"
                className="h-11 rounded-xl bg-foreground/[0.03] pr-10 text-sm dark:bg-white/[0.04]"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => load()}
              disabled={loading}
              aria-label="به‌روزرسانی فهرست"
              title="به‌روزرسانی"
              className="h-11 rounded-xl px-4 font-bold"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              <span className="sm:hidden">به‌روزرسانی</span>
            </Button>
          </div>

          {/* — جدول (دسکتاپ) + کارت (موبایل) — */}
          {showSkeleton ? (
            <>
              <div className="hidden md:block">
                <TableSkeleton rows={6} cols={4} />
              </div>
              <div className="space-y-3 md:hidden" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="glass h-28 animate-pulse rounded-2xl" />
                ))}
              </div>
            </>
          ) : showEmpty ? (
            <EmptyState
              icon={Inbox}
              title="کاربر دارای پرداختی یافت نشد"
              description={
                query
                  ? "با این جست‌وجو کاربری دارای پرداخت یا اقساط وجود ندارد؛ عبارت دیگری را امتحان کنید."
                  : "هنوز کاربری پرداخت یا قسطی ثبت نکرده است — با ثبت‌نام اقساطی کاربران، اینجا نمایش داده می‌شوند."
              }
            />
          ) : users ? (
            <>
              {/* — جدول دسکتاپ — */}
              <div className="glass hidden overflow-hidden rounded-2xl md:block">
                <div className="max-h-[70vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>کاربر</TableHead>
                        <TableHead>وضعیت اقساط</TableHead>
                        <TableHead>مبلغ پرداخت‌شده</TableHead>
                        <TableHead>مانده‌ی اقساط</TableHead>
                        <TableHead className="text-left">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => {
                        const instTotal = u.installmentPaid + u.installmentPending;
                        const remainingAmount =
                          u.installmentTotalAmount - u.installmentPaidAmount;
                        return (
                          <TableRow key={u.id}>
                            <TableCell className="max-w-44">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white ${tileGradient} shadow-md`}
                                  aria-hidden
                                >
                                  {displayName(u).charAt(0)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-foreground">
                                    {displayName(u)}
                                  </p>
                                  <a
                                    href={`tel:${u.phone}`}
                                    dir="ltr"
                                    className="flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 transition-colors hover:underline dark:text-teal-300 dark:hover:text-teal-200"
                                    title="تماس با کاربر"
                                  >
                                    <Phone className="size-3" />
                                    {faDigits(u.phone)}
                                  </a>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {instTotal > 0 ? (
                                <p className="whitespace-nowrap text-xs font-bold tabular-nums text-foreground">
                                  {faDigits(u.installmentPaid)}
                                  <span className="text-muted-foreground">
                                    {" "}
                                    / {faDigits(instTotal)}
                                  </span>
                                  <span className="ms-1.5 text-[0.6rem] font-medium text-muted-foreground">
                                    قسط
                                  </span>
                                </p>
                              ) : (
                                <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-xs font-bold text-muted-foreground">
                                  بدون اقساط
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <p className="text-xs font-bold tabular-nums text-foreground">
                                {u.installmentTotalAmount > 0 ? (
                                  <>
                                    {faAmount(u.installmentPaidAmount)}
                                    <span className="text-[0.6rem] font-medium text-muted-foreground">
                                      {" "}
                                      از {faAmount(u.installmentTotalAmount)} تومان
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground/50">—</span>
                                )}
                              </p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {u.installmentPending > 0 ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-bold tabular-nums text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                                  <Hourglass className="size-3" />
                                  {faAmount(remainingAmount)} تومان
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                                  <CheckCircle2 className="size-3" />
                                  تسویه‌شده
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-left">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setPaymentsUser(u)}
                                aria-label={`پرداختی‌ها و اقساط ${displayName(u)}`}
                                title="پرداختی‌ها و اقساط"
                                className="size-8 text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:hover:bg-violet-400/10 dark:hover:text-violet-200"
                              >
                                <Wallet className="size-4" />
                              </Button>
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
                {users.map((u) => {
                  const instTotal = u.installmentPaid + u.installmentPending;
                  const remainingAmount =
                    u.installmentTotalAmount - u.installmentPaidAmount;
                  return (
                    <article key={u.id} className="glass space-y-3 rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-black text-white ${tileGradient} shadow-md`}
                          aria-hidden
                        >
                          {displayName(u).charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-foreground">
                            {displayName(u)}
                          </p>
                          <a
                            href={`tel:${u.phone}`}
                            dir="ltr"
                            className="mt-0.5 flex w-fit items-center justify-start gap-1 text-xs font-semibold text-teal-600 dark:text-teal-300"
                            title="تماس با کاربر"
                          >
                            <Phone className="size-3" />
                            {faDigits(u.phone)}
                          </a>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPaymentsUser(u)}
                          aria-label={`پرداختی‌ها و اقساط ${displayName(u)}`}
                          title="پرداختی‌ها و اقساط"
                          className="size-8 shrink-0 text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-300 dark:hover:bg-violet-400/10 dark:hover:text-violet-200"
                        >
                          <Wallet className="size-4" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[0.6rem] font-bold">
                        {instTotal > 0 ? (
                          <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-foreground">
                            اقساط {faDigits(u.installmentPaid)} از {faDigits(instTotal)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-muted-foreground">
                            بدون اقساط
                          </span>
                        )}
                        {u.installmentTotalAmount > 0 ? (
                          <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 tabular-nums text-muted-foreground">
                            {faAmount(u.installmentPaidAmount)} از{" "}
                            {faAmount(u.installmentTotalAmount)} تومان
                          </span>
                        ) : null}
                        {u.installmentPending > 0 ? (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 tabular-nums text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                            مانده: {faAmount(remainingAmount)} تومان
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300">
                            تسویه‌شده
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* — صفحه‌بندی — */}
              {pageCount > 1 && (
                <nav
                  aria-label="صفحه‌بندی کاربران دارای پرداخت"
                  className="flex items-center justify-between gap-3"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-10 rounded-xl px-5 text-xs font-bold"
                  >
                    <ChevronRight className="size-4" />
                    قبلی
                  </Button>
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">
                    صفحه‌ی {faDigits(page)} از {faDigits(pageCount)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount || loading}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    className="h-10 rounded-xl px-5 text-xs font-bold"
                  >
                    بعدی
                    <ChevronLeft className="size-4" />
                  </Button>
                </nav>
              )}
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* — دیالوگ پرداختی‌ها و اقساط کاربر (تب وضعیت اقساط کاربران) — */}
      <UserPaymentsDialog
        user={paymentsUser}
        open={!!paymentsUser}
        onOpenChange={(o) => {
          if (!o) setPaymentsUser(null);
        }}
        onManageInstallments={manageInstallments}
        onChanged={refreshAll}
      />

      {/* — دیالوگ مدیریت اقساط (از دیالوگ پرداختی کاربر باز می‌شود) — */}
      {installmentsTarget ? (
        <InstallmentsDialog
          enrollmentId={installmentsTarget.id}
          enrollmentTitle={installmentsTarget.title}
          open={!!installmentsTarget}
          onOpenChange={(o) => {
            if (!o) setInstallmentsTarget(null);
          }}
          onChanged={refreshAll}
        />
      ) : null}
    </div>
  );
}
