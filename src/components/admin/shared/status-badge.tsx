import { Badge } from "@/components/ui/badge";
import { ENROLLMENT_STATUSES, type EnrollmentStatus } from "@/lib/course-theme";

/** نشان وضعیت ثبت‌نام (رنگ‌بندی از رجیستری مشترک) */
export function StatusBadge({ status }: { status: EnrollmentStatus }) {
  const meta = ENROLLMENT_STATUSES[status];
  return (
    <Badge
      variant="outline"
      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[0.65rem] font-bold ${meta.badge}`}
    >
      {meta.label}
    </Badge>
  );
}
