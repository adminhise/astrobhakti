/// Hindi and English interface strings (proposal §14: Hindi and English at launch).
class S {
  S(this.lang);
  final String lang;
  bool get hi => lang == 'hi';

  String t(String key) => (hi ? _hi[key] : _en[key]) ?? _en[key] ?? key;

  static const _en = <String, String>{
    'tagline': 'A personal place for daily bhakti. Prayer, original devotional audio, live darshan and trusted priest services in one calm app.',
    'getStarted': 'Get started',
    'browseFirst': 'Browse first',
    'noAccount': 'No account needed to explore.',
    'chooseLanguage': 'Choose your language',
    'moreLanguages': 'More languages will be added when reviewed content, navigation and service messages are ready together.',
    'continue': 'Continue',
    'whom': 'Whom do you worship?',
    'whomSub': 'Choose one to five deities. You can change this any time, and the full catalogue stays open to browse.',
    'requestDeity': 'Request a deity that is not listed yet',
    'chooseDefault': 'Choose your default',
    'chooseDefaultSub': 'Your default deity shapes Home, reminders, live events and relevant pooja services.',
    'reminderTitle': 'A gentle daily reminder?',
    'reminderSub': 'No streaks, no guilt for missed days.',
    'setReminder': 'Set reminder',
    'skip': 'Skip for now',
    'home': 'Home', 'explore': 'Explore', 'live': 'Live', 'pooja': 'Pooja', 'myBhakti': 'My Bhakti',
    'namaste': 'Namaste',
    'todaysPrayer': 'TODAY’S PRAYER',
    'startDevotion': 'Start my devotion',
    'continueListening': 'Continue',
    'dailyRoutine': 'Daily routine',
    'routinePrivate': 'Completion is private and optional. No streaks or leaderboards.',
    'liveDarshan': 'Live darshan',
    'todayForYou': 'Today for you',
    'services': 'SERVICES',
    'bookPooja': 'Book a pooja',
    'serviceNote': 'Service area is labeled and kept apart from editorial recommendations. Prices shown before payment.',
    'saveAcross': 'Save across your devices',
    'noChart': 'No birth chart or astrology profile is needed. Your devotional choices are never used for advertising.',
  };

  static const _hi = <String, String>{
    'tagline': 'दैनिक भक्ति के लिए आपका अपना स्थान। प्रार्थना, मौलिक भक्ति ऑडियो, लाइव दर्शन और विश्वसनीय पुजारी सेवाएँ, एक शांत ऐप में।',
    'getStarted': 'शुरू करें',
    'browseFirst': 'पहले देखें',
    'noAccount': 'देखने के लिए खाते की आवश्यकता नहीं।',
    'chooseLanguage': 'अपनी भाषा चुनें',
    'moreLanguages': 'समीक्षित सामग्री तैयार होने पर और भाषाएँ जोड़ी जाएँगी।',
    'continue': 'आगे बढ़ें',
    'whom': 'आप किसकी उपासना करते हैं?',
    'whomSub': 'एक से पाँच देवता चुनें। आप इसे कभी भी बदल सकते हैं।',
    'requestDeity': 'सूची में नहीं? देवता का अनुरोध करें',
    'chooseDefault': 'अपने मुख्य देवता चुनें',
    'chooseDefaultSub': 'मुख्य देवता से होम, रिमाइंडर, लाइव कार्यक्रम और पूजा सेवाएँ तय होती हैं।',
    'reminderTitle': 'एक सौम्य दैनिक रिमाइंडर?',
    'reminderSub': 'कोई स्ट्रीक नहीं, छूटे दिनों का कोई दबाव नहीं।',
    'setReminder': 'रिमाइंडर सेट करें',
    'skip': 'अभी नहीं',
    'home': 'होम', 'explore': 'खोजें', 'live': 'लाइव', 'pooja': 'पूजा', 'myBhakti': 'मेरी भक्ति',
    'namaste': 'नमस्ते',
    'todaysPrayer': 'आज की प्रार्थना',
    'startDevotion': 'मेरी भक्ति शुरू करें',
    'continueListening': 'जारी रखें',
    'dailyRoutine': 'दैनिक साधना',
    'routinePrivate': 'पूरा करना निजी और वैकल्पिक है। कोई लीडरबोर्ड नहीं।',
    'liveDarshan': 'लाइव दर्शन',
    'todayForYou': 'आज आपके लिए',
    'services': 'सेवाएँ',
    'bookPooja': 'पूजा बुक करें',
    'serviceNote': 'सेवा क्षेत्र संपादकीय सुझावों से अलग रखा गया है। भुगतान से पहले कीमत दिखाई जाती है।',
    'saveAcross': 'अपने सभी उपकरणों पर सहेजें',
    'noChart': 'जन्म कुंडली की आवश्यकता नहीं। आपकी भक्ति पसंद विज्ञापन के लिए कभी उपयोग नहीं होती।',
  };
}
