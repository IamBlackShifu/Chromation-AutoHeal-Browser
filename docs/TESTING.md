# Testing Recording & OhScrapper Features

## ✅ How to Test Recording

1. **Launch the browser**: `npm start`

2. **Navigate to a test page**:
   - Type in address bar: `https://infinitylinesofcode.com`
   - Or use any form-based website

3. **Start Recording**:
   - Click the **Recorder** button (⏺️) or press `Ctrl+Shift+R`
   - Select recording mode (Auto recommended)
   - Click **"Start Recording"** button
   - Status bar should show "⏺️ Recording..."

4. **Perform Actions on the Page**:
   - **Click** buttons or links
   - **Type** in input fields
   - **Select** dropdown options
   - **Submit** forms

5. **Check Actions Panel**:
   - Each action should appear in the Actions List immediately
   - You'll see: `#1 click [selector]`, `#2 input [selector]`, etc.

6. **Stop Recording**:
   - Click **"Stop Recording"** button
   - Recording status disappears

7. **Export Script**:
   - Select format (Playwright, Selenium, Cypress, etc.)
   - Click **"Export Script"**
   - File downloads automatically

### Expected Result:
- Actions appear in real-time as you interact
- Each action shows type, selector, and value
- Export generates a working test script

---

## ✅ How to Test OhScrapper Discovery

1. **Navigate to a page with forms/buttons**:
   - Example: `https://www.w3schools.com/html/html_forms.asp`
   - Or: `https://www.wikipedia.org`
   - Or any page with interactive elements

2. **Open Inspector Panel**:
   - Click **Inspector** button (🔍) or press `Ctrl+Shift+I`

3. **Method 1: Inspect Single Element**:
   - Click **"Inspect Single Element"** button
   - Button changes to "Inspecting... (Click element)"
   - Click any element on the page (input, button, link)
   - Element details appear in panel:
     - Tag, ID, Name, Type, Text
     - Generated locators with confidence scores
     - Multiple selector strategies ranked by priority

4. **Method 2: Discover All Elements** (OhScrapper):
   - Click **"Discover All Elements"** button
   - Button shows "Discovering..."
   - Wait 1-3 seconds
   - **Discovery Results** section appears showing:
     - Total count of discovered elements
     - Table with all elements
     - Each row shows:
       - Semantic name (e.g., `page_form_email_input`)
       - Primary selector
       - Element type
       - Confidence score badge

5. **Export Page Object Model**:
   - Select framework from dropdown:
     - **Playwright** (TypeScript)
     - **Selenium** (JavaScript)
     - **Cypress** (JavaScript)
   - Click **"Export POM"** button
   - File downloads (e.g., `PageObject.ts`)
   - Open file to see ready-to-use code!

6. **Export JSON Data**:
   - Click **"Export JSON"** button
   - Downloads `discovered-elements.json`
   - Contains all element metadata

### Expected Result:
- Discovers ALL interactive elements
- Generates semantic names
- Shows confidence scores
- Exports working POM code
- Multiple selector strategies per element

---

## 🎯 Good Test Pages

### For Recording:
- **Google**: https://infinitylinesofcode.com (search form)
- **TodoMVC**: https://todomvc.com/examples/vanilla-es6/ (interactive app)
- **Demo Form**: https://www.w3schools.com/html/html_forms.asp

### For Element Discovery:
- **Wikipedia**: https://www.wikipedia.org (search, links, buttons)
- **GitHub Login**: https://github.com/login (form fields)
- **W3Schools Forms**: https://www.w3schools.com/html/html_forms.asp
- **Any modern web app** with forms and buttons

---

## 🔍 What to Look For

### Recording Should Capture:
- ✅ Clicks on buttons, links
- ✅ Text input in fields
- ✅ Dropdown selections
- ✅ Form submissions
- ✅ Shows selector used
- ✅ Shows value entered

### Discovery Should Find:
- ✅ All `<input>` fields (except hidden)
- ✅ All `<button>` elements
- ✅ All `<a>` links with href
- ✅ `<select>` dropdowns
- ✅ `<textarea>` elements
- ✅ Elements with ARIA roles

### Generated Names Should Include:
- ✅ Page name (from title)
- ✅ Section (form, nav, header, etc.)
- ✅ Purpose (from label/placeholder/text)
- ✅ Element type (btn, input, link, etc.)
- ✅ Example: `google_search_query_input`

### Selectors Should Prioritize:
1. ✅ `data-testid` attributes (1.0 confidence)
2. ✅ Unique IDs (0.95 confidence)
3. ✅ ARIA labels (0.85 confidence)
4. ✅ Name attributes (0.75 confidence)
5. ✅ CSS selectors (0.65 confidence)

---

## 🐛 Troubleshooting

### Recording Not Working:
- **Issue**: No actions appear
- **Fix**: Refresh the page in the webview after starting recording
- **Why**: Event listeners need to be injected into fresh page

### Discovery Shows "0 elements":
- **Issue**: Page has no interactive elements
- **Fix**: Navigate to a page with forms/buttons
- **Try**: wikipedia.org, github.com/login, or any form page

### Console Errors About Cache:
- **Status**: Not critical, safe to ignore
- **Reason**: Electron cache permission issues
- **Impact**: None on functionality

---

## 📝 Example Workflow

### Complete Test Script Creation:
1. Navigate to `https://github.com/login`
2. Click **Inspector** → **"Discover All Elements"**
3. Wait for discovery (finds ~6-8 elements)
4. Select "Playwright" framework
5. Click **"Export POM"**
6. Download shows `PageObject.ts`
7. Click **Recorder** → **"Start Recording"**
8. Type username, password, click login
9. Click **"Stop Recording"**
10. Select "Playwright" format
11. Click **"Export Script"**
12. Now you have:
    - **Page Object** with all elements
    - **Test Script** with recorded actions
    - Ready to combine and run!

---

## 💡 Tips

- **Recording**: Start recording BEFORE interacting with page
- **Discovery**: Works best on pages with many form elements
- **Export**: Check confidence scores - higher is better
- **Names**: Should be readable and descriptive
- **Selectors**: Primary selector is the most reliable

---

**Both features are now fully functional!** 🎉

Try them out and you'll see:
- Actions recorded in real-time ⏺️
- Elements discovered automatically 🔍
- POMs generated instantly 📦
- Test automation made easy 🚀
