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
    "99_typeA99[0][0]": "Discord",
    "99_typeA99[1][0]": "SMS",
    "54_whichOf[]": "option1,option2,option3"
  }
}
```

**Format Rules:**
- Simple fields (radio, text, select): Use numeric QID only (e.g., `"140": "yes"`)
- Matrix/table fields: `{qid}_{fieldName}[row][col]` (e.g., `"99_typeA99[0][0]": "value"`)
- Checkbox arrays: `{qid}_{fieldName}[]` with comma-separated values (e.g., `"54_whichOf[]": "opt1,opt2"`)
- **CRITICAL:** Always remove the 'q' prefix from form input names (input `q99_typeA99[0][0]` → key `99_typeA99[0][0]`)

**Worker receives and converts to JotForm API format:**
```javascript
// Worker does this conversion:
for (const [key, value] of Object.entries(submissionData)) {
  formData.append(`submission[${key}]`, value);
}
```

**Final format sent to JotForm API:**
```
submission[field_123]=value&submission[field_456]=another value&submission[field_789[row0][col0]]=matrix cell value
```

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

