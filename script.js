// ==========================================
// 🌟 1. ตั้งค่า SUPABASE (เปลี่ยนชื่อตัวแปรแก้บัคแล้ว)
// ==========================================
const SUPABASE_URL = 'https://oobldgtmzjdbiyqzcjyw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vYmxkZ3RtempkYml5cXpjanl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTI2ODAsImV4cCI6MjA5MjI2ODY4MH0.D7k_8tLHXhUn1cJvb78IUwXIh4AtojHHgpfnQ1kjmjw';

// ใช้ชื่อตัวแปร 'supa' แทน เพื่อไม่ให้ไปชนกับของเดิมในระบบ
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let db = []; 
let stats = { forgotten: 0 };
let commonWords = []; 
let chartInstance = null;

// --- 🔐 ระบบ Authentication (Discord) & Local Sync ---
supa.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const cloudSyncIcon = document.getElementById('cloudSyncIcon');

    if (currentUser) {
        // ล็อกอินแล้ว!
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userInfo.classList.add('flex');
        cloudSyncIcon.classList.remove('hidden');
        
        document.getElementById('userName').innerText = currentUser.user_metadata.full_name || currentUser.email;
        document.getElementById('userAvatar').src = currentUser.user_metadata.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

        // ดูดคำจาก Local ขึ้น Cloud ทันทีเมื่อล็อกอิน
        await syncLocalToCloud();
        await loadDataFromCloud();
    } else {
        // ยังไม่ล็อกอิน (ใช้ LocalStorage)
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        userInfo.classList.remove('flex');
        cloudSyncIcon.classList.add('hidden');
        
        loadDataFromLocal();
    }
});

async function loginWithDiscord() {
    const { data, error } = await supa.auth.signInWithOAuth({ 
        provider: 'discord'
    });
    
    if (error) {
        alert("เกิดข้อผิดพลาดในการล็อกอิน: " + error.message);
    }
}

async function logout() {
    await supa.auth.signOut();
    window.location.reload();
}

// ==========================================
// ☁️ 2. ระบบจัดการข้อมูล (Data Management)
// ==========================================

function loadDataFromLocal() {
    db = JSON.parse(localStorage.getItem('vocab_db')) || [];
    recalculateStats();
    initChart();
}

async function loadDataFromCloud() {
    const { data, error } = await supa
        .from('vocab_entries')
        .select('*')
        .order('id', { ascending: true });
        
    if (!error) {
        db = data.map(item => ({
            db_id: item.id,
            word: item.word,
            translation: item.translation,
            altTrans: item.alt_trans,
            lang: item.lang,
            pos: item.pos,
            data1: item.data1,
            data2: item.data2,
            forgotCount: item.forgot_count
        }));
    }
    recalculateStats();
    initChart();
}

async function syncLocalToCloud() {
    const localDb = JSON.parse(localStorage.getItem('vocab_db')) || [];
    if (localDb.length === 0) return; 

    const recordsToInsert = localDb.map(item => ({
        user_id: currentUser.id,
        word: item.word,
        translation: item.translation,
        alt_trans: item.altTrans || '',
        lang: item.lang || 'en',
        pos: item.pos || 'General',
        data1: item.data1 || '',
        data2: item.data2 || '',
        forgot_count: item.forgotCount || 0
    }));

    const { error } = await supa.from('vocab_entries').insert(recordsToInsert);
    if (!error) {
        localStorage.removeItem('vocab_db'); 
        alert('☁️ ซิงค์คำศัพท์จากเครื่องนี้ขึ้น Cloud สำเร็จแล้วเพื่อน!');
    }
}

async function saveEntry(newEntry) {
    if (currentUser) {
        const record = {
            user_id: currentUser.id,
            word: newEntry.word,
            translation: newEntry.translation,
            alt_trans: newEntry.altTrans || '',
            lang: newEntry.lang || 'en',
            pos: newEntry.pos || 'General',
            data1: newEntry.data1 || '',
            data2: newEntry.data2 || '',
            forgot_count: newEntry.forgotCount || 0
        };
        const { data, error } = await supa.from('vocab_entries').insert([record]).select();
        if (!error && data) {
            newEntry.db_id = data[0].id;
            db.push(newEntry);
        }
    } else {
        db.push(newEntry);
        localStorage.setItem('vocab_db', JSON.stringify(db));
    }
    recalculateStats();
    updateChart();
}

async function updateForgotCount(index) {
    db[index].forgotCount = (db[index].forgotCount || 0) + 1;
    
    if (currentUser && db[index].db_id) {
        await supa.from('vocab_entries').update({ forgot_count: db[index].forgotCount }).eq('id', db[index].db_id);
    } else {
        localStorage.setItem('vocab_db', JSON.stringify(db));
    }
    recalculateStats();
    updateChart();
}

async function deleteWord(index) {
    if (confirm(`ลบคำนี้ออกจากคลังความจำ?`)) {
        if (currentUser && db[index].db_id) {
            await supa.from('vocab_entries').delete().eq('id', db[index].db_id);
        }
        db.splice(index, 1);
        if (!currentUser) localStorage.setItem('vocab_db', JSON.stringify(db));
        
        recalculateStats();
        updateChart();
        openVocabList();
    }
}

function recalculateStats() {
    stats.forgotten = db.reduce((sum, item) => sum + (item.forgotCount || 0), 0);
    document.getElementById('totalCount').innerText = db.length;
    document.getElementById('forgetCount').innerText = stats.forgotten;
}

// ==========================================
// 📊 3. ระบบกราฟและ UI
// ==========================================
function initChart() {
    const ctx = document.getElementById('statChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new Chart(ctx, {
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
}

function updateChart() {
    if (chartInstance) {
        chartInstance.data.datasets[0].data = [db.length, stats.forgotten];
        chartInstance.update();
    }
}

// ==========================================
// 🧠 4. ระบบ Dictionary & AI Logic
// ==========================================
async function initDictionary() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        const text = await response.text();
        commonWords = text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        document.getElementById('dictStatus').innerHTML = "✅ <span class='font-black'>PRO DICT READY</span>";
        document.getElementById('dictStatus').classList.replace('text-slate-400', 'text-green-500');
    } catch (e) {
        document.getElementById('dictStatus').innerText = "⚠️ Offline Mode";
    }
}

function isChineseChar(text) { return /[\u4e00-\u9fa5]/.test(text); }

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
    if (wrongWord.length < 3 || commonWords.includes(wrongWord)) return null;
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
    
    if (isChineseChar(word)) { alertBox.classList.add('hidden'); return true; }

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

async function fetchPartOfSpeech(word, isChinese) {
    const lowerWord = word.toLowerCase();
    if (isChinese) {
        const greetingsZH = ['你好', '早安', '晚安', '再见', '谢谢', '对不起', '拜拜'];
        if (greetingsZH.includes(word)) return "Greeting (คำทักทาย)";
        if (word.endsWith('国') || word.endsWith('兰') || word.endsWith('亚')) return "Proper Noun (ชื่อประเทศ/สถานที่)";
        if (word.length >= 4) return "Phrase / Idiom (วลี/สำนวน)";
        return "Noun / Verb"; 
    }
    const whWordsPOS = { 'who': 'Pronoun', 'what': 'Pronoun, Adverb', 'where': 'Adverb, Conjunction', 'when': 'Adverb, Conjunction', 'why': 'Adverb, Conjunction, Noun', 'how': 'Adverb, Conjunction', 'which': 'Pronoun, Determiner', 'whom': 'Pronoun', 'whose': 'Pronoun, Determiner' };
    if (whWordsPOS[lowerWord]) return whWordsPOS[lowerWord];
    const greetingsEN = ['hello', 'hi', 'hey', 'goodbye', 'bye', 'welcome', 'thanks', 'sorry', 'good morning', 'good night'];
    if (greetingsEN.includes(lowerWord)) return "Interjection (คำทักทาย/อุทาน)";
    const countriesEN = ['china', 'japan', 'korea', 'america', 'france', 'germany', 'italy', 'spain', 'thailand', 'london', 'england'];
    if (countriesEN.includes(lowerWord) || lowerWord.endsWith('land') || lowerWord.endsWith('ia')) return "Proper Noun (ชื่อประเทศ/สถานที่)";
    if (lowerWord.includes(' ')) return "Phrase (วลี/ประโยค)";

    try {
        const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (dictRes.ok) {
            const dictData = await dictRes.json();
            const posArray = dictData[0].meanings.map(m => m.partOfSpeech);
            const uniquePos = [...new Set(posArray)];
            return uniquePos.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
        } else {
            return "Unknown / Proper Noun";
        }
    } catch (err) { return "Unknown"; }
}

async function fetchTranslation(word, isChinese) {
    try {
        const langCode = isChinese ? 'zh-CN' : 'en';
        const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${langCode}&tl=th&dt=t&dt=rm&dt=bd&q=${encodeURIComponent(word)}`;
        const gtRes = await fetch(gtUrl);
        const gtData = await gtRes.json();
        
        let translatedText = gtData[0][0][0];
        let pinyinText = "-";
        let altTranslations = []; 

        if (isChinese && gtData[0]) {
            for (let i = 0; i < gtData[0].length; i++) {
                if (gtData[0][i][2] || gtData[0][i][3]) pinyinText = gtData[0][i][3] || gtData[0][i][2];
            }
        }

        if (gtData[1]) {
            gtData[1].forEach(posGroup => { if (posGroup[1]) altTranslations.push(...posGroup[1]); });
            altTranslations = [...new Set(altTranslations)].filter(t => t !== translatedText).slice(0, 5);
        }
        let altText = altTranslations.length > 0 ? altTranslations.join(', ') : "";

        if (translatedText.toLowerCase() === word.toLowerCase() && word.length > 2 && !isChinese) return { error: true };

        let partOfSpeech = await fetchPartOfSpeech(word, isChinese);
        let past = "-"; let future = "-";
        if (!isChinese) {
            const posLower = partOfSpeech.toLowerCase();
            if (posLower.includes('verb')) {
                past = generatePastTense(word);
                future = "will " + word;
            }
        }
        return { translation: translatedText, altTrans: altText, lang: isChinese ? 'zh' : 'en', pinyin: pinyinText, pos: partOfSpeech, past: past, future: future, error: false };
    } catch (e) { return { error: true }; }
}

function generatePastTense(word) {
    if (word.includes(' ')) return "-"; 
    const irregulars = { 'go': 'went', 'eat': 'ate', 'see': 'saw', 'do': 'did', 'buy': 'bought', 'develop': 'developed', 'understand': 'understood', 'remove': 'removed', 'can': 'could' };
    const low = word.toLowerCase();
    if (irregulars[low]) return irregulars[low];
    if (low.endsWith('e')) return word + 'd';
    if (low.endsWith('y') && !/[aeiou]y$/.test(low)) return word.slice(0, -1) + 'ied';
    return word + 'ed';
}

// --- 🚀 ประมวลผลหลัก ---
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
        await updateForgotCount(existingIndex);
        showData(db[existingIndex]);
    } else {
        loadingOverlay?.classList.remove('hidden');
        displayWord.innerText = word;
        displayTrans.innerText = "กำลังดึงข้อมูลระดับลึก...";
        
        const apiResult = await fetchTranslation(word, isChinese);
        
        if (apiResult.error) {
            loadingOverlay?.classList.add('hidden');
            document.getElementById('grammarAlert').innerHTML = `❌ ไม่พบคำแปลสำหรับ <b>"${word}"</b> โปรดเช็คตัวสะกด`;
            document.getElementById('grammarAlert').classList.remove('hidden');
            return;
        }

        const newEntry = {
            word: word, 
            translation: apiResult.translation,
            altTrans: apiResult.altTrans, 
            lang: apiResult.lang,
            pos: apiResult.pos, 
            data1: isChinese ? apiResult.pinyin : apiResult.past,
            data2: isChinese ? "คำศัพท์ภาษาจีน" : apiResult.future,
            forgotCount: 0
        };

        await saveEntry(newEntry);
        showData(newEntry);
        loadingOverlay?.classList.add('hidden');
    }
    input.value = '';
}

function showData(data) {
    let transHtml = data.translation;
    if (data.altTrans) transHtml += `<br><span class="text-base md:text-lg text-slate-400 font-normal italic">ความหมายอื่นๆ: ${data.altTrans}</span>`;
    document.getElementById('displayTrans').innerHTML = transHtml;
    
    const badge = document.getElementById('langBadge');
    if (data.lang === 'zh') {
        badge.innerText = "🇨🇳 Chinese"; badge.className = "text-xs md:text-sm font-bold px-3 py-1.5 rounded-full bg-red-100 text-red-600 border border-red-200 shadow-sm";
    } else {
        badge.innerText = "🇬🇧 English"; badge.className = "text-xs md:text-sm font-bold px-3 py-1.5 rounded-full bg-blue-100 text-blue-600 border border-blue-200 shadow-sm";
    }

    const posBadge = document.getElementById('posBadge');
    if (data.pos && data.pos !== "Unknown") {
        posBadge.innerText = data.pos; posBadge.classList.remove('hidden');
    } else { posBadge.classList.add('hidden'); }

    const label1 = document.getElementById('infoLabel1');
    const val1 = document.getElementById('infoValue1');
    const label2 = document.getElementById('infoLabel2');
    const val2 = document.getElementById('infoValue2');

    if (data.lang === 'zh') {
        label1.innerText = "Pinyin (พินอิน)"; val1.innerText = data.data1 || "-";
        label2.innerText = "Type (ประเภท)"; val2.innerText = data.data2 || "-";
    } else {
        label1.innerText = "Past Tense (อดีต)"; val1.innerText = data.data1 || "-";
        label2.innerText = "Future Tense (อนาคต)"; val2.innerText = data.data2 || "-";
    }
}

function openVocabList() {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    db.forEach((item, index) => {
        const flag = item.lang === 'zh' ? '🇨🇳' : '🇬🇧';
        const posHtml = (item.pos && item.pos !== "Unknown") ? `<br><span class="inline-block mt-2 text-[10px] md:text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-black uppercase tracking-wider">${item.pos}</span>` : '';
        const altHtml = item.altTrans ? `<br><span class="text-xs md:text-sm text-slate-400 mt-1 inline-block">อื่นๆ: ${item.altTrans}</span>` : '';
        const infoData = item.data1 !== undefined ? item.data1 : '-';

        const row = document.createElement('tr');
        row.className = "hover:bg-blue-50/30 transition duration-200 border-b border-slate-50";
        row.innerHTML = `
            <td class="p-4 md:p-6 align-top">
                <span class="font-black text-slate-700 ${item.lang === 'zh' ? 'text-xl md:text-2xl' : 'uppercase text-sm md:text-base lg:text-lg'}">${flag} ${item.word}</span>
                ${posHtml}
            </td>
            <td class="p-4 md:p-6 text-slate-700 text-base md:text-lg font-medium align-top">
                ${item.translation} ${altHtml} <br><span class="text-sm md:text-base text-slate-400 font-normal italic mt-1 inline-block">${infoData}</span>
            </td>
            <td class="p-4 md:p-6 text-center align-middle">
                <span class="px-3 py-1 md:py-1.5 rounded-full text-xs md:text-sm font-black ${item.forgotCount > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}">${item.forgotCount || 0}</span>
            </td>
            <td class="p-4 md:p-6 text-center align-middle">
                <button onclick="deleteWord(${index})" class="text-slate-300 hover:text-red-500 text-xl md:text-2xl transition-all hover:scale-125">🗑️</button>
            </td>`;
        tableBody.appendChild(row);
    });
    document.getElementById('vocabModal').classList.remove('hidden');
}

async function updateOldWords() {
    const icon = document.getElementById('syncIcon');
    icon.classList.add('inline-block', 'spin-fast'); 

    const wordsToUpdate = db.filter(item => item.lang !== 'zh' && (!item.pos || item.altTrans === undefined));
    
    if (wordsToUpdate.length === 0) {
        icon.classList.remove('spin-fast');
        alert(`คำทั้งหมดอัปเดตสมบูรณ์แล้ว!`);
        return;
    }

    const updatePromises = wordsToUpdate.map(async (item) => {
        const newPos = await fetchPartOfSpeech(item.word, false);
        item.pos = newPos;

        const posLower = newPos.toLowerCase();
        if (item.word.includes(' ') || !posLower.includes('verb')) {
            item.data1 = "-"; 
            item.data2 = "-"; 
        }

        if (item.altTrans === undefined) {
            try {
                const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=th&dt=t&dt=bd&q=${encodeURIComponent(item.word)}`;
                const gtRes = await fetch(gtUrl);
                const gtData = await gtRes.json();
                
                let altTranslations = [];
                if (gtData[1]) {
                    gtData[1].forEach(posGroup => {
                        if (posGroup[1]) altTranslations.push(...posGroup[1]);
                    });
                    altTranslations = [...new Set(altTranslations)].filter(t => t !== item.translation).slice(0, 5);
                }
                item.altTrans = altTranslations.length > 0 ? altTranslations.join(', ') : "";
            } catch (e) {
                item.altTrans = "";
            }
        }
        
        if (currentUser && item.db_id) {
            await supa.from('vocab_entries').update({
                pos: item.pos,
                data1: item.data1,
                data2: item.data2,
                alt_trans: item.altTrans
            }).eq('id', item.db_id);
        }
    });

    await Promise.all(updatePromises);

    icon.classList.remove('spin-fast'); 
    updateUI();
    
    if (!document.getElementById('vocabModal').classList.contains('hidden')) {
        openVocabList(); 
    }
    alert(`⚡ อัปเดตความหมายเพิ่มเติม และซ่อมแซมคำเก่าเรียบร้อยครับ R!`);
}

function closeVocabList() { document.getElementById('vocabModal').classList.add('hidden'); }
document.getElementById('vocabInput').addEventListener('keypress', (e) => { if (e.key === 'Enter') processVocab(); });

initDictionary();