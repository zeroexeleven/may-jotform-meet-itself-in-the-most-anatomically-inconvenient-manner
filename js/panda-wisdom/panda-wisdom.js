document.addEventListener("DOMContentLoaded", () => {
  // Track loading state
  let firstImageLoaded = false;
  
  // Slides configuration: add more objects to this array for more images
  const slides = [
    {
      src: "https://raw.githubusercontent.com/zeroexeleven/may-jotform-meet-itself-in-a-most-anatomically-inconvenient-manner/master/images/enough_tea_nope.jpeg",
      alt: "Photograph of a page from a book by James Norbury: sometimes making someone a cup of tea makes a world of difference.",
      caption: "Dear every kind soul who has gifted me with the peerless pleasure of tea: It was in fact not enough. Please bestow more. I have an astronomical need. Thank you."
    },
    {
      src: "https://raw.githubusercontent.com/zeroexeleven/may-jotform-meet-itself-in-a-most-anatomically-inconvenient-manner/master/images/view_worth_struggle.jpeg",
      alt: "Photograph of a page from a book by James Norbury on how hard work and struggle often lead to the most beautiful views.",
      caption: "Hard work and struggle often lead to the most beautiful views."
    },
    {
      src: "https://raw.githubusercontent.com/zeroexeleven/may-jotform-meet-itself-in-a-most-anatomically-inconvenient-manner/master/images/back_to_basics.jpeg",
      alt: "Photograph of a page from a book by James Norbury — backtrack, simply, shift your perspective.",
      caption: "Relation to the KISS principle. Reframe when stuck; go back to when it made sense. Remember your roots — the good parts. Replant the bad parts, obviously, before the remembering."
    },
    {
      src: "https://raw.githubusercontent.com/zeroexeleven/may-jotform-meet-itself-in-a-most-anatomically-inconvenient-manner/master/images/listeners_lovers_learners.jpeg",
      alt: "Photograph of a page from a book by James Norbury on the value of listening.",
      caption: "The value of listening, the one language of love that people too often forget."
    },
    {
      src: "https://raw.githubusercontent.com/zeroexeleven/may-jotform-meet-itself-in-a-most-anatomically-inconvenient-manner/master/images/more_than_words.jpeg",
      alt: "Photograph of a page from a book by James Norbury on the importance of seeing beyond words.",
      caption: "The importance of understanding beyond words, beyond thoughts, beyond... you get the idea."
    }
    // Add more like:
    // {
    //   src: "https://raw.githubusercontent.com/.../images/another_page.jpeg",
    //   alt: "Photograph of another page from a book by James Norbury",
    //   caption: "Another page from James Norbury’s book."
    // }
  ];

  const inner = document.getElementById("carouselInner");
  const dotsContainer = document.getElementById("carouselDots");
  const prevBtn = document.getElementById("prevSlide");
  const nextBtn = document.getElementById("nextSlide");
  const closeBtn = document.getElementById("closeImage");
  const captionEl = document.getElementById("slideCaption");

  if (!inner || !dotsContainer) return;

  // Build slides and dots
  slides.forEach((slide, index) => {
    const slideEl = document.createElement("div");
    slideEl.className = "carousel-slide";
    slideEl.dataset.index = index;

    const img = document.createElement("img");
    img.alt = slide.alt || "";
    
    // Handle image load
    img.onload = () => {
      img.classList.add("img-loaded");
      if (index === 0 && !firstImageLoaded) {
        firstImageLoaded = true;
        inner.classList.add("loaded");
      }
    };
    
    // Set src after attaching onload
    img.src = slide.src;
    
    // Handle cached images (already loaded)
    if (img.complete && img.naturalHeight !== 0) {
      img.classList.add("img-loaded");
      if (index === 0) {
        firstImageLoaded = true;
        inner.classList.add("loaded");
      }
    }

    slideEl.appendChild(img);
    inner.appendChild(slideEl);

    const dot = document.createElement("div");
    dot.className = "carousel-dot";
    dot.dataset.index = index;
    dotsContainer.appendChild(dot);
  });

  let currentIndex = 0;
  const total = slides.length;
  
  // Debounce navigation to prevent rapid-fire slide changes
  let isTransitioning = false;
  const transitionCooldown = 400; // ms - matches CSS transition duration

  function setActive(index) {
    if (!total) return;
    if (isTransitioning) return; // Ignore if already transitioning
    
    const newIndex = (index + total) % total;
    if (newIndex === currentIndex) return; // No change needed
    
    isTransitioning = true;
    currentIndex = newIndex;

    inner.querySelectorAll(".carousel-slide").forEach((slide) => {
      const idx = Number(slide.dataset.index);
      slide.classList.toggle("active", idx === currentIndex);
    });

    dotsContainer.querySelectorAll(".carousel-dot").forEach((dot) => {
      const idx = Number(dot.dataset.index);
      dot.classList.toggle("active", idx === currentIndex);
    });

    if (captionEl) {
      const caption = slides[currentIndex].caption || "";
      captionEl.textContent = caption;
    }
    
    // Release lock after transition completes
    setTimeout(() => {
      isTransitioning = false;
    }, transitionCooldown);
  }

  function next() {
    setActive(currentIndex + 1);
  }

  function prev() {
    setActive(currentIndex - 1);
  }

  // Init - set first slide active immediately (bypass debounce)
  if (total > 0) {
    currentIndex = 0;
    inner.querySelectorAll(".carousel-slide").forEach((slide) => {
      slide.classList.toggle("active", Number(slide.dataset.index) === 0);
    });
    dotsContainer.querySelectorAll(".carousel-dot").forEach((dot) => {
      dot.classList.toggle("active", Number(dot.dataset.index) === 0);
    });
    if (captionEl && slides[0]) {
      captionEl.textContent = slides[0].caption || "";
    }
  }

  // Button events
  if (nextBtn) {
    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      next();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      prev();
    });
  }

  // Dot click
  dotsContainer.addEventListener("click", (e) => {
    const dot = e.target.closest(".carousel-dot");
    if (!dot) return;
    const idx = Number(dot.dataset.index);
    setActive(idx);
  });

  // Swipe support (touch) - page has touch-action: none so we handle all swipes
  let touchStartX = null;

  inner.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
    }
  });

  inner.addEventListener("touchend", (e) => {
    if (touchStartX == null) return;
    const endX = e.changedTouches[0].clientX;
    const deltaX = endX - touchStartX;
    const threshold = 40; // px

    if (deltaX > threshold) {
      prev();
    } else if (deltaX < -threshold) {
      next();
    }
    
    touchStartX = null;
  });

  // Mouse drag swipe (simple) - only on carousel inner, not buttons
  let mouseDown = false;
  let mouseStartX = null;
  let isDragging = false;

  inner.addEventListener("mousedown", (e) => {
    // Ignore if clicking on navigation buttons
    if (e.target.closest('.carousel-nav')) return;
    
    mouseDown = true;
    mouseStartX = e.clientX;
    isDragging = false;
  });

  document.addEventListener("mousemove", (e) => {
    if (!mouseDown) return;
    const deltaX = Math.abs(e.clientX - mouseStartX);
    if (deltaX > 5) {
      isDragging = true;
    }
  });

  document.addEventListener("mouseup", (e) => {
    if (!mouseDown || mouseStartX == null) return;
    
    if (isDragging) {
      const deltaX = e.clientX - mouseStartX;
      const threshold = 40;

      if (deltaX > threshold) {
        prev();
      } else if (deltaX < -threshold) {
        next();
      }
    }
    
    mouseDown = false;
    mouseStartX = null;
    isDragging = false;
  });

  // Keyboard navigation (with debounce built into setActive)
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  });

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      // Try to extract edit URL from query params
      const params = new URLSearchParams(window.location.search);
      const editURL = params.get("edit");
      
      if (editURL) {
        window.location.href = `thankyou.html?edit=${encodeURIComponent(editURL)}`;
      } else {
        window.location.href = "thankyou.html";
      }
    });
  }
});
