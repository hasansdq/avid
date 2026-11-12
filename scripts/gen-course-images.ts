/**
 * اسکریپت یکبار مصرف: تولید تصویر جلد برای ۸ دوره‌ی فعلی آوید
 * سبک یکسان: تصویرسازی سه‌بعدی مدرن، پس‌زمینه تیره، اکسنت رنگی هماهنگ با تم دوره، بدون متن
 * خروجی: public/uploads/course-<slug>.png (1344x768)
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "public", "uploads");

const COURSES: { slug: string; prompt: string }[] = [
  {
    slug: "ai-ml",
    prompt:
      "Modern 3D illustration of artificial intelligence and machine learning concept, glowing teal neural network brain made of connected nodes and data streams, floating holographic charts and chips, dark deep background with teal and emerald accent lighting, clean minimal composition, no text, no letters, high quality, detailed, professional online course cover",
  },
  {
    slug: "security-network",
    prompt:
      "Modern 3D illustration of cybersecurity and computer networking concept, glowing shield with padlock floating above a network topology of connected servers and nodes, teal and cyan accent lighting on dark deep background, subtle circuit lines, clean minimal composition, no text, no letters, high quality, detailed, professional online course cover",
  },
  {
    slug: "web-dev",
    prompt:
      "Modern 3D illustration of web design and development concept, floating browser windows with colorful abstract UI blocks, code brackets and layered website mockups, violet and purple accent lighting on dark deep background, clean minimal composition, no text, no letters, high quality, detailed, professional online course cover",
  },
  {
    slug: "kids-coding",
    prompt:
      "Cheerful 3D illustration of children learning computer programming, cute friendly robot character surrounded by colorful toy-like coding blocks and playful game elements, warm amber and orange tones, soft bright background, fun inviting mood for kids academy, clean minimal composition, no text, no letters, high quality, detailed, course cover",
  },
  {
    slug: "python",
    prompt:
      "Modern 3D illustration of Python programming language concept, stylized glossy snake coiled around a floating terminal window with abstract glowing code lines, emerald green accent lighting on dark deep background, clean minimal composition, no text, no letters, high quality, detailed, professional online course cover",
  },
  {
    slug: "design-uiux",
    prompt:
      "Modern 3D illustration of graphic design and UI/UX concept, floating color palette with brush, pen tool and vector bezier shapes, layered design artboards, fuchsia pink and purple accent lighting on dark deep background, creative studio vibe, clean minimal composition, no text, no letters, high quality, detailed, professional course cover",
  },
  {
    slug: "data-excel",
    prompt:
      "Modern 3D illustration of data analysis and spreadsheet concept, glowing bar charts and pie charts rising from a grid of spreadsheet cells, magnifying lens over data points, lime green accent lighting on dark deep background, clean minimal composition, no text, no letters, high quality, detailed, professional online course cover",
  },
  {
    slug: "digital-marketing",
    prompt:
      "Modern 3D illustration of digital marketing concept, glossy megaphone with rising engagement charts, floating shopping cart, heart like icons and growth arrow, orange coral and warm yellow accent lighting on dark deep background, clean minimal composition, no text, no letters, high quality, detailed, professional online course cover",
  },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();

  for (const { slug, prompt } of COURSES) {
    const out = path.join(OUT_DIR, `course-${slug}.png`);
    if (fs.existsSync(out) && fs.statSync(out).size > 10_000) {
      console.log(`↷ skip (exists): ${out}`);
      continue;
    }
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const res = await zai.images.generations.create({
          prompt,
          size: "1344x768",
        });
        const b64 = res.data?.[0]?.base64;
        if (!b64) throw new Error("empty base64");
        fs.writeFileSync(out, Buffer.from(b64, "base64"));
        console.log(`✓ saved ${out} (${fs.statSync(out).size} bytes)`);
        ok = true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`✗ attempt ${attempt} for ${slug}: ${message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
