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

// --- 🔍 ระบบตรวจสอบความถูกต้องแบบเข้มงวด ---
function validateInput(text) {
    const alertBox = document.getElementById('grammarAlert');
    const whWords = ['who', 'what', 'where', 'when', 'why', 'how'];
    const words = text.toLowerCase().replace(/[?.,!]/g, '').split(' ');
    let suggestions = [];

    // 1. ตรวจสอบ Wh-Words (Strict Check)
    words.forEach(w => {
        if (w.startsWith('wh') || w === 'how' || (w.includes('wh') && w.length > 2)) {
            if (!whWords.includes(w)) {
                suggestions.push(`❌ คำว่า <b>"${w}"</b> สะกดผิด! โปรดตรวจสอบตัวสะกด (เช่น where, what, who)`);
            }
        }
    });

    // 2. ตรวจสอบการเบิ้ลตัวอักษรผิดปกติ (เช่น Wherrr, Cattt)
    const hasRepeated = /(.)\1\1/.test(text.toLowerCase());
    if (hasRepeated) {
        suggestions.push(`⚠️ พบตัวอักษรซ้ำซ้อนผิดปกติใน <b>"${text}"</b> กรุณาพิมพ์ใหม่ให้ถูกต้อง`);
    }

    // 3. ตรวจสอบประโยคคำถาม
    const hasWh = words.some(w => whWords.includes(w));
    if (hasWh && !text.includes('?')) {
        suggestions.push(`💡 อย่าลืมใส่เครื่องหมาย <b>"?"</b> ท้ายประโยค Wh-Question นะครับ`);
    }

    if (suggestions.length > 0) {
        alertBox.innerHTML = suggestions.join('<br>');
        alertBox.classList.remove('hidden');
        
        // ถ้าสะกดผิด หรือมีเครื่องหมายกากบาท จะไม่ยอมให้เซฟลงสถิติ
        return !suggestions.some(s => s.includes('❌') || s.includes('⚠️'));
    }
    
    alertBox.classList.add('hidden');
    return true;
}

// --- 🌐 ระบบแปลภาษาจริงจาก Google ---
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
        return { translation: "ไม่พบคำแปล", past: "-", future: "-" };
    }
}

function generatePastTense(word) {
    const irregulars = { 'go': 'went', 'eat': 'ate', 'see': 'saw', 'do': 'did', 'buy': 'bought' };
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

    // ตรวจสอบความถูกต้องก่อน (ถ้าไม่ผ่านให้หยุดเลย)
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
        // [CASE: พิมพ์ซ้ำ]
        displayWord.innerHTML = `<span class="forgotten-word">${word}</span>`;
        stats.forgotten += 1;
        db[existingIndex].forgotCount = (db[existingIndex].forgotCount || 0) + 1;
        showData(db[existingIndex]);
    } else {
        // [CASE: คำใหม่]
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

// --- 📋 จัดการคลังและสถิติ ---
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
                <button onclick="deleteWord(${index})" class="text-slate-300 hover:text-red-500 transition-transform hover:scale-125">🗑️</button>
            </td>`;
        tableBody.appendChild(row);
    });
    document.getElementById('vocabModal').classList.remove('hidden');
}

function deleteWord(index) {
    if (confirm(`คุณต้องการลบคำว่า "${db[index].word}" ใช่หรือไม่?`)) {
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