# راهنمای کوتاه استقرار روی دایرکت‌ادمین (≈۱۰ دقیقه)

خلاصه‌ی عملی؛ راهنمای کامل (رفع اشکال، انتقال دیتابیس، بکاپ/بازیابی و…):
`DEPLOY.md` در ریشه‌ی پروژه.

## ۱) روی سرور — Docker

```bash
# پیش‌نیاز (یک‌بار): curl -fsSL https://get.docker.com | sh
mkdir -p /home/<user>/avid-app && cd /home/<user>/avid-app
unzip /path/to/avid-latest.zip          # محتوا در avid/ باز می‌شود
cd avid                                 # همه‌ی دستورها از داخل همین پوشه

cp .env.example .env
nano .env        # ADMIN_INITIAL_PASSWORD قوی + CHAT_AUTH_SECRET=$(openssl rand -hex 32)

docker compose config --quiet && echo OK   # اعتبارسنجی
docker compose up -d --build
docker compose ps    # web و chat باید healthy شوند
```

- رمز مدیر: همان `ADMIN_INITIAL_PASSWORD` (یا اگر خالی بود، رمز تصادفی در
  `docker compose logs migrate` چاپ می‌شود).
- برای انتقال دیتابیس نسخه‌ی قبلی، **قبل** از `up` بخش «۲-ب» در `DEPLOY.md`
  را ببینید (جای‌گذاری فایل با مالکیت bun در `/app/data/custom.db`).

## ۲) در دایرکت‌ادمین — Apache

1. **ماژول‌ها** (یک‌بار، به‌عنوان Admin):
   ```bash
   cd /usr/local/directadmin/custombuild
   ./build set apache_modules "mod_proxy mod_proxy_http mod_proxy_wstunnel mod_rewrite mod_headers"
   ./build rewrite_confs
   ```
2. **VirtualHost دامنه**: Admin Level → **Custom HTTPD Configurations** →
   دامنه → محتوای `deploy/apache/vhost-include.conf` را در VirtualHost
   قرار دهید (پروکسی `/` → 3900 و `/socket.io/` → 3004 با WebSocket).
   اگر دایرکت‌ادمین nginx_apache است: به‌جایش `deploy/nginx/vhost-proxy.conf`
   را داخل `server{}` بگذارید.
3. **گواهی TLS**: Let's Encrypt رایگان از پنل + فعال‌سازی ریدایرکت HTTPS.

## ۳) بعد از اولین ورود (`/superadmin`)

1. تغییر رمز مدیر (ماژول «حساب و امنیت» — نشست‌های قبلی باطل می‌شوند).
2. پیکربندی پیامک (ملی‌پیامک) و درگاه پرداخت (زرین‌پال/پی‌پینگ).
3. یک ویدئو/تصویر آپلود کنید و نمایش آن را ببینید.
4. تست گفتگوی زنده بین پنل مدیریت و سایت.

## سریع‌ترین سلامت‌سنجی

```bash
curl -s 127.0.0.1:3900/api/health      # {"ok":true,"db":"ok"}
ss -tlnp | grep -E '3900|3004'         # فقط 127.0.0.1
docker compose logs --tail 20 web
```
