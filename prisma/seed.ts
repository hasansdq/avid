import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'crypto'

const prisma = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  // ---------- تنظیمات سایت ----------
  await prisma.siteSettings.upsert({
    where: { id: 'main' },
    update: {},
    create: {
      id: 'main',
      siteName: 'آوید',
      tagline: 'آکادمی مهارت‌های آینده',
      slogan: 'یادگیری هر مهارتی، سرمایه‌ی شما در آینده است',
      logoUrl: '/images/logo.png',
      studentsCount: 270,
      completedCoursesCount: 13,
      rating: 4.9,
      supportHours: 'شنبه تا جمعه، ۹ صبح تا ۱۸',
    },
  })

  // ---------- مدیر (بدون رمز عبور ثابت) ----------
  // رمز مدیر از ADMIN_INITIAL_PASSWORD خوانده می‌شود؛ اگر تنظیم نشده یا کوتاه بود
  // رمز تصادفی تولید و در کنسول چاپ می‌شود. تغییر رمز از ماژول «حساب و امنیت» ممکن است.
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim() ?? ''
  const existingAdmin = await prisma.adminUser.findFirst()
  if (!existingAdmin) {
    let password = adminPassword
    let generated = false
    if (password.length < 8) {
      password = randomBytes(12).toString('hex')
      generated = true
    }
    await prisma.adminUser.create({
      data: {
        username: 'admin',
        passwordHash: hashPassword(password),
      },
    })
    if (generated) {
      console.warn('⚠ ADMIN_INITIAL_PASSWORD تنظیم نشده بود؛ رمز تصادفی برای مدیر «admin» تولید شد:')
      console.warn(`   ${password}`)
      console.warn('   آن را ذخیره کنید و بعد از ورود از ماژول «حساب و امنیت» عوض کنید.')
    }
  }

  // ---------- دوره‌ها ----------
  const courseCount = await prisma.course.count()
  if (courseCount === 0) {
    await prisma.course.createMany({
      data: [
        {
          title: 'هوش مصنوعی و یادگیری ماشین',
          description: 'از مبانی ML و شبکه‌های عصبی تا ساخت و استقرار مدل‌های واقعی.',
          category: 'هوش مصنوعی',
          type: 'online',
          level: 'پیشرفته',
          hours: 42,
          sessions: 24,
          price: 3500000,
          cashTuition: 12000000,
          installmentTuition: 14400000,
          students: 68,
          icon: 'Bot',
          theme: 'teal',
          tag: 'پرمخاطب',
          sortOrder: 1,
        },
        {
          title: 'طراحی و توسعه وب',
          description: 'HTML، CSS، JavaScript و React برای ساخت سایت‌های مدرن و واکنش‌گرا.',
          category: 'برنامه‌نویسی',
          type: 'online',
          level: 'مقدماتی',
          hours: 36,
          sessions: 20,
          price: 2800000,
          cashTuition: 10000000,
          installmentTuition: 12000000,
          students: 92,
          icon: 'Code',
          theme: 'violet',
          sortOrder: 2,
        },
        {
          title: 'کامپیوتر و برنامه‌نویسی کودکان',
          description: 'یادگیری بازی‌محور برنامه‌نویسی و تفکر الگوریتمی برای ۷ تا ۱۴ سال.',
          category: 'کودکان',
          type: 'inperson',
          level: 'مقدماتی',
          hours: 24,
          sessions: 16,
          price: 1900000,
          cashTuition: 8000000,
          installmentTuition: 9600000,
          capacity: 14,
          schedule: 'شنبه و سه‌شنبه، ۱۶ تا ۱۸',
          students: 45,
          icon: 'Gamepad2',
          theme: 'amber',
          tag: 'ویژه کودکان',
          sortOrder: 3,
        },
        {
          title: 'برنامه‌نویسی پایتون',
          description: 'زبان همه‌کاره پایتون از صفر تا ساخت ربات، اسکریپت و اپلیکیشن.',
          category: 'برنامه‌نویسی',
          type: 'online',
          level: 'مقدماتی',
          hours: 30,
          sessions: 18,
          price: 2400000,
          cashTuition: 9000000,
          installmentTuition: 10800000,
          students: 77,
          icon: 'Terminal',
          theme: 'emerald',
          sortOrder: 4,
        },
        {
          title: 'طراحی گرافیک و UI/UX',
          description: 'اصول طراحی، فیگما و تجربه کاربری برای ساخت رابط‌های حرفه‌ای.',
          category: 'طراحی',
          type: 'inperson',
          level: 'متوسط',
          hours: 28,
          sessions: 15,
          price: 2600000,
          cashTuition: 11000000,
          installmentTuition: 13200000,
          capacity: 12,
          schedule: 'دوشنبه و چهارشنبه، ۱۷ تا ۱۹',
          students: 54,
          icon: 'Palette',
          theme: 'fuchsia',
          sortOrder: 5,
        },
        {
          title: 'امنیت و شبکه',
          description: 'امنیت سایبری، نفوذ اخلاقی و مدیریت شبکه‌های سازمانی به صورت عملی.',
          category: 'امنیت',
          type: 'inperson',
          level: 'پیشرفته',
          hours: 34,
          sessions: 19,
          price: 3200000,
          cashTuition: 13000000,
          installmentTuition: 15600000,
          capacity: 10,
          schedule: 'یکشنبه و پنجشنبه، ۱۸ تا ۲۰',
          students: 31,
          icon: 'ShieldCheck',
          theme: 'rose',
          sortOrder: 6,
        },
        {
          title: 'تحلیل داده و اکسل',
          description: 'اکسل پیشرفته، Power BI و تحلیل داده برای تصمیم‌گیری هوشمند.',
          category: 'داده',
          type: 'online',
          level: 'متوسط',
          hours: 26,
          sessions: 14,
          price: 2200000,
          cashTuition: 8500000,
          installmentTuition: 10200000,
          students: 48,
          icon: 'ChartColumnBig',
          theme: 'lime',
          sortOrder: 7,
        },
        {
          title: 'دیجیتال مارکتینگ',
          description: 'سئو، تبلیغات، شبکه‌های اجتماعی و استراتژی رشد برند در فضای دیجیتال.',
          category: 'بازاریابی',
          type: 'online',
          level: 'مقدماتی',
          hours: 22,
          sessions: 12,
          price: 0,
          cashTuition: 0,
          installmentTuition: 0,
          students: 63,
          icon: 'TrendingUp',
          theme: 'orange',
          tag: 'رایگان',
          sortOrder: 8,
        },
      ],
    })
  }

  // ---------- ویدئوها ----------
  const videoCount = await prisma.video.count()
  if (videoCount === 0) {
    await prisma.video.createMany({
      data: [
        {
          title: 'هوش مصنوعی چیست؟ شروع سفر به دنیای آینده',
          description: 'آشنایی با مفاهیم پایه AI، یادگیری ماشین و کاربردهای آن در زندگی روزمره.',
          url: 'https://www.youtube.com/watch?v=ukzFI9rgwfU',
          thumbnail: '/images/video-ai.png',
          duration: '۱۸:۴۲',
          views: 12400,
          level: 'مقدماتی',
          sortOrder: 1,
        },
        {
          title: 'اولین سایت خودت را بساز!',
          description: 'در یک ویدئو، ساخت یک صفحه وب کامل و زیبا با HTML و CSS را یاد بگیر.',
          url: '',
          thumbnail: '/images/video-web.png',
          duration: '۲۴:۱۵',
          views: 9800,
          level: 'مقدماتی',
          sortOrder: 2,
        },
        {
          title: 'برنامه‌نویسی بازی برای کودکان',
          description: 'ساخت اولین بازی رایانه‌ای با بلوک‌های رنگی و منطق برنامه‌نویسی.',
          url: '',
          thumbnail: '/images/video-kids.png',
          duration: '۱۲:۳۰',
          views: 15600,
          level: 'ویژه کودکان',
          sortOrder: 3,
        },
      ],
    })
  }

  console.log('Seed completed ✔')
  console.log('  - site: آوید')
  console.log('  - admin: بدون رمز ثابت — هنگام ساخت از ADMIN_INITIAL_PASSWORD یا رمز تصادفی استفاده می‌شود')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
