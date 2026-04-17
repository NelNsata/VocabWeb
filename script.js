let db = JSON.parse(localStorage.getItem('vocab_db')) || [];
let stats = JSON.parse(localStorage.getItem('vocab_stats')) || { forgotten: 0 };
let commonWords = []; 

// --- 🌐 ระบบดึง Dictionary แบบ Full Load (10,000 คำ) ---
async function initDictionary() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const text = await response.text();
        
        // กวาดเอา 10,000 คำเข้าคลังสมองเลย!
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

// --- 🧠 อัลกอริทึมหาคำศัพท์ผิดเพี้ยน ---
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
    
    // ถ้าคำที่พิมพ์มา อยู่ใน 10,000 คำอยู่แล้ว แปลว่าถูกชัวร์ ปล่อยผ่านได้เลย
    if (commonWords.includes(wrongWord)) return null;

    let threshold = wrongWord.length >= 5 ? 2 : 1; // คำยาวยอมให้ผิดได้ 2 ตัว
    let bestMatch = null;
    let minDistance = threshold + 1;

    for (const correctWord of commonWords) {
        if (Math.abs(wrongWord.length - correctWord.length) <= 1) {
            const distance = getLevenshteinDistance(wrongWord, correctWord);
            if (distance > 0 && distance < minDistance) {
                minDistance = distance;
                bestMatch = correctWord;
                // ถ้าผิดแค่ 1 ตัวอักษร และเป็นคำฮิตๆ (เจอแรกๆ) ให้เบรกทันที
                if (distance === 1) break; 
            }
        }
    }
    return bestMatch;
}

function autoFix(correctWord) {
    const input = document.getElementById('vocabInput');
    input.value = correctWord;
    document.getElementById('grammarAlert').classList.add('hidden');
    processVocab();
}

// --- 🔍 ระบบตรวจสอบการสะกดคำ (เข้มงวด) ---
function validateInput(text) {
    const alertBox = document.getElementById('grammarAlert');
    const word = text.toLowerCase().replace(/[?.,!]/g, '');
    
    const suggestion = getDidYouMean(word);
    
    if (suggestion) {
        alertBox.innerHTML = `🤔 เพื่อน R พิมพ์ผิดหรือเปล่า? หมายถึงคำว่า <button onclick="autoFix('${suggestion}')" class="suggestion-btn">"${suggestion}"</button> ใช่ไหม?`;
        alertBox.classList.remove('hidden');
        return false; // ไม่ยอมให้ผ่านจนกว่าจะคลิกแก้คำผิด
    }
    
    // ดักตัวอักษรซ้ำรัวๆ เช่น remooov
    if (/(.)\1\1/.test(word)) {
        alertBox.innerHTML = `⚠️ คำว่า <b>"${word}"</b> สะกดแปลกๆ นะเพื่อน ลองเช็คอีกที`;
        alertBox.classList.remove('hidden');
        return false;
    }

    alertBox.classList.add('hidden');
    return true;
}

// --- 🌐 ระบบแปลภาษา Google ---
async function fetchTranslation(word) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t&q=${encodeURIComponent(word)}`;
        const response = await fetch(url);
        const data = await response.json();
        let translatedText = data[0][0][0];

        if (translatedText.toLowerCase() === word.toLowerCase() && word.length > 2) {
            return { error: true };
        }

        return {
            translation: translatedText,
            past: generatePastTense(word),
            future: "will " + word,
            error: false
        };
    } catch (e) {
        return { error: true };
    }
}

function generatePastTense(word) {
    const irregulars = { 'go': 'went', 'eat': 'ate', 'see': 'saw', 'do': 'did', 'buy': 'bought', 'remove': 'removed' };
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

    // เช็คความถูกต้อง ถ้าเด้งถาม "Did you mean?" จะหยุดการทำงานบรรทัดนี้
    if (!validateInput(word)) return;

    const resultCard = document.getElementById('resultCard');
    const displayWord = document.getElementById('displayWord');
    const displayTrans = document.getElementById('displayTrans');
    const loadingOverlay = document.getElementById('loadingOverlay');

    document.getElementById('welcomeMessage')?.classList.add('hidden');
    resultCard.classList.remove('hidden');

    const lowerWord = word.toLowerCase();
    const existingIndex = db.findIndex(item => item.word.toLowerCase() === lowerWord);

    if (existingIndex !== -1) {
        displayWord.innerHTML = `<span class="forgotten-word">${word}</span>`;
        stats.forgotten += 1;
        db[existingIndex].forgotCount = (db[existingIndex].forgotCount || 0) + 1;
        showData(db[existingIndex]);
    } else {
        loadingOverlay?.classList.remove('hidden');
        displayWord.innerText = word;
        displayTrans.innerText = "กำลังค้นหา...";
        
        const apiResult = await fetchTranslation(word);
        
        if (apiResult.error) {
            loadingOverlay?.classList.add('hidden');
            document.getElementById('grammarAlert').innerHTML = `❌ ไม่พบคำแปลสำหรับ <b>"${word}"</b> โปรดเช็คอีกทีเพื่อน`;
            document.getElementById('grammarAlert').classList.remove('hidden');
            return;
        }

        const newEntry = {
            word: word, translation: apiResult.translation,
            past: apiResult.past, future: apiResult.future, forgotCount: 0
        };

        db.push(newEntry);
        showData(newEntry);
        loadingOverlay?.classList.add('hidden');
    }

    input.value = '';
    updateUI();
}

function showData(data) {
    document.getElementById('displayTrans').innerText = data.translation;
    document.getElementById('pastTense').innerText = data.past;
    document.getElementById('futureTense').innerText = data.future;
}

// --- 📋 คลังคำศัพท์ ---
function openVocabList() {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    db.forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-blue-50/20 transition duration-200";
        row.innerHTML = `
            <td class="p-6 font-black text-blue-600 uppercase text-xs">${item.word}</td>
            <td class="p-6 text-slate-600 text-sm font-medium">${item.translation}</td>
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

// เริ่มโหลดพจนานุกรม 10K ตอนเปิดเว็บเลย!
initDictionary();
updateUI();