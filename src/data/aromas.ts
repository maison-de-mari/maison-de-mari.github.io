/**
 * Ароматы Maison De Mari (t.me/Maisondemari).
 * Распив (5/10 мл) — цены в сумах, оформляется через корзину; bottle — полный флакон под заказ (в долларах).
 * usd — только флаконы под заказ, цена в долларах, заказ сразу в Telegram.
 * post — номер поста в канале бутика. Фото — в images.json по slug.
 */
import images from "./images.json";

export type Aroma = {
  slug: string;
  brand: string;
  name: string;
  /** Цена распива (минимальная), сум; у флаконов под заказ — 0 */
  price: number;
  variants?: { label: string; price: number }[];
  usd?: { label: string; usd: number }[];
  bottle?: string;
  /** цена не указана — уточняется в Telegram */
  ask?: boolean;
  description: { ru: string; uz: string };
  post: number;
};

export type AromaWithImages = Aroma & { images: string[] };

const ml = (p5: number, p10?: number) =>
  p10 ? [{ label: "5 ml", price: p5 }, { label: "10 ml", price: p10 }] : [{ label: "10 ml", price: p5 }];

const list: Aroma[] = [
  {
    slug: "louis-vuitton-moon-tale",
    brand: "Louis Vuitton",
    name: "Moon Tale",
    price: 360_000,
    variants: ml(360_000, 720_000),
    bottle: "100 ml — 550 $",
    description: {
      ru: "Пион, магнолия, жасмин самбак, малина и розовая герань — светлый, сочный цветочный аромат.",
      uz: "Pion, magnoliya, sambak yasmini, malina va pushti geran — yorqin, shirali gulli atir.",
    },
    post: 441,
  },
  {
    slug: "orto-parisi-boccanera",
    brand: "Orto Parisi",
    name: "Boccanera",
    price: 470_000,
    variants: ml(470_000),
    description: {
      ru: "Перец, имбирь и корица с шоколадом, ванилью и пачули — тёмный, соблазнительный, тёплый шлейф.",
      uz: "Qalampir, zanjabil va dolchin shokolad, vanil va pachuli bilan — qorong‘i, jozibali, iliq iz.",
    },
    post: 656,
  },
  {
    slug: "maison-crivelli-cuir-infrarouge",
    brand: "Maison Crivelli",
    name: "Cuir Infrarouge",
    price: 375_000,
    variants: ml(375_000, 750_000),
    description: {
      ru: "Сладкая малина, тёплая корица и глубокие кожаные аккорды — смелый чувственный аромат.",
      uz: "Shirin malina, iliq dolchin va chuqur teri akkordlari — dadil hissiyotli atir.",
    },
    post: 652,
  },
  {
    slug: "creed-spring-flower",
    brand: "Creed",
    name: "Spring Flower",
    price: 225_000,
    variants: ml(225_000, 450_000),
    description: {
      ru: "Сочные фрукты, роза и лёгкие цветы — нежный, романтичный, элегантный аромат.",
      uz: "Shirali mevalar, atirgul va yengil gullar — nozik, romantik, nafis atir.",
    },
    post: 649,
  },
  {
    slug: "versace-cedrat-de-diamante",
    brand: "Versace",
    name: "Cédrat de Diamante",
    price: 235_000,
    variants: ml(235_000, 470_000),
    description: {
      ru: "Искрящийся цитрус с древесными и фужерными оттенками — свежий, чистый, благородный.",
      uz: "Yog‘och va fujer tuslari bilan chaqnoq sitrus — tetik, toza, nafis.",
    },
    post: 659,
  },
  {
    slug: "gritti-tutu",
    brand: "Gritti",
    name: "Tutù",
    price: 130_000,
    variants: ml(130_000, 260_000),
    bottle: "100 ml — 195 $",
    description: {
      ru: "Сочная малина, сливочные аккорды и цветы — сладкий, нежный, очень женственный аромат.",
      uz: "Shirali malina, qaymoqli akkordlar va gullar — shirin, nozik, juda ayollarga xos atir.",
    },
    post: 434,
  },
  {
    slug: "ysl-libre-berry-crush",
    brand: "YSL",
    name: "Libre Berry Crush",
    price: 195_000,
    variants: ml(195_000, 390_000),
    description: {
      ru: "Сладкая малина и цветы в фирменном стиле Libre — яркий, чувственный, запоминающийся шлейф.",
      uz: "Libre uslubidagi shirin malina va gullar — yorqin, hissiyotli, esda qoladigan iz.",
    },
    post: 425,
  },
  {
    slug: "byredo-animalique",
    brand: "Byredo",
    name: "Animalique",
    price: 195_000,
    variants: ml(195_000, 390_000),
    bottle: "Флакон — 250 $",
    description: {
      ru: "Цитрус, мимоза и фиалка на тёплой коже и амбре — для тех, кто любит выделяться.",
      uz: "Iliq teri va ambra ustida sitrus, mimoza va binafsha — ajralib turishni yoqtiradiganlar uchun.",
    },
    post: 429,
  },
  {
    slug: "louis-vuitton-lv-lovers",
    brand: "Louis Vuitton",
    name: "LV Lovers",
    price: 325_000,
    variants: ml(325_000, 650_000),
    bottle: "100 ml — 440 $",
    description: {
      ru: "Гальбанум, бергамот и имбирь на сандале и кедре — солнечный древесный аромат.",
      uz: "Sandal va kedr ustida galbanum, bergamot va zanjabil — quyoshli yog‘och atir.",
    },
    post: 457,
  },
  {
    slug: "bvlgari-le-gemme-tygar",
    brand: "Bvlgari",
    name: "Le Gemme Tygar",
    price: 260_000,
    variants: ml(260_000, 520_000),
    bottle: "60 ml — 320 $",
    description: {
      ru: "Сочный грейпфрут, пряный имбирь и тёплое дерево — харизматичный статусный аромат.",
      uz: "Shirali greypfrut, achchiq zanjabil va iliq yog‘och — xarizmatik maqomli atir.",
    },
    post: 553,
  },
  {
    slug: "parfums-de-marly-althair",
    brand: "Parfums de Marly",
    name: "Althaïr",
    price: 125_000,
    variants: ml(125_000, 250_000),
    description: {
      ru: "Корица, кардамон и бурбонская ваниль с пралине и засахаренным миндалём — тёплый гурманский аромат.",
      uz: "Dolchin, kardamon va burbon vanili praline va qandli bodom bilan — iliq gurman atir.",
    },
    post: 594,
  },
  {
    slug: "reservation-riviera-californienne",
    brand: "Riviera Californienne",
    name: "Reservation",
    price: 300_000,
    variants: ml(300_000, 600_000),
    bottle: "100 ml — 470 $",
    description: {
      ru: "Кофе, пряности и амбра с морской свежестью и ванилью — глубокий согревающий шлейф.",
      uz: "Dengiz tetikligi va vanil bilan qahva, ziravorlar va ambra — chuqur iliq iz.",
    },
    post: 620,
  },
  {
    slug: "phlur-vanilla-skin",
    brand: "Phlur",
    name: "Vanilla Skin",
    price: 165_000,
    variants: ml(165_000, 330_000),
    bottle: "Флакон под заказ — 210 $",
    description: {
      ru: "Кремовая ваниль и мягкое дерево — тёплый уютный аромат, словно объятие.",
      uz: "Qaymoqli vanil va yumshoq yog‘och — quchoqdek iliq va qulay atir.",
    },
    post: 503,
  },
  {
    slug: "zielinski-rozen-tobacco-cedarwood-pepper",
    brand: "Zielinski & Rozen",
    name: "Tobacco, Cedarwood & Pepper",
    price: 180_000,
    variants: ml(180_000, 360_000),
    bottle: "50 ml — 170 $",
    description: {
      ru: "Табак, кедр и перец — тёплый пряный древесный унисекс с лёгкой дымкой.",
      uz: "Tamaki, kedr va qalampir — yengil tutunli iliq achchiq yog‘och uniseks.",
    },
    post: 472,
  },
  {
    slug: "zielinski-rozen-bergamot-green-tea-sandalwood",
    brand: "Zielinski & Rozen",
    name: "Bergamot, Green Tea & Sandalwood",
    price: 180_000,
    variants: ml(180_000, 360_000),
    bottle: "50 ml — 170 $",
    description: {
      ru: "Бергамот, зелёный чай и сандал — чистый, лёгкий и уютный аромат.",
      uz: "Bergamot, ko‘k choy va sandal — toza, yengil va qulay atir.",
    },
    post: 469,
  },
  {
    slug: "essential-parfums-bois-imperial",
    brand: "Essential Parfums",
    name: "Bois Impérial",
    price: 130_000,
    variants: [...ml(130_000, 260_000), { label: "100 ml", price: 1_900_000 }],
    description: {
      ru: "Свежий древесно-пряный унисекс: звучит дорого, чисто и элегантно, стойкий.",
      uz: "Tetik yog‘och-achchiq uniseks: qimmat, toza va nafis jaranglaydi, bardoshli.",
    },
    post: 449,
  },
  // ——— флаконы под заказ (цена в $) ———
  {
    slug: "tom-ford-tobacco-vanille",
    brand: "Tom Ford",
    name: "Tobacco Vanille",
    price: 0,
    usd: [{ label: "50 ml", usd: 260 }, { label: "100 ml", usd: 310 }],
    description: {
      ru: "Пряный табак, сладкая ваниль, какао и сухофрукты — тёплая обволакивающая классика.",
      uz: "Achchiq tamaki, shirin vanil, kakao va quritilgan mevalar — iliq o‘rab oluvchi klassika.",
    },
    post: 624,
  },
  {
    slug: "creed-wild-vetiver",
    brand: "Creed",
    name: "Wild Vetiver",
    price: 0,
    usd: [{ label: "100 ml", usd: 440 }],
    description: {
      ru: "Бергамот, розовый перец и роза на ветивере и кедре — свежий цитрусово-фужерный аромат.",
      uz: "Vetiver va kedr ustida bergamot, pushti qalampir va atirgul — tetik sitrus-fujer atir.",
    },
    post: 492,
  },
  {
    slug: "amouage-purpose-50",
    brand: "Amouage",
    name: "Purpose 50",
    price: 0,
    usd: [{ label: "100 ml", usd: 450 }],
    description: {
      ru: "Древесные, пряные и смолистые оттенки — глубокий благородный восточный аромат.",
      uz: "Yog‘och, achchiq va qatronli tuslar — chuqur nafis sharqona atir.",
    },
    post: 465,
  },
  {
    slug: "penhaligons-halfeti-leather",
    brand: "Penhaligon’s",
    name: "Halfeti Leather",
    price: 0,
    usd: [{ label: "100 ml", usd: 340 }],
    description: {
      ru: "Слива, кардамон и роза на коже, уде и ладане — пряный кожаный унисекс.",
      uz: "Teri, ud va ladan ustida olxo‘ri, kardamon va atirgul — achchiq teri uniseks.",
    },
    post: 523,
  },
  {
    slug: "hormone-paris-this-is-not-caffeine",
    brand: "Hormone Paris",
    name: "This is Not Caffeine",
    price: 0,
    usd: [{ label: "100 ml", usd: 210 }],
    description: {
      ru: "Карамель, кокос, кофе и ваниль — восточный гурманский аромат.",
      uz: "Karamel, kokos, qahva va vanil — sharqona gurman atir.",
    },
    post: 488,
  },
  {
    slug: "guerlain-nerolia-vetiver-set",
    brand: "Guerlain",
    name: "Nerolia Vetiver Set",
    price: 0,
    usd: [{ label: "75 + 7,5 + 75 ml", usd: 130 }],
    description: {
      ru: "Набор: нероли, ветивер, базилик и инжир — свежий древесно-цветочный аромат.",
      uz: "To‘plam: neroli, vetiver, rayhon va anjir — tetik yog‘och-gulli atir.",
    },
    post: 519,
  },
  // ——— Medik8 из того же канала — в основном магазине, раздел «Уход за лицом» ———
  {
    slug: "mfk-724",
    brand: "Maison Francis Kurkdjian",
    name: "724",
    price: 235_000,
    variants: [
      { label: "5 ml", price: 235_000 },
      { label: "10 ml", price: 470_000 },
    ],
    description: {
      ru: "Аромат чистоты и свежести: воздушные цветочные ноты и мягкий мускус. На разлив 5 и 10 мл. Цену флакона 70 мл уточните в Telegram.",
      uz: "Tozalik va tetiklik ifori: yengil gulli notalar va mayin mushk. 5 va 10 ml quyma. 70 ml flakon narxini Telegramda aniqlang.",
    },
    post: 16027,
    bottle: "70 ml — 290 $",
  },
  {
    slug: "bleu-de-chanel-parfum",
    brand: "Chanel",
    name: "Bleu de Chanel Parfum",
    price: 150_000,
    variants: [
      { label: "5 ml", price: 150_000 },
      { label: "10 ml", price: 300_000 },
    ],
    description: {
      ru: "Глубокий, благородный мужской аромат. На разлив 5 и 10 мл. Цену флаконов 100 мл уточните в Telegram.",
      uz: "Chuqur va nafis erkaklar ifori. 5 va 10 ml quyma. 100 ml flakonlar narxini Telegramda aniqlang.",
    },
    post: 16018,
    bottle: "100 ml — 200 $ (EDP), 320 $ (L’Exclusif)",
  },
  {
    slug: "clive-christian-uncovered",
    brand: "Clive Christian",
    name: "Uncovered",
    price: 0,
    ask: true,
    description: {
      ru: "Альдегиды, эвкалипт и розовый перец, в сердце — бессмертник, ирис и иланг-иланг на солёном аккорде, шлейф белого мускуса, сандала и амбры. Чистый, светящийся аромат.",
      uz: "Aldegidlar, evkalipt va pushti murch, qalbida — sho‘r akkorddagi o‘lmasgul, iris va ilang-ilang, oq mushk, sandal va ambra izi. Toza, yorqin atir.",
    },
    post: 0,
  },
  {
    slug: "clive-christian-out-of-the-blue",
    brand: "Clive Christian",
    name: "Strange Heavens Out of the Blue",
    price: 0,
    ask: true,
    description: {
      ru: "Анис, кофе и розовый перец, жасмин и цветок апельсина, база из карамели, какао и дыма — тёплый гурманский аромат. Флакон расписал художник Доминго Запата.",
      uz: "Arpabodiyon, qahva va pushti murch, yasmin va apelsin guli, karamel, kakao va tutun asosi — iliq gurman atir. Flakonni rassom Domingo Sapata bezagan.",
    },
    post: 0,
  },
  // ——— новинки канала, ноябрь 2026 (посты 645–804) ———
  {
    slug: "asdaaf-ameerat-al-arab",
    brand: "Asdaaf",
    name: "Ameerat Al Arab",
    price: 120_000,
    variants: [{ label: "10 ml", price: 120_000 }, { label: "Флакон 100 ml", price: 550_000 }],
    description: {
      ru: "Восточный женственный аромат: сочная фруктовая сладость, нежные цветы и роскошный шлейф.",
      uz: "Sharqona ayollar ifori: shirali mevali shirinlik, mayin gullar va hashamatli iz.",
    },
    post: 645,
  },
  {
    slug: "lattafa-eclaire",
    brand: "Lattafa",
    name: "Eclaire",
    price: 570_000,
    variants: [{ label: "Флакон 100 ml", price: 570_000 }],
    description: {
      ru: "Сливочно-карамельный гурманский аромат — как ванильный десерт с карамелью и молоком. Мягкий, уютный шлейф.",
      uz: "Qaymoqli-karamelli gurman atir — karamel va sutli vanilli desert kabi. Mayin, iliq iz.",
    },
    post: 661,
  },
  {
    slug: "lattafa-yara",
    brand: "Lattafa",
    name: "Yara",
    price: 550_000,
    variants: [{ label: "Флакон 100 ml", price: 550_000 }],
    description: {
      ru: "Сочные фрукты, воздушные цветы и сливочная ваниль — нежный, сладкий, обволакивающий аромат.",
      uz: "Shirali mevalar, yengil gullar va qaymoqli vanil — mayin, shirin, o‘rab oluvchi atir.",
    },
    post: 691,
  },
  {
    slug: "creed-iris-debonair",
    brand: "Creed",
    name: "Iris Debonair",
    price: 245_000,
    variants: ml(245_000, 490_000),
    bottle: "100 ml — 480 $",
    description: {
      ru: "Новинка Creed: пудровый ирис, цитрусовая свежесть и тёплое дерево — благородная, сдержанная роскошь.",
      uz: "Creed yangiligi: upali iris, sitrus tetikligi va iliq yog‘och — olijanob, vazmin hashamat.",
    },
    post: 696,
  },
  {
    slug: "carolina-herrera-cedar-chic",
    brand: "Carolina Herrera",
    name: "Cedar Chic",
    price: 250_000,
    variants: [...ml(250_000, 500_000), { label: "Флакон 100 ml", price: 4_477_000 }],
    description: {
      ru: "Благородная древесность, лёгкая пряность и дорогая сдержанность — стильный, чистый, уверенный аромат.",
      uz: "Olijanob yog‘och, yengil ziravor va qimmatbaho vazminlik — zamonaviy, toza, ishonchli atir.",
    },
    post: 700,
  },
  {
    slug: "chanel-coco-mademoiselle",
    brand: "Chanel",
    name: "Coco Mademoiselle",
    price: 165_000,
    variants: ml(165_000, 330_000),
    bottle: "100 ml — 250 $",
    description: {
      ru: "Искрящиеся цитрусы, роза и жасмин на тёплом шлейфе из пачули, ванили и белого мускуса. Утончённый и стойкий.",
      uz: "Yorqin sitruslar, atirgul va yasmin — pachuli, vanil va oq mushkning iliq izida. Nafis va turg‘un.",
    },
    post: 705,
  },
  {
    slug: "chanel-chance-eau-tendre-edp",
    brand: "Chanel",
    name: "Chance Eau Tendre Eau de Parfum",
    price: 165_000,
    variants: ml(165_000, 330_000),
    bottle: "100 ml — 250 $",
    description: {
      ru: "Грейпфрут и айва, бархатный жасмин и роза, шлейф белого мускуса — воздушный, романтичный, женственный.",
      uz: "Greypfrut va behi, baxmal yasmin va atirgul, oq mushk izi — yengil, romantik, ayollarcha.",
    },
    post: 708,
  },
  {
    slug: "dolce-gabbana-devotion-intense",
    brand: "Dolce & Gabbana",
    name: "Devotion Intense",
    price: 125_000,
    variants: ml(125_000, 250_000),
    bottle: "100 ml — 170 $",
    description: {
      ru: "Сочное фруктовое начало и роскошный ванильный шлейф — сливочный, сладкий, цветочный гурман.",
      uz: "Shirali mevali boshlanish va hashamatli vanil izi — qaymoqli, shirin, gulli gurman.",
    },
    post: 716,
  },
  {
    slug: "attar-collection-second-skin",
    brand: "Attar Collection",
    name: "Second Skin",
    price: 160_000,
    variants: ml(160_000, 320_000),
    bottle: "80 ml — 180 $",
    description: {
      ru: "Пудровые белые цветы и мускус — пахнет чистотой и дорогим уходовым кремом. Аромат «второй кожи».",
      uz: "Upali oq gullar va mushk — tozalik va qimmatbaho parvarish kremi hidi. «Ikkinchi teri» ifori.",
    },
    post: 721,
  },
  {
    slug: "agent-provocateur-edp",
    brand: "Agent Provocateur",
    name: "Eau de Parfum",
    price: 95_000,
    variants: ml(95_000, 190_000),
    description: {
      ru: "Чувственный и загадочный: цветочные аккорды на тёплом древесно-мускусном шлейфе.",
      uz: "Shahvoniy va sirli: iliq yog‘och-mushk izidagi gulli akkordlar.",
    },
    post: 734,
  },
  {
    slug: "dior-miss-dior-holiday-set",
    brand: "Dior",
    name: "Miss Dior Holiday Set 2026",
    price: 2_400_000,
    variants: [{ label: "Набор", price: 2_400_000 }],
    description: {
      ru: "Подарочный набор: Miss Dior Eau de Parfum и увлажняющее молочко для тела с ароматом розы.",
      uz: "Sovg‘a to‘plami: Miss Dior Eau de Parfum va atirgul ifori bilan namlovchi tana suti.",
    },
    post: 741,
  },
  {
    slug: "hermes-un-jardin-sur-le-toit",
    brand: "Hermès",
    name: "Un Jardin sur le Toit",
    price: 120_000,
    variants: ml(120_000, 240_000),
    description: {
      ru: "Сад на крыше Парижа: сочное зелёное яблоко, нежная груша и цветы — свежий, лёгкий, утончённый.",
      uz: "Parij tomidagi bog‘: shirali yashil olma, mayin nok va gullar — tetik, yengil, nafis.",
    },
    post: 745,
  },
  {
    slug: "hermes-un-jardin-sur-la-lagune",
    brand: "Hermès",
    name: "Un Jardin sur la Lagune",
    price: 105_000,
    variants: ml(105_000, 210_000),
    description: {
      ru: "Венецианский сад: цветочные, древесные и минеральные оттенки — нежный, свежий, воздушный.",
      uz: "Venetsiya bog‘i: gulli, yog‘och va mineral tuslar — mayin, tetik, yengil.",
    },
    post: 750,
  },
  {
    slug: "clive-christian-matsukita",
    brand: "Clive Christian",
    name: "Matsukita",
    price: 480_000,
    variants: ml(480_000, 960_000),
    description: {
      ru: "Древесный шипр: бергамот и розовый перец, мате и жасмин, пихтовый бальзам и амбра.",
      uz: "Yog‘och-shipr: bergamot va pushti murch, mate va yasmin, archa balzami va ambra.",
    },
    post: 754,
  },
  {
    slug: "creed-original-santal",
    brand: "Creed",
    name: "Original Santal",
    price: 215_000,
    variants: ml(215_000, 430_000),
    description: {
      ru: "Сандал, можжевельник и корица, лаванда и имбирь, шлейф тонки и ванили — тёплый древесно-пряный.",
      uz: "Sandal, archa mevasi va doljin, lavanda va zanjabil, tonka va vanil izi — iliq yog‘och-ziravorli.",
    },
    post: 759,
  },
  {
    slug: "guerlain-linstant-pour-homme",
    brand: "Guerlain",
    name: "L’Instant de Guerlain pour Homme",
    price: 130_000,
    variants: ml(130_000, 260_000),
    description: {
      ru: "Бадьян и бергамот, какао, сандал и дым, пачули в базе — тёплый древесный мужской аромат.",
      uz: "Badyan va bergamot, kakao, sandal va tutun, asosida pachuli — iliq yog‘ochli erkaklar ifori.",
    },
    post: 762,
  },
  {
    slug: "prada-paradoxe-set",
    brand: "Prada",
    name: "Paradoxe Set",
    price: 1_800_000,
    variants: [{ label: "50 + 10 ml", price: 1_800_000 }],
    description: {
      ru: "Набор Paradoxe Parfum: 50 мл и 10 мл. Женственный, чувственный, с элегантным шлейфом.",
      uz: "Paradoxe Parfum to‘plami: 50 ml va 10 ml. Ayollarcha, shahvoniy, nafis izli.",
    },
    post: 776,
  },
  {
    slug: "vilhelm-chimilka",
    brand: "Vilhelm Parfumerie",
    name: "Chimilka",
    price: 185_000,
    variants: ml(185_000, 370_000),
    bottle: "100 ml — 270 $",
    description: {
      ru: "Бархатистый персик и сочный итальянский мандарин — аромат, который собирает комплименты с первого вдоха.",
      uz: "Baxmal shaftoli va shirali italyan mandarini — birinchi nafasdan maqtov to‘playdigan atir.",
    },
    post: 780,
  },
  {
    slug: "dries-van-noten-raving-rose",
    brand: "Dries Van Noten",
    name: "Raving Rose",
    price: 425_000,
    variants: ml(425_000, 850_000),
    description: {
      ru: "Розовый и чёрный перец, розовая вода и роза, мускус и кашмеран — смелая, пряная роза.",
      uz: "Pushti va qora murch, atirgul suvi va atirgul, mushk va kashmeran — dadil, ziravorli atirgul.",
    },
    post: 791,
  },
  {
    slug: "dries-van-noten-rosa-carnivora",
    brand: "Dries Van Noten",
    name: "Rosa Carnivora",
    price: 425_000,
    variants: ml(425_000, 850_000),
    description: {
      ru: "Роза и розовый перец, ветивер, пачули и лабданум — тёмная, хищная роза.",
      uz: "Atirgul va pushti murch, vetiver, pachuli va labdanum — qoramtir, yirtqich atirgul.",
    },
    post: 800,
  },
  {
    slug: "chopard-rose-seljuke",
    brand: "Chopard",
    name: "Rose Seljuke",
    price: 145_000,
    variants: ml(145_000, 290_000),
    description: {
      ru: "Болгарская роза, восточное дерево, мадагаскарская ваниль и тонка — тёплая восточная роза.",
      uz: "Bolgar atirguli, sharq yog‘ochi, Madagaskar vanili va tonka — iliq sharqona atirgul.",
    },
    post: 804,
  },
];

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const imageMap = images as Record<string, string[]>;

export const aromas: AromaWithImages[] = list.map((a) => ({ ...a, images: (imageMap[a.slug] ?? []).map((u) => `${BASE}${u}`) }));

export const getAroma = (slug: string) => aromas.find((a) => a.slug === slug);

/** Минимальная цена распива в сумах (0 — если аромат только под заказ) */
export const minSum = (a: Aroma) => (a.usd ? 0 : a.variants ? Math.min(...a.variants.map((v) => v.price)) : a.price);
export const minUsd = (a: Aroma) => (a.usd ? Math.min(...a.usd.map((u) => u.usd)) : 0);

/** новинки — есть только снимок спереди (поворот показывает его же) */
export const FRONT_ONLY = new Set<string>(["agent-provocateur-edp", "asdaaf-ameerat-al-arab", "attar-collection-second-skin", "carolina-herrera-cedar-chic", "chanel-chance-eau-tendre-edp", "chanel-coco-mademoiselle", "chopard-rose-seljuke", "clive-christian-matsukita", "creed-iris-debonair", "creed-original-santal", "dior-miss-dior-holiday-set", "dolce-gabbana-devotion-intense", "dries-van-noten-raving-rose", "dries-van-noten-rosa-carnivora", "guerlain-linstant-pour-homme", "hermes-un-jardin-sur-la-lagune", "hermes-un-jardin-sur-le-toit", "lattafa-eclaire", "lattafa-yara", "prada-paradoxe-set", "vilhelm-chimilka"]);
