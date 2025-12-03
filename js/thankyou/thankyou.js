document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const editURL = params.get("edit");
  const directId = params.get("id"); // Direct submission ID from form submission

  const editLink = document.getElementById("editLink");
  const summaryLink = document.getElementById("summaryLink");
  const pandaBtn = document.getElementById("pandaWisdom");

  let submissionId = null;

  // First, check if we have a direct ID parameter (from form submission or edit redirect)
  if (directId) {
    submissionId = directId;
  }

  // Then check if we have an edit URL parameter (from summary page)
  if (editURL && editLink) {
    // Extract submission ID from the edit URL
    const match = editURL.match(/[?&]editId=([^&]+)/);
    if (match) {
      submissionId = decodeURIComponent(match[1]);
    } else {
      // Fallback for old format
      const oldMatch = editURL.match(/\/edit\/(\d+)/);
      if (oldMatch) {
        submissionId = oldMatch[1];
      }
    }
  }

  // Set up edit link
  if (submissionId && editLink) {
    // Use JotForm's original edit URL
    editLink.href = `https://www.jotform.com/edit/${submissionId}`;
  } else if (editLink) {
    editLink.style.display = "none";
  }

  // Set up summary link
  if (submissionId && summaryLink) {
    summaryLink.href = `summary.html?id=${encodeURIComponent(submissionId)}`;
    
    // Fetch submitter name to personalize page title
    fetchSubmitterName(submissionId);
  } else if (summaryLink) {
    summaryLink.style.display = "none";
  }

  // Pass submission ID to panda wisdom page so it can return properly
  if (submissionId && pandaBtn) {
    const currentHref = pandaBtn.getAttribute("href");
    pandaBtn.href = `${currentHref}?id=${encodeURIComponent(submissionId)}`;
  }

  async function fetchSubmitterName(id) {
    try {
      // NOTE: Only send id to proxy, don't include other URL params
      const cacheBust = Date.now();
      const res = await fetch(`https://jotform-proxy.zeroexeleven.workers.dev?id=${encodeURIComponent(id)}&_=${cacheBust}`, {
        cache: 'no-store'
      });
      const data = await res.json();
      
      if (res.ok && data.responseCode === 200) {
        const answers = data.content.answers || {};
        if (answers['151'] && answers['151'].answer) {
          let name = answers['151'].answer;
          // Handle if answer is an object (like {typeA151: 'name'})
          if (typeof name === 'object' && name !== null && !Array.isArray(name)) {
            // Get the first value from the object
            name = Object.values(name)[0];
          }
          // Ensure it's a string
          if (name) {
            name = String(name);
            document.title = `Thank You ${name}!`;
          }
        }
      }
    } catch (e) {
      // Silently fail - keep default title
    }
  }

  /* ===== Panda glints ===== */
if (pandaBtn) {
    let lastMoveTime = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let mouseSpeed = 0;
    let isHoveringButton = false;
    let hoverInterval = null;
    
    // Detect if touch device
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
    function makeSpark(isFast = false) {
      const spark = document.createElement("div");
      spark.className = "spark";
      
      // Randomly choose from silver/gold/rose gold palette
      const colors = ['silver', 'gold', 'rose'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      spark.classList.add(randomColor);
      
      // Fast animation when on button
      if (isFast) {
        spark.style.animation = "sparkTwinkleFast 0.4s ease-out forwards";
      }
  
      // Non-linear size distribution - favor extremes (tiny and larger)
      const minScale = 0.1;    // tiny pinpricks
      const maxScale = 1.8;    // medium bright glints
      const rand = Math.random();
      // Use power distribution to favor extremes
      const scaleFactor = Math.pow(rand, 0.6); // Exponent < 1 favors smaller values
      const scale = minScale + scaleFactor * (maxScale - minScale);
      spark.style.transform = `translate(-50%, -50%) scale(${scale})`;
  
      // random position in a bubble around the button (-15%..115%)
      const x = Math.random() * 130 - 15;
      const y = Math.random() * 130 - 15;
      spark.style.left = `${x}%`;
      spark.style.top = `${y}%`;
  
      pandaBtn.appendChild(spark);
      setTimeout(() => spark.remove(), isFast ? 400 : 750);
    }
  
    function burst(count, isFast = false) {
      for (let i = 0; i < count; i++) {
        setTimeout(() => makeSpark(isFast), Math.random() * (isFast ? 80 : 150));
      }
    }
  
    // Calculate distance from mouse to button center
    function getDistanceToButton(mouseX, mouseY) {
      const rect = pandaBtn.getBoundingClientRect();
      const buttonCenterX = rect.left + rect.width / 2;
      const buttonCenterY = rect.top + rect.height / 2;
      const dx = mouseX - buttonCenterX;
      const dy = mouseY - buttonCenterY;
      return Math.sqrt(dx * dx + dy * dy);
    }
  
    // Initial hover effect and continuous dense hover flashing
    pandaBtn.addEventListener("mouseenter", () => {
      isHoveringButton = true;
      burst(3, true);
      
      // Start continuous dense flashing while hovering
      if (hoverInterval) clearInterval(hoverInterval);
      hoverInterval = setInterval(() => {
        if (isHoveringButton) {
          burst(3, true); // Dense, consistent flashing
        }
      }, 80); // Flash every 80ms for very dense coverage
    });
    
    pandaBtn.addEventListener("mouseleave", () => {
      isHoveringButton = false;
      if (hoverInterval) {
        clearInterval(hoverInterval);
        hoverInterval = null;
      }
    });
    

  
    // Touch movement tracking for mobile
    if (isTouchDevice) {
      let lastTouchX = 0;
      let lastTouchY = 0;
      let lastTouchTime = 0;
      let touchHoldInterval = null;
      let isTouchingButton = false;
      let isNearButton = false;
      let nearButtonInterval = null;
      
      // Helper to check if touch is on or near button
      function isTouchNearButton(x, y) {
        const rect = pandaBtn.getBoundingClientRect();
        const expandedMargin = 20; // 20px expanded hit area
        return x >= rect.left - expandedMargin &&
               x <= rect.right + expandedMargin &&
               y >= rect.top - expandedMargin &&
               y <= rect.bottom + expandedMargin;
      }
      
      // Document-level touchstart to detect near-button touches
      document.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          lastTouchX = touch.clientX;
          lastTouchY = touch.clientY;
          lastTouchTime = Date.now();
          
          // Check if touch is on or near the button
          if (isTouchNearButton(touch.clientX, touch.clientY)) {
            isNearButton = true;
            burst(5, true); // Initial excited burst
            
            // Start continuous dense flashing
            if (nearButtonInterval) clearInterval(nearButtonInterval);
            nearButtonInterval = setInterval(() => {
              burst(4, true); // Keep firing regardless of isNearButton flag
            }, 50); // Very fast - 50ms intervals
          }
        }
      }, { passive: true });
      
      // Track if finger stays near button during movement
      document.addEventListener("touchmove", (e) => {
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          const wasNearButton = isNearButton;
          isNearButton = isTouchNearButton(touch.clientX, touch.clientY);
          
          // Start interval if finger moved into button area
          if (isNearButton && !wasNearButton) {
            burst(5, true);
            if (nearButtonInterval) clearInterval(nearButtonInterval);
            nearButtonInterval = setInterval(() => {
              burst(4, true);
            }, 50);
          }
          // Stop interval if finger moved away from button area
          else if (!isNearButton && wasNearButton) {
            if (nearButtonInterval) {
              clearInterval(nearButtonInterval);
              nearButtonInterval = null;
            }
          }
        }
      }, { passive: true });
      
      // Clean up on touch end
      document.addEventListener("touchend", () => {
        isNearButton = false;
        if (nearButtonInterval) {
          clearInterval(nearButtonInterval);
          nearButtonInterval = null;
        }
      });
      
      document.addEventListener("touchcancel", () => {
        isNearButton = false;
        if (nearButtonInterval) {
          clearInterval(nearButtonInterval);
          nearButtonInterval = null;
        }
      });
      
      // Keep button-specific listeners for direct button touches
      pandaBtn.addEventListener("touchstart", (e) => {
        isTouchingButton = true;
      });
      
      pandaBtn.addEventListener("touchend", () => {
        isTouchingButton = false;
      });
      
      pandaBtn.addEventListener("touchcancel", () => {
        isTouchingButton = false;
      });
      
      // Regular touchmove for glint trail (separate from hold detection)
      document.addEventListener("touchmove", (e) => {
        if (e.touches.length !== 1) return;
        
        const now = Date.now();
        const touch = e.touches[0];
        const timeDiff = now - lastTouchTime;
        
        // High frame rate for responsive tracking
        if (timeDiff > 16 && lastTouchTime > 0) { // ~60fps
          const dx = touch.clientX - lastTouchX;
          const dy = touch.clientY - lastTouchY;
          const touchDistance = Math.sqrt(dx * dx + dy * dy);
          
          // Calculate distance from touch to button center
          const distanceToButton = getDistanceToButton(touch.clientX, touch.clientY);
          
          // Scale range based on screen size
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          const screenDiagonal = Math.sqrt(screenWidth * screenWidth + screenHeight * screenHeight);
          const maxDistance = screenDiagonal * 0.6; // Use diagonal for true perimeter-to-center range
          
          // Proximity: 0 at perimeter, 1 at button center
          const proximity = Math.max(0, Math.min(1, 1 - (distanceToButton / maxDistance)));
          
          // Radial gradient logic: sparse at perimeter, dense at center
          let glintCount = 0;
          let throttleFactor = 1; // How often to show glints (lower = more frequent)
          
          if (proximity > 0.85) {
            // Very close to button - intense, urgent flashing
            glintCount = 2;
            throttleFactor = 0.9; // Almost always show
          } else if (proximity > 0.7) {
            // Close - high density
            glintCount = 2;
            throttleFactor = 0.8;
          } else if (proximity > 0.55) {
            // Medium-close - frequent
            glintCount = Math.random() > 0.2 ? 2 : 1;
            throttleFactor = 0.7;
          } else if (proximity > 0.4) {
            // Medium distance - moderate
            glintCount = Math.random() > 0.4 ? 1 : 2;
            throttleFactor = 0.6;
          } else if (proximity > 0.25) {
            // Medium-far - occasional
            glintCount = Math.random() > 0.6 ? 1 : 0;
            throttleFactor = 0.5;
          } else if (proximity > 0.1) {
            // Far - sparse
            glintCount = Math.random() > 0.75 ? 1 : 0;
            throttleFactor = 0.35;
          } else {
            // Perimeter - handful, slow
            glintCount = Math.random() > 0.88 ? 1 : 0;
            throttleFactor = 0.2;
          }
          
          // Apply throttle factor - suppress some glints based on distance
          if (Math.random() > throttleFactor) {
            glintCount = 0;
          }
          
          // Only show glints if finger is moving
          if (glintCount > 0 && touchDistance > 1) {
            const isOnButton = proximity > 0.8;
            burst(glintCount, isOnButton);
          }
        }
        
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
        lastTouchTime = now;
      });
    }
    
    // Global mouse movement: intensity based on speed and proximity (desktop only)
    if (!isTouchDevice) {
      document.addEventListener("mousemove", (e) => {
      const now = Date.now();
      const timeDiff = now - lastMoveTime;
      
      // Calculate proximity to button (closer = more glints)
      const distanceToButton = getDistanceToButton(e.clientX, e.clientY);
      const maxDistance = 600; // increased range for earlier response
      const proximity = Math.max(0, 1 - (distanceToButton / maxDistance));
      
      // Adaptive throttle - much faster updates when close to button
      let throttle = 70;
      if (proximity > 0.7) {
        throttle = 25; // very frequent when on/near button
      } else if (proximity > 0.5) {
        throttle = 35; // frequent when close
      } else if (proximity > 0.3) {
        throttle = 50;
      }
      
      if (timeDiff > throttle) {
        // Calculate mouse speed
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        mouseSpeed = distance / timeDiff * 100; // normalize
        
        // Calculate glint count based on speed and proximity
        let glintCount = 0;
        
        // Base speed contribution
        if (mouseSpeed > 8) {
          glintCount += 1;
        } else if (mouseSpeed > 4) {
          if (Math.random() > 0.5) glintCount += 1;
        }
        
        // Proximity modifies the count - more when far, excited when on button
        const isOnButton = proximity > 0.75;
        
        if (isOnButton) {
          // Very close/on button - urgent flashing, always show glints
          glintCount = 2; // Always 2 for constant presence
        } else if (proximity > 0.6) {
          // Close - moderate
          if (Math.random() > 0.4) glintCount += 1;
        } else if (proximity > 0.4) {
          // Medium distance - full effect
          glintCount += 1;
        } else if (proximity > 0.2) {
          // Getting farther - more glints to guide
          glintCount += 1;
          if (Math.random() > 0.5) glintCount += 1;
        } else if (proximity > 0.1) {
          // Far away - consistent guidance
          glintCount = 1;
          if (Math.random() > 0.4) glintCount += 1;
        } else {
          // Very far - still show hints
          glintCount = 1;
        }
        
        // Cap at 2 glints per movement
        glintCount = Math.min(2, glintCount);
        
        if (glintCount > 0) {
          burst(glintCount, isOnButton);
        }
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        lastMoveTime = now;
      }
    });
    }
  
    // Idle shimmer - more noticeable on mobile
    if (isTouchDevice) {
      setInterval(() => burst(3), 2200); // More dense, more frequent on mobile
    } else {
      setInterval(() => burst(2), 3200); // Original gentle shimmer on desktop
    }
  }

});
