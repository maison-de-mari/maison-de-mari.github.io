# Maison De Mari

Парфюмерный бутик в Ташкенте (t.me/Maisondemari): распив 5/10 мл и полные флаконы под заказ, заказ через Telegram.
Отдельный проект, не связан с BeautyBrand.

Сайт: https://maison-de-mari.github.io/ (организация GitHub `maison-de-mari`), публикуется GitHub Actions (`.github/workflows/pages.yml`) при каждом пуше в `main`.

## Что уже есть

- `src/data/aromas.ts` — 24 аромата: цены распива, флаконы под заказ, описания RU/UZ, номера постов канала
- `src/data/notes.ts` — пирамида нот, год, парфюмер, когда носить
- `src/data/moods.ts` — настроения: цветочные, гурманские, древесные, свежие
- `src/data/reviews.ts` — отзывы из канала бутика
- `src/data/images.json` + `public/products/` — фото ароматов
- `public/brand/` — картинки бутика, парфюмерных домов и настроений
- `src/components/scent.tsx` — анимация «шлейф аромата»
- `src/components/ui/perfume-carousel.tsx` — первый экран: круглая 3D-витрина (three.js) — флаконы по кругу на подиуме-циферблате, крутится пальцем/мышью; клик — камера подъезжает, карточка с нотами, ценой и «В корзину»
- `src/components/ui/perfume-ring/scene.ts` — сама 3D-сцена (без React)
- `src/lib/cart.ts` — корзина распива (localStorage)
- `public/bottles/` — флаконы на прозрачном фоне для витрины (Higgsfield: GPT Image 2 по фото аромата + удаление фона)

Стек: Next.js (статический экспорт) + Tailwind 4 + framer-motion + three.js. Компоненты в стиле shadcn лежат в `src/components/ui/`.

Локально: `npm run dev`. Сборка для Pages: `STATIC_EXPORT=1 npm run build` → `out/`.
