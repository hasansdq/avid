# تست‌های دستی سندباکس (E2E استریم)

این اسکریپت‌ها بخشی از بیلد نیستند — ابزار آزمایش دستی در سندباکس‌اند.

## پیش‌نیاز: کرومیوم با دوربین/میکروفون جعلی (CDP)

`--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream`
(بدون فلگ دوم، مجوز دوربین در headless رد می‌شود و «شروع پخش» خطا می‌دهد):

```bash
python3 scripts/daemon-launch.py /tmp /tmp/chrome-fake.log \
  ~/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome \
  --remote-debugging-port=9222 \
  --use-fake-device-for-media-stream \
  --use-fake-ui-for-media-stream \
  --no-sandbox --disable-gpu --headless=new about:blank
```

## پیش‌نیاز: استریم تستی در دیتابیس

```bash
sqlite3 db/custom.db "INSERT OR REPLACE INTO LiveStream (id,title,description,status,hostId,inviteSlug,createdAt,updatedAt) VALUES ('teststream001','کلاس تست اتصال استریم','test','scheduled',NULL,NULL,strftime('%s','now')*1000,strftime('%s','now')*1000);"
sqlite3 db/custom.db "INSERT OR REPLACE INTO StreamInvitation (id,streamId,courseId,courseTitle,classId,createdAt) VALUES ('testinv001','teststream001',(SELECT id FROM Course WHERE title='دیجیتال مارکتینگ'),'دیجیتال مارکتینگ',NULL,strftime('%s','now')*1000);"
```

دانشجوی تست باید در دوره‌ی دعوت‌شده ثبت‌نام کرده باشد (۰۹۱۲۱۱۱۲۲۳۳ → «دیجیتال مارکتینگ»).

## اجرا

```bash
bun tests/e2e-stream2.ts   # سناریوی کامل: استاد دسکتاپ + دانشجوی موبایل (نمایش افقی) + کنترل‌های موبایل استاد
bun tests/e2e-light.ts     # سناریوی سبک: چت دوطرفه + کنترل‌های موبایل استاد
bun tests/debug-pc.ts      # عیب‌یابی WebRTC (رویدادهای pc/ontrack/ice در صفحه)
```

نکته‌ها:
- هر اجرا باید با کرومیوم تازه شروع شود (دستگاه جعلی محدود است؛ تب‌های باقی‌مانده باعث
  «صدا بدون تصویر» می‌شوند).
- سرویس استریم زombi ناشرها را تا ~۳۵ ثانیه بعد از بستن تب نگه می‌دارد؛ برای اتاق تمیز
  سرویس را ری‌استارت کن.
- اسکرین‌شات‌ها در `docs/screenshots/` ذخیره می‌شوند. کرومیوم headless ویدئوی داخل
  المان چرخیده (transform) در اسکرین‌شات سیاه می‌کشد — رندر واقعی را با
  `debug-pc.ts` (readyState/videoWidth) تأیید کن.
