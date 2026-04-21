// ==========================================
// 🌟 1. ตั้งค่า SUPABASE (Production Keys)
// ==========================================
const SUPABASE_URL = 'https://oobldgtmzjdbiyqzcjyw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vYmxkZ3RtempkYml5cXpjanl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTI2ODAsImV4cCI6MjA5MjI2ODY4MH0.D7k_8tLHXhUn1cJvb78IUwXIh4AtojHHgpfnQ1kjmjw';

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let db = []; 
let stats = { forgotten: 0 };
let commonWords = []; 
let chartInstance = null;
let isInitialLoadDone = false;

// ==========================================
// 🔐 2. ระบบ Authentication & Session Manager
// ==========================================
supa.auth.onAuthStateChange(async (event, session) => {
    currentUser = session?.user || null;
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const cloudSyncIcon = document.getElementById('cloudSyncIcon');

    if (currentUser) {
        if(loginBtn) loginBtn.classList.add('hidden');
        if(userInfo) {
            userInfo.classList.remove('hidden');
            userInfo.classList.add('flex');
        }
        if(cloudSyncIcon) cloudSyncIcon.classList.remove('hidden');
        
        document.getElementById('userName').innerText = currentUser.user_metadata.full_name || currentUser.email.split('@')[0];
        document.getElementById('userAvatar').src = currentUser.user_metadata.avatar_url || 'https://ui-avatars.com/api/?name=' + currentUser.email;

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            if (!isInitialLoadDone) {
                isInitialLoadDone = true;
                await syncLocalToCloud();
                await loadDataFromCloud();
                
                if (window.location.hash.includes('access_token')) {
                    history.replaceState(null, document.title, window.location.pathname);
                }
            }
        }
    } else {
        if(loginBtn) loginBtn.classList.remove('hidden');
        if(userInfo) {
            userInfo.classList.add('hidden');
            userInfo.classList.remove('flex');
        }
        if(cloudSyncIcon) cloudSyncIcon.classList.add('hidden');
        
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
            loadDataFromLocal();
        }
    }
});

async function loginWithDiscord() {
    try {
        const { error } = await supa.auth.signInWithOAuth({ provider: 'discord' });
        if (error) throw error;
    } catch (err) {
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อ Discord: " + err.message);
    }
}

async function logout() {
    try {
        document.getElementById('userName').innerText = "กำลังออก...";
        
        const signOutPromise = supa.auth.signOut();
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, 2000));
        await Promise.race([signOutPromise, timeoutPromise]);
    } catch (err) {
        console.error("Logout Error:", err);
    } finally {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach((c) => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        window.location.href = window.location.origin + window.location.pathname;
    }
}

// ==========================================
// ☁️ 3. ระบบ Data Sync & Cloud Management
// ==========================================
function loadDataFromLocal() {
    try {
        db = JSON.parse(localStorage.getItem('vocab_db')) || [];
    } catch (e) {
        db = []; 
    }
    updateUI(); 
    initChart();
}

async function loadDataFromCloud(retryCount = 0) {
    try {
        const { data, error } = await supa
            .from('vocab_entries')
            .select('*')
            .eq('user_id', currentUser.id) 
            .order('id', { ascending: true });
            
        if (error) throw error;

        if (data) {
            db = data.map(item => ({
                db_id: item.id,
                word: item.word,
                translation: item.translation,
                altTrans: item.alt_trans || '',
                lang: item.lang || 'en',
                pos: item.pos || 'General',
                data1: (item.data1 && item.data1 !== 'undefined' && item.data1 !== 'null') ? item.data1 : '-',
                data2: (item.data2 && item.data2 !== 'undefined' && item.data2 !== 'null') ? item.data2 : '-',
                forgotCount: item.forgot_count || 0
            }));
        }
    } catch (err) {
        if (retryCount < 1) {
            setTimeout(() => loadDataFromCloud(1), 1500);
            return;
        }
    }
    
    updateUI();
    initChart();
    
    const modal = document.getElementById('vocabModal');
    if (modal && !modal.classList.contains('hidden')) openVocabList();
}

let isSyncing = false; 
async function syncLocalToCloud() {
    if (isSyncing) return;
    const localDb = JSON.parse(localStorage.getItem('vocab_db')) || [];
    if (!Array.isArray(localDb) || localDb.length === 0) return; 

    isSyncing = true;
    try {
        const { data: cloudData, error: fetchError } = await supa
            .from('vocab_entries')
            .select('id, word, forgot_count')
            .eq('user_id', currentUser.id);

        if (fetchError) throw fetchError;

        const recordsToInsert = [];

        for (const localItem of localDb) {
            if (!localItem || !localItem.word) continue; 
            
            const lowerLocalWord = localItem.word.toLowerCase();
            const existingCloudItem = cloudData.find(c => c.word.toLowerCase() === lowerLocalWord);

            if (existingCloudItem) {
                if (localItem.forgotCount > 0) {
                    await supa.from('vocab_entries')
                        .update({ forgot_count: existingCloudItem.forgot_count + localItem.forgotCount })
                        .eq('id', existingCloudItem.id);
                }
            } else {
                recordsToInsert.push({
                    user_id: currentUser.id,
                    word: localItem.word,
                    translation: localItem.translation || '',
                    alt_trans: localItem.altTrans || '',
                    lang: localItem.lang || 'en',
                    pos: localItem.pos || 'General',
                    data1: (localItem.data1 && localItem.data1 !== 'undefined') ? localItem.data1 : '-',
                    data2: (localItem.data2 && localItem.data2 !== 'undefined') ? localItem.data2 : '-',
                    forgot_count: localItem.forgotCount || 0
                });
            }
        }

        if (recordsToInsert.length > 0) {
            await supa.from('vocab_entries').insert(recordsToInsert);
        }

        localStorage.removeItem('vocab_db'); 
        localStorage.removeItem('vocab_stats');

    } catch (err) {
        console.error("Sync Error:", err);
    } finally {
        isSyncing = false;
    }
}

let isSaving = false; 
async function saveEntry(newEntry) {
    if (isSaving) return;
    isSaving = true;

    try {
        if (currentUser) {
            const record = {
                user_id: currentUser.id,
                word: newEntry.word,
                translation: newEntry.translation,
                alt_trans: newEntry.altTrans || '',
                lang: newEntry.lang || 'en',
                pos: newEntry.pos || 'General',
                data1: newEntry.data1 || '-',
                data2: newEntry.data2 || '-',
                forgot_count: newEntry.forgotCount || 0
            };
            const { data, error } = await supa.from('vocab_entries').insert([record]).select();
            if (!error && data) {
                newEntry.db_id = data[0].id;
                db.push(newEntry);
            }
        } else {
            db.push(newEntry);
        }
        updateUI(); 
    } finally {
        isSaving = false;
    }
}

async function updateForgotCount(index) {
    db[index].forgotCount = (db[index].forgotCount || 0) + 1;
    updateUI(); 
    
    if (currentUser && db[index].db_id) {
        supa.from('vocab_entries')
            .update({ forgot_count: db[index].forgotCount })
            .eq('id', db[index].db_id)
            .then(({error}) => { if(error) console.error("Update failed", error); });
    }
}

async function deleteWord(index) {
    if (confirm(`ลบคำว่า "${db[index].word}" ออกจากคลังความจำ?`)) {
        const deletedItem = db[index];
        db.splice(index, 1);
        updateUI(); 
        
        // ถ้าเปิดหน้าต่างค้นหาอยู่ ให้ดึงคำค้นหาล่าสุดมาเรนเดอร์ใหม่
        const searchTerm = document.getElementById('vocabSearch')?.value.toLowerCase() || "";
        renderTable(searchTerm);
        
        if (currentUser && deletedItem.db_id) {
            await supa.from('vocab_entries').delete().eq('id', deletedItem.db_id);
        }
    }
}

// ==========================================
// 📊 4. ระบบ UI & Graph
// ==========================================
function updateUI() {
    stats.forgotten = db.reduce((sum, item) => sum + (item.forgotCount || 0), 0);
    document.getElementById('totalCount').innerText = db.length;
    document.getElementById('forgetCount').innerText = stats.forgotten;
    
    if (!currentUser) {
        localStorage.setItem('vocab_db', JSON.stringify(db));
        localStorage.setItem('vocab_stats', JSON.stringify(stats));
    }
    
    updateChart();
}

function initChart() {
    const canvas = document.getElementById('statChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
// 🧠 5. ระบบ Dictionary & AI Logic
// ==========================================
async function initDictionary() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt');
        if (!response.ok) throw new Error("Network error");
        const text = await response.text();
        commonWords = text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        document.getElementById('dictStatus').innerHTML = "✅ <span class='font-black'>PRO DICT READY</span>";
        document.getElementById('dictStatus').classList.replace('text-slate-400', 'text-green-500');
    } catch (e) {
        document.getElementById('dictStatus').innerHTML = "⚠️ <span class='font-black'>BASIC DICT</span>";
    }
}

function isChineseChar(text) { return /[\u4e00-\u9fa5]/.test(text); }

function getLevenshteinDistance(s1, s2) {
    if (!s1 || !s2) return 0;
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

// 🌟 อัปเกรด: ให้ระบบเช็คจากคำที่เราเคยบันทึกไว้ด้วย (Personal Dictionary)
function getDidYouMean(wrongWord) {
    const lowerWrong = wrongWord.toLowerCase();
    if (lowerWrong.length < 3) return null;
    
    // ถ้าเคยบันทึกคำนี้ไปแล้ว ให้ผ่านโลด ไม่ต้องแก้คำผิด
    if (db.some(item => item.word.toLowerCase() === lowerWrong)) return null;
    if (commonWords.includes(lowerWrong)) return null;

    let threshold = lowerWrong.length >= 5 ? 2 : 1;
    let bestMatch = null;
    let minDistance = threshold + 1;

    // รวบรวมคำทั้งหมดที่ระบบรู้จัก (Dict 10K + คำศัพท์ในเครื่องเรา)
    const allKnownWords = [...new Set([...commonWords, ...db.map(i => i.word.toLowerCase())])];

    for (const correctWord of allKnownWords) {
        if (Math.abs(lowerWrong.length - correctWord.length) <= 1) {
            const distance = getLevenshteinDistance(lowerWrong, correctWord);
            if (distance > 0 && distance < minDistance) {
                minDistance = distance;
                bestMatch = correctWord;
                if (distance === 1) break; 
            }
        }
    }
    return bestMatch;
}

window.autoFix = function(correctWord) {
    document.getElementById('vocabInput').value = correctWord;
    document.getElementById('grammarAlert').classList.add('hidden');
    processVocab();
}

// 🌟 อัปเกรด: ปุ่มดื้อ! (Force Add) ถ้าระบบบอกผิด แต่ฉันจะเอาคำนี้!
window.forceAddWord = function(originalText) {
    const word = originalText.toLowerCase().replace(/[?.,!]/g, '');
    commonWords.push(word); // แอบจดใส่สมองไว้ชั่วคราว
    document.getElementById('vocabInput').value = originalText;
    document.getElementById('grammarAlert').classList.add('hidden');
    processVocab(); 
}

function validateInput(text) {
    const alertBox = document.getElementById('grammarAlert');
    const word = text.toLowerCase().replace(/[?.,!]/g, '');
    
    if (isChineseChar(word)) { alertBox.classList.add('hidden'); return true; }

    const suggestion = getDidYouMean(word);
    if (suggestion) {
        // สร้าง UI แจ้งเตือน + ปุ่ม Force Add
        alertBox.innerHTML = `
            <div class="flex flex-col gap-3">
                <span>🤔 หมายถึงคำว่า <button onclick="autoFix('${suggestion}')" class="text-blue-600 font-black underline hover:text-blue-800 transition">"${suggestion}"</button> ใช่ไหม?</span>
                <button onclick="forceAddWord('${text.replace(/'/g, "\\'")}')" class="text-xs md:text-sm bg-amber-200 text-amber-900 px-4 py-2 rounded-xl font-bold hover:bg-amber-300 w-fit transition shadow-sm border border-amber-300">
                    ไม่ใช่, บันทึกคำว่า "${text}"
                </button>
            </div>
        `;
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
    
    const countriesEN = ['china', 'japan', 'korea', 'america', 'france', 'germany', 'italy', 'spain', 'thailand', 'london', 'england', 'mexico'];
    if (countriesEN.includes(lowerWord) || lowerWord.endsWith('land') || lowerWord.endsWith('ia')) return "Proper Noun (ชื่อเฉพาะ/สถานที่)";
    
    if (lowerWord.includes(' ')) return "Phrase (วลี/ประโยค)";

    try {
        const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (dictRes.ok) {
            const dictData = await dictRes.json();
            const posArray = dictData[0].meanings.map(m => m.partOfSpeech);
            const uniquePos = [...new Set(posArray)];
            return uniquePos.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
        }
        return "Unknown / Proper Noun";
    } catch (err) { return "Unknown"; }
}

async function fetchTranslation(word, isChinese) {
    try {
        const langCode = isChinese ? 'zh-CN' : 'en';
        const gtUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${langCode}&tl=th&dt=t&dt=rm&dt=bd&q=${encodeURIComponent(word)}`;
        const gtRes = await fetch(gtUrl);
        const gtData = await gtRes.json();
        
        let translatedText = gtData[0][0][0] || "ไม่พบคำแปล";
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

        if (translatedText.toLowerCase() === word.toLowerCase() && word.length > 2 && !isChinese) {
            return { error: true, msg: "แปลไม่ได้ อาจสะกดผิด" };
        }

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
    } catch (e) { 
        return { error: true, msg: "การเชื่อมต่อ API แปลภาษาขัดข้อง" }; 
    }
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

// --- 🚀 กระบวนการหลัก (Core Process) ---
window.processVocab = async function() {
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
        displayWord.innerHTML = `<span class="forgotten-word text-red-500">${word}</span>`;
        await updateForgotCount(existingIndex);
        showData(db[existingIndex]);
        input.value = '';
    } else {
        loadingOverlay?.classList.remove('hidden');
        displayWord.innerText = word;
        displayTrans.innerText = "กำลังวิเคราะห์รากศัพท์...";
        
        const apiResult = await fetchTranslation(word, isChinese);
        
        if (apiResult.error) {
            loadingOverlay?.classList.add('hidden');
            document.getElementById('grammarAlert').innerHTML = `❌ <b>"${word}"</b>: ${apiResult.msg}`;
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
        input.value = '';
    }
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

    const safeData1 = (data.data1 && data.data1 !== 'undefined' && data.data1 !== 'null') ? data.data1 : "-";
    const safeData2 = (data.data2 && data.data2 !== 'undefined' && data.data2 !== 'null') ? data.data2 : "-";

    if (data.lang === 'zh') {
        label1.innerText = "Pinyin (พินอิน)"; val1.innerText = safeData1;
        label2.innerText = "Type (ประเภท)"; val2.innerText = safeData2;
    } else {
        label1.innerText = "Past Tense (อดีต)"; val1.innerText = safeData1;
        label2.innerText = "Future Tense (อนาคต)"; val2.innerText = safeData2;
    }
}

// --- 📋 ระบบคลังคำศัพท์ (มีระบบค้นหา) ---
window.filterVocab = function() {
    const searchTerm = document.getElementById('vocabSearch').value.toLowerCase();
    renderTable(searchTerm);
}

function renderTable(filter = "") {
    const tableBody = document.getElementById('vocabTableBody');
    tableBody.innerHTML = '';
    
    // กรองคำศัพท์
    const filteredDb = db.filter(item => 
        item.word.toLowerCase().includes(filter) || 
        item.translation.toLowerCase().includes(filter) ||
        (item.altTrans && item.altTrans.toLowerCase().includes(filter))
    );

    // เรียงจากล่าสุดขึ้นก่อน
    const displayList = [...filteredDb].reverse();
    
    displayList.forEach((item) => {
        const realIndex = db.findIndex(orig => orig.word === item.word);
        
        const flag = item.lang === 'zh' ? '🇨🇳' : '🇬🇧';
        const posHtml = (item.pos && item.pos !== "Unknown" && item.pos !== "Unknown / Proper Noun") ? `<br><span class="inline-block mt-2 text-[10px] md:text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-black uppercase tracking-wider">${item.pos}</span>` : '';
        const altHtml = item.altTrans ? `<br><span class="text-xs md:text-sm text-slate-400 mt-1 inline-block">อื่นๆ: ${item.altTrans}</span>` : '';
        const infoData = (item.data1 && item.data1 !== 'undefined' && item.data1 !== 'null') ? item.data1 : '-';

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
                <button onclick="deleteWord(${realIndex})" class="text-slate-300 hover:text-red-500 text-xl md:text-2xl transition-all hover:scale-125" title="ลบคำนี้">🗑️</button>
            </td>`;
        tableBody.appendChild(row);
    });

    if (displayList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-slate-400 italic">ไม่มีข้อมูล...</td></tr>`;
    }
}

window.openVocabList = function() {
    const searchInput = document.getElementById('vocabSearch');
    if (searchInput) searchInput.value = ''; 
    renderTable();
    document.getElementById('vocabModal').classList.remove('hidden');
}

window.closeVocabList = function() { document.getElementById('vocabModal').classList.add('hidden'); }

window.updateOldWords = async function() {
    const icon = document.getElementById('syncIcon');
    icon.classList.add('inline-block', 'spin-fast'); 

    const wordsToUpdate = db.filter(item => 
        item.lang !== 'zh' && 
        (!item.pos || item.altTrans === undefined || item.data1 === 'undefined' || item.data2 === 'undefined' || item.data1 === null)
    );
    
    if (wordsToUpdate.length === 0) {
        icon.classList.remove('spin-fast');
        alert(`เยี่ยมมาก! คลังคำศัพท์ของคุณสมบูรณ์ 100% ไม่มีข้อมูลตกหล่นครับ 🎉`);
        return;
    }

    const updatePromises = wordsToUpdate.map(async (item) => {
        const newPos = await fetchPartOfSpeech(item.word, false);
        item.pos = newPos;

        const posLower = newPos.toLowerCase();
        if (item.word.includes(' ') || !posLower.includes('verb')) {
            item.data1 = "-"; 
            item.data2 = "-"; 
        } else {
            if (item.data1 === 'undefined' || item.data1 === null) item.data1 = generatePastTense(item.word);
            if (item.data2 === 'undefined' || item.data2 === null) item.data2 = "will " + item.word;
        }

        if (!item.altTrans) {
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
        renderTable(document.getElementById('vocabSearch').value.toLowerCase()); 
    }
    alert(`⚡ อัปเดตข้อมูลเก่าให้สมบูรณ์เรียบร้อยครับ R!`);
}

// ==========================================
// 🚀 6. Event Listeners & Initialize
// ==========================================
document.getElementById('vocabInput').addEventListener('keypress', (e) => { 
    if (e.key === 'Enter') processVocab(); 
});

initDictionary();