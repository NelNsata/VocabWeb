let db = JSON.parse(localStorage.getItem('vocab_db')) || [];
let stats = JSON.parse(localStorage.getItem('vocab_stats')) || { forgotten: 0 };
let commonWords = [];
let favorites = JSON.parse(localStorage.getItem('vocab_favorites')) || [];

// คำศัพท์ที่ใช้บ่อยพร้อมประเภทคำและตัวอย่าง
const wordDetails = {
    // Common English words with details
    'hello': { pos: 'interjection', example: 'Hello, how are you today?' },
    'world': { pos: 'noun', example: 'The world is full of wonders.' },
    'thank': { pos: 'verb', example: 'I want to thank you for your help.' },
    'please': { pos: 'adverb', example: 'Could you please help me?' },
    'sorry': { pos: 'adjective', example: 'I am sorry for the mistake.' },
    'good': { pos: 'adjective', example: 'This is a good idea.' },
    'time': { pos: 'noun', example: 'Time flies when you are having fun.' },
    'year': { pos: 'noun', example: 'Happy new year!' },
    'work': { pos: 'verb/noun', example: 'I work hard every day.' },
    'life': { pos: 'noun', example: 'Life is beautiful.' },
    'day': { pos: 'noun', example: 'Have a nice day!' },
    'way': { pos: 'noun', example: 'This is the best way to do it.' },
    'man': { pos: 'noun', example: 'He is a kind man.' },
    'thing': { pos: 'noun', example: 'One thing led to another.' },
    'woman': { pos: 'noun', example: 'She is a strong woman.' },
    'child': { pos: 'noun', example: 'The child is playing.' },
    'look': { pos: 'verb', example: 'Look at the beautiful sky!' },
    'use': { pos: 'verb', example: 'Can I use your phone?' },
    'find': { pos: 'verb', example: 'I cannot find my keys.' },
    'give': { pos: 'verb', example: 'Give me a moment, please.' },
    'tell': { pos: 'verb', example: 'Tell me a story.' },
    'ask': { pos: 'verb', example: 'May I ask you a question?' },
    'seem': { pos: 'verb', example: 'It seems like a good plan.' },
    'feel': { pos: 'verb', example: 'I feel happy today.' },
    'try': { pos: 'verb', example: 'Try your best!' },
    'leave': { pos: 'verb', example: 'I need to leave now.' },
    'call': { pos: 'verb', example: 'I will call you later.' },
    'keep': { pos: 'verb', example: 'Keep up the good work!' },
    'let': { pos: 'verb', example: 'Let me help you.' },
    'begin': { pos: 'verb', example: 'Let us begin the meeting.' },
    'help': { pos: 'verb/noun', example: 'Can you help me?' },
    'turn': { pos: 'verb', example: 'Turn left at the corner.' },
    'start': { pos: 'verb', example: 'Start when you are ready.' },
    'show': { pos: 'verb', example: 'Show me how to do it.' },
    'hear': { pos: 'verb', example: 'Did you hear that sound?' },
    'play': { pos: 'verb', example: 'Children love to play.' },
    'run': { pos: 'verb', example: 'I run every morning.' },
    'move': { pos: 'verb', example: 'Please move your car.' },
    'live': { pos: 'verb', example: 'I live in Bangkok.' },
    'believe': { pos: 'verb', example: 'I believe in you.' },
    'bring': { pos: 'verb', example: 'Bring your friends!' },
    'happen': { pos: 'verb', example: 'What will happen next?' },
    'must': { pos: 'modal verb', example: 'You must try harder.' },
    'need': { pos: 'verb', example: 'I need some water.' },
    'feel': { pos: 'verb', example: 'I feel tired today.' },
    'become': { pos: 'verb', example: 'She wants to become a doctor.' },
    'leave': { pos: 'verb', example: 'Do not leave me alone.' },
    'put': { pos: 'verb', example: 'Put the book on the table.' },
    'mean': { pos: 'verb', example: 'What does this word mean?' },
    'read': { pos: 'verb', example: 'I love to read books.' }
};

// สำหรับ mapping ประเภทคำไทย
const posTranslation = {
    'noun': 'คำนาม',
    'verb': 'คำกริยา',
    'adjective': 'คำคุณศัพท์',
    'adverb': 'คำกริยาวิเศษณ์',
    'preposition': 'คำบุพบท',
    'conjunction': 'คำสันธาน',
    'interjection': 'คำอุทาน',
    'pronoun': 'คำสรรพนาม',
    'modal verb': 'กริยาช่วย',
    'determiner': 'คำกำหนด',
    'article': 'คำนำหน้านาม',
    'verb/noun': 'กริยา/นาม'
}; 

// --- โหลดดิกชันนารีอังกฤษ 10K คำ ---
async function initDictionary() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const text = await response.text();
        commonWords = text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        const statusEl = document.getElementById('dictStatus');
        statusEl.innerHTML = "✅ <span class='font-black'>10K DICT READY</span>";
        statusEl.classList.replace('text-slate-400', 'text-green-500');
    } catch (e) {
        document.getElementById('dictStatus').innerText = "⚠️ Offline Mode";
    }
}

// ดึงคำแนะนำหลายตัวเลือก พร้อม phonetic matching
function getSuggestions(wrongWord, maxSuggestions = 3) {
    if (wrongWord.length < 2) return [];
    if (commonWords.includes(wrongWord)) return [];

    let threshold = wrongWord.length >= 5 ? 2 : 1;
    let suggestions = [];
    
    const wrongLower = wrongWord.toLowerCase();

    for (const correctWord of commonWords) {
        if (Math.abs(wrongWord.length - correctWord.length) <= 2) {
            const distance = getLevenshteinDistance(wrongLower, correctWord);
            if (distance > 0 && distance <= threshold) {
                suggestions.push({ word: correctWord, distance: distance });
            }
        }
    }
    
    // เรียงตามระยะห่างและเอาเฉพาะ unique
    suggestions.sort((a, b) => a.distance - b.distance);
    const uniqueSuggestions = [...new Set(suggestions.map(s => s.word))].slice(0, maxSuggestions);
    
    return uniqueSuggestions;
}

// เก็บฟังก์ชันเดิมไว้สำหรับ backward compatibility
function getDidYouMean(wrongWord) {
    const suggestions = getSuggestions(wrongWord, 1);
    return suggestions.length > 0 ? suggestions[0] : null;
}

function autoFix(correctWord) {
    const input = document.getElementById('vocabInput');
    input.value = correctWord;
    document.getElementById('grammarAlert').classList.add('hidden');
    // Animation effect
    input.classList.add('ring-2', 'ring-green-400');
    setTimeout(() => input.classList.remove('ring-2', 'ring-green-400'), 300);
    processVocab();
}

// ระบบ Text-to-Speech
function speakWord(word, lang) {
    if (!('speechSynthesis' in window)) {
        alert('เบราว์เซอร์ของคุณไม่รองรับการอ่านออกเสียง');
        return;
    }
    
    window.speechSynthesis.cancel(); // หยุดเสียงก่อนหน้า
    
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = lang === 'zh' ? 'zh-CN' : 'en-US';
    utterance.rate = 0.9; // อ่านช้าลงนิดหน่อย
    utterance.pitch = 1;
    
    window.speechSynthesis.speak(utterance);
}

// Copy to clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const toast = document.createElement('div');
        toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg animate-fade-in z-50';
        toast.textContent = 'คัดลอกแล้ว!';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    });
}

// Toggle favorite
function toggleFavorite(word) {
    const index = favorites.indexOf(word);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(word);
    }
    localStorage.setItem('vocab_favorites', JSON.stringify(favorites));
    updateFavoriteButton(word);
}

function isFavorite(word) {
    return favorites.includes(word);
}

function updateFavoriteButton(word) {
    const btn = document.getElementById('favoriteBtn');
    if (btn) {
        const isFav = isFavorite(word);
        btn.innerHTML = isFav ? '★ บันทึกแล้ว' : '☆ บันทึก';
        btn.className = isFav 
            ? 'text-amber-500 hover:text-amber-600 font-bold text-sm transition'
            : 'text-slate-400 hover:text-amber-500 font-bold text-sm transition';
    }
}

function validateInput(text) {
    const alertBox = document.getElementById('grammarAlert');
    const word = text.toLowerCase().replace(/[?.,!]/g, '');
    
    // ถ้าเป็นภาษาจีน ข้ามการเช็คตัวสะกดไปเลย
    if (isChineseChar(word)) {
        alertBox.classList.add('hidden');
        return true; 
    }

    // ถ้าเป็นภาษาอังกฤษ ทำการเช็คปกติ
    const suggestions = getSuggestions(word, 3);
    if (suggestions.length > 0) {
        // ถ้ามีคำแนะนำที่ match 100% ให้ auto-correct
        if (suggestions.length === 1 && word.length > 3) {
            const autoCorrectBtn = document.createElement('button');
            autoCorrectBtn.className = 'suggestion-btn';
            autoCorrectBtn.textContent = `"${suggestions[0]}" (แก้ให้อัตโนมัติ)`;
            autoCorrectBtn.onclick = () => autoFix(suggestions[0]);
            
            alertBox.innerHTML = `🤔 คุณหมายถึง ${autoCorrectBtn.outerHTML} ใช่ไหม? 
                <button onclick="autoFix('${suggestions[0]}')" class="text-blue-600 hover:underline ml-2">ใช่, ใช้คำนี้</button>
                <button onclick="forceProcess('${text}')" class="text-slate-400 hover:text-slate-600 ml-2 text-sm">ไม่, ใช้คำเดิม</button>`;
        } else {
            const buttonsHtml = suggestions.map((s, i) => 
                `<button onclick="autoFix('${s}')" class="suggestion-btn">${i + 1}. "${s}"</button>`
            ).join(' ');
            alertBox.innerHTML = `🤔 คุณหมายถึง: ${buttonsHtml} หรือเปล่า?
                <button onclick="forceProcess('${text}')" class="text-slate-400 hover:text-slate-600 ml-2 text-sm">ไม่มีคำที่ตรง</button>`;
        }
        alertBox.classList.remove('hidden');
        return false;
    }
    
    if (/(.)\1\1/.test(word)) {
        alertBox.innerHTML = `⚠️ คำว่า <b>"${word}"</b> สะกดแปลกๆ นะเพื่อน 
            <button onclick="forceProcess('${text}')" class="text-slate-400 hover:text-slate-600 ml-2 text-sm">ใช้คำนี้ต่อไป</button>`;
        alertBox.classList.remove('hidden');
        return false;
    }

    alertBox.classList.add('hidden');
    return true;
}

// ฟังก์ชันบังคับใช้คำเดิมโดยไม่สน spell check
function forceProcess(word) {
    document.getElementById('grammarAlert').classList.add('hidden');
    document.getElementById('vocabInput').value = word;
    processVocab(true); // true = skip validation
}

// ระบบแปลภาษา Google (รองรับ พินอิน)
async function fetchTranslation(word, isChinese) {
    try {
        const langCode = isChinese ? 'zh-CN' : 'en';
        // เพิ่ม dt=md สำหรับ definitions และ dt=ex สำหรับตัวอย่าง
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${langCode}&tl=th&dt=t&dt=rm&dt=md&dt=ex&q=${encodeURIComponent(word)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        let translatedText = data[0][0][0];
        let pinyinText = "-";
        let definitions = [];
        let examples = [];

        // ดึงพินอินสำหรับจีน
        if (isChinese && data[0]) {
            for (let i = 0; i < data[0].length; i++) {
                if (data[0][i][2] || data[0][i][3]) {
                    pinyinText = data[0][i][3] || data[0][i][2];
                    if (pinyinText && pinyinText !== word) break;
                }
            }
        }
        
        // ดึง definitions (ถ้ามี)
        if (data[1]) {
            definitions = data[1].slice(0, 2).map(d => d[0]);
        }
        
        // ดึงตัวอย่างประโยค (ถ้ามี)
        if (data[2] && data[2][0]) {
            examples = data[2].slice(0, 2).map(ex => ({
                source: ex[0],
                target: ex[1]
            }));
        }

        // เช็คแปลไม่ได้
        if (translatedText.toLowerCase() === word.toLowerCase() && word.length > 2 && !isChinese) {
            return { error: true };
        }

        // หาประเภทคำและตัวอย่างจากฐานข้อมูลภายใน
        const wordLower = word.toLowerCase();
        const wordInfo = wordDetails[wordLower] || {};
        const pos = wordInfo.pos || (isChinese ? 'คำศัพท์' : guessPartOfSpeech(word));
        const example = wordInfo.example || (examples.length > 0 ? examples[0].source : null);

        return {
            translation: translatedText,
            lang: isChinese ? 'zh' : 'en',
            pinyin: pinyinText,
            past: isChinese ? "-" : generatePastTense(word),
            future: isChinese ? "-" : "will " + word,
            pos: pos,
            posThai: posTranslation[pos] || pos,
            example: example,
            definitions: definitions,
            error: false
        };
    } catch (e) {
        console.error('Translation error:', e);
        return { error: true };
    }
}

// เดาประเภทคำจากรูปแบบคำ
function guessPartOfSpeech(word) {
    const commonSuffixes = {
        'tion': 'noun', 'sion': 'noun', 'ness': 'noun', 'ment': 'noun',
        'ity': 'noun', 'er': 'noun', 'or': 'noun', 'ist': 'noun',
        'ful': 'adjective', 'ous': 'adjective', 'ive': 'adjective', 'able': 'adjective',
        'ible': 'adjective', 'al': 'adjective', 'ial': 'adjective',
        'ly': 'adverb', 'ward': 'adverb', 'wise': 'adverb'
    };
    
    const wordLower = word.toLowerCase();
    for (const [suffix, pos] of Object.entries(commonSuffixes)) {
        if (wordLower.endsWith(suffix)) return pos;
    }
    
    return 'word';
}

function generatePastTense(word) {
    const irregulars = { 'go': 'went', 'eat': 'ate', 'see': 'saw', 'do': 'did', 'buy': 'bought' };
    const low = word.toLowerCase();
    if (irregulars[low]) return irregulars[low];
    if (low.endsWith('e')) return word + 'd';
    return word + 'ed';
}

// ฟังก์ชันหลัก
async function processVocab(skipValidation = false) {
    const input = document.getElementById('vocabInput');
    const word = input.value.trim();
    if (!word) return;

    if (!skipValidation && !validateInput(word)) return;

    const isChinese = isChineseChar(word);
    const lowerWord = isChinese ? word : word.toLowerCase();
    const existingIndex = db.findIndex(item => (isChinese ? item.word === lowerWord : item.word.toLowerCase() === lowerWord));

    const resultCard = document.getElementById('resultCard');
    const displayWord = document.getElementById('displayWord');
    const displayTrans = document.getElementById('displayTrans');
    const loadingOverlay = document.getElementById('loadingOverlay');

    document.getElementById('welcomeMessage')?.classList.add('hidden');
    resultCard.classList.remove('hidden');

    if (existingIndex !== -1) {
        displayWord.innerHTML = `<span class="forgotten-word">${word}</span>`;
        stats.forgotten += 1;
        db[existingIndex].forgotCount = (db[existingIndex].forgotCount || 0) + 1;
        showData(db[existingIndex]);
    } else {
        loadingOverlay?.classList.remove('hidden');
        displayWord.innerText = word;
        displayTrans.innerText = "กำลังค้นหา...";
        
        const apiResult = await fetchTranslation(word, isChinese);
        
        if (apiResult.error) {
            loadingOverlay?.classList.add('hidden');
            document.getElementById('grammarAlert').innerHTML = `❌ ไม่พบคำแปลสำหรับ <b>"${word}"</b> โปรดเช็คอีกทีเพื่อน`;
            document.getElementById('grammarAlert').classList.remove('hidden');
            return;
        }

        const newEntry = {
            word: word, 
            translation: apiResult.translation,
            lang: apiResult.lang,
            data1: isChinese ? apiResult.pinyin : apiResult.past,
            data2: isChinese ? "คำศัพท์ภาษาจีน" : apiResult.future,
            pos: apiResult.pos,
            posThai: apiResult.posThai,
            example: apiResult.example,
            definitions: apiResult.definitions,
            timestamp: Date.now(),
            forgotCount: 0
        };

        db.push(newEntry);
        showData(newEntry);
        loadingOverlay?.classList.add('hidden');
    }

    input.value = '';
    updateUI();
}

// ปรับการแสดงผลหน้าการ์ดให้รองรับ 2 ภาษา
function showData(data) {
    document.getElementById('displayTrans').innerText = data.translation;
    const badge = document.getElementById('langBadge');
    
    const label1 = document.getElementById('infoLabel1');
    const val1 = document.getElementById('infoValue1');
    const label2 = document.getElementById('infoLabel2');
    const val2 = document.getElementById('infoValue2');

    if (data.lang === 'zh') {
        badge.innerText = "🇨🇳 Chinese";
        badge.className = "text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-600";
        
        label1.innerText = "Pinyin (พินอิน)";
        val1.innerText = data.data1 || "-";
        
        label2.innerText = "Part of Speech (ประเภทคำ)";
        val2.innerText = data.posThai || data.pos || "-";
    } else {
        badge.innerText = "🇬🇧 English";
        badge.className = "text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-600";
        
        label1.innerText = "Past Tense (อดีต)";
        val1.innerText = data.data1 || "-";
        
        label2.innerText = "Part of Speech (ประเภทคำ)";
        val2.innerText = data.posThai || data.pos || "-";
    }
    
    // เพิ่ม action buttons (เสียง, คัดลอก, บันทึก)
    let actionDiv = document.getElementById('actionButtons');
    if (!actionDiv) {
        actionDiv = document.createElement('div');
        actionDiv.id = 'actionButtons';
        actionDiv.className = 'flex gap-2 mt-4 pt-4 border-t border-slate-100';
        document.getElementById('resultCard').appendChild(actionDiv);
    }
    
    const isFav = isFavorite(data.word);
    actionDiv.innerHTML = `
        <button onclick="speakWord('${data.word.replace(/'/g, "\\'")}', '${data.lang}')" 
            class="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-sm font-medium transition">
            🔊 ฟังเสียง
        </button>
        <button onclick="copyToClipboard('${data.word.replace(/'/g, "\\'")} - ${data.translation.replace(/'/g, "\\'")}')" 
            class="flex items-center gap-1 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-sm font-medium transition">
            📋 คัดลอก
        </button>
        <button id="favoriteBtn" onclick="toggleFavorite('${data.word.replace(/'/g, "\\'")}')" 
            class="${isFav ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'} font-bold text-sm transition flex items-center gap-1 px-3 py-1.5 hover:bg-amber-50 rounded-xl">
            ${isFav ? '★ บันทึกแล้ว' : '☆ บันทึก'}
        </button>
    `;
    
    // แสดงตัวอย่างประโยคถ้ามี
    let exampleDiv = document.getElementById('exampleSentence');
    if (data.example) {
        if (!exampleDiv) {
            exampleDiv = document.createElement('div');
            exampleDiv.id = 'exampleSentence';
            exampleDiv.className = 'mt-4 p-4 bg-amber-50/50 rounded-2xl border border-amber-100';
            document.getElementById('resultCard').appendChild(exampleDiv);
        }
        exampleDiv.innerHTML = `
            <span class="block text-amber-400 font-bold text-[10px] uppercase mb-1 tracking-widest">Example (ตัวอย่าง)</span>
            <p class="text-amber-800 font-medium italic">"${data.example}"</p>
        `;
        exampleDiv.classList.remove('hidden');
    } else if (exampleDiv) {
        exampleDiv.classList.add('hidden');
    }
}

// คลังคำศัพท์
function openVocabList() {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    
    // แสดงจำนวนคำศัพท์
    const vocabCount = document.createElement('div');
    vocabCount.className = 'p-4 bg-slate-50 text-center text-sm text-slate-500';
    vocabCount.innerHTML = `ทั้งหมด <b>${db.length}</b> คำ | บันทึกไว้ <b>${favorites.length}</b> คำ`;
    
    // Search box
    const searchDiv = document.createElement('div');
    searchDiv.className = 'p-4 border-b';
    searchDiv.innerHTML = `
        <input type="text" id="vocabSearch" placeholder="🔍 ค้นหาคำศัพท์..." 
            class="w-full p-3 border border-slate-200 rounded-xl text-sm focus:border-blue-500 outline-none"
            onkeyup="filterVocabList(this.value)">
    `;
    
    db.forEach((item, index) => {
        const flag = item.lang === 'zh' ? '🇨🇳' : '🇬🇧';
        const isFav = isFavorite(item.word);
        const row = document.createElement('tr');
        row.className = "hover:bg-blue-50/20 transition duration-200 vocab-row";
        row.dataset.word = item.word.toLowerCase();
        row.innerHTML = `
            <td class="p-6 font-black text-slate-700 ${item.lang === 'zh' ? 'text-lg' : 'uppercase text-xs'}">
                ${flag} ${item.word} ${isFav ? '<span class="text-amber-400">★</span>' : ''}
            </td>
            <td class="p-6 text-slate-600 text-sm font-medium">
                ${item.translation} 
                <br><span class="text-[10px] text-slate-400 font-normal italic">${item.posThai || item.data1 || ''}</span>
            </td>
            <td class="p-6 text-center">
                <span class="px-3 py-1 rounded-full text-[10px] font-black ${item.forgotCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}">
                    ${item.forgotCount || 0}
                </span>
            </td>
            <td class="p-6 text-center">
                <button onclick="speakWord('${item.word.replace(/'/g, "\\'")}', '${item.lang}')" 
                    class="text-slate-300 hover:text-indigo-500 transition-all hover:scale-125 mr-2">🔊</button>
                <button onclick="deleteWord(${index})" 
                    class="text-slate-300 hover:text-red-500 transition-all hover:scale-125">🗑️</button>
            </td>`;
        tableBody.appendChild(row);
    });
    
    document.getElementById('vocabModal').classList.remove('hidden');
}

function filterVocabList(query) {
    const rows = document.querySelectorAll('.vocab-row');
    const lowerQuery = query.toLowerCase();
    rows.forEach(row => {
        const word = row.dataset.word;
        if (word.includes(lowerQuery)) {
            row.classList.remove('hidden');
        } else {
            row.classList.add('hidden');
        }
    });
}

function deleteWord(index) {
    if (confirm(`ลบคำนี้ออกจากคลังความจำ?`)) {
        stats.forgotten = Math.max(0, stats.forgotten - (db[index].forgotCount || 0));
        db.splice(index, 1);
        updateUI();
        openVocabList();
    }
}

function closeVocabList() { document.getElementById('vocabModal').classList.add('hidden'); }

document.getElementById('vocabInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') processVocab();
});

initDictionary();
updateUI();