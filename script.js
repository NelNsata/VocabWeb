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
            cutout: '75%'
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

// --- 🔍 ระบบตรวจจับคำสะกดผิดและ Wh-Questions ---
function checkGrammar(text) {
    const alertBox = document.getElementById('grammarAlert');
    const whWords = ['who', 'what', 'where', 'when', 'why', 'how'];
    const words = text.toLowerCase().replace(/[?.,!]/g, '').split(' ');
    let suggestions = [];

    // 1. ตรวจสอบ Wh-Words สะกดผิดเบื้องต้น
    words.forEach(w => {
        if (w.length > 2) {
            whWords.forEach(correct => {
                if (w !== correct && isSimilar(w, correct)) {
                    suggestions.push(`⚠️ คุณสะกด <b>"${correct}"</b> ผิดหรือเปล่า? (พบคำว่า "${w}")`);
                }
            });
        }
    });

    // 2. ตรวจสอบประโยคคำถาม (ถ้ามี Wh-word แต่ไม่มี ?)
    const hasWh = words.some(w => whWords.includes(w));
    if (hasWh && !text.includes('?')) {
        suggestions.push(`💡 ประโยค <b>Wh-Question</b> ควรลงท้ายด้วยเครื่องหมาย <b>"?"</b>`);
    }

    if (suggestions.length > 0) {
        alertBox.innerHTML = suggestions.join('<br>');
        alertBox.classList.remove('hidden');
    } else {
        alertBox.classList.add('hidden');
    }
}

// ฟังก์ชันช่วยเช็คความคล้ายของคำ (Levenshtein Distance แบบง่าย)
function isSimilar(s1, s2) {
    let mistakes = 0;
    if (Math.abs(s1.length - s2.length) > 1) return false;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
        if (s1[i] !== s2[i]) mistakes++;
    }
    return mistakes === 1; // ผิดได้แค่ 1 ตัวอักษร
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
            future: word.toLowerCase().includes(' ') ? "will " + word : "will " + word
        };
    } catch (e) {
        return { translation: "Error: ต่อเน็ตอยู่หรือเปล่า?", past: "-", future: "-" };
    }
}

function generatePastTense(word) {
    if (word.includes(' ')) return "n/a (phrase)";
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

    checkGrammar(word);

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

// --- 📋 คลังคำศัพท์และระบบลบ ---
function openVocabList() {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    db.forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition";
        row.innerHTML = `
            <td class="p-4 font-bold text-blue-600 uppercase text-xs">${item.word}</td>
            <td class="p-4 text-slate-600 text-sm">${item.translation}</td>
            <td class="p-4 text-center">
                <span class="px-2 py-1 rounded-full text-[10px] font-black ${item.forgotCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}">
                    ${item.forgotCount || 0}
                </span>
            </td>
            <td class="p-4 text-center">
                <button onclick="deleteWord(${index})" class="hover:scale-125 transition-transform">🗑️</button>
            </td>`;
        tableBody.appendChild(row);
    });
    document.getElementById('vocabModal').classList.remove('hidden');
}

function deleteWord(index) {
    if (confirm(`ลบคำว่า "${db[index].word}"?`)) {
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