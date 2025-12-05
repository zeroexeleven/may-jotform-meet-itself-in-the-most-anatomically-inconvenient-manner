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
    "field_123": "value",
    "field_456": "another value",
    "field_789[row0][col0]": "matrix cell value"
  }
}
```

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
