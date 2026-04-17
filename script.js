let db = JSON.parse(localStorage.getItem('vocab_db')) || [];
let stats = JSON.parse(localStorage.getItem('vocab_stats')) || { forgotten: 0 };

// --- กราฟวงกลม ---
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

// --- ระบบแปลภาษาจริง ---
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
    } catch (error) {
        return { translation: "Error เชื่อมต่อไม่ได้", past: "-", future: "-" };
    }
}

function generatePastTense(word) {
    const irregulars = { 'go': 'went', 'eat': 'ate', 'see': 'saw', 'do': 'did', 'take': 'took' };
    const low = word.toLowerCase();
    if (irregulars[low]) return irregulars[low];
    if (low.endsWith('e')) return word + 'd';
    return word + 'ed';
}

// --- ฟังก์ชันหลักเมื่อกดปุ่ม ---
async function processVocab() {
    const input = document.getElementById('vocabInput');
    const word = input.value.trim();
    if (!word) return;

    const resultCard = document.getElementById('resultCard');
    const displayWord = document.getElementById('displayWord');
    const loadingOverlay = document.getElementById('loadingOverlay');

    document.getElementById('welcomeMessage')?.classList.add('hidden');
    resultCard.classList.remove('hidden');

    const lowerWord = word.toLowerCase();
    const existingIndex = db.findIndex(item => item.word.toLowerCase() === lowerWord);

    if (existingIndex !== -1) {
        // กรณีลืมคำเดิม
        displayWord.innerHTML = `<span class="forgotten-word">${word}</span>`;
        stats.forgotten += 1;
        db[existingIndex].forgotCount = (db[existingIndex].forgotCount || 0) + 1;
        showData(db[existingIndex]);
    } else {
        // กรณีคำใหม่
        loadingOverlay?.classList.remove('hidden');
        displayWord.innerText = word;
        
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

// --- ระบบจัดการคลังและปุ่มลบ ---
function openVocabList() {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    db.forEach((item, index) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition";
        row.innerHTML = `
            <td class="p-4 font-bold text-blue-600 uppercase text-sm">${item.word}</td>
            <td class="p-4 text-slate-600 text-sm">${item.translation}</td>
            <td class="p-4 text-center">
                <span class="px-2 py-1 rounded-full text-xs font-bold ${item.forgotCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}">
                    ${item.forgotCount || 0}
                </span>
            </td>
            <td class="p-4 text-center">
                <button onclick="deleteWord(${index})" class="text-red-400 hover:text-red-600 p-2">
                    🗑️
                </button>
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