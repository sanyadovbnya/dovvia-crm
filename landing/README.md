# Dovvia Landing Page

Two static HTML files for `getdovvia.com`. No build step — just upload to
your WHM `public_html`.

## Files

- `index.html` — Russian (default; primary for Instagram traffic from
  the Russian-speaking US market). `<html lang="ru">`.
- `en.html` — English. `<html lang="en">`.
- Each page links to the other via the `RU`/`EN` toggle in the nav.

## Upload (cPanel / WHM)

1. cPanel → File Manager → `public_html` of `getdovvia.com`
2. Upload `index.html` and `en.html` (drag-and-drop the files, or zip
   the `landing/` folder and Extract)
3. Verify `https://getdovvia.com/` shows Russian and
   `https://getdovvia.com/en.html` shows English

If `app.getdovvia.com` is on a different host than `getdovvia.com`
(apex), no DNS change needed — they're independent.

## What you need to fill in

Search each HTML file for `TODO:` comments. There are placeholders for:

1. **Hero dashboard screenshot** — replace the `placeholder-img` div
   under the hero with `<img src="/assets/dashboard.png" alt="..."
   class="rounded-2xl shadow-pop" />`
2. **Demo video** — replace the second `placeholder-img` div with a
   YouTube embed or `<video src="..." controls poster="..." />`
3. **Mike's photo** — replace the gradient circle with `M` initial
   with `<img src="/assets/mike.jpg" class="h-12 w-12 rounded-full
   object-cover" />`
4. **Your founder photo** — replace the round `placeholder-img` div
   with `<img src="/assets/alex.jpg" class="h-32 w-32 rounded-full
   object-cover mx-auto" />`
5. **Calendly URL** — replace `https://calendly.com/YOUR-CALENDLY-LINK/15min`
   with your actual Calendly link (search `YOUR-CALENDLY-LINK` in both
   files — appears once in each)
6. **OG image** (optional) — `og-image.png` in `/assets/` is what
   shows when the link is shared on Instagram, WhatsApp, Telegram, etc.
   1200×630 png with the brand orange + a screenshot is ideal.

## Editing copy

Both files are vanilla HTML — open in any text editor, edit any text,
upload the modified file. No compile step.

## Brand consistency

Tailwind is loaded via CDN with a config that mirrors the app's brand
colors (orange/brand, gray/ink, etc). If you tweak `app/tailwind.config.js`
later, mirror the change in the inline `tailwind.config = {...}` block
at the top of each landing HTML so the marketing site doesn't drift.
