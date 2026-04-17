let db = JSON.parse(localStorage.getItem('vocab_db')) || [];
let stats = JSON.parse(localStorage.getItem('vocab_stats')) || { forgotten: 0 };
let commonWords = []; 

// --- 🌐 โหลดดิกชันนารีอังกฤษ 10K คำ ---
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

// --- 📊 กราฟสถิติ ---
const ctx = document.getElementById('statChart').getContext('2d');
let myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
        labels: ['คำใหม่', 'ลืมคำเดิม'],
        datasets: [{
            data: [db.length, stats.forgotten],
            backgroundColor: ['#3b82f6', '#ef4444'],
            borderWidth: 0,
            cutout: '80%'
        }]
    },
    options: { plugins: { legend: { display: false } }, maintainAspectRatio: false }
});

function updateUI() {
    document.getElementById('totalCount').innerText = db.length;
    document.getElementById('forgetCount').innerText = stats.forgotten;
    myChart.data.datasets[0].data = [db.length, stats.forgotten];
    myChart.update();
    localStorage.setItem('vocab_db', JSON.stringify(db));
    localStorage.setItem('vocab_stats', JSON.stringify(stats));
}

// --- 🧠 ระบบเช็คภาษาและคำผิด ---
function isChineseChar(text) {
    // เช็คว่ามีตัวอักษรจีนอยู่ในคำหรือไม่
    return /[\u4e00-\u9fa5]/.test(text);
}

function getLevenshteinDistance(s1, s2) {
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + indicator);
        }
    }
    return track[s2.length][s1.length];
}

function getDidYouMean(wrongWord) {
    if (wrongWord.length < 3) return null;
    if (commonWords.includes(wrongWord)) return null;

    let threshold = wrongWord.length >= 5 ? 2 : 1;
    let bestMatch = null;
    let minDistance = threshold + 1;

    for (const correctWord of commonWords) {
        if (Math.abs(wrongWord.length - correctWord.length) <= 1) {
            const distance = getLevenshteinDistance(wrongWord, correctWord);
            if (distance > 0 && distance < minDistance) {
                minDistance = distance;
                bestMatch = correctWord;
                if (distance === 1) break; 
            }
        }
    }
    return bestMatch;
}

function autoFix(correctWord) {
    document.getElementById('vocabInput').value = correctWord;
    document.getElementById('grammarAlert').classList.add('hidden');
    processVocab();
}

function validateInput(text) {
    const alertBox = document.getElementById('grammarAlert');
    const word = text.toLowerCase().replace(/[?.,!]/g, '');
    
    // ถ้าเป็นภาษาจีน ข้ามการเช็คตัวสะกดไปเลย (เพราะพิมพ์เป็นตัวๆ อยู่แล้ว)
    if (isChineseChar(word)) {
        alertBox.classList.add('hidden');
        return true; 
    }

    // ถ้าเป็นภาษาอังกฤษ ทำการเช็คปกติ
    const suggestion = getDidYouMean(word);
    if (suggestion) {
        alertBox.innerHTML = `🤔 หมายถึงคำว่า <button onclick="autoFix('${suggestion}')" class="suggestion-btn">"${suggestion}"</button> ใช่ไหม?`;
        alertBox.classList.remove('hidden');
        return false;
    }
    
    if (/(.)\1\1/.test(word)) {
        alertBox.innerHTML = `⚠️ คำว่า <b>"${word}"</b> สะกดแปลกๆ นะเพื่อน`;
        alertBox.classList.remove('hidden');
        return false;
    }

    alertBox.classList.add('hidden');
    return true;
}

// --- 🌐 ระบบแปลภาษา Google (รองรับ พินอิน) ---
async function fetchTranslation(word, isChinese) {
    try {
        // ถ้าเป็นจีน แปล zh-CN -> th พร้อมขอข้อมูล dt=rm (Romanization/พินอิน)
        // ถ้าเป็นอังกฤษ แปล en -> th
        const langCode = isChinese ? 'zh-CN' : 'en';
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${langCode}&tl=th&dt=t&dt=rm&q=${encodeURIComponent(word)}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        let translatedText = data[0][0][0];
        let pinyinText = "-";

        // พยายามดึง พินอิน จาก Google API (ถ้ามี)
        if (isChinese && data[0]) {
            for (let i = 0; i < data[0].length; i++) {
                // พินอินมักจะอยู่ในตำแหน่งที่มีข้อมูล 4 ตัว และตัวที่ 3/4 คือพินอิน
                if (data[0][i][2] || data[0][i][3]) {
                    pinyinText = data[0][i][3] || data[0][i][2];
                }
            }
        }

        // เช็คแปลไม่ได้
        if (translatedText.toLowerCase() === word.toLowerCase() && word.length > 2 && !isChinese) {
            return { error: true };
        }

        return {
            translation: translatedText,
            lang: isChinese ? 'zh' : 'en',
            pinyin: pinyinText,
            past: isChinese ? "-" : generatePastTense(word),
            future: isChinese ? "-" : "will " + word,
            error: false
        };
    } catch (e) {
        return { error: true };
    }
}

function generatePastTense(word) {
    const irregulars = { 'go': 'went', 'eat': 'ate', 'see': 'saw', 'do': 'did', 'buy': 'bought' };
    const low = word.toLowerCase();
    if (irregulars[low]) return irregulars[low];
    if (low.endsWith('e')) return word + 'd';
    return word + 'ed';
}

// --- 🚀 ฟังก์ชันหลัก ---
async function processVocab() {
    const input = document.getElementById('vocabInput');
    const word = input.value.trim();
    if (!word) return;

    if (!validateInput(word)) return;

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
            data1: isChinese ? apiResult.pinyin : apiResult.past, // ใช้เก็บ Pinyin หรือ Past tense
            data2: isChinese ? "คำศัพท์ภาษาจีน" : apiResult.future,
            forgotCount: 0
        };

        db.push(newEntry);
        showData(newEntry);
        loadingOverlay?.classList.add('hidden');
    }

    input.value = '';
    updateUI();
}

// --- 🎨 ปรับการแสดงผลหน้าการ์ดให้รองรับ 2 ภาษา ---
function showData(data) {
    document.getElementById('displayTrans').innerText = data.translation;
    const badge = document.getElementById('langBadge');
    
    // ตั้งค่ากล่อง 1 (อดีต หรือ พินอิน)
    const label1 = document.getElementById('infoLabel1');
    const val1 = document.getElementById('infoValue1');
    // ตั้งค่ากล่อง 2 (อนาคต หรือ ประเภท)
    const label2 = document.getElementById('infoLabel2');
    const val2 = document.getElementById('infoValue2');

    if (data.lang === 'zh') {
        badge.innerText = "🇨🇳 Chinese";
        badge.className = "text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-600";
        
        label1.innerText = "Pinyin (พินอิน)";
        val1.innerText = data.data1 || "-";
        
        label2.innerText = "Type (ประเภท)";
        val2.innerText = data.data2 || "-";
    } else {
        badge.innerText = "🇬🇧 English";
        badge.className = "text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-600";
        
        label1.innerText = "Past Tense (อดีต)";
        val1.innerText = data.data1 || "-";
        
        label2.innerText = "Future Tense (อนาคต)";
        val2.innerText = data.data2 || "-";
    }
}

// --- 📋 คลังคำศัพท์ ---
function openVocabList() {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    db.forEach((item, index) => {
        const flag = item.lang === 'zh' ? '🇨🇳' : '🇬🇧';
        const row = document.createElement('tr');
        row.className = "hover:bg-blue-50/20 transition duration-200";
        row.innerHTML = `
            <td class="p-6 font-black text-slate-700 ${item.lang === 'zh' ? 'text-lg' : 'uppercase text-xs'}">${flag} ${item.word}</td>
            <td class="p-6 text-slate-600 text-sm font-medium">${item.translation} <br><span class="text-[10px] text-slate-400 font-normal italic">${item.data1}</span></td>
            <td class="p-6 text-center">
                <span class="px-3 py-1 rounded-full text-[10px] font-black ${item.forgotCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}">
                    ${item.forgotCount || 0}
                </span>
            </td>
            <td class="p-6 text-center">
                <button onclick="deleteWord(${index})" class="text-slate-300 hover:text-red-500 transition-all hover:scale-125">🗑️</button>
            </td>`;
        tableBody.appendChild(row);
    });
    document.getElementById('vocabModal').classList.remove('hidden');
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