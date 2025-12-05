i decided jotform and its lack of support for creative freedom could go shove it\
i got bored\
i got excited\
now here we are...\
hello and welcome

---

## 🤖 AI ASSISTANT NOTE - DEPLOYED WORKER INFO

**IMPORTANT:** The jotform-proxy worker (`jotform-proxy.zeroexeleven.workers.dev`) is **NOT** in this repository.  
It is deployed separately. Do not suggest modifying it or say you can't find it.

### Worker Endpoints:
- **GET `/?id={submissionId}`** - Fetch submission from JotForm API
- **POST `/edit`** - Update submission in JotForm API

### Edit Submission Data Format:

**Client should send (index.html):**
```json
{
  "submissionId": "123456789",
  "submission": {
    "140": "yes",
    "4_topSecret[0][0]": "basta",
    "4_topSecret[2][0]": "🥀",
    "99_typeA99[0][0]": "Discord",
    "99_typeA99[1][0]": "SMS",
    "54_whichOf[]": "unlisted factors"
  }
}
```

**Format Rules:**
- Simple fields (radio, text, select): Use numeric QID only (e.g., `"140": "yes"`)
  - Worker wraps as: `submission[140]=yes`
- Matrix/table fields: `{qid}_{fieldName}[row][col]` (e.g., `"4_topSecret[0][0]": "value"`)
  - Worker wraps as: `submission[4_topSecret[0][0]]=value`
  - **To clear a matrix cell:** Omit it from the submission entirely (don't send empty string)
- Checkbox arrays: `{qid}_{fieldName}[]` with comma-separated values (e.g., `"54_whichOf[]": "unlisted factors"`)
  - Worker wraps as: `submission[54_whichOf[]]=unlisted factors`
  - **CRITICAL:** Keep the `[]` brackets intact - don't remove them!
  - Single checked value: `"54_whichOf[]": "unlisted factors"`
  - Multiple values: `"54_whichOf[]": "option1,option2,option3"`
- **CRITICAL:** Always remove the 'q' prefix from form input names (input `q4_topSecret[0][0]` → key `4_topSecret[0][0]`)

**⚠️ WORKER BUG ALERT:**
The current worker code blindly wraps ALL keys with `submission[]`, which creates malformed field names for matrix and checkbox fields!
- Current: `submission[4_topSecret[0][0]]` ❌ WRONG
- JotForm needs: `submission[4][topSecret][0][0]` OR different format

The worker needs to parse bracketed field names and construct proper nested format for JotForm API.

**Worker receives and converts to JotForm API format:**
```javascript
// ⚠️ CURRENT WORKER CODE (BROKEN FOR MATRIX/CHECKBOXES):
for (const [key, value] of Object.entries(submissionData)) {
  formData.append(`submission[${key}]`, value);
}
// This creates: submission[4_topSecret[0][0]] which is WRONG!
```

**❌ Current broken format sent to JotForm API:**
```
submission[140]=yes                          ✅ OK (simple field)
submission[4_topSecret[0][0]]=basta          ❌ WRONG (matrix - malformed brackets)
submission[54_whichOf[]]=unlisted factors    ❌ WRONG (checkbox - malformed brackets)
```

**✅ CORRECT format JotForm API expects:**
Based on form input names `q4_topSecret[0][0]` and `q54_whichOf[]`, the API expects:
```
submission[q140]=yes
submission[q4_topSecret[0][0]]=basta
submission[q54_whichOf[]]=unlisted factors
```

**🔧 FIX NEEDED:**
Client should send keys WITH the 'q' prefix for ALL fields:
- Simple: `"q140": "yes"`
- Matrix: `"q4_topSecret[0][0]": "basta"`  
- Checkbox: `"q54_whichOf[]": "unlisted factors"`

Then worker wraps with `submission[]` to create proper format.

### ⚠️ CRITICAL: Do NOT double-wrap submission[] in the client
The worker adds the `submission[]` wrapper, so client sends raw field IDs only.

### ⚠️ CORS Headers - Fetch Requests to Worker

**IMPORTANT:** The deployed worker does NOT allow custom request headers beyond the standard CORS-safe list.

When fetching from the worker in `summary.js` or any other client code:

**✅ ALLOWED:**
```javascript
fetch(`${workerBase}?id=${id}&_=${Date.now()}`, {
  cache: 'no-store'
})
```

**❌ FORBIDDEN (causes CORS errors):**
```javascript
fetch(`${workerBase}?id=${id}`, {
  headers: {
    'Cache-Control': 'no-cache',  // ❌ NOT in Access-Control-Allow-Headers
    'Pragma': 'no-cache'           // ❌ NOT in Access-Control-Allow-Headers
  }
})
```

**Cache Prevention Strategy:**
- Use `cache: 'no-store'` in fetch options
- Add timestamp query parameter: `&_=${Date.now()}`
- DO NOT use Cache-Control or Pragma headers (worker doesn't allow them)

