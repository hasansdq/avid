-- نمره‌ی کسب‌شده‌ی هر سوال + نمره‌ی نهایی دستی/خودکار در پاسخ‌برگه‌های آزمون
-- grades: JSON نقشه‌ی questionId → نمره‌ی کسب‌شده (اولیه = خودکار، ویرایش توسط مدیر)
-- scoreManual: true = نمره‌ی نهایی دستی؛ false = جمع خودکار نمره‌ی سوالات
ALTER TABLE "ExamAttempt" ADD COLUMN "grades" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ExamAttempt" ADD COLUMN "scoreManual" BOOLEAN NOT NULL DEFAULT false;
