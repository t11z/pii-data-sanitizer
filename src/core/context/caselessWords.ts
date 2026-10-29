/**
 * Vocabulary guards for the caseless name scripts (Arabic, Hebrew, the Indic
 * scripts, Thai, Hangul).
 *
 * Why these are needed: in a caseless script there is no capitalization signal,
 * so a bare name-database hit is the only evidence a token is a name. The native
 * packs are ingested from Wikidata given-name / family-name labels, and many of
 * those labels are also ordinary words — including the most frequent function
 * words of the language ("और" = and, "ਦੇ" = of, "في" = in, "לא" = no). Each
 * such word then scores as a core-tier name, and two of them in a row chain into
 * a confident two-part "person" ("هو لا", "אני לא", "कर के"). Nearly every
 * name-free sentence in these scripts produced a PERSON span. A Latin word in
 * the same position would never be considered, because it is lowercase.
 *
 * Two lists, with different strength:
 *
 * - FUNCTION_WORDS: closed-class grammar words (conjunctions, postpositions,
 *   pronouns, auxiliaries, negation, demonstratives). They are never a name
 *   part in running text, so `nameLike` rejects them outright — they can neither
 *   start nor extend a chain. Words that are genuinely also common surnames are
 *   deliberately NOT here (Odia "କର" Kar, Odia "ଦେ" De, Korean "이" Lee / "나" Na);
 *   they go in the ambiguous list instead.
 *
 * - AMBIGUOUS_CASELESS: frequent content words that are also (rare) names
 *   ("सरकार" government / Sarkar, "నీరు" water / Neeru, "ทอง" gold / Thong).
 *   Like the Latin AMBIGUOUS_WORDS, they only lose the single-token case: alone
 *   they score below threshold, inside a multi-part name they still count, so
 *   "राहुल सरकार" keeps detecting. Common given names that happen to be words
 *   (Suraj "sun", Prem "love", Asha "hope", Maya, Jagannath) are deliberately
 *   left OUT, so a lone given name in these scripts still detects — the same
 *   leak-over-noise trade the Latin lists make.
 *
 * Only words present in (or plausible for) the native packs matter; listing a
 * function word that is not in a pack is a harmless no-op. Scripts do not share
 * code points, so one set per role covers all of them.
 */
const FUNCTION_WORDS_BY_SCRIPT: Record<string, string> = {
  Devanagari:
    'और के की का को में से है हैं था थी थे ने पर भी तो यह वह ये वे कि जो कर करना किया करें ' +
    'करके हो होता होती होगा गया गई जा रहा रही रहे नहीं न एक सब कुछ अब तब जब यहाँ वहाँ लिए साथ ' +
    'बाद पहले बहुत या तथा एवं लेकिन मगर अगर इस उस इन उन मैं हम तुम आप वो',
  Bengali:
    'এবং ও আর এই সেই যে কি কী কে না হয় হবে ছিল আছে করে করা থেকে জন্য দিয়ে সঙ্গে পর আগে ' +
    'একটি এক সব কিছু এখন তখন খুব আমি তুমি আপনি সে তারা আমরা কিন্তু অথবা বা তবে যদি',
  Gurmukhi:
    'ਅਤੇ ਦੇ ਦੀ ਦਾ ਨੂੰ ਵਿੱਚ ਤੋਂ ਹੈ ਹਨ ਸੀ ਸਨ ਨੇ ਤੇ ਵੀ ਤਾਂ ਇਹ ਉਹ ਕਿ ਜੋ ਕਰ ਕਰਨਾ ਕੀਤਾ ਹੋ ਹੁੰਦਾ ' +
    'ਗਿਆ ਜਾ ਰਿਹਾ ਨਹੀਂ ਇੱਕ ਸਭ ਕੁਝ ਹੁਣ ਜਦੋਂ ਲਈ ਨਾਲ ਬਾਅਦ ਪਹਿਲਾਂ ਬਹੁਤ ਕੇ ਮੈਂ ਅਸੀਂ ਤੁਸੀਂ ਪਰ ਜਾਂ',
  Oriya:
    'ଏବଂ ଓ ର କୁ ରେ ରୁ ଠାରୁ ଅଛି ଥିଲା ଥିଲେ ହେଉଛି ହେବ ଏହି ସେହି ଯେ କି ଯାହା କରି କରିବା କଲେ ହୋଇ ' +
    'ଗଲା ନାହିଁ ଏକ ସବୁ କିଛି ଏବେ ପାଇଁ ସହିତ ପରେ ବହୁତ ମୁଁ ଆମେ ତୁମେ ଆପଣ କିନ୍ତୁ ବା କେ ଟି ଜି',
  Gujarati:
    'અને ના ની નું ને માં થી છે છો હતું હતા હતી એ આ તે કે જે કર કરવું કર્યું થયું ગયું રહ્યું ' +
    'નથી એક બધા કંઈ હવે ત્યારે માટે સાથે પછી પહેલાં બહુ હું અમે તમે પણ અથવા',
  Tamil:
    'மற்றும் இது அது இந்த அந்த ஒரு என்று என்ற ஆனால் இல்லை உள்ளது இருந்தது நான் நீ அவன் ' +
    'அவள் அவர் நாம் நாங்கள் அவர்கள் இங்கே அங்கே இப்போது நாளை மேலும் அல்லது',
  Telugu:
    'మరియు ఈ ఆ ఒక అని కానీ లేదు ఉంది ఉన్నాయి నేను నువ్వు అతను ఆమె మేము వారు ఇక్కడ అక్కడ ' +
    'ఇప్పుడు ఈరోజు రేపు లేదా కూడా',
  Kannada:
    'ಮತ್ತು ಈ ಆ ಒಂದು ಎಂದು ಆದರೆ ಇಲ್ಲ ಇದೆ ಇತ್ತು ನಾನು ನೀನು ಅವನು ಅವಳು ಅವರು ನಾವು ಇಲ್ಲಿ ಅಲ್ಲಿ ಈಗ ' +
    'ನಾಳೆ ಅಥವಾ ಸಹ',
  Malayalam:
    'ഒപ്പം ഈ ആ ഒരു എന്ന് പക്ഷേ ഇല്ല ഉണ്ട് ആയിരുന്നു ഞാൻ നീ അവൻ അവൾ അവർ നമ്മൾ ഇവിടെ അവിടെ ' +
    'ഇപ്പോൾ ഇന്ന് നാളെ അല്ലെങ്കിൽ കൂടാതെ',
  Thai:
    'และ ของ ที่ ใน เป็น ไม่ ได้ มี จะ ให้ กับ แต่ หรือ ก็ ว่า นี้ นั้น การ ความ ไป มา อยู่ แล้ว ' +
    'ด้วย จาก ถึง ทุก โดย เพื่อ ซึ่ง',
  Hangul: '그리고 그 저 것 수 등 및 또는 하지만 우리 저희 너 그들 여기 거기',
  Arabic:
    'و في من إلى الى على عن مع هذا هذه ذلك تلك التي الذي الذين كان كانت يكون هو هي هم أنا ' +
    'نحن أنت أن إن لا ما لم لن قد كل بعد قبل عند حتى أو ثم بل لكن ليس غير بين فوق تحت',
  Hebrew:
    'ו של את על עם זה זאת זו הוא היא הם הן אני אתה אנחנו לא כן כל אבל או גם רק עוד אם כי מה ' +
    'מי איך למה לי לך לו לה שלי שלך אין יש היה הייתה ' +
    // inflected prepositions (with/of/to/object-marker + pronoun suffix)
    'איתו איתה איתם איתן איתי איתך אותו אותה אותם אותן אותי אותך שלו שלה שלנו שלהם להם לנו בו בה בהם',
};

const AMBIGUOUS_BY_SCRIPT: Record<string, string> = {
  Devanagari: 'सरकार नीति काम समय लोग देश मौसम बड़ा छोटा धन',
  Bengali: 'সরকার দিন মন ছোট',
  Gurmukhi: 'ਸਰਕਾਰ ਮੌਸਮ ਲੋਕ',
  Oriya: 'କର ଦେ ସରକାର ପାଣି ଲୋକ ଧନ',
  Gujarati: 'કાલે',
  Tamil: 'மக்கள் கை',
  Telugu: 'నీరు',
  Kannada: 'ಇಂದು ನೀರು ನಗರ',
  Malayalam: 'സർക്കാർ',
  Thai: 'วัน เดือน ทอง คำ แก้ว ดำ ใหญ่ เล็ก สด ผล ฝน สุข ใจ เตรียม',
  Hangul: '이 나 정부 사람 나라 도시 사랑',
  Arabic: 'بيت ماء شمس قلب حب الصباح الخبز',
  Hebrew: 'בית יום לילה מים שמש לב אהבה',
};

function toSet(byScript: Record<string, string>): Set<string> {
  return new Set(Object.values(byScript).flatMap((words) => words.split(' ')));
}

const FUNCTION_WORDS = toSet(FUNCTION_WORDS_BY_SCRIPT);
const AMBIGUOUS_CASELESS = toSet(AMBIGUOUS_BY_SCRIPT);

/** A closed-class grammar word of a caseless script: never a name part. */
export function isCaselessFunctionWord(token: string): boolean {
  return FUNCTION_WORDS.has(token);
}

/** A caseless-script content word that is also a rare name: weak on its own. */
export function isAmbiguousCaselessWord(token: string): boolean {
  return AMBIGUOUS_CASELESS.has(token);
}
