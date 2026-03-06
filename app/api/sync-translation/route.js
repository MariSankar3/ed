import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { targetLang, dryRun = false } = await request.json();
    if (!targetLang) {
      return NextResponse.json({ error: "Missing targetLang" }, { status: 400 });
    }

    // 1. Load current en.json
    const sourceFilePath = path.join(process.cwd(), 'en.json');
    if (!fs.existsSync(sourceFilePath)) {
      return NextResponse.json({ error: "Source file en.json not found" }, { status: 404 });
    }
    const currentEnData = JSON.parse(fs.readFileSync(sourceFilePath, 'utf8'));

    // 2. Load or initialize Sync State Memory (.sync_state.json)
    const syncStatePath = path.join(process.cwd(), '.sync_state.json');
    let syncState = {};
    if (fs.existsSync(syncStatePath)) {
      syncState = JSON.parse(fs.readFileSync(syncStatePath, 'utf8'));
    }
    
    // Ensure __genesis exists
    if (!syncState.__genesis && Object.keys(syncState).length > 0) {
      const firstLang = Object.keys(syncState).find(k => k !== '__genesis');
      if (firstLang) {
        syncState.__genesis = { ...syncState[firstLang] };
      }
    }

    // 3. Determine target languages
    let langsToProcess = [];
    if (targetLang === 'all') {
      const generatedSet = new Set();
      // Use the same logic as generated-languages API
      const files = fs.readdirSync(process.cwd());
      files.forEach(file => {
        if (file.endsWith('.json') && !['package.json', 'package-lock.json', '.sync_state.json', 'en.json', 'translations.json'].includes(file)) {
          const code = file.replace('.json', '');
          if (code.length >= 2 && code.length <= 5) generatedSet.add(code);
        }
      });
      // Also check public dir
      const publicPath = path.join(process.cwd(), 'public');
      if (fs.existsSync(publicPath)) {
        const publicFiles = fs.readdirSync(publicPath);
        publicFiles.forEach(file => {
          if (file.endsWith('.json') && file !== 'en.json') {
            const code = file.replace('.json', '');
            if (code.length >= 2 && code.length <= 5) generatedSet.add(code);
          }
        });
      }
      // Also check syncState
      Object.keys(syncState).forEach(key => {
        if (key !== '__genesis' && key !== 'en') generatedSet.add(key);
      });
      langsToProcess = Array.from(generatedSet);
    } else {
      langsToProcess = [targetLang];
    }

    const allResults = {
      success: true,
      processed: [],
      errors: []
    };

    const fetchWithRetry = async (url, retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const res = await fetch(url);
          if (res.ok) return res;
          if (res.status === 429) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        } catch (err) {
          if (i === retries - 1) throw err;
          await new Promise(r => setTimeout(r, 500 * (i + 1))); 
        }
      }
      throw new Error("Max retries reached");
    };

    for (const lang of langsToProcess) {
      try {
        console.log(`[Sync] Starting processing for: ${lang}`);
        
        // Prepare sync state for this lang
        if (!syncState[lang]) {
          syncState[lang] = syncState.__genesis ? { ...syncState.__genesis } : { ...currentEnData };
          if (!syncState.__genesis) syncState.__genesis = { ...syncState[lang] };
        }

        // Load target language file (prioritize public/ since that's our source of truth now)
        const publicOutputPath = path.join(process.cwd(), 'public', `${lang}.json`);
        const rootOutputPath = path.join(process.cwd(), `${lang}.json`);
        
        let targetData = {};
        if (fs.existsSync(publicOutputPath)) {
          targetData = JSON.parse(fs.readFileSync(publicOutputPath, 'utf8'));
        } else if (fs.existsSync(rootOutputPath)) {
          targetData = JSON.parse(fs.readFileSync(rootOutputPath, 'utf8'));
        }

        const keysToTranslate = [];
        for (const [key, currentEnValue] of Object.entries(currentEnData)) {
          if (typeof currentEnValue !== 'string' || currentEnValue.trim() === '') continue;
          const isMissing = !targetData[key] || targetData[key].trim() === '';
          const previousEnValue = syncState[lang][key];
          const englishChanged = previousEnValue !== undefined && previousEnValue !== currentEnValue;
          if (isMissing || englishChanged) keysToTranslate.push(key);
        }

        if (dryRun) {
          allResults.processed.push({ lang, keysToTranslate });
          continue;
        }

        if (keysToTranslate.length === 0) {
          allResults.processed.push({ lang, translatedKeys: [] });
          continue;
        }

        const finalDictionary = { ...targetData };
        const translatedKeys = [];
        
        for (const key of keysToTranslate) {
          const value = currentEnData[key];
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(value)}`;
          const response = await fetchWithRetry(url);
          
          if (response && response.ok) {
            const data = await response.json();
            const translatedText = data[0].map(item => item[0]).join('');
            finalDictionary[key] = translatedText;
            syncState[lang][key] = value;
            translatedKeys.push(key);
            console.log(`[Sync] ✅ ${lang}: ${key}`);
          }
          await new Promise(r => setTimeout(r, 150));
        }

        // Save only to public/
        if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
          fs.mkdirSync(path.join(process.cwd(), 'public'));
        }
        fs.writeFileSync(publicOutputPath, JSON.stringify(finalDictionary, null, 2));
        
        allResults.processed.push({ lang, translatedKeys });
      } catch (err) {
        console.error(`[Sync] ❌ Error processing ${lang}:`, err);
        allResults.errors.push({ lang, error: err.message });
      }
    }

    // Save tracking registry once at the end
    fs.writeFileSync(syncStatePath, JSON.stringify(syncState, null, 2));

    // Compatibility check: if only one lang was requested, maintain old return structure
    if (targetLang !== 'all') {
      const result = allResults.processed[0] || (allResults.errors[0] ? { error: allResults.errors[0].error } : { error: "Unknown error" });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
      return NextResponse.json({ 
        success: true, 
        message: `Translations synced successfully for ${targetLang}`,
        translatedKeys: result.translatedKeys || result.keysToTranslate || []
      });
    }

    return NextResponse.json(allResults);
  } catch (error) {
    console.error('Translation Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
