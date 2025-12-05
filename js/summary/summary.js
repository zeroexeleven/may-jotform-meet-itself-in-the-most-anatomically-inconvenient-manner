document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const submissionId = params.get("id");

  // Debug: Log the actual URL and parsed ID
  console.log('📍 Summary page URL:', window.location.href);
  console.log('📍 Parsed submission ID:', submissionId);
  console.log('📍 All URL params:', Array.from(params.entries()));

  const workerBase = "https://jotform-proxy.zeroexeleven.workers.dev";

  // Helper to build query string with all persisted params (excluding page-specific ones)
  function getPersistedParams(excludeKeys = []) {
    const persistParams = new URLSearchParams();
    const excludeSet = new Set(excludeKeys);
    for (const [key, value] of params.entries()) {
      if (!excludeSet.has(key)) {
        persistParams.set(key, value);
      }
    }
    const paramStr = persistParams.toString();
    return paramStr ? '&' + paramStr : '';
  }

  const metaText = document.getElementById("metaText");
  const answersEl = document.getElementById("answers");
  const backToForm = document.getElementById("backToForm");
  const printButton = document.getElementById("printButton");
  const closeButton = document.getElementById("closeButton");

  // Hide edit button unless test=true parameter is present
  const isTestMode = params.get("test") === "true";
  if (!isTestMode && backToForm) {
    backToForm.style.display = "none";
  }

  if (printButton) {
    printButton.addEventListener("click", () => window.print());
  }

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      if (submissionId) {
        window.location.href = `thankyou.html?id=${encodeURIComponent(submissionId)}${getPersistedParams()}`;
      } else if (window.history.length > 1) {
        history.back();
      } else {
        window.location.href = "../thankyou.html";
      }
    });
  }

  if (!submissionId) {
    metaText.textContent = "Missing submission ID.";
    return;
  }

  metaText.textContent = "Submission ID: " + submissionId;
  // Will be set to edit URL after submission loads
  backToForm.href = "#";
  
  // Store submission data for building edit URL
  let cachedSubmission = null;

  // Build edit URL - simple redirect to edit page with just the ID
  function buildEditURL(id) {
    const baseUrl = window.location.origin !== 'null' && window.location.protocol !== 'file:' 
      ? `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, '')}/../pages/edit.html`
      : '../pages/edit.html';
    
    return `${baseUrl}?id=${encodeURIComponent(id)}${getPersistedParams()}`;
  }

  loadSubmission(submissionId);

  // Reload fresh data when page becomes visible (handles back button, cached navigation)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && submissionId) {
      console.log('🔄 Page visible, reloading fresh submission data...');
      loadSubmission(submissionId);
    }
  });

  // Also reload when page gains focus (extra safety for browser back)
  window.addEventListener('focus', () => {
    if (submissionId) {
      console.log('🔄 Window focused, reloading fresh submission data...');
      loadSubmission(submissionId);
    }
  });

  async function loadSubmission(id) {
    try {
      // Add cache-busting timestamp to always fetch fresh data
      // NOTE: Only send id to proxy, don't include other URL params like test=true
      const cacheBust = Date.now();
      const res = await fetch(
        `${workerBase}?id=${encodeURIComponent(id)}&_=${cacheBust}`,
        {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        }
      );
      const data = await res.json();

      if (!res.ok || data.responseCode !== 200) {
        metaText.textContent = "Couldn't load submission.";
        return;
      }

      const submission = data.content;
      
      // Extract submitter name/identity from the last field (151)
      const answers = submission.answers || {};
      let submitterName = null;
      if (answers['151'] && answers['151'].answer) {
        const answerValue = answers['151'].answer;
        // Handle if answer is an object (like {typeA151: 'name'})
        if (typeof answerValue === 'object' && answerValue !== null && !Array.isArray(answerValue)) {
          // Get the first value from the object
          submitterName = Object.values(answerValue)[0];
        } else {
          submitterName = answerValue;
        }
        // Ensure it's a string
        if (submitterName) {
          submitterName = String(submitterName);
          metaText.textContent = `contribution by ${submitterName}`;
        }
      }
      
      // Send custom data to Clarity for tracking
      if (typeof clarity === 'function') {
        clarity('set', 'submissionId', submissionId);
        if (submitterName) {
          clarity('set', 'submitterName', submitterName);
        }
      }
      
      // Update edit link to go to edit page
      backToForm.href = buildEditURL(submissionId);
      
      renderAnswers(submission);
    } catch (e) {
      metaText.textContent = "Error loading submission.";
    }
  }

  // simple “string looks like HTML” check
  function looksLikeHTML(str) {
    return typeof str === "string" && /<\/?[a-z][\s\S]*>/i.test(str);
  }

  // treat strings that are only tags + whitespace + &nbsp; as empty
  function isEmptyHTML(str) {
    if (typeof str !== "string") return false;

    // Decode \u003C / \u003E just in case it's still escaped
    const decoded = str.replace(/\\u003C/g, "<").replace(/\\u003E/g, ">");

    // If it contains an img tag, it's NOT empty (even if there's no text)
    if (/<img[^>]*>/i.test(decoded)) {
      return false;
    }

    const cleaned = decoded
      // strip all tags
      .replace(/<[^>]*>/g, "")
      // normalize &nbsp; to spaces
      .replace(/&nbsp;/gi, " ")
      // strip other HTML entities
      .replace(/&[a-z]+;/gi, " ")
      .trim();

    return cleaned === "";
  }

  // Format matrix data as a simple list of row values
  // Matrix answer format: {"rowId": {"colId": "value"}, ...} or {"rowId": "value", ...}
  function formatMatrixAnswer(answer, item) {
    if (!answer || typeof answer !== "object") {
      return formatAnswer(answer);
    }
    
    // Skip metadata keys like colIds, rowIds
    const entries = Object.entries(answer).filter(([key]) => 
      key !== 'colIds' && key !== 'rowIds'
    );
    
    if (entries.length === 0) {
      return "";
    }
    
    // Build a list of values, extracting actual cell values from nested structure
    const values = [];
    for (const [rowKey, rowData] of entries) {
      if (typeof rowData === 'object' && rowData !== null && !Array.isArray(rowData)) {
        // Nested structure: {"colId": "value"} - extract all column values for this row
        const colValues = Object.entries(rowData)
          .filter(([colKey]) => colKey !== 'colIds' && colKey !== 'rowIds')
          .map(([colKey, cellValue]) => {
            if (cellValue && String(cellValue).trim() !== '') {
              return String(cellValue).trim();
            }
            return null;
          })
          .filter(v => v !== null);
        
        if (colValues.length > 0) {
          values.push(...colValues);
        }
      } else if (rowData && String(rowData).trim() !== '') {
        // Direct value
        values.push(String(rowData).trim());
      }
    }
    
    if (values.length === 0) {
      return "";
    }
    
    // Return as a simple bulleted list for readability
    if (values.length === 1) {
      return values[0];
    }
    
    return '<ul style="margin:0;padding-left:1.5em;">' + 
      values.map(v => `<li>${v.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('') + 
      '</ul>';
  }

  // render long-text (rich text) fields as HTML always
  function renderRichTextField(valueDiv, primary, secondary) {
    let src = null;

    if (typeof primary === "string" && !isEmptyHTML(primary) && hasContent(primary)) {
      src = primary;
    } else if (
      typeof secondary === "string" &&
      !isEmptyHTML(secondary) &&
      hasContent(secondary)
    ) {
      src = secondary;
    }

    if (src != null) {
      // decode escaped angle brackets from API
      const decoded = src.replace(/\\u003C/g, "<").replace(/\\u003E/g, ">");
      valueDiv.innerHTML = decoded;
      
      // Preserve inline styles on all elements (text-align, etc.)
      // The HTML already contains proper styles from the editor, just ensure they display
      valueDiv.style.cssText = ''; // Clear any default styles that might override
    } else {
      // fall back to generic formatting if we don't get a usable string
      const fallback = primary != null ? primary : secondary;
      valueDiv.textContent = formatAnswer(fallback);
    }
  }

  function renderAnswers(submission) {
    const answers = submission.answers || {};
    const keys = Object.keys(answers);

    // follow form order
    keys.sort((a, b) => {
      const oa = Number(answers[a].order || 0);
      const ob = Number(answers[b].order || 0);
      return oa - ob;
    });

    answersEl.innerHTML = "";

    for (const key of keys) {
      const item = answers[key];
      const type = item.type || "";
      const name = item.name || "";

      // skip non-content controls
      if (
        type === "control_pagebreak" ||
        type === "control_button" ||
        name.includes("none_hide")
      ) {
        continue;
      }

      let rawAnswer = item.answer;
      let pretty = item.prettyFormat;

      // Skip if no answer property exists at all
      if (!("answer" in item)) {
        continue;
      }

      // normalize "fake" empty HTML to truly empty
      if (typeof rawAnswer === "string" && isEmptyHTML(rawAnswer)) {
        rawAnswer = "";
      }
      if (typeof pretty === "string" && isEmptyHTML(pretty)) {
        pretty = "";
      }

      // only include questions with actual content (either answer or pretty)
      if (!hasContent(rawAnswer) && !hasContent(pretty)) {
        continue;
      }

      const row = document.createElement("div");
      row.className = "answer-row";

      const labelDiv = document.createElement("div");
      labelDiv.className = "q-label";
      labelDiv.textContent = item.text || "";

      const valueDiv = document.createElement("div");
      valueDiv.className = "q-value";

      switch (type) {
        case "control_matrix":
          // Matrix data typically comes as nested object: {"rowId": {"colId": "value"}}
          // We need to format it as a proper table
          if (pretty && hasContent(pretty)) {
            if (looksLikeHTML(pretty)) {
              valueDiv.innerHTML = pretty;
            } else {
              valueDiv.textContent = formatAnswer(pretty);
            }
          } else if (typeof rawAnswer === "object" && rawAnswer !== null && !Array.isArray(rawAnswer)) {
            // Format matrix data as a table
            valueDiv.innerHTML = formatMatrixAnswer(rawAnswer, item);
          } else {
            valueDiv.textContent = formatAnswer(rawAnswer);
          }
          break;

        case "control_inline":
          // Fill-in-the-blank / inline layout: check if there's actual filled-in content
          // For control_inline, if answer is an object, check if it has meaningful values
          if (typeof rawAnswer === "object" && rawAnswer !== null && !Array.isArray(rawAnswer)) {
            // Check if any value in the object has content
            const hasFilledContent = Object.values(rawAnswer).some(v => 
              v !== null && v !== undefined && String(v).trim() !== ""
            );
            if (!hasFilledContent) {
              continue; // Skip this field entirely
            }
          }
          
          // For string answers (HTML), check if all spans contain only whitespace
          if (typeof rawAnswer === "string" && looksLikeHTML(rawAnswer)) {
            // Extract all content from span tags (user input fields)
            const spanMatches = rawAnswer.match(/<span[^>]*>([^<]*)<\/span>/g);
            if (spanMatches) {
              const hasAnyContent = spanMatches.some(span => {
                const content = span.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
                return content !== "";
              });
              if (!hasAnyContent) {
                continue; // Skip if all spans are empty
              }
            }
          }
          
          // Fill-in-the-blank / inline layout: use HTML rendering
          if (pretty && hasContent(pretty)) {
            valueDiv.innerHTML = pretty;
          } else if (
            typeof rawAnswer === "string" &&
            looksLikeHTML(rawAnswer) &&
            !isEmptyHTML(rawAnswer)
          ) {
            valueDiv.innerHTML = rawAnswer;
          } else if (typeof rawAnswer === "string") {
            // Try to parse JSON strings
            try {
              const parsed = JSON.parse(rawAnswer);
              valueDiv.textContent = formatAnswer(parsed);
            } catch {
              valueDiv.textContent = formatAnswer(rawAnswer);
            }
          } else if (typeof rawAnswer === "object") {
            // For object answers, format them
            valueDiv.textContent = formatAnswer(rawAnswer);
          } else {
            valueDiv.textContent = formatAnswer(rawAnswer);
          }
          break;

        case "control_text":
          if (pretty && hasContent(pretty)) {
            if (looksLikeHTML(pretty)) {
              valueDiv.innerHTML = pretty;
            } else {
              valueDiv.textContent = formatAnswer(pretty);
            }
          } else if (typeof rawAnswer === "string") {
            if (looksLikeHTML(rawAnswer)) {
              valueDiv.innerHTML = rawAnswer;
            } else {
              // Try to parse JSON strings
              try {
                const parsed = JSON.parse(rawAnswer);
                valueDiv.textContent = formatAnswer(parsed);
              } catch {
                valueDiv.textContent = formatAnswer(rawAnswer);
              }
            }
          } else {
            valueDiv.textContent = formatAnswer(rawAnswer);
          }
          break;

        case "control_textarea":
        case "control_wysiwyg":
          // ALL long-text responses are rich text -> always render as HTML
          renderRichTextField(valueDiv, pretty, rawAnswer);
          
          // Handle blob URLs in rich text content
          const images = valueDiv.querySelectorAll('img[src^="blob:"]');
          images.forEach(img => {
            const placeholder = document.createElement('div');
            placeholder.style.cssText = 'padding: 8px; background: rgba(255, 255, 255, 0.03); border-radius: 4px; text-align: center; font-style: italic; font-size: 12px; opacity: 0.6;';
            placeholder.textContent = 'image not accessible in summary view';
            img.replaceWith(placeholder);
          });
          break;

        case "control_checkbox":
          if (pretty && hasContent(pretty)) {
            valueDiv.textContent = formatAnswer(pretty);
          } else {
            valueDiv.textContent = formatAnswer(rawAnswer);
          }
          break;

        case "control_fileupload":
          // Handle file uploads - JotForm stores these differently
          if (Array.isArray(rawAnswer) && rawAnswer.length > 0) {
            rawAnswer.forEach(fileUrl => {
              if (fileUrl && typeof fileUrl === 'string') {
                // Check if it's an image
                const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileUrl);
                
                if (isImage) {
                  const img = document.createElement('img');
                  img.src = fileUrl;
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  img.style.borderRadius = '8px';
                  img.style.marginTop = '8px';
                  img.alt = 'Uploaded image';
                  valueDiv.appendChild(img);
                } else {
                  // Non-image file - show as download link
                  const link = document.createElement('a');
                  link.href = fileUrl;
                  link.textContent = fileUrl.split('/').pop() || 'Download file';
                  link.target = '_blank';
                  link.style.display = 'block';
                  link.style.marginTop = '4px';
                  valueDiv.appendChild(link);
                }
              }
            });
          } else if (typeof rawAnswer === 'string' && rawAnswer.trim() !== '') {
            // Single file URL
            const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(rawAnswer);
            
            if (isImage) {
              const img = document.createElement('img');
              img.src = rawAnswer;
              img.style.maxWidth = '100%';
              img.style.height = 'auto';
              img.style.borderRadius = '8px';
              img.alt = 'Uploaded image';
              valueDiv.appendChild(img);
            } else {
              const link = document.createElement('a');
              link.href = rawAnswer;
              link.textContent = rawAnswer.split('/').pop() || 'Download file';
              link.target = '_blank';
              valueDiv.appendChild(link);
            }
          } else {
            valueDiv.textContent = formatAnswer(rawAnswer);
          }
          break;

        case "control_widget":
          // generic widgets: prefer pretty/text if present and non-empty
          if (pretty && hasContent(pretty)) {
            if (looksLikeHTML(pretty)) {
              valueDiv.innerHTML = pretty;
            } else {
              valueDiv.textContent = formatAnswer(pretty);
            }
          } else if (
            rawAnswer &&
            typeof rawAnswer === "object" &&
            "text" in rawAnswer &&
            hasContent(rawAnswer.text)
          ) {
            const t = rawAnswer.text;
            if (looksLikeHTML(t)) {
              valueDiv.innerHTML = t;
            } else {
              valueDiv.textContent = formatAnswer(t);
            }
          } else {
            valueDiv.textContent = formatAnswer(rawAnswer);
          }
          break;

        default:
          if (pretty && hasContent(pretty)) {
            if (typeof pretty === "string" && looksLikeHTML(pretty)) {
              valueDiv.innerHTML = pretty;
            } else {
              valueDiv.textContent = formatAnswer(pretty);
            }
          } else if (
            typeof rawAnswer === "string" &&
            rawAnswer.trim() !== "" &&
            looksLikeHTML(rawAnswer)
          ) {
            valueDiv.innerHTML = rawAnswer;
          } else {
            valueDiv.textContent = formatAnswer(rawAnswer);
          }
          break;
      }

      row.appendChild(labelDiv);
      row.appendChild(valueDiv);
      answersEl.appendChild(row);
    }

    if (!answersEl.children.length) {
      answersEl.textContent =
        "No answered questions found for this submission.";
    }
  }

  function hasContent(value) {
    if (value == null || value === "") return false;

    if (typeof value === "string") {
      // strip non-breaking spaces (actual char) and whitespace
      const trimmed = value.replace(/\u00a0/g, " ").trim();
      if (trimmed === "") return false;
      if (isEmptyHTML(value)) return false;
      // Check for JSON strings that represent empty arrays or empty objects
      if (trimmed === '[""]' || trimmed === "[]" || trimmed === '{}' || trimmed === 'null') return false;
      return true;
    }

    if (Array.isArray(value)) {
      return value.some((v) => hasContent(v));
    }

    if (typeof value === "object") {
      return Object.values(value).some((v) => hasContent(v));
    }

    return true;
  }

  function formatAnswer(answer) {
    if (answer == null) return "";

    if (typeof answer === "string") {
      // kill literal &nbsp; when we're treating as plain text
      const cleaned = answer.replace(/&nbsp;/gi, " ").trim();
      if (!hasContent(cleaned)) return "";
      return cleaned;
    }

    if (Array.isArray(answer)) {
      const flat = answer.flat ? answer.flat(Infinity) : [].concat(...answer);
      return flat
        .map((v) => formatAnswer(v))
        .filter((s) => s !== "")
        .join(", ");
    }

    if (typeof answer === "object") {
      // prefer `text` if present (some widgets use this)
      if ("text" in answer && hasContent(answer.text)) {
        return formatAnswer(answer.text);
      }

      try {
        return Object.entries(answer)
          .map(([k, v]) => `${k}: ${formatAnswer(v)}`)
          .filter((s) => !s.endsWith(": "))
          .join(" | ");
      } catch {
        return String(answer);
      }
    }

    return String(answer);
  }
});
