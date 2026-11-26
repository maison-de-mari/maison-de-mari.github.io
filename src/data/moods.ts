/** Настроения ароматов бутика — по описанию нот каждого аромата */
export type Mood = "floral" | "gourmand" | "woody" | "fresh";

export const MOODS: Mood[] = ["floral", "gourmand", "woody", "fresh"];

export const MOOD_OF: Record<string, Mood> = {
  "louis-vuitton-moon-tale": "floral",
  "creed-spring-flower": "floral",
  "gritti-tutu": "floral",
  "ysl-libre-berry-crush": "floral",
  "mfk-724": "floral",
  "guerlain-nerolia-vetiver-set": "floral",
  "orto-parisi-boccanera": "gourmand",
  "maison-crivelli-cuir-infrarouge": "gourmand",
  "parfums-de-marly-althair": "gourmand",
  "phlur-vanilla-skin": "gourmand",
  "tom-ford-tobacco-vanille": "gourmand",
  "hormone-paris-this-is-not-caffeine": "gourmand",
  "reservation-riviera-californienne": "gourmand",
  "byredo-animalique": "woody",
  "zielinski-rozen-tobacco-cedarwood-pepper": "woody",
  "essential-parfums-bois-imperial": "woody",
  "amouage-purpose-50": "woody",
  "penhaligons-halfeti-leather": "woody",
  "bleu-de-chanel-parfum": "woody",
  "versace-cedrat-de-diamante": "fresh",
  "louis-vuitton-lv-lovers": "fresh",
  "bvlgari-le-gemme-tygar": "fresh",
  "zielinski-rozen-bergamot-green-tea-sandalwood": "fresh",
  "creed-wild-vetiver": "fresh",
  "clive-christian-uncovered": "floral",
  "clive-christian-out-of-the-blue": "gourmand",
};
