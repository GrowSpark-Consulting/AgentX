// Raja's phrase list (docs/reference/opt-out-handoff-phrases.md, 9 Oct): 10 phrases in each of 13 languages, the same
// intent at the same number in every language. Used as few-shot examples in extraction_v2 and as test cases, NEVER as keywords:
// spelling in Tanglish, Manglish and Hinglish varies a lot. exit-phrases.test.ts keeps this file equal to the document.
// The six languages marked needsNativeCheck are to be read by a native speaker before they are final test data.

/** Phrase numbers (1-based) that ask for a person; the rest are opt-outs. Phrase 7 is "not interested". */
export const HANDOFF_PHRASE_NUMBERS = [2, 5, 9] as const;
export const NOT_INTERESTED_PHRASE_NUMBER = 7;

export interface ExitPhrases {
  language: string;
  needsNativeCheck: boolean;
  /** Index 0 is phrase 1. */
  phrases: readonly string[];
}

export const EXIT_PHRASES: readonly ExitPhrases[] = [
  {
    language: "English",
    needsNativeCheck: false,
    phrases: [
      "Stop messaging me.",
      "I don't want to talk to a bot.",
      "Remove my number from your list right now.",
      "How many times do I have to say STOP?",
      "Get me a real person, not this AI.",
      "Stop spamming me.",
      "I'm not interested, leave me alone.",
      "Don't ever contact me again.",
      "This bot is useless, connect me to someone.",
      "Unsubscribe me or I'll report you.",
    ],
  },
  {
    language: "Tamil",
    needsNativeCheck: false,
    phrases: [
      "எனக்கு மெசேஜ் அனுப்பாதீங்க.",
      "AI-கிட்ட பேச விருப்பம் இல்ல.",
      "என் நம்பரை லிஸ்ட்ல இருந்து எடுங்க.",
      "எத்தனை தடவை சொல்றது, நிறுத்துங்க!",
      "ஒரு ஆள்கிட்ட பேசணும், இந்த bot வேண்டாம்.",
      "தொந்தரவு பண்ணாதீங்க.",
      "எனக்கு விருப்பம் இல்ல, விட்டுடுங்க.",
      "இனிமே எனக்கு மெசேஜ் பண்ணக்கூடாது.",
      "இது சுத்த வேஸ்ட், யாராவது மனுஷங்க கிட்ட கனெக்ட் பண்ணுங்க.",
      "இன்னொரு மெசேஜ் வந்தா ரிப்போர்ட் பண்ணுவேன்.",
    ],
  },
  {
    language: "Tanglish",
    needsNativeCheck: false,
    phrases: [
      "Enakku message pannadheenga.",
      "AI kitta pesa venam.",
      "En number-a list la irundhu remove pannunga.",
      "Evlo vaati solradhu, STOP pannunga!",
      "Oru aal kitta pesanum, indha bot venam.",
      "Summa torture pannadheenga.",
      "Interest illa, vittudunga.",
      "Inimel message vandha block panniduven.",
      "Idhu waste, yaaravadhu real person kitta connect pannunga.",
      "Thollai pannadheenga, report pannuven.",
    ],
  },
  {
    language: "Malayalam",
    needsNativeCheck: false,
    phrases: [
      "എനിക്ക് മെസേജ് അയക്കരുത്.",
      "AI-യുമായി സംസാരിക്കാൻ താല്പര്യമില്ല.",
      "എന്റെ നമ്പർ ലിസ്റ്റിൽ നിന്ന് മാറ്റൂ.",
      "എത്ര തവണ പറയണം, നിർത്ത്!",
      "ഒരു ആളുമായി സംസാരിക്കണം, ഈ ബോട്ട് വേണ്ട.",
      "ശല്യം ചെയ്യരുത്.",
      "താല്പര്യമില്ല, എന്നെ വെറുതെ വിട്.",
      "ഇനി മേലാൽ മെസേജ് അയക്കരുത്.",
      "ഇത് വെറും വേസ്റ്റ്, ഏതെങ്കിലും ആളെ കണക്ട് ചെയ്യൂ.",
      "ഇനിയും മെസേജ് വന്നാൽ റിപ്പോർട്ട് ചെയ്യും.",
    ],
  },
  {
    language: "Manglish",
    needsNativeCheck: false,
    phrases: [
      "Enikku message ayakkaruthu.",
      "AI-yodu samsarikkan thalparyamilla.",
      "Ente number list-il ninnu maattu.",
      "Ethra thavana parayanam, nirthu!",
      "Oru aalinodu samsarikkanam, ee bot venda.",
      "Shalyam cheyyaruthu.",
      "Thalparyamilla, enne veruthe vidu.",
      "Ini melal message ayakkaruthu.",
      "Ithu verum waste, aareyenkilum connect cheyyu.",
      "Iniyum message vannal report cheyyum.",
    ],
  },
  {
    language: "Hindi",
    needsNativeCheck: false,
    phrases: [
      "मुझे मैसेज मत करो।",
      "मुझे AI से बात नहीं करनी।",
      "मेरा नंबर अपनी लिस्ट से हटाओ।",
      "कितनी बार बोलूँ, बंद करो!",
      "किसी इंसान से बात कराओ, ये बॉट नहीं चाहिए।",
      "परेशान मत करो।",
      "मुझे कोई दिलचस्पी नहीं, मेरा पीछा छोड़ो।",
      "आज के बाद मुझे कभी मैसेज मत करना।",
      "ये बॉट बेकार है, किसी असली आदमी से जोड़ो।",
      "फिर से मैसेज आया तो रिपोर्ट कर दूँगा।",
    ],
  },
  {
    language: "Hinglish",
    needsNativeCheck: false,
    phrases: [
      "Mujhe message mat karo.",
      "Mujhe AI se baat nahi karni.",
      "Mera number list se hatao.",
      "Kitni baar bolu, band karo!",
      "Kisi insaan se baat karao, ye bot nahi chahiye.",
      "Pareshan mat karo yaar.",
      "Interest nahi hai, peecha chhodo.",
      "Aaj ke baad kabhi message mat karna.",
      "Ye bot bekaar hai, kisi real person se connect karo.",
      "Dobara message aaya toh block aur report kar dunga.",
    ],
  },
  {
    language: "Telugu",
    needsNativeCheck: true,
    phrases: [
      "నాకు మెసేజ్ పంపకండి.",
      "AI తో మాట్లాడటం నాకు ఇష్టం లేదు.",
      "నా నంబర్ మీ లిస్ట్ నుండి తీసేయండి.",
      "ఎన్నిసార్లు చెప్పాలి, ఆపండి!",
      "ఎవరైనా మనిషితో మాట్లాడించండి, ఈ బాట్ వద్దు.",
      "విసిగించకండి.",
      "నాకు ఆసక్తి లేదు, నన్ను వదిలేయండి.",
      "ఇంకెప్పుడూ మెసేజ్ చేయకండి.",
      "ఈ బాట్ వేస్ట్, ఎవరైనా మనిషిని కనెక్ట్ చేయండి.",
      "మళ్ళీ మెసేజ్ వస్తే రిపోర్ట్ చేస్తా.",
    ],
  },
  {
    language: "Kannada",
    needsNativeCheck: true,
    phrases: [
      "ನನಗೆ ಮೆಸೇಜ್ ಮಾಡಬೇಡಿ.",
      "AI ಜೊತೆ ಮಾತಾಡೋಕೆ ಇಷ್ಟ ಇಲ್ಲ.",
      "ನನ್ನ ನಂಬರ್ ಲಿಸ್ಟ್‌ನಿಂದ ತೆಗೆಯಿರಿ.",
      "ಎಷ್ಟು ಸಲ ಹೇಳಬೇಕು, ನಿಲ್ಲಿಸಿ!",
      "ಯಾರಾದರೂ ಮನುಷ್ಯರ ಜೊತೆ ಮಾತಾಡಿಸಿ, ಈ ಬಾಟ್ ಬೇಡ.",
      "ತೊಂದರೆ ಕೊಡಬೇಡಿ.",
      "ನನಗೆ ಆಸಕ್ತಿ ಇಲ್ಲ, ನನ್ನನ್ನು ಬಿಟ್ಟುಬಿಡಿ.",
      "ಇನ್ಮೇಲೆ ಮೆಸೇಜ್ ಮಾಡಬೇಡಿ.",
      "ಈ ಬಾಟ್ ವೇಸ್ಟ್, ಯಾರನ್ನಾದರೂ ಕನೆಕ್ಟ್ ಮಾಡಿ.",
      "ಮತ್ತೆ ಮೆಸೇಜ್ ಬಂದರೆ ರಿಪೋರ್ಟ್ ಮಾಡ್ತೀನಿ.",
    ],
  },
  {
    language: "Bengali",
    needsNativeCheck: true,
    phrases: [
      "আমাকে মেসেজ করবেন না।",
      "আমি AI-এর সাথে কথা বলতে চাই না।",
      "আমার নম্বর লিস্ট থেকে সরান।",
      "কতবার বলব, বন্ধ করুন!",
      "কোনো মানুষের সাথে কথা বলান, এই বট চাই না।",
      "বিরক্ত করবেন না।",
      "আমার কোনো আগ্রহ নেই, আমাকে ছেড়ে দিন।",
      "আর কখনো মেসেজ করবেন না।",
      "এই বট একদম বাজে, কোনো আসল লোকের সাথে কানেক্ট করুন।",
      "আবার মেসেজ এলে রিপোর্ট করব।",
    ],
  },
  {
    language: "Marathi",
    needsNativeCheck: true,
    phrases: [
      "मला मेसेज करू नका.",
      "मला AI शी बोलायचं नाही.",
      "माझा नंबर लिस्टमधून काढा.",
      "किती वेळा सांगू, बंद करा!",
      "कोणत्यातरी माणसाशी बोलू द्या, हा बॉट नको.",
      "त्रास देऊ नका.",
      "मला काही इंटरेस्ट नाही, मला सोडा.",
      "यापुढे कधीही मेसेज करू नका.",
      "हा बॉट बेकार आहे, कोणत्यातरी खऱ्या माणसाशी जोडा.",
      "पुन्हा मेसेज आला तर रिपोर्ट करेन.",
    ],
  },
  {
    language: "Gujarati",
    needsNativeCheck: true,
    phrases: [
      "મને મેસેજ ન કરો.",
      "મારે AI સાથે વાત નથી કરવી.",
      "મારો નંબર લિસ્ટમાંથી કાઢી નાખો.",
      "કેટલી વાર કહું, બંધ કરો!",
      "કોઈ માણસ સાથે વાત કરાવો, આ બોટ નથી જોઈતો.",
      "હેરાન ન કરો.",
      "મને કોઈ રસ નથી, મને છોડી દો.",
      "હવે પછી ક્યારેય મેસેજ ન કરતા.",
      "આ બોટ નકામો છે, કોઈ સાચા માણસ સાથે જોડો.",
      "ફરી મેસેજ આવ્યો તો રિપોર્ટ કરીશ.",
    ],
  },
  {
    language: "Punjabi",
    needsNativeCheck: true,
    phrases: [
      "ਮੈਨੂੰ ਮੈਸੇਜ ਨਾ ਕਰੋ।",
      "ਮੈਂ AI ਨਾਲ ਗੱਲ ਨਹੀਂ ਕਰਨੀ।",
      "ਮੇਰਾ ਨੰਬਰ ਲਿਸਟ ਵਿੱਚੋਂ ਹਟਾਓ।",
      "ਕਿੰਨੀ ਵਾਰ ਕਹਾਂ, ਬੰਦ ਕਰੋ!",
      "ਕਿਸੇ ਬੰਦੇ ਨਾਲ ਗੱਲ ਕਰਾਓ, ਇਹ ਬੋਟ ਨਹੀਂ ਚਾਹੀਦਾ।",
      "ਤੰਗ ਨਾ ਕਰੋ।",
      "ਮੈਨੂੰ ਕੋਈ ਦਿਲਚਸਪੀ ਨਹੀਂ, ਮੇਰਾ ਪਿੱਛਾ ਛੱਡੋ।",
      "ਅੱਜ ਤੋਂ ਬਾਅਦ ਕਦੇ ਮੈਸੇਜ ਨਾ ਕਰਨਾ।",
      "ਇਹ ਬੋਟ ਬੇਕਾਰ ਹੈ, ਕਿਸੇ ਅਸਲੀ ਬੰਦੇ ਨਾਲ ਜੋੜੋ।",
      "ਦੁਬਾਰਾ ਮੈਸੇਜ ਆਇਆ ਤਾਂ ਰਿਪੋਰਟ ਕਰਾਂਗਾ।",
    ],
  },
];

/** What phrase number `n` (1-based) means. */
export const exitIntentOf = (n: number): "talk_to_human" | "opt_out" => ((HANDOFF_PHRASE_NUMBERS as readonly number[]).includes(n) ? "talk_to_human" : "opt_out");
