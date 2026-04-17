let db = JSON.parse(localStorage.getItem('vocab_db')) || [];
let stats = JSON.parse(localStorage.getItem('vocab_stats')) || { forgotten: 0 };

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

// --- 🧠 ระบบหาความน่าจะเป็น (Did you mean...?) ---

// อัลกอริทึมคำนวณความต่างของตัวอักษร
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
    // ฐานข้อมูลคำศัพท์พื้นฐาน (เพิ่มได้ตามใจชอบเพื่อน)
    const dictionary = ['who', 'what', 'where', 'when', 'why', 'how', 'which', 'whom', 'whose', 'whether', 'because', 'developer', 'computer', 'language', 'understand'];
    let bestMatch = null;
    let minDistance = 3; // ผิดได้ไม่เกิน 2 ตัวอักษร

    dictionary.forEach(correctWord => {
        const distance = getLevenshteinDistance(wrongWord.toLowerCase(), correctWord);
        if (distance > 0 && distance < minDistance) {
            minDistance = distance;
            bestMatch = correctWord;
        }
    });
    return bestMatch;
}

// ฟังก์ชันกดปุ่มแก้ไขคำอัตโนมัติ
function autoFix(correctWord) {
    const input = document.getElementById('vocabInput');
    input.value = correctWord;
    document.getElementById('grammarAlert').classList.add('hidden');
    processVocab(); // ทำงานต่อทันทีหลังจากแก้คำให้แล้ว
}

// --- 🔍 ระบบตรวจสอบความถูกต้อง (Validation) ---
function validateInput(text) {
    const alertBox = document.getElementById('grammarAlert');
    const words = text.toLowerCase().replace(/[?.,!]/g, '').split(' ');
    let suggestions = [];
    let isBlocker = false;

    words.forEach(w => {
        // เช็คความน่าจะเป็น
        const suggestion = getDidYouMean(w);
        if (suggestion) {
            suggestions.push(`🤔 คุณหมายถึงคำว่า <button onclick="autoFix('${suggestion}')" class="suggestion-btn">"${suggestion}"</button> หรือเปล่า?`);
            isBlocker = true; // บล็อกไว้เพื่อให้ user กดเลือกคำที่ถูก
        }

        // เช็คตัวอักษรซ้ำ
        if (/(.)\1\1/.test(w)) {
            suggestions.push(`⚠️ คำว่า <b>"${w}"</b> ดูเหมือนจะมีตัวอักษรซ้ำซ้อนผิดปกติ`);
            isBlocker = true;
        }
    });

    if (suggestions.length > 0) {
        alertBox.innerHTML = suggestions.join('<br>');
        alertBox.classList.remove('hidden');
        return !isBlocker;
    }
    
    alertBox.classList.add('hidden');
    return true;
}

// --- 🌐 ระบบแปลภาษาจริง ---
async function fetchTranslation(word) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t&q=${encodeURIComponent(word)}`;
        const response = await fetch(url);
        const data = await response.json();
        return {
            translation: data[0][0][0],
            past: generatePastTense(word),
            future: "will " + word
        };
    } catch (e) {
        return { translation: "เกิดข้อผิดพลาดในการเชื่อมต่อ", past: "-", future: "-" };
    }
}

function generatePastTense(word) {
    const irregulars = { 'go': 'went', 'eat': 'ate', 'see': 'saw', 'do': 'did', 'buy': 'bought', 'take': 'took' };
    const low = word.toLowerCase();
    if (word.includes(' ')) return "Phrase";
    if (irregulars[low]) return irregulars[low];
    if (low.endsWith('e')) return word + 'd';
    return word + 'ed';
}

// --- 🚀 ฟังก์ชันประมวลผลหลัก ---
async function processVocab() {
    const input = document.getElementById('vocabInput');
    const word = input.value.trim();
    if (!word) return;

    // ตรวจสอบความถูกต้อง (Did you mean?)
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
        displayTrans.innerText = "กำลังค้นหาคำแปล...";
        
        const apiResult = await fetchTranslation(word);
        const newEntry = {
            word: word,
            translation: apiResult.translation,
            past: apiResult.past,
            future: apiResult.future,
            forgotCount: 0
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

// --- 📋 ระบบคลังคำศัพท์ ---
function openVocabList() {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    db.forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-blue-50/30 transition duration-200";
        row.innerHTML = `
            <td class="p-6 font-black text-blue-600 uppercase text-sm tracking-tight">${item.word}</td>
            <td class="p-6 text-slate-600 text-sm font-medium">${item.translation}</td>
            <td class="p-6 text-center">
                <span class="px-3 py-1 rounded-full text-[10px] font-black ${item.forgotCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}">
                    ${item.forgotCount || 0}
                </span>
            </td>
            <td class="p-6 text-center">
                <button onclick="deleteWord(${index})" class="text-slate-300 hover:text-red-500 transition-all transform hover:scale-125">🗑️</button>
            </td>`;
        tableBody.appendChild(row);
    });
    document.getElementById('vocabModal').classList.remove('hidden');
}

function deleteWord(index) {
    if (confirm(`ลบคำว่า "${db[index].word}" ออกจากความทรงจำ?`)) {
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

updateUI();